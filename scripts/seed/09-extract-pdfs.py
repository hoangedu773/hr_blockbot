"""Extract text from PDFs under `data/` and emit 08-compatible knowledge JSONL.

This is the missing step between "cào PDF" and the ingestion pipeline: the scraper
produces PDFs, this script turns each page into a searchable chunk, `08` pushes it
to Atlas, `07` gives it vectors — then the agent can cite the exact page as evidence.

Usage (from the repo root):
  python scripts/seed/09-extract-pdfs.py                       # scan data/**.pdf -> data/knowledge_pdf/
  python scripts/seed/09-extract-pdfs.py --file path/to/x.pdf
  python scripts/seed/09-extract-pdfs.py --min-chars 50        # skip nearly-empty pages

Requires `pypdf` (already in apps/ai-service requirements).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = REPO_ROOT / "data"
OUT_DIR = DATA_ROOT / "knowledge_pdf"
MIN_PAGE_CHARS = 30

sys.path.insert(0, str(DATA_ROOT.parent / "apps" / "ai-service"))

from pypdf import PdfReader  # noqa: E402


def clean_title(stem: str) -> str:
    return stem.replace("GUTA_", "").replace("_", " ").strip()


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract PDF text into knowledge JSONL.")
    parser.add_argument("--file", action="append", default=[], help="specific PDF (repeatable)")
    parser.add_argument("--min-chars", type=int, default=MIN_PAGE_CHARS)
    args = parser.parse_args()

    if args.file:
        pdfs = [Path(p) for p in args.file]
    else:
        pdfs = sorted(DATA_ROOT.rglob("*.pdf"))
    pdfs = [p for p in pdfs if "knowledge_pdf" not in p.parts]
    if not pdfs:
        print("Không tìm thấy PDF nào trong data/. Thả PDF vào data/ rồi chạy lại.")
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    total_pages = total_records = 0
    for pdf in pdfs:
        try:
            reader = PdfReader(str(pdf))
        except Exception as exc:  # noqa: BLE001 - a corrupt file must not stop the batch
            print(f"LỖI đọc {pdf.name}: {type(exc).__name__} — bỏ qua")
            continue
        title = clean_title(pdf.stem)
        records = []
        for index, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            if len(text) < args.min_chars:
                continue  # bìa/trang trống
            records.append(
                {
                    "title": title,
                    "question": f"Trang {index}",
                    "content": text,
                    "source_url": f"file://{pdf.relative_to(REPO_ROOT).as_posix()}#page={index}",
                    "content_type": "pdf",
                    "knowledge_status": "active",
                    "text_sha256": sha256(text),
                }
            )
        total_pages += len(reader.pages)
        total_records += len(records)
        out_name = sha256(str(pdf))[:10] + ".jsonl"
        out_path = OUT_DIR / out_name
        out_path.write_text(
            "\n".join(json.dumps(record, ensure_ascii=False) for record in records),
            encoding="utf-8",
        )
        print(f"{pdf.name}: {len(reader.pages)} trang -> {len(records)} đoạn -> {out_path.name}")

    print(
        f"\nTổng: {len(pdfs)} PDF · {total_pages} trang · {total_records} đoạn có chữ."
        f"\nBước tiếp theo:"
        f"\n  python scripts/seed/08-ingest-knowledge.py --file \"data/knowledge_pdf/*.jsonl\" --apply"
        f"\n  python scripts/seed/07-generate-embeddings.py --apply"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
