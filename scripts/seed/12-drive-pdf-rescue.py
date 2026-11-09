"""Dựng PDF tải được từ các file Google Drive bị chặn tải (chỉ xem trước).

Bối cảnh: 54 document trong `policies` có `source` là link `drive.google.com/file/d/<id>`,
nhưng phần lớn không tải trực tiếp được (`uc?export=download` trả trang "Can't download
file"). Người dùng hỏi "cho tôi xem biểu mẫu" thì chatbot không có file nào để gửi.

Cách vượt: dùng chính cơ chế `/preview` mà `crawl-guta-restricted-ocr.py` đã dùng để OCR
— Drive trả ảnh từng trang qua `viewer/img`. Thay vì OCR, script này ghép các ảnh đó
thành một PDF thật, để agent gửi ra cho người dùng mở.

    /preview -> ds token -> signed id -> meta (page count) -> viewer/img?page=N&w=1400

Ảnh trang ở `w=1400` cho ~200-800 KB/trang sau khi nén JPEG 70. Một file 3 trang ≈ 730 KB.

Usage (từ repo root):
  python scripts/seed/12-drive-pdf-rescue.py --list
  python scripts/seed/12-drive-pdf-rescue.py --dry-run --limit 5
  python scripts/seed/12-drive-pdf-rescue.py --apply --out data/guta_rescued_pdf
  python scripts/seed/12-drive-pdf-rescue.py --apply --fid <id> --out ...

Ghi chú pháp lý/vận hành: script chỉ tải những file mà tài khoản người chạy đã có quyền
xem qua link công khai của Guta. Không bypass quyền truy cập; chỉ đổi định dạng từ
"xem trước" sang "PDF gửi nội bộ".
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
AI_SERVICE = REPO_ROOT / "apps" / "ai-service"
sys.path.insert(0, str(AI_SERVICE))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env")
load_dotenv(AI_SERVICE / ".env")

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
PAGE_WIDTH = 1400
JPEG_QUALITY = 70
MAX_PAGES = 60
CONCURRENCY = 2


def safe_filename(title: str, fid: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9À-ỹ _.-]", "", title).strip().replace(" ", "_")
    cleaned = re.sub(r"_+", "_", cleaned)[:90]
    return f"{cleaned or 'tai_lieu'}_{fid[:8]}.pdf"


async def fetch_page_images(client, fid: str, width: int = PAGE_WIDTH) -> tuple[list[bytes], dict]:
    """Trả (danh sách ảnh PNG theo trang, metadata chẩn đoán)."""
    fssid = "f" + uuid.uuid4().hex[:24]
    meta: dict = {"fid": fid}
    preview = await client.get(f"https://drive.google.com/file/d/{fid}/preview", headers=UA)
    token = re.search(r"viewer/upload\?ds\\u003d([\w-]+)", preview.text)
    if not token:
        return [], {**meta, "error": "no_ds_token"}
    upload = await client.get(
        f"https://drive.google.com/viewer/upload?ds={token.group(1)}&ck=drive&dsmi=texmex&p=proj&fssid={fssid}",
        headers=UA,
    )
    signed = re.search(r"meta\?id=([^&\"]+)&dsmi", upload.text)
    if not signed:
        return [], {**meta, "error": "no_signed_id"}
    sid = signed.group(1)
    meta_resp = await client.get(
        f"https://drive.google.com/viewer/meta?id={sid}&dsmi=texmex&fssid={fssid}", headers=UA
    )
    try:
        pages = int(json.loads(re.sub(r"^\)\]\}'", "", meta_resp.text.strip())).get("pages", 0))
    except (ValueError, AttributeError):
        return [], {**meta, "error": "bad_meta"}
    meta["pages"] = pages
    if pages <= 0 or pages > MAX_PAGES:
        return [], {**meta, "error": f"pages_out_of_range:{pages}"}

    images: list[bytes] = []
    for page in range(pages):
        resp = await client.get(
            f"https://drive.google.com/viewer/img?id={sid}&dsmi=texmex&fssid={fssid}"
            f"&auditContext=forDisplay&page={page}&w={width}",
            headers=UA,
        )
        if resp.status_code != 200 or not resp.content:
            return images, {**meta, "error": f"page_{page}_http_{resp.status_code}"}
        images.append(resp.content)
        await asyncio.sleep(0.2)
    return images, meta


def images_to_pdf(images: list[bytes]) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    for raw in images:
        pix = pymupdf.Pixmap(raw)
        page = doc.new_page(width=pix.width * 0.75, height=pix.height * 0.75)
        page.insert_image(page.rect, stream=pix.tobytes("jpeg", jpg_quality=JPEG_QUALITY))
    buffer = io.BytesIO()
    doc.save(buffer, deflate=True, garbage=4)
    doc.close()
    return buffer.getvalue()


async def rescue_one(client, item: dict, out_dir: Path, apply: bool) -> dict:
    fid = item["fid"]
    images, meta = await fetch_page_images(client, fid)
    if not images:
        return {**meta, "title": item.get("title", ""), "status": "failed"}

    pdf_bytes = images_to_pdf(images)
    result = {
        "fid": fid,
        "title": item.get("title", ""),
        "pages": meta.get("pages"),
        "pdf_bytes": len(pdf_bytes),
        "status": "ok",
    }
    if apply:
        target = out_dir / safe_filename(item.get("title", ""), fid)
        target.write_bytes(pdf_bytes)
        result["file"] = str(target)
    return result


def collect_targets() -> list[dict]:
    """Document có link Drive file và chưa có `attachments`."""
    from app.db import db_client

    if not db_client.ping() or db_client.db is None:
        return []
    collection = db_client.db.policies
    items = []
    for doc in collection.find({"source": {"$regex": "drive.google.com/file"}}, {"title": 1, "source": 1}):
        match = re.search(r"/file/d/([A-Za-z0-9_-]+)", str(doc.get("source") or ""))
        if match:
            items.append({"fid": match.group(1), "title": str(doc.get("title") or "")})
    return items


async def run(args: argparse.Namespace) -> int:
    import httpx

    if args.fid:
        targets = [{"fid": args.fid, "title": args.title or args.fid}]
    else:
        targets = collect_targets()
        if not targets:
            print("Không kết nối được MongoDB hoặc không có document nào dùng link Drive file.")
            return 2
    if args.limit:
        targets = targets[: args.limit]

    print(f"{len(targets)} file cần lấy | out={args.out} | apply={args.apply}")
    out_dir = Path(args.out)
    if args.apply:
        out_dir.mkdir(parents=True, exist_ok=True)

    sem = asyncio.Semaphore(CONCURRENCY)
    results: list[dict] = []

    async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as client:
        async def worker(item: dict) -> None:
            async with sem:
                try:
                    results.append(await rescue_one(client, item, out_dir, args.apply))
                except Exception as exc:  # noqa: BLE001 - báo lỗi từng file, không dừng cả lô
                    results.append({"fid": item["fid"], "title": item.get("title", ""),
                                    "status": "error", "error": f"{type(exc).__name__}: {str(exc)[:120]}"})

        await asyncio.gather(*(worker(item) for item in targets))

    ok = [r for r in results if r["status"] == "ok"]
    failed = [r for r in results if r["status"] != "ok"]
    print(f"\nthành công: {len(ok)} | lỗi: {len(failed)}")
    for item in ok:
        print(f"  {item['pages']:3d} trang | {item['pdf_bytes']/1024:7.0f} KB | {item['title'][:56]}")
    for item in failed:
        print(f"  LỖI {item.get('error', '?'):28s} | {item.get('title', '')[:56]}")

    if args.apply and ok:
        manifest = out_dir / "_manifest.json"
        payload = {"generatedAt": datetime.now(timezone.utc).isoformat(), "items": ok}
        manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nmanifest: {manifest}")
    return 0 if not failed else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Dựng PDF từ trang preview của Drive bị chặn tải.")
    parser.add_argument("--apply", action="store_true", help="ghi file PDF (mặc định chỉ đo)")
    parser.add_argument("--out", default="data/guta_rescued_pdf", help="thư mục đầu ra")
    parser.add_argument("--limit", type=int, default=0, help="giới hạn số file xử lý")
    parser.add_argument("--fid", help="chỉ xử lý một file Drive id")
    parser.add_argument("--title", help="tiêu đề cho --fid")
    parser.add_argument("--list", action="store_true", help="liệt kê file cần lấy rồi thoát")
    args = parser.parse_args()

    if args.list:
        for item in collect_targets():
            print(f"  {item['fid']}  {item['title'][:70]}")
        return 0
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())
