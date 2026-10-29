"""Crawl ALL document attachments from Guta portal posts (Google Drive + S3).

Strategy:
  1. Inventory: every document link in raw-posts.jsonl
     (Drive files, Drive folders, Google Docs/Sheets, S3 pdf/doc, cover attachments).
  2. Individual Drive files: download via drive.usercontent.google.com
     (fallback: gdown). Files with download disabled by owner -> marked restricted.
  3. Drive folders: recursive walk via public embeddedfolderview endpoint
     (no JS needed). Download document-type files; skip media (recorded only).
  4. Classify PDFs: DOCUMENT (portrait text) vs SLIDE (landscape deck).
     Extract text via PyMuPDF / python-docx / python-pptx.
  5. Outputs (data/guta_portal/):
     - document-inventory.jsonl   (one record per attachment + folder tree files)
     - documents-knowledge.jsonl  (RAG-format knowledge docs)
     - documents-knowledge.md     (human-readable compilation)

Usage:
  .venv/Scripts/python.exe scripts/crawl-guta-documents.py [--max-files N] [--skip-folders]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import time
import unicodedata
from html import unescape as hunescape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent
DATA_DIR = REPO_ROOT / "data" / "guta_portal"
DOCS_DIR = DATA_DIR / "documents"
RAW_POSTS = DATA_DIR / "raw-posts.jsonl"

USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
SLIDE_PAGE_MAX_CHARS = 450
DOC_EXTS = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".csv", ".txt"}
SKIP_EXTS = {".mp4", ".mov", ".avi", ".mp3", ".wav", ".m4a", ".zip", ".rar", ".7z"}
FOLDER_MAX_DEPTH = 4
FOLDER_MAX_FILES = 600
REQUEST_DELAY = 0.25

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(DATA_DIR.parent / "guta_portal" / "crawl.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("guta_doc_crawler")


def normalize(text: Optional[str]) -> str:
    return unicodedata.normalize("NFC", text or "").strip()


def safe_name(title: str, max_len: int = 60) -> str:
    t = normalize(hunescape(title))
    t = re.sub(r"[^\w\s.-]", "", t, flags=re.UNICODE)
    t = re.sub(r"[-\s]+", "_", t).strip("_.- ")
    return (t or "untitled")[:max_len]


# ---------------------------------------------------------------- inventory


def build_inventory() -> List[Dict[str, Any]]:
    """Scan raw posts for every document-like attachment."""
    if not RAW_POSTS.exists():
        raise FileNotFoundError(f"Missing {RAW_POSTS} - run crawl-guta-portal.py first")
    posts = [json.loads(l) for l in open(RAW_POSTS, encoding="utf-8") if l.strip()]

    items: List[Dict[str, Any]] = []
    seen: set = set()

    def add(kind: str, key: str, url: str, post: Dict[str, Any]) -> None:
        if key in seen:
            return
        seen.add(key)
        cover = post.get("cover")
        cover_url = cover.get("url") if isinstance(cover, dict) else None
        items.append({
            "kind": kind,
            "key": key,
            "url": url,
            "post_id": post["id"],
            "post_title": normalize(post.get("title", "")),
            "post_published_at": normalize(post.get("published_at", "")),
            "cover_url": cover_url,
        })

    for p in posts:
        content = p.get("content") or ""
        for fid in re.findall(r"drive\.google\.com/file/d/([\w-]+)", content):
            add("gdrive_file", f"file:{fid}",
                f"https://drive.google.com/file/d/{fid}/view", p)
        for fid in re.findall(r"drive\.google\.com/drive/folders/([\w-]+)", content):
            add("gdrive_folder", f"folder:{fid}",
                f"https://drive.google.com/drive/folders/{fid}", p)
        for m in set(re.findall(
                r"https://docs\.google\.com/(?:spreadsheets|document)/d/[\w-]+", content)):
            add("google_docs", m, m, p)
        for u in re.findall(
                r"https://s3\.ap-southeast-1\.amazonaws\.com/guta\.content/[^\s\"'<>\\)]+", content):
            u = u.rstrip(".,;")
            if re.search(r"\.(pdf|docx?|xlsx?|pptx?)$", u, re.I):
                add("s3_file", u, u, p)
        cover = p.get("cover")
        if isinstance(cover, dict):
            cu = cover.get("url") or ""
            ext = (cover.get("ext") or "").lower()
            if ext in (".pdf", ".docx", ".doc", ".xlsx", ".xls") and cu:
                add("cover_file", cu, cu, p)
    return items


# ---------------------------------------------------------------- download

UC_URL = "https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"


async def download_binary(client: httpx.AsyncClient, url: str, target: Path) -> str:
    """Download a URL to target. Returns 'ok' | 'restricted' | 'error: ...'."""
    if target.exists() and target.stat().st_size > 0:
        return "cached"
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        r = await client.get(url, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
        head = r.content[:64] if r.content else b""
        if b"Only the owner and editors can download" in r.content[:4000] or \
           (r.headers.get("content-type", "").startswith("text/html") and not head.startswith(b"%PDF")):
            return "restricted"
        if r.status_code != 200 or len(r.content) < 40:
            return f"error: HTTP {r.status_code} ({len(r.content)} bytes)"
        target.write_bytes(r.content)
        return "ok"
    except Exception as exc:
        return f"error: {type(exc).__name__}: {str(exc)[:150]}"


async def download_individual(items: List[Dict[str, Any]], max_files: Optional[int]) -> None:
    sem = asyncio.Semaphore(5)
    counter = {"n": 0}

    async def one(item: Dict[str, Any]) -> None:
        if item["kind"] not in ("gdrive_file", "s3_file", "cover_file"):
            return
        async with sem:
            if max_files is not None and counter["n"] >= max_files:
                item["status"] = "skipped"
                return
            fid = item["key"].split(":", 1)[-1]
            if item["kind"] == "gdrive_file":
                target = DOCS_DIR / "individual" / f"{safe_name(item['post_title'])}__{fid[:12]}.bin"
                url = UC_URL.format(fid=fid)
            else:
                ext = Path(item["url"]).suffix or ".pdf"
                target = DOCS_DIR / "individual" / f"{safe_name(item['post_title'])}__{fid[:8]}{ext}"
                url = item["url"]
            item["local_path"] = str(target)
            item["status"] = await download_binary(_shared_client, url, target)
            counter["n"] += 1
            logger.info("[%s] individual: %s", item["status"], target.name)

    await asyncio.gather(*(one(i) for i in items))


# ------------------------------------------------------- folder traversal


def parse_entries(html: str) -> Tuple[List[Tuple[str, str]], List[Tuple[str, str]]]:
    """Return (folders, files) as (id, name) lists from embeddedfolderview HTML."""
    folders, files = [], []
    for m in re.finditer(
            r'id="entry-([\w-]+)"(.*?)(?=flip-entry-last-modified|id="entry-|</div><div class="flip-bundle)',
            html, re.S):
        eid, body = m.group(1), m.group(2)
        t = re.search(r'flip-entry-title">([^<]+)', body)
        name = hunescape(t.group(1)).strip() if t else "untitled"
        if "drive.google.com/drive/folders/" in body or 'aria-label="Folder"' in body:
            folders.append((eid, name))
        else:
            files.append((eid, name))
    return folders, files


class FolderWalker:
    """Recursive public-Drive folder walker via embeddedfolderview."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client
        self.visited: set = set()
        self.records: List[Dict[str, Any]] = []
        self.n_files = 0

    async def list_dir(self, fid: str) -> Tuple[List[Tuple[str, str]], List[Tuple[str, str]]]:
        url = f"https://drive.google.com/embeddedfolderview?id={fid}#list"
        r = await self.client.get(url, headers={"User-Agent": USER_AGENT})
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code} listing folder {fid[:12]}")
        return parse_entries(r.text)

    async def walk(self, fid: str, root_name: str, rel: str, depth: int) -> None:
        if depth > FOLDER_MAX_DEPTH or self.n_files >= FOLDER_MAX_FILES or fid in self.visited:
            return
        self.visited.add(fid)
        await asyncio.sleep(REQUEST_DELAY)
        try:
            subfolders, files = await self.list_dir(fid)
        except Exception as exc:
            logger.warning("Cannot list folder %s/%s: %s", rel, fid[:12], exc)
            self.records.append({"root": root_name, "rel_path": rel, "id": fid,
                                 "name": fid, "status": f"error: {str(exc)[:120]}"})
            return
        logger.info("Folder %s: %d subfolders, %d files", rel or root_name, len(subfolders), len(files))
        # Download this level's files FIRST so progress is visible before deep recursion
        tasks = []
        for file_id, fname in files:
            if self.n_files >= FOLDER_MAX_FILES:
                break
            ext = Path(fname).suffix.lower()
            record = {"root": root_name, "rel_path": rel, "id": file_id,
                      "name": fname, "status": None, "local_path": None}
            self.records.append(record)
            if ext in SKIP_EXTS:
                record["status"] = "skipped_media"
            elif ext in DOC_EXTS or not ext:
                target = (DOCS_DIR / "folders" / safe_name(root_name, 40) / rel.lstrip("/") /
                          safe_name(fname, 80))
                self.n_files += 1
                record["local_path"] = str(target)
                tasks.append(self._dl(record, file_id, target))
        if tasks:
            await asyncio.gather(*tasks)
        for sfid, sname in subfolders:
            await self.walk(sfid, root_name, f"{rel}/{safe_name(sname, 50)}", depth + 1)
            if self.n_files >= FOLDER_MAX_FILES:
                return

    async def _dl(self, record: Dict[str, Any], file_id: str, target: Path) -> None:
        await asyncio.sleep(REQUEST_DELAY * 0.5)
        record["status"] = await download_binary(self.client, UC_URL.format(fid=file_id), target)
        logger.info("[%s] %s/%s", record["status"], record["rel_path"] or record["root"], record["name"][:60])


