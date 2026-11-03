// Downloads the pinned PhoBERT + VnCoreNLP assets required by the isolated F4
// worker, then writes SHA-256 manifests. Usage:
//   node scripts/setup-f4-assets.mjs --target D:/HRBlockbot-private/f4-assets
// Network runs only here; the runtime encoder is offline and verifies digests.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const revision = "01daacda68afe13d83023d16ec647239e344a1e6";
const segmenterRevision = "62bbc58fe5d113c898eae112656be97dcf50b3a0";
const hf = `https://huggingface.co/vinai/phobert-base/resolve/${revision}/`;
const archive = "https://github.com/vncorenlp/VnCoreNLP/archive/refs/tags/v1.2.zip";
const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
const target = targetIndex >= 0 ? path.resolve(args[targetIndex + 1]) : null;
if (!target) { console.error("Usage: node scripts/setup-f4-assets.mjs --target <directory>"); process.exit(2); }

const sha256 = async (file) => {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => fs.createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("end", resolve).on("error", reject));
  return hash.digest("hex");
};
const download = async (url, file) => {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) { console.log("skip", path.basename(file)); return; }
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`download failed ${response.status} for ${url}`);
  const total = Number(response.headers.get("content-length") || 0);
  const handle = fs.createWriteStream(file);
  let seen = 0;
  for await (const chunk of response.body) { seen += chunk.length; handle.write(chunk); }
  await new Promise((resolve) => handle.end(resolve));
  if (total && seen !== total) throw new Error(`incomplete download ${file} ${seen}/${total}`);
  console.log("downloaded", path.basename(file), seen);
};

const modelDir = path.join(target, "phobert-base");
const segmenterDir = path.join(target, "vncorenlp");
await fsp.mkdir(modelDir, { recursive: true });
await fsp.mkdir(segmenterDir, { recursive: true });
for (const name of ["config.json", "pytorch_model.bin", "bpe.codes", "vocab.txt"]) await download(hf + name, path.join(modelDir, name));
const modelFiles = {};
for (const name of ["config.json", "pytorch_model.bin", "bpe.codes", "vocab.txt"]) modelFiles[name] = await sha256(path.join(modelDir, name));
await fsp.writeFile(path.join(modelDir, "artifact-manifest.json"), JSON.stringify({ model: "vinai/phobert-base", revision, files: modelFiles }, null, 2));

const zip = path.join(segmenterDir, "VnCoreNLP-1.2.zip");
await download(archive, zip);
const extract = path.join(segmenterDir, "_extract");
await fsp.rm(extract, { recursive: true, force: true });
await fsp.mkdir(extract, { recursive: true });
if (process.platform === "win32") {
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${extract.replace(/'/g, "''")}' -Force`], { stdio: "inherit" });
} else {
  execFileSync("tar", ["-xf", zip, "-C", extract], { stdio: "inherit" });
}
const source = path.join(extract, "VnCoreNLP-1.2");
if (!fs.existsSync(source)) throw new Error("unexpected VnCoreNLP archive layout");
await fsp.copyFile(path.join(source, "VnCoreNLP-1.2.jar"), path.join(segmenterDir, "VnCoreNLP-1.2.jar"));
await fsp.mkdir(path.join(segmenterDir, "models", "wordsegmenter"), { recursive: true });
for (const name of ["vi-vocab", "wordsegmenter.rdr"]) {
  await fsp.copyFile(path.join(source, "models", "wordsegmenter", name), path.join(segmenterDir, "models", "wordsegmenter", name));
}
const segmenterFiles = {};
for (const relative of ["VnCoreNLP-1.2.jar", "models/wordsegmenter/vi-vocab", "models/wordsegmenter/wordsegmenter.rdr"]) segmenterFiles[relative] = await sha256(path.join(segmenterDir, relative));
await fsp.writeFile(path.join(segmenterDir, "artifact-manifest.json"), JSON.stringify({ revision: segmenterRevision, files: segmenterFiles }, null, 2));
await fsp.rm(extract, { recursive: true, force: true });
console.log(JSON.stringify({ modelDir, segmenterDir, files: Object.keys(modelFiles).length + Object.keys(segmenterFiles).length }, null, 2));
