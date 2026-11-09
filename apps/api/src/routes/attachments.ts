import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { authorizeAttachment } from "../services/document-authorization.service.js";
import { endpoint as endpoint } from "../lib/endpoint.js";

const router = Router();

const ALLOWED_CATEGORIES = ["pdf", "images", "rescued_pdf"] as const;
type Category = (typeof ALLOWED_CATEGORIES)[number];

const ALLOWED_EXTENSIONS: Record<Category, string[]> = {
  pdf: [".pdf"],
  images: [".png", ".jpg", ".jpeg"],
  rescued_pdf: [".pdf"],
};

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function resolveDataRoot(): string {
  // Try relative to this file first
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    let dir = currentDir;
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, "data");
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // fallback
  }

  // Fallback to process.cwd()
  let cwdCandidate = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(cwdCandidate, "data");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    cwdCandidate = path.dirname(cwdCandidate);
  }

  return path.resolve(process.cwd(), "data");
}

const DATA_ROOT = resolveDataRoot();
const CATEGORY_DIRS: Record<Category, string> = {
  pdf: path.resolve(DATA_ROOT, "guta_mau_bien_ban_cho_agent"),
  images: path.resolve(DATA_ROOT, "guta_bo_du_lieu_chatbot", "anh_tham_chieu"),
  rescued_pdf: path.resolve(DATA_ROOT, "guta_rescued_pdf"),
};

router.get("/attachments/:category/:filename", authenticateToken, endpoint(async (req: Request, res: Response) => {
  const { category, filename } = req.params;

  if (!category || !ALLOWED_CATEGORIES.includes(category as Category)) {
    res.status(400).json({
      error: {
        code: "INVALID_CATEGORY",
        message: "Category must be either 'pdf' or 'images'",
      },
    });
    return;
  }

  const validCategory = category as Category;

  // Path traversal prevention: disallow slashes, backslashes, null bytes, parent traversal
  if (
    !filename ||
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0") ||
    path.basename(filename) !== filename
  ) {
    res.status(400).json({
      error: {
        code: "INVALID_FILENAME",
        message: "Filename contains invalid or malicious characters",
      },
    });
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  const allowedExts = ALLOWED_EXTENSIONS[validCategory];
  if (!allowedExts.includes(ext)) {
    res.status(400).json({
      error: {
        code: "INVALID_EXTENSION",
        message: `File extension '${ext}' is not allowed for category '${validCategory}'`,
      },
    });
    return;
  }

  // Trusted deployment configuration, never a request parameter. Also permits
  // hermetic tests without copying confidential GUTA documents into the repo.
  const configuredRoot = process.env.ATTACHMENTS_DATA_ROOT;
  const baseDir = configuredRoot ? path.resolve(configuredRoot, validCategory === "images"
    ? "guta_bo_du_lieu_chatbot/anh_tham_chieu" : validCategory === "pdf"
      ? "guta_mau_bien_ban_cho_agent" : "guta_rescued_pdf") : CATEGORY_DIRS[validCategory];
  const resolvedPath = path.resolve(baseDir, filename);

  // Strict boundary containment check
  if (!resolvedPath.startsWith(baseDir + path.sep)) {
    res.status(400).json({
      error: {
        code: "ACCESS_DENIED",
        message: "Access to the requested path is denied",
      },
    });
    return;
  }

  await authorizeAttachment(req.user!, category, filename);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile() || !fs.realpathSync(resolvedPath).startsWith(fs.realpathSync(baseDir) + path.sep)) {
    res.status(404).json({
      error: {
        code: "FILE_NOT_FOUND",
        message: `File '${filename}' not found in category '${validCategory}'`,
      },
    });
    return;
  }

  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");

  res.sendFile(resolvedPath);
}));

export default router;