async def crawl_folders(items: List[Dict[str, Any]]) -> None:
    folders = [i for i in items if i["kind"] == "gdrive_folder"]
    async with httpx.AsyncClient(timeout=60.0) as client:
        for f in folders:
            fid = f["key"].split(":", 1)[1]
            walker = FolderWalker(client)
            logger.info("=== Walking folder %s (%s) ===", fid[:12], f["post_title"][:50])
            await walker.walk(fid, f["post_title"] or fid, "", 0)
            f["folder_records"] = walker.records
            f["local_path"] = str(DOCS_DIR / "folders" / safe_name(f["post_title"], 40))
            ok = sum(1 for r in walker.records if r.get("status") in ("ok", "cached"))
            f["status"] = "ok" if ok else "empty"
            f["folder_files"] = ok
            logger.info("Folder %s done: %d doc files ok", fid[:12], ok)


# ------------------------------------------------------- classify & extract


def sniff_pdf(path: Path) -> Dict[str, Any]:
    import pymupdf

    doc = pymupdf.open(path)
    pages = doc.page_count
    texts, landscape = [], 0
    for pg in doc:
        texts.append(pg.get_text("text").strip())
        r = pg.rect
        if r.width > r.height:
            landscape += 1
    doc.close()
    total = sum(len(t) for t in texts)
    avg = total / max(pages, 1)
    return {
        "pages": pages,
        "avg_chars_per_page": round(avg, 1),
        "landscape_ratio": round(landscape / max(pages, 1), 2),
        "is_slide": pages > 0 and (landscape / pages) >= 0.6 and avg < SLIDE_PAGE_MAX_CHARS,
        "text": "\n\n".join(t for t in texts if t),
    }


