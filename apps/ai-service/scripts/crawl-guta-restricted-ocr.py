"""OCR restricted (view-only) Google Drive PDFs linked from the Guta portal.

These files allow anonymous PREVIEW but have download disabled. The Drive
texmex viewer still renders every page as an image; this script:
  1. fetches the /preview page and extracts the `ds` token,
  2. exchanges it for a signed doc id via viewer/upload,
  3. reads page count from viewer/meta,
  4. downloads each page image (w=2400) via viewer/img,
  5. OCRs it with Tesseract (vie traineddata, local tessdata dir).

Outputs (data/guta_portal/):
  - documents-ocr-knowledge.jsonl  (RAG-format docs, slide detection included)
  - documents-ocr-knowledge.md     (human-readable compilation)
  - ocr-state.json                 (resume state: file id -> done/failed)

Usage:
  .venv/Scripts/python.exe scripts/crawl-guta-restricted-ocr.py [--max-files N]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent
DATA_DIR = REPO_ROOT / "data" / "guta_portal"
RAW_POSTS = DATA_DIR / "raw-posts.jsonl"
STATE_FILE = DATA_DIR / "ocr-state.json"
KNOWLEDGE_FILE = DATA_DIR / "documents-ocr-knowledge.jsonl"
MD_FILE = DATA_DIR / "documents-ocr-knowledge.md"

TESSERACT_CMD = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
TESSDATA_DIR = r"C:\Users\hoang\bin\tessdata-vie"
PAGE_WIDTH = 2400
SLIDE_PAGE_MAX_CHARS = 450
REQUEST_DELAY = 0.6

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(),
              logging.FileHandler(DATA_DIR / "ocr.log", encoding="utf-8")],
)
logger = logging.getLogger("guta_ocr")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def collect_restricted_files() -> List[Dict[str, Any]]:
    """gdrive_file attachments; those already downloaded are skipped by state."""
    if not RAW_POSTS.exists():
        raise FileNotFoundError(RAW_POSTS)
    posts = [json.loads(l) for l in open(RAW_POSTS, encoding="utf-8") if l.strip()]
    seen: set = set()
    items: List[Dict[str, Any]] = []
    for p in posts:
        for fid in re.findall(r"drive\.google\.com/file/d/([\w-]+)", p.get("content") or ""):
            if fid in seen:
                continue
            seen.add(fid)
            items.append({
                "fid": fid,
                "post_id": p["id"],
                "post_title": (p.get("title") or "").strip(),
                "url": f"https://drive.google.com/file/d/{fid}/view",
            })
    return items


class OcrClient:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def _get(self, url: str, binary: bool = False) -> httpx.Response:
        r = await self.client.get(url, headers={"User-Agent": UA}, follow_redirects=True)
        r.raise_for_status()
        return r

    async def ocr_file(self, item: Dict[str, Any]) -> Dict[str, Any]:
        fid = item["fid"]
        fssid = "f" + uuid.uuid4().hex[:24]

        # 1. preview page -> ds token
        pv = await self._get(f"https://drive.google.com/file/d/{fid}/preview")
        m = re.search(r"viewer/upload\?ds\\u003d([\w-]+)", pv.text)
        if not m:
            return {"status": "no_ds_token"}
        ds = m.group(1)
        await asyncio.sleep(REQUEST_DELAY)

        # 2. signed doc id
        up = await self._get(
            f"https://drive.google.com/viewer/upload?ds={ds}&ck=drive&dsmi=texmex&p=proj&fssid={fssid}")
        m = re.search(r'meta\?id=([^&"]+)&dsmi', up.text)
        if not m:
            return {"status": "no_signed_id"}
        sid = m.group(1)
        await asyncio.sleep(REQUEST_DELAY)

        # 3. page count
        meta = await self._get(f"https://drive.google.com/viewer/meta?id={sid}&dsmi=texmex&fssid={fssid}")
        meta_json = json.loads(re.sub(r"^\)\]\}'", "", meta.text.strip()))
        pages = int(meta_json.get("pages", 0))
        if pages <= 0 or pages > 60:
            return {"status": f"bad_pages:{pages}"}

        # 4+5. pages -> images -> OCR
        import pytesseract
        from PIL import Image
        import io
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
        ocr_cfg = f"--tessdata-dir {TESSDATA_DIR} --psm 6"

        texts: List[str] = []
        landscape = 0
        for pg in range(pages):
            img_resp = await self._get(
                f"https://drive.google.com/viewer/img?id={sid}&dsmi=texmex&fssid={fssid}"
                f"&auditContext=forDisplay&page={pg}&w={PAGE_WIDTH}")
            img = Image.open(io.BytesIO(img_resp.content))
            w, h = img.size
            if w > h:
                landscape += 1
            text = await asyncio.to_thread(
                pytesseract.image_to_string, img, "vie", ocr_cfg)
            texts.append(text.strip())
            await asyncio.sleep(REQUEST_DELAY * 0.5)

        full_text = "\n\n".join(t for t in texts if t)
        ratio = landscape / pages
        avg = len(full_text) / pages
        is_slide = ratio >= 0.6 and avg < SLIDE_PAGE_MAX_CHARS
        return {
            "status": "ok",
            "pages": pages,
            "landscape_ratio": round(ratio, 2),
            "avg_chars_per_page": round(avg, 1),
            "is_slide": is_slide,
            "text": full_text,
        }


async def main_async(args: argparse.Namespace) -> None:
    state: Dict[str, Any] = {}
    if STATE_FILE.exists():
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))

    items = collect_restricted_files()
    todo = [i for i in items if state.get(i["fid"], {}).get("status") != "ok"]
    if args.max_files:
        todo = todo[: args.max_files]
    logger.info("Restricted Drive files: %d total, %d to OCR", len(items), len(todo))

    sem = asyncio.Semaphore(2)

    async def one(item: Dict[str, Any]) -> None:
        async with sem:
            t0 = time.time()
            try:
                async with httpx.AsyncClient(timeout=90.0) as client:
                    rec = await OcrClient(client).ocr_file(item)
            except Exception as exc:
                rec = {"status": f"error: {type(exc).__name__}: {str(exc)[:150]}"}
            rec.update({k: item[k] for k in ("fid", "post_id", "post_title", "url")})
            state[item["fid"]] = rec
            STATE_FILE.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
            logger.info("[%s] %.1fs p%s %s", rec["status"], time.time() - t0,
                        rec.get("pages", "?"), item["post_title"][:55])

    await asyncio.gather(*(one(i) for i in todo))

    # Build outputs from all successful OCR records
    knowledge = []
    for fid, rec in state.items():
        if rec.get("status") != "ok" or len(rec.get("text", "")) < 80:
            continue
        title = rec["post_title"] or fid
        kind = "slide" if rec.get("is_slide") else "document"
        kind_line = ("Tài liệu slide đào tạo, nội dung đã được OCR chuyển thành tri thức."
                     if kind == "slide" else
                     "Tài liệu PDF bị chặn tải trên Google Drive (chỉ xem), nội dung được OCR từ ảnh trang.")
        text = (f"**{title}**\n\n({kind_line} Nguồn bài: {rec['post_id']} | {rec['url']})\n\n"
                f"{rec['text']}")
        knowledge.append({
            "document": title,
            "version": "v1.0-ocr",
            "source": rec["url"],
            "departmentIds": [],
            "priority": "P2" if kind == "slide" else "P1",
            "category": "Tài liệu đính kèm (OCR từ preview)" if kind == "document"
                        else "Tài liệu đính kèm (slide, OCR)",
            "attachment_url": rec["url"],
            "post_id": rec["post_id"],
            "ocr": True,
            "pages": rec["pages"],
            "chunks": [{"order": 0, "article": f"Nội dung tài liệu: {title}", "text": text}],
        })

    with open(KNOWLEDGE_FILE, "w", encoding="utf-8") as f:
        for k in knowledge:
            f.write(json.dumps(k, ensure_ascii=False) + "\n")

    lines = ["# TÀI LIỆU DRIVE BỊ CHẶN TẢI — NỘI DUNG OCR TỪ PREVIEW", "",
             "> 46+ file quy định/quyết định chỉ cho xem trên Drive; text thu bằng Tesseract OCR (vie).",
             "> Lưu ý: OCR có thể sai một số ký tự dấu tiếng Việt.", ""]
    for k in knowledge:
        lines += [f"## {k['document']}", "",
                  f"- **Loại:** {k['category']} ({k['pages']} trang)",
                  f"- **Nguồn:** {k['attachment_url']}", ""]
        lines.append(k["chunks"][0]["text"])
        lines += ["", "---", ""]
    MD_FILE.write_text("\n".join(lines), encoding="utf-8")

    ok = sum(1 for r in state.values() if r.get("status") == "ok")
    print("=" * 62)
    print(f"OCR done: {ok}/{len(state)} files ok | knowledge docs: {len(knowledge)}")
    fails = {k: r["status"] for k, r in state.items() if r.get("status") not in ("ok",)}
    if fails:
        print("Non-ok:", dict(list(fails.items())[:20]))
    print("=" * 62)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-files", type=int, default=None)
    args = ap.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
