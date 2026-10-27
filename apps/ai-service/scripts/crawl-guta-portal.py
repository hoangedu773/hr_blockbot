"""Crawler, text sanitizer, classifier, and RAG dataset generator for Cổng thông tin Guta Cafe.

Endpoints:
  - Count: https://congthongtin.gutacafe.com/api/posts/count
  - List:  https://congthongtin.gutacafe.com/api/posts?_limit=50&_start={start}
  - Detail: https://congthongtin.gutacafe.com/api/posts/{id}

Outputs:
  - data/guta_portal/raw-posts.jsonl
  - data/guta_portal/portal-sources.jsonl
  - data/guta_portal/portal-knowledge.jsonl
  - data/guta_portal/portal-knowledge.md
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# Monorepo import resolution for app.rag.corpus
SCRIPT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = SCRIPT_DIR.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import httpx
from bs4 import BeautifulSoup

from app.rag.corpus import PolicyChunk, chunks_from_documents

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("guta_crawler")

BASE_URL = "https://congthongtin.gutacafe.com"
API_BASE = f"{BASE_URL}/api"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
}


def normalize_str(text: Optional[str]) -> str:
    """Normalize unicode to NFC and strip surrounding whitespace."""
    if not text:
        return ""
    return unicodedata.normalize("NFC", text).strip()


def clean_html(html_content: Optional[str], cover_url: Optional[str] = None) -> str:
    """Sanitize HTML content into structured plain text/markdown.

    Preserves headings, lists, paragraphs, Drive iframe embeds, and hyperlinks.
    Strips inline styles, fonts, redundant figures, and empty markup.
    """
    if not html_content:
        return ""

    soup = BeautifulSoup(html_content, "html.parser")

    # 1. Transform iframe embeds (Drive previews, YouTube videos)
    for iframe in soup.find_all("iframe"):
        src = (iframe.get("src") or "").strip()
        if not src:
            continue
        if "drive.google.com" in src:
            iframe.replace_with(f"\n\n[Tài liệu đính kèm (Google Drive)]: {src}\n\n")
        elif "youtube.com" in src or "youtu.be" in src:
            iframe.replace_with(f"\n\n[Video hướng dẫn (YouTube)]: {src}\n\n")
        else:
            iframe.replace_with(f"\n\n[Liên kết nhúng]: {src}\n\n")

    # 2. Transform anchor links
    for a in soup.find_all("a"):
        href = (a.get("href") or "").strip()
        text = a.get_text(strip=True)
        if href:
            if not text:
                text = "Liên kết"
            if text in ("Link tải fil", "Link tải"):
                text = "Link tải file"
            a.replace_with(f" [{text}]({href}) ")

    # 3. Transform headings
    for h in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        h_text = h.get_text(strip=True)
        if not h_text:
            h.decompose()
            continue
        level = int(h.name[1])
        hashes = "#" * level
        h.replace_with(f"\n\n{hashes} {h_text}\n\n")

    # 4. Transform lists
    for ul in soup.find_all(["ul", "ol"]):
        for li in ul.find_all("li"):
            li_text = li.get_text(strip=True)
            if li_text:
                li.replace_with(f"\n- {li_text}")

    # 5. Transform line breaks and paragraphs
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for p in soup.find_all("p"):
        p_text = p.get_text(strip=True)
        if p_text:
            p.replace_with(f"\n\n{p_text}\n\n")
        else:
            p.decompose()

    # 6. Extract full text and clean whitespace
    raw_text = soup.get_text()
    raw_text = normalize_str(raw_text)

    cleaned_lines = []
    for line in raw_text.split("\n"):
        line = line.strip()
        if re.fullmatch(r"#+\s*", line):
            continue
        if line:
            line = re.sub(r"-(\[[^\]]+\])", r"- \1", line)
            cleaned_lines.append(line)

    result = "\n".join(cleaned_lines)

    # 7. Append S3 PDF/file if present and not already mentioned
    if cover_url and cover_url not in result:
        result += f"\n\n[File đính kèm (S3)]: {cover_url}"

    return result.strip()


def extract_attachment_url(post: Dict[str, Any]) -> Optional[str]:
    """Extract primary attachment URL: S3 PDF/DOCX or Google Drive document."""
    cover = post.get("cover")
    if isinstance(cover, dict):
        url = cover.get("url")
        ext = (cover.get("ext") or "").lower()
        if url and ext in (".pdf", ".docx", ".doc", ".xlsx", ".xls"):
            return url

    # Check iframe embeds in HTML
    content = post.get("content") or ""
    soup = BeautifulSoup(content, "html.parser")
    for iframe in soup.find_all("iframe"):
        src = (iframe.get("src") or "").strip()
        if "drive.google.com" in src or "docs.google.com" in src:
            return src

    # Check anchor links
    for a in soup.find_all("a"):
        href = (a.get("href") or "").strip()
        if "drive.google.com" in href or "docs.google.com" in href or href.endswith(".pdf"):
            return href

    # Fallback to cover image if present
    if isinstance(cover, dict) and cover.get("url"):
        return cover.get("url")

    return None


def classify_post(post: Dict[str, Any]) -> Tuple[str, str, bool]:
    """Classify post into P1, P2, P3, or P4 according to business rules.

    Returns:
        (priority, category, exclude_from_rag)
    """
    title = normalize_str(post.get("title", ""))
    t_up = title.upper()

    # --- P4: Internal Social / Welcomes / Personal Appointments / Filtered out ---
    if re.search(r"CHÀO\s+(?:MỪNG|ĐÓN)\s+(?:THÀNH|NHÂN)\s+VIÊN\s+MỚI", t_up):
        return "P4", "Chào mừng nhân viên mới", True

    if re.search(r"QUYẾT\s+ĐỊNH\s+(?:BỔ\s+NHIỆM|ĐIỀU\s+CHUYỂN|ĐIỀU\s+CHỈNH\s+VÀ\s+BỔ\s+NHIỆM\s+MỚI)", t_up):
        return "P4", "Bổ nhiệm & Điều chuyển cá nhân", True

    social_patterns = [
        "SINH NHẬT",
        "YEAR END PARTY",
        "TIKTOK",
        "TRUNG THU",
        "PHỤ NỮ",
        "8/3",
        "20/10",
        "GENZ",
        "BIỆT ĐỘI GUTA",
        "TIẾNG CƯỜI",
        "TRẢI NGHIỆM KHI LÀM VIỆC",
        "KHAI TRƯƠNG",
        "THỰC TẬP SINH",
        "NGÀY HỘI VIỆC LÀM",
        "MỘT NGÀY LÀM VIỆC CỦA GUTA-ER",
        "QUẢN LÝ KHU VỰC (AM) CỦA GUTA LÀ AI",
        "QUẢN LÝ KHU VỰC - MẢNH GHÉP",
        "ĐÁNH GIÁ NÔI BỘ QUÝ I-2024",
    ]
    if any(k in t_up for k in social_patterns):
        return "P4", "Sự kiện & Văn hóa nội bộ", True

    # --- P3: Forms & Admin Procedures ---
    p3_patterns = [
        "BIỂU MẪU",
        "KỲ CHẤM CÔNG",
        "HƯỚNG DẪN SỬ DỤNG CỬA",
        "PHƯƠNG THỨC LIÊN HỆ NỘI BỘ",
    ]
    if any(k in t_up for k in p3_patterns):
        return "P3", "Biểu mẫu & Thủ tục hành chính", False

    # --- P2: Operations & Training ---
    p2_patterns = [
        "5 NGÀY ĐẦU",
        "TÀI LIỆU ĐÀO TẠO",
        "BÍ KÍP",
        "KỸ NĂNG MỀM",
        "LỘ TRÌNH PHÁT TRIỂN",
        "QUY TRÌNH TUYỂN DỤNG",
        "BẠN PHÁT TRIỂN",
        "NÂNG TẦM CÔNG VIỆC",
        "CHƯƠNG TRÌNH ĐÀO TẠO",
        "GUTA APP",
    ]
    if any(k in t_up for k in p2_patterns):
        return "P2", "Vận hành & Đào tạo", False

    # --- P1: Core Policies ---
    p1_keywords = [
        "QUY ĐỊNH",
        "CHÍNH SÁCH LƯƠNG",
        "LƯƠNG",
        "THƯỞNG",
        "PHỤ CẤP",
        "ĐỊNH BIÊN",
        "KỶ LUẬT",
        "XỬ PHẠT",
        "HAO HỤT",
        "KPI",
        "ĐÃI NGỘ",
        "NGHỈ TẾT",
        "NGHỈ LỄ",
        "SƠ ĐỒ TỔ CHỨC",
        "GIẢM GIÁ CHO NHÂN VIÊN",
        "LỊCH TRÌNH THANH TOÁN LƯƠNG",
        "GIAN LẬN",
        "THU NHẬP CA ĐÊM",
    ]
    if any(k in t_up for k in p1_keywords):
        return "P1", "Chính sách & Quy định", False

    return "P4", "Tin tức & Thông tin chung", True


async def fetch_with_retry(
    client: httpx.AsyncClient,
    url: str,
    max_retries: int = 3,
    backoff: float = 1.0,
) -> httpx.Response:
    """Fetch URL with selective retry: only retry on 5xx, 429, timeout, network errors.

    Client errors (400, 401, 403, 404, etc. except 429) fail-fast without blind retries.
    """
    for attempt in range(1, max_retries + 1):
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp

            # Non-retryable client errors (400, 403, 404)
            if 400 <= resp.status_code < 500 and resp.status_code != 429:
                logger.warning("GET %s returned non-retryable client error HTTP %d", url, resp.status_code)
                resp.raise_for_status()

            # Retryable server error (5xx) or rate limit (429)
            logger.warning(
                "GET %s returned HTTP %d (attempt %d/%d, retryable)",
                url,
                resp.status_code,
                attempt,
                max_retries,
            )
        except (httpx.RequestError, httpx.TimeoutException) as exc:
            logger.warning("GET %s network error: %s (attempt %d/%d)", url, exc, attempt, max_retries)

        if attempt < max_retries:
            await asyncio.sleep(backoff * (2 ** (attempt - 1)))

    raise RuntimeError(f"Exhausted retries ({max_retries}) for {url}")


async def crawl_all_posts() -> List[Dict[str, Any]]:
    """Crawl full details for all posts from Strapi API with resilient exception handling."""
    async with httpx.AsyncClient(headers=HEADERS, timeout=15.0) as client:
        # 1. Fetch expected post count
        count_resp = await fetch_with_retry(client, f"{API_BASE}/posts/count")
        expected_count = int(count_resp.text.strip())
        logger.info("Strapi total post count reported: %d", expected_count)

        # 2. Paginate post summaries
        summaries: List[Dict[str, Any]] = []
        limit = 50
        start = 0
        while True:
            list_url = f"{API_BASE}/posts?_limit={limit}&_start={start}"
            logger.info("Fetching post list from offset %d...", start)
            resp = await fetch_with_retry(client, list_url)
            batch = resp.json()
            if not batch:
                break
            summaries.extend(batch)
            start += len(batch)
            if len(batch) < limit:
                break

        logger.info("Fetched %d post summaries in listing", len(summaries))

        # 3. Concurrently fetch full detail for each post
        logger.info("Fetching full detail for %d posts...", len(summaries))
        sem = asyncio.Semaphore(12)

        async def fetch_detail(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            post_id = item["id"]
            detail_url = f"{API_BASE}/posts/{post_id}"
            async with sem:
                try:
                    resp = await fetch_with_retry(client, detail_url)
                    return resp.json()
                except Exception as exc:
                    logger.warning("Failed to fetch detail for post id %s: %s", post_id, exc)
                    return None

        tasks = [fetch_detail(item) for item in summaries]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        detailed_posts: List[Dict[str, Any]] = []
        for res in results:
            if isinstance(res, Exception):
                logger.warning("Post fetch task raised unhandled exception: %s", res)
            elif isinstance(res, dict):
                detailed_posts.append(res)

        detailed_posts.sort(key=lambda p: p["id"])
        logger.info("Successfully fetched %d full post details", len(detailed_posts))
        return detailed_posts


def load_portal_chunks(path: Optional[Union[str, Path]] = None) -> List[PolicyChunk]:
    """Load portal knowledge documents from JSONL and adapt seamlessly to PolicyChunk list."""
    if path is None:
        repo_root = AI_SERVICE_DIR.parent.parent
        path = repo_root / "data" / "guta_portal" / "portal-knowledge.jsonl"

    target_path = Path(path)
    if not target_path.exists():
        raise FileNotFoundError(f"Knowledge file not found at: {target_path}")

    docs: List[Dict[str, Any]] = []
    with open(target_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                docs.append(json.loads(line))

    return chunks_from_documents(docs)


def build_markdown_document(knowledge_docs: List[Dict[str, Any]]) -> str:
    """Generate portal-knowledge.md synthesizing all P1 and P2 policies."""
    lines: List[str] = [
        "# CẨM NANG CHÍNH SÁCH & VẬN HÀNH GUTA CAFE",
        "",
        "> **Nguồn dữ liệu:** Cổng thông tin Guta Cafe (`https://congthongtin.gutacafe.com`)",
        "> **Mục đích:** Tra cứu chính sách, quy chế đãi ngộ, quy trình vận hành và tài liệu đào tạo nội bộ.",
        "> **Cập nhật:** Tự động đồng bộ và chuẩn hóa từ hệ thống Strapi API.",
        "",
        "---",
        "",
        "## MỤC LỤC TÀI LIỆU",
        "",
    ]

    p1_items = [d for d in knowledge_docs if d["priority"] == "P1"]
    p2_items = [d for d in knowledge_docs if d["priority"] == "P2"]
    p3_items = [d for d in knowledge_docs if d["priority"] == "P3"]

    lines.append("### Phần 1: Chính Sách & Quy Định Cốt Lõi (P1)")
    for i, item in enumerate(p1_items, 1):
        doc = item["document"]
        slug_anchor = re.sub(r"[^\w\s-]", "", doc).strip().lower()
        slug_anchor = re.sub(r"[-\s]+", "-", slug_anchor)
        lines.append(f"{i}. [{doc}](#{slug_anchor})")

    lines.append("")
    lines.append("### Phần 2: Quy Trình Vận Hành & Đào Tạo (P2)")
    for i, item in enumerate(p2_items, 1):
        doc = item["document"]
        slug_anchor = re.sub(r"[^\w\s-]", "", doc).strip().lower()
        slug_anchor = re.sub(r"[-\s]+", "-", slug_anchor)
        lines.append(f"{i}. [{doc}](#{slug_anchor})")

    if p3_items:
        lines.append("")
        lines.append("### Phụ Lục: Biểu Mẫu & Thủ Tục Hành Chính (P3)")
        for i, item in enumerate(p3_items, 1):
            doc = item["document"]
            slug_anchor = re.sub(r"[^\w\s-]", "", doc).strip().lower()
            slug_anchor = re.sub(r"[-\s]+", "-", slug_anchor)
            lines.append(f"{i}. [{doc}](#{slug_anchor})")

    lines.append("")
    lines.append("---")
    lines.append("")

    # Section 1: P1
    lines.append("# PHẦN 1: CHÍNH SÁCH & QUY ĐỊNH CỐT LÕI (P1)")
    lines.append("")
    for item in p1_items:
        lines.append(f"## {item['document']}")
        lines.append("")
        lines.append(f"- **Phân loại:** {item['category']} ({item['priority']})")
        lines.append(f"- **Nguồn văn bản:** [{item['source']}]({item['source']})")
        if item.get("attachment_url"):
            lines.append(f"- **Tài liệu đính kèm:** [{item['attachment_url']}]({item['attachment_url']})")
        lines.append("")
        chunk_text = item["chunks"][0]["text"] if item.get("chunks") else ""
        lines.append(chunk_text)
        lines.append("")
        lines.append("---")
        lines.append("")

    # Section 2: P2
    lines.append("# PHẦN 2: QUY TRÌNH VẬN HÀNH & ĐÀO TẠO (P2)")
    lines.append("")
    for item in p2_items:
        lines.append(f"## {item['document']}")
        lines.append("")
        lines.append(f"- **Phân loại:** {item['category']} ({item['priority']})")
        lines.append(f"- **Nguồn văn bản:** [{item['source']}]({item['source']})")
        if item.get("attachment_url"):
            lines.append(f"- **Tài liệu đính kèm:** [{item['attachment_url']}]({item['attachment_url']})")
        lines.append("")
        chunk_text = item["chunks"][0]["text"] if item.get("chunks") else ""
        lines.append(chunk_text)
        lines.append("")
        lines.append("---")
        lines.append("")

    # Section 3: P3
    if p3_items:
        lines.append("# PHẦN 3: BIỂU MẪU & THỦ TỤC HÀNH CHÍNH (P3)")
        lines.append("")
        for item in p3_items:
            lines.append(f"## {item['document']}")
            lines.append("")
            lines.append(f"- **Phân loại:** {item['category']} ({item['priority']})")
            lines.append(f"- **Nguồn văn bản:** [{item['source']}]({item['source']})")
            if item.get("attachment_url"):
                lines.append(f"- **Tài liệu đính kèm:** [{item['attachment_url']}]({item['attachment_url']})")
            lines.append("")
            chunk_text = item["chunks"][0]["text"] if item.get("chunks") else ""
            lines.append(chunk_text)
            lines.append("")
            lines.append("---")
            lines.append("")

    return "\n".join(lines).strip() + "\n"


async def main() -> None:
    repo_root = AI_SERVICE_DIR.parent.parent
    data_dir = repo_root / "data" / "guta_portal"
    data_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Target data output directory: %s", data_dir)

    # 1. Crawl all posts with resilience
    posts = await crawl_all_posts()
    logger.info("Total posts crawled: %d", len(posts))

    # 2. Save raw-posts.jsonl
    raw_posts_file = data_dir / "raw-posts.jsonl"
    with open(raw_posts_file, "w", encoding="utf-8") as f:
        for p in posts:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")
    logger.info("Saved %d raw posts to %s", len(posts), raw_posts_file)

    # 3. Classify and build sources and RAG knowledge documents
    sources: List[Dict[str, Any]] = []
    knowledge_docs: List[Dict[str, Any]] = []

    priority_stats = {"P1": 0, "P2": 0, "P3": 0, "P4": 0}

    for p in posts:
        post_id = p["id"]
        title = normalize_str(p.get("title", ""))
        slug = normalize_str(p.get("slug", ""))
        published_at = normalize_str(p.get("published_at", ""))
        url = f"{BASE_URL}/post/{slug}"

        cover = p.get("cover")
        cover_url = cover.get("url") if isinstance(cover, dict) else None
        attachment_url = extract_attachment_url(p)

        priority, category, exclude_from_rag = classify_post(p)
        priority_stats[priority] += 1

        # Sources catalog entry
        sources.append({
            "id": post_id,
            "title": title,
            "slug": slug,
            "published_at": published_at,
            "priority": priority,
            "category": category,
            "url": url,
            "attachment_url": attachment_url,
            "exclude_from_rag": exclude_from_rag,
        })

        # RAG Document format compatible with corpus.py (chunks_from_documents)
        if not exclude_from_rag:
            clean_text = clean_html(p.get("content"), cover_url)
            doc_text = f"**{title}**\n\n{clean_text}" if not clean_text.startswith(title) else clean_text

            knowledge_docs.append({
                "document": title,
                "version": "v1.0",
                "source": url,
                "departmentIds": [],
                "priority": priority,
                "category": category,
                "attachment_url": attachment_url,
                "chunks": [
                    {
                        "order": 0,
                        "article": f"Nội dung: {title}",
                        "text": doc_text,
                    }
                ],
            })

    # 4. Save portal-sources.jsonl
    sources_file = data_dir / "portal-sources.jsonl"
    with open(sources_file, "w", encoding="utf-8") as f:
        for s in sources:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    logger.info("Saved %d sources catalog entries to %s", len(sources), sources_file)

    # 5. Save portal-knowledge.jsonl
    knowledge_file = data_dir / "portal-knowledge.jsonl"
    with open(knowledge_file, "w", encoding="utf-8") as f:
        for doc in knowledge_docs:
            f.write(json.dumps(doc, ensure_ascii=False) + "\n")
    logger.info("Saved %d RAG knowledge documents to %s", len(knowledge_docs), knowledge_file)

    # 6. Save portal-knowledge.md
    md_content = build_markdown_document(knowledge_docs)
    md_file = data_dir / "portal-knowledge.md"
    with open(md_file, "w", encoding="utf-8") as f:
        f.write(md_content)
    logger.info("Saved compiled markdown document to %s", md_file)

    # 7. Self-verification with corpus.py loader
    policy_chunks = load_portal_chunks(knowledge_file)
    logger.info("Verified load_portal_chunks() -> %d PolicyChunks generated!", len(policy_chunks))

    # 8. Print execution summary
    print("\n" + "=" * 60)
    print("HOÀN TẤT THU THẬP & XỬ LÝ DỮ LIỆU CỔNG THÔNG TIN GUTA CAFE")
    print("=" * 60)
    print(f"Tổng số bài cào thành công: {len(posts)}/199")
    print(f"Thống kê phân loại:")
    print(f"  - P1 (Chính sách & Quy định cốt lõi): {priority_stats['P1']} bài")
    print(f"  - P2 (Vận hành & Đào tạo):          {priority_stats['P2']} bài")
    print(f"  - P3 (Biểu mẫu & Thủ tục hành chính): {priority_stats['P3']} bài")
    print(f"  - P4 (Tin tức nội bộ / Excluded):    {priority_stats['P4']} bài")
    print(f"Tổng số documents nạp RAG (P1 + P2 + P3): {len(knowledge_docs)}")
    print(f"Tổng số PolicyChunks nạp qua chunks_from_documents(): {len(policy_chunks)}")
    print(f"File kết quả sinh ra tại: {data_dir.resolve()}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