def sniff_office(path: Path) -> Dict[str, Any]:
    ext = path.suffix.lower()
    parts: List[str] = []
    if ext == ".docx":
        import docx
        d = docx.Document(str(path))
        parts = [p.text for p in d.paragraphs if p.text.strip()]
        for tbl in d.tables:
            for row in tbl.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    parts.append(" | ".join(cells))
    elif ext == ".pptx":
        import pptx
        prs = pptx.Presentation(str(path))
        for i, slide in enumerate(prs.slides, 1):
            lines = [sh.text_frame.text.strip() for sh in slide.shapes
                     if sh.has_text_frame and sh.text_frame.text.strip()]
            if lines:
                parts.append(f"## Slide {i}\n" + "\n\n".join(lines))
    elif ext in (".xlsx", ".xls"):
        return {"pages": 0, "avg_chars_per_page": 0, "landscape_ratio": 0,
                "is_slide": False, "text": "", "note": "spreadsheet - not parsed"}
    elif ext == ".txt" or ext == ".csv":
        text = path.read_text(encoding="utf-8", errors="ignore")
        return {"pages": 0, "avg_chars_per_page": 0, "landscape_ratio": 0,
                "is_slide": False, "text": text[:20000]}
    return {"pages": max(len(parts), 1), "avg_chars_per_page": 0,
            "landscape_ratio": 0, "is_slide": ext == ".pptx",
            "text": "\n\n".join(parts)}


def extract_file(path: Path) -> Dict[str, Any]:
    try:
        head = path.read_bytes()[:8]
        if head.startswith(b"%PDF") or path.suffix.lower() == ".pdf":
            info = sniff_pdf(path)
        elif path.suffix.lower() in (".docx", ".pptx", ".xlsx", ".xls", ".txt", ".csv"):
            info = sniff_office(path)
        elif path.suffix.lower() == ".doc":
            return {"pages": 0, "avg_chars_per_page": 0, "landscape_ratio": 0,
                    "is_slide": False, "text": "", "note": "legacy .doc not parsed"}
        elif head.startswith(b"%PDF"):
            info = sniff_pdf(path)
            info["real_ext"] = ".pdf"
        elif head.startswith(b"PK"):
            raw = sniff_pdf(path) if False else None  # placeholder, sniff by extension below
            # try docx first, then pptx
            try:
                info = sniff_office(path.with_suffix(".docx"))
                info["real_ext"] = ".docx"
            except Exception:
                info = sniff_office(path.with_suffix(".pptx"))
                info["real_ext"] = ".pptx"
        else:
            return {"pages": 0, "avg_chars_per_page": 0, "landscape_ratio": 0,
                    "is_slide": False, "text": "", "note": f"unknown binary {head[:4]!r}"}
        return info
    except Exception as exc:
        return {"pages": 0, "avg_chars_per_page": 0, "landscape_ratio": 0,
                "is_slide": False, "text": "",
                "note": f"extract error: {type(exc).__name__}: {str(exc)[:150]}"}


# ------------------------------------------------------------------ outputs


def build_outputs(items: List[Dict[str, Any]]) -> None:
    inventory: List[Dict[str, Any]] = []
    knowledge: List[Dict[str, Any]] = []

    def add_knowledge(title: str, category: str, url: str, local_path: str,
                      post_id: Any, kind: str, text: str) -> None:
        knowledge.append({
            "document": title,
            "version": "v1.0",
            "source": url,
            "departmentIds": [],
            "priority": "P2" if kind == "slide" else "P1",
            "category": category,
            "attachment_url": url,
            "local_path": local_path,
            "post_id": post_id,
            "chunks": [{"order": 0, "article": f"Nội dung tài liệu: {title}", "text": text}],
        })

    for it in items:
        rec = {k: v for k, v in it.items() if k != "folder_records"}
        inventory.append(rec)

        if it["kind"] in ("gdrive_file", "s3_file", "cover_file"):
            lp = Path(it["local_path"]) if it.get("local_path") else None
            if not lp or not lp.exists() or lp.stat().st_size == 0:
                rec["document_kind"] = None
                continue
            info = extract_file(lp)
            kind = "slide" if info.get("is_slide") else "document"
            rec["document_kind"] = kind
            rec.update({k: info.get(k) for k in ("pages", "avg_chars_per_page", "landscape_ratio", "note", "real_ext")})
            rec["text_chars"] = len(info.get("text", ""))
            if info.get("text") and len(info["text"]) >= 80:
                kind_line = ("Tài liệu slide đào tạo, nội dung đã được chuyển thành tri thức."
                             if kind == "slide" else "Tài liệu văn bản gốc (PDF/DOC).")
                text = (f"**{it['post_title']}**\n\n({kind_line} Nguồn bài: {it['post_id']} | {it['url']})\n\n"
                        f"{info['text']}")
                add_knowledge(it["post_title"],
                              "Tài liệu đính kèm (slide)" if kind == "slide" else "Tài liệu đính kèm (văn bản)",
                              it["url"], str(lp), it["post_id"], kind, text)

        elif it["kind"] == "gdrive_folder":
            rec["document_kind"] = "folder"
            for r in it.get("folder_records", []):
                st = r.get("status")
                lpath = r.get("local_path")
                entry = {"root": r["root"], "rel_path": r["rel_path"], "name": r["name"],
                         "id": r["id"], "status": st}
                if lpath and st in ("ok", "cached"):
                    lp = Path(lpath)
                    info = extract_file(lp)
                    kind = "slide" if info.get("is_slide") else "document"
                    entry.update({"document_kind": kind, "pages": info.get("pages"),
                                  "text_chars": len(info.get("text", ""))})
                    if info.get("text") and len(info["text"]) >= 80:
                        title = f"{r['name']} ({r['rel_path'].lstrip('/') or r['root']})"
                        kind_line = ("Tài liệu slide đào tạo, nội dung đã được chuyển thành tri thức."
                                     if kind == "slide" else "Tài liệu văn bản gốc.")
                        text = (f"**{title}**\n\n({kind_line} Nguồn: Google Drive {it['url']})\n\n"
                                f"{info['text']}")
                        add_knowledge(title, "Thư mục Drive — tài liệu đào tạo",
                                      it["url"], str(lp), it["post_id"], kind, text)
                rec.setdefault("folder_contents", []).append(entry)
        elif it["kind"] == "google_docs":
            rec["document_kind"] = "external_form_or_doc"

    with open(DATA_DIR / "document-inventory.jsonl", "w", encoding="utf-8") as f:
        for r in inventory:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(DATA_DIR / "documents-knowledge.jsonl", "w", encoding="utf-8") as f:
        for k in knowledge:
            f.write(json.dumps(k, ensure_ascii=False) + "\n")

    lines = ["# TÀI LIỆU ĐÍNH KÈM CỔNG THÔNG TIN GUTA — KHO TRI THỨC ĐỒ VĂN BẢN & SLIDE", "",
             "> Nguồn: raw-posts.jsonl (199 bài) + thư mục Google Drive công khai.",
             "> Slide đào tạo đã được chuyển thành tri thức dạng văn bản.", ""]
    for k in knowledge:
        lines += [f"## {k['document']}", "",
                  f"- **Loại:** {k['category']}",
                  f"- **File gốc:** `{k['local_path']}`",
                  f"- **Nguồn:** {k['attachment_url']}", ""]
        lines.append(k["chunks"][0]["text"])
        lines += ["", "---", ""]
    (DATA_DIR / "documents-knowledge.md").write_text("\n".join(lines), encoding="utf-8")
    return knowledge


_shared_client: Optional[httpx.AsyncClient] = None


async def main_async(args: argparse.Namespace) -> None:
    global _shared_client
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    items = build_inventory()
    stats: Dict[str, int] = {}
    for i in items:
        stats[i["kind"]] = stats.get(i["kind"], 0) + 1
    logger.info("Inventory: %d attachments -> %s", len(items), stats)

    t0 = time.time()
    _shared_client = httpx.AsyncClient(timeout=90.0, follow_redirects=True)
    try:
        await download_individual(items, args.max_files)
        logger.info("Individual downloads done in %.1fs", time.time() - t0)
        if not args.skip_folders:
            await crawl_folders(items)
    finally:
        await _shared_client.aclose()

    knowledge = build_outputs(items)

    n_knowledge = len(knowledge)
    ok = sum(1 for i in items if i.get("status") in ("ok", "cached"))
    restricted = sum(1 for i in items if i.get("status") == "restricted")
    errs = [i for i in items if str(i.get("status", "")).startswith("error")]
    kinds = {}
    for i in items:
        k = i.get("document_kind")
        if k:
            kinds[k] = kinds.get(k, 0) + 1
    folder_files = sum(1 for i in items if i["kind"] == "gdrive_folder"
                       for r in i.get("folder_records", []) if r.get("status") in ("ok", "cached"))
    print("=" * 62)
    print(f"Inventory: {len(items)} attachments | ok/cached: {ok} | restricted: {restricted} | errors: {len(errs)}")
    print(f"Folder doc files downloaded: {folder_files}")
    print(f"Classified kinds: {kinds}")
    print(f"Knowledge docs written: {n_knowledge}")
    if errs:
        print("Errors:")
        for e in errs[:20]:
            print(f"  - [{e['post_id']}] {e['post_title'][:60]} -> {e['status'][:120]}")
    print("=" * 62)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-files", type=int, default=None,
                    help="limit individual file downloads (smoke test)")
    ap.add_argument("--skip-folders", action="store_true")
    args = ap.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
