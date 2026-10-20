#!/usr/bin/env python3
"""Seed 05 — ingest `policies` (văn bản pháp luật thật + quy chế nội bộ tự soạn).

Mục đích (`docs/design/data-derivation.md` §6, `22-erd-overall.md §3`): F3 cần `policies`
có nội dung thật để RAG trả lời kèm `document/version/article/source`.

Thành phần (mỗi document ≥ 5 chunk, 100% có `source` + `version`, KHÔNG embedding —
embedding do Phase 4 sinh):
  1. Bộ luật Lao động 2019 — public-document (Luật 45/2019/QH14)
  2. Nghị định 145/2020/NĐ-CP — public-document (hướng dẫn BLLĐ)
  3-5. Quy chế nội bộ GUTA — authored (nhóm tự soạn, dán nhãn rõ, không phải văn bản
       pháp luật và không trích điều khoản luật nào chưa kiểm)

Nhãn provenance: `provenance = "public-document" | "authored"` trên từng document.
Nội dung luật được tóm tắt đúng theo điều/khoản đã đối chiếu; không trích nguyên văn dài
và không bịa số điều. Quy chế nội bộ dùng số điều của chính quy chế (do nhóm soạn).

Idempotent: upsert theo `(title, version)`; `seededAt` chỉ ghi lần đầu ($setOnInsert)
nên chạy lại `modified=0`. `--dry-run` in thống kê; `--revert` xoá document seededBy.

Chạy (PowerShell, .env nằm ở worktree chính):
  $env:MONGODB_URI = <chuỗi Atlas có /hr_bot>; python scripts/seed/05-policies.py --dry-run
"""
import os
import sys
import argparse
import datetime

from pymongo import MongoClient, UpdateOne

SEED = "seed-05"
MIN_CHUNKS = 5

BLLD_SOURCE = "https://vanban.chinhphu.vn/?pageid=27160&docid=198540"
ND145_SOURCE = "https://vanban.chinhphu.vn/?pageid=27160&docid=201967"
AUTHORED_SOURCE = "authored:scripts/seed/05-policies.py"


def chunk(document, version, source, article, text, order, effective_from=None):
    c = {
        "document": document,
        "version": version,
        "article": article,
        "source": source,
        "text": text,
        "order": order,
    }
    if effective_from:
        c["effectiveFrom"] = effective_from
    return c


def policy(title, version, source, category, provenance, effective_from, chunks):
    return {
        "title": title,
        "version": version,
        "source": source,
        "category": category,
        "provenance": provenance,
        "effectiveFrom": effective_from,
        "chunks": chunks,
    }


BLLD = "Bộ luật Lao động 2019"
BLLD_VERSION = "45/2019/QH14"
BLLD_EFFECTIVE = datetime.datetime(2021, 1, 1, tzinfo=datetime.timezone.utc)

ND145 = "Nghị định 145/2020/NĐ-CP"
ND145_VERSION = "145/2020/NĐ-CP"
ND145_EFFECTIVE = datetime.datetime(2021, 2, 1, tzinfo=datetime.timezone.utc)

GUTA = "Quy chế nội bộ GUTA"
GUTA_VERSION = "v1.0"
GUTA_EFFECTIVE = datetime.datetime(2026, 10, 1, tzinfo=datetime.timezone.utc)


POLICIES = [
    policy(
        BLLD, BLLD_VERSION, BLLD_SOURCE, "luật", "public-document", BLLD_EFFECTIVE,
        [
            chunk(BLLD, BLLD_VERSION, BLLD_SOURCE, "Điều 105",
                  "Thời giờ làm việc bình thường không quá 08 giờ trong 01 ngày và không quá 48 giờ "
                  "trong 01 tuần. Người sử dụng lao động có trách nhiệm bảo đảm thời giờ làm việc, "
                  "thời giờ nghỉ ngơi theo quy định pháp luật.", 0, BLLD_EFFECTIVE),
            chunk(BLLD, BLLD_VERSION, BLLD_SOURCE, "Điều 107 khoản 1-2",
                  "Làm thêm giờ là khoảng thời gian làm việc ngoài thời giờ làm việc bình thường. "
                  "Chỉ được sử dụng làm thêm giờ khi người lao động đồng ý; số giờ làm thêm không quá "
                  "50% số giờ làm việc bình thường trong 01 ngày; nếu làm việc theo tuần thì tổng số "
                  "giờ bình thường và làm thêm không quá 12 giờ/ngày; không quá 40 giờ trong 01 tháng.", 1, BLLD_EFFECTIVE),
            chunk(BLLD, BLLD_VERSION, BLLD_SOURCE, "Điều 107 khoản 3",
                  "Giới hạn làm thêm giờ theo năm: không quá 200 giờ trong 01 năm. Một số trường hợp "
                  "được làm thêm tới 300 giờ/năm, ví dụ sản xuất - gia công hàng xuất khẩu, giải quyết "
                  "hậu quả thiên tai/hỏa hoạn/dịch bệnh, hoặc do thiếu lao động lành nghề, thiếu nguyên "
                  "liệu đột xuất.", 2, BLLD_EFFECTIVE),
            chunk(BLLD, BLLD_VERSION, BLLD_SOURCE, "Điều 98",
                  "Tiền lương làm thêm giờ được trả ít nhất 150% tiền lương ngày làm việc bình thường; "
                  "200% vào ngày nghỉ hằng tuần; 300% vào ngày nghỉ lễ, tết (chưa kể tiền lương ngày "
                  "nghỉ có hưởng lương với người lao động hưởng lương theo ngày). Làm thêm vào ban đêm "
                  "còn được trả thêm 20% tiền lương làm việc ban ngày của ngày tương ứng.", 3, BLLD_EFFECTIVE),
            chunk(BLLD, BLLD_VERSION, BLLD_SOURCE, "Điều 112",
                  "Người lao động được nghỉ làm việc, hưởng nguyên lương các ngày lễ, tết: Tết Dương "
                  "lịch 01 ngày; Tết Âm lịch 05 ngày; Giỗ Tổ Hùng Vương 01 ngày (10/3 âm lịch); Ngày "
                  "Chiến thắng 01 ngày (30/4); Ngày Quốc tế Lao động 01 ngày (1/5); Ngày Quốc khánh "
                  "02 ngày (2/9 và 01 ngày liền kề trước hoặc sau).", 4, BLLD_EFFECTIVE),
            chunk(BLLD, BLLD_VERSION, BLLD_SOURCE, "Điều 113 khoản 1",
                  "Người lao động làm việc đủ 12 tháng được nghỉ hằng năm hưởng nguyên lương: 12 ngày "
                  "làm việc với điều kiện bình thường; 14 ngày với người chưa thành niên, lao động "
                  "khuyết tật hoặc nghề nặng nhọc, độc hại, nguy hiểm; 16 ngày với nghề đặc biệt nặng "
                  "nhọc, độc hại, nguy hiểm.", 5, BLLD_EFFECTIVE),
            chunk(BLLD, BLLD_VERSION, BLLD_SOURCE, "Điều 113 khoản 2-4, Điều 114",
                  "Làm chưa đủ 12 tháng thì số ngày nghỉ hằng năm theo tỷ lệ số tháng đã làm. Khi thôi "
                  "việc mà chưa nghỉ hết phép năm thì được thanh toán tiền lương cho những ngày chưa "
                  "nghỉ. Cứ đủ 05 năm làm việc thì phép năm tăng thêm 01 ngày. Người sử dụng lao động "
                  "phải quy định lịch nghỉ hằng năm sau khi tham khảo ý kiến người lao động.", 6, BLLD_EFFECTIVE),
            chunk(BLLD, BLLD_VERSION, BLLD_SOURCE, "Điều 115",
                  "Nghỉ việc riêng hưởng nguyên lương: kết hôn 03 ngày; con đẻ/con nuôi kết hôn 01 "
                  "ngày; cha mẹ (kể cả bên vợ/chồng), vợ/chồng, con chết 03 ngày. Nghỉ không hưởng "
                  "lương 01 ngày khi ông bà nội/ngoại, anh chị em ruột chết hoặc cha/mẹ, anh chị em "
                  "ruột kết hôn. Ngoài ra hai bên có thể thỏa thuận nghỉ không hưởng lương.", 7, BLLD_EFFECTIVE),
            chunk(BLLD, BLLD_VERSION, BLLD_SOURCE, "Điều 104",
                  "Thưởng là số tiền, tài sản hoặc hình thức khác mà người sử dụng lao động thưởng cho "
                  "người lao động căn cứ kết quả sản xuất kinh doanh và mức độ hoàn thành công việc. "
                  "Quy chế thưởng do người sử dụng lao động quyết định và công bố công khai tại nơi "
                  "làm việc sau khi tham khảo ý kiến tổ chức đại diện người lao động.", 8, BLLD_EFFECTIVE),
        ],
    ),
    policy(
        ND145, ND145_VERSION, ND145_SOURCE, "nghị định", "public-document", ND145_EFFECTIVE,
        [
            chunk(ND145, ND145_VERSION, ND145_SOURCE, "Điều 1",
                  "Nghị định quy định chi tiết và hướng dẫn thi hành một số điều của Bộ luật Lao động "
                  "về điều kiện lao động và quan hệ lao động (hợp đồng lao động, thời giờ làm việc - "
                  "nghỉ ngơi, kỷ luật lao động, lao động nước ngoài và các nội dung liên quan).", 0, ND145_EFFECTIVE),
            chunk(ND145, ND145_VERSION, ND145_SOURCE, "Thời giờ làm việc, nghỉ ngơi",
                  "Nghị định hướng dẫn chi tiết việc xác định thời giờ làm việc, thời giờ nghỉ ngơi, "
                  "làm thêm giờ, làm việc ban đêm và nghỉ hằng năm, gồm cách tính số ngày nghỉ hằng năm "
                  "theo tỷ lệ tháng làm việc và các khoảng thời gian được coi là thời gian làm việc để "
                  "tính phép năm.", 1, ND145_EFFECTIVE),
            chunk(ND145, ND145_VERSION, ND145_SOURCE, "Hợp đồng lao động",
                  "Nghị định hướng dẫn nội dung, hình thức giao kết và quản lý hợp đồng lao động; các "
                  "trường hợp được giao kết bằng lời nói; việc sửa đổi, chấm dứt hợp đồng và trách nhiệm "
                  "của hai bên khi chấm dứt.", 2, ND145_EFFECTIVE),
            chunk(ND145, ND145_VERSION, ND145_SOURCE, "Kỷ luật lao động",
                  "Nghị định hướng dẫn trình tự, thủ tục xử lý kỷ luật lao động, việc xóa kỷ luật và "
                  "trách nhiệm vật chất của người lao động; yêu cầu bảo đảm quyền giải trình, quyền tự "
                  "bào chữa và sự tham gia của tổ chức đại diện người lao động tại cơ sở.", 3, ND145_EFFECTIVE),
            chunk(ND145, ND145_VERSION, ND145_SOURCE, "Lao động nước ngoài",
                  "Nghị định quy định điều kiện, hồ sơ, trình tự cấp giấy phép lao động và việc tuyển "
                  "dụng, quản lý lao động nước ngoài làm việc tại Việt Nam, cùng trách nhiệm của người "
                  "sử dụng lao động.", 4, ND145_EFFECTIVE),
        ],
    ),
    policy(
        f"{GUTA} — Giờ làm việc và chấm công", GUTA_VERSION, AUTHORED_SOURCE,
        "quy trình nội bộ", "authored", GUTA_EFFECTIVE,
        [
            chunk(f"{GUTA} — Giờ làm việc và chấm công", GUTA_VERSION, AUTHORED_SOURCE, "Điều 1",
                  "Ca làm việc chuẩn của cửa hàng là 08 giờ/ngày, tối đa 48 giờ/tuần theo Bộ luật Lao "
                  "động 2019. Cửa hàng bố trí ca sáng, ca chiều và ca tối; lịch ca được công bố cho nhân "
                  "viên chậm nhất 03 ngày trước ngày làm việc đầu tiên của tuần.", 0, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Giờ làm việc và chấm công", GUTA_VERSION, AUTHORED_SOURCE, "Điều 2",
                  "Nhân viên chấm công vào/ra bằng máy vân tay hoặc ứng dụng điểm danh tại cửa hàng. "
                  "Chấm công thay thế chỉ được chấp nhận khi có xác nhận của quản lý cửa hàng trong "
                  "vòng 24 giờ.", 1, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Giờ làm việc và chấm công", GUTA_VERSION, AUTHORED_SOURCE, "Điều 3",
                  "Đi muộn hoặc về sớm dưới 15 phút phải báo quản lý trước khi ca bắt đầu; từ 03 lần "
                  "trong một tháng bị ghi nhận vào đánh giá chuyên cần. Không chấm công mà vắng mặt được "
                  "tính là nghỉ không phép và xử lý theo quy chế kỷ luật.", 2, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Giờ làm việc và chấm công", GUTA_VERSION, AUTHORED_SOURCE, "Điều 4",
                  "Làm thêm giờ chỉ khi được quản lý duyệt trước và nhân viên đồng ý; tổng làm thêm tối "
                  "đa 40 giờ/tháng và 200 giờ/năm. Bảng chấm công làm thêm được gửi về phòng nhân sự "
                  "cùng bảng lương tháng.", 3, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Giờ làm việc và chấm công", GUTA_VERSION, AUTHORED_SOURCE, "Điều 5",
                  "Nghỉ giữa ca ít nhất 30 phút đối với ca từ 06 giờ trở lên; thời gian nghỉ giữa ca "
                  "không tính vào giờ làm việc nếu nhân viên được rời vị trí làm việc.", 4, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Giờ làm việc và chấm công", GUTA_VERSION, AUTHORED_SOURCE, "Điều 6",
                  "Dữ liệu chấm công là nguồn đối chiếu chính thức cho bảng lương; mọi khiếu nại về "
                  "chấm công phải gửi trong vòng 05 ngày làm việc kể từ ngày nhận bảng lương.", 5, GUTA_EFFECTIVE),
        ],
    ),
    policy(
        f"{GUTA} — Nghỉ phép và ngày lễ", GUTA_VERSION, AUTHORED_SOURCE,
        "quy trình nội bộ", "authored", GUTA_EFFECTIVE,
        [
            chunk(f"{GUTA} — Nghỉ phép và ngày lễ", GUTA_VERSION, AUTHORED_SOURCE, "Điều 1",
                  "Nhân viên làm đủ 12 tháng có 12 ngày phép năm hưởng nguyên lương; làm chưa đủ 12 "
                  "tháng thì số ngày phép theo tỷ lệ số tháng đã làm. Cứ đủ 05 năm làm việc, phép năm "
                  "tăng thêm 01 ngày.", 0, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Nghỉ phép và ngày lễ", GUTA_VERSION, AUTHORED_SOURCE, "Điều 2",
                  "Ngày lễ, Tết được nghỉ và hưởng nguyên lương theo Điều 112 Bộ luật Lao động 2019: "
                  "Tết Dương lịch 01 ngày, Tết Âm lịch 05 ngày, Giỗ Tổ 01 ngày, 30/4 01 ngày, 1/5 01 "
                  "ngày, Quốc khánh 02 ngày.", 1, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Nghỉ phép và ngày lễ", GUTA_VERSION, AUTHORED_SOURCE, "Điều 3",
                  "Nhân viên gửi yêu cầu nghỉ phép qua dashboard chậm nhất 03 ngày làm việc trước ngày "
                  "nghỉ; nghỉ từ 03 ngày liên tiếp trở lên cần quản lý cửa hàng và phòng nhân sự duyệt. "
                  "Trường hợp khẩn cấp được báo sau nhưng phải có minh chứng.", 2, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Nghỉ phép và ngày lễ", GUTA_VERSION, AUTHORED_SOURCE, "Điều 4",
                  "Không quá 05 ngày phép năm chưa dùng được chuyển sang năm sau; số ngày còn lại được "
                  "thanh toán khi chấm dứt hợp đồng lao động theo quy định pháp luật.", 3, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Nghỉ phép và ngày lễ", GUTA_VERSION, AUTHORED_SOURCE, "Điều 5",
                  "Nghỉ việc riêng hưởng nguyên lương theo Điều 115 Bộ luật Lao động 2019 (kết hôn 03 "
                  "ngày; con kết hôn 01 ngày; cha mẹ, vợ/chồng, con chết 03 ngày). Nghỉ không hưởng "
                  "lương phải được quản lý đồng ý trước.", 4, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Nghỉ phép và ngày lễ", GUTA_VERSION, AUTHORED_SOURCE, "Điều 6",
                  "Nhân viên vi phạm quy trình nghỉ phép (không báo, báo sai, nghỉ quá số ngày được "
                  "duyệt) bị trừ ngày phép hoặc tính là nghỉ không phép theo quy chế kỷ luật.", 5, GUTA_EFFECTIVE),
        ],
    ),
    policy(
        f"{GUTA} — Đề tài, báo cáo nghiệm thu và KPI", GUTA_VERSION, AUTHORED_SOURCE,
        "quy trình nội bộ", "authored", GUTA_EFFECTIVE,
        [
            chunk(f"{GUTA} — Đề tài, báo cáo nghiệm thu và KPI", GUTA_VERSION, AUTHORED_SOURCE, "Điều 1",
                  "Vòng đời đề tài nội bộ có đúng 05 trạng thái: DRAFT (nháp) → ASSIGNED (đã giao) → "
                  "IN_PROGRESS (đang làm) → PENDING_REVIEW (chờ duyệt) → COMPLETED (hoàn tất). Không "
                  "nhảy cóc trạng thái, không có trạng thái quá hạn (overdue chỉ là dẫn xuất từ hạn).", 0, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Đề tài, báo cáo nghiệm thu và KPI", GUTA_VERSION, AUTHORED_SOURCE, "Điều 2",
                  "Mỗi lần đổi trạng thái đề tài phải gửi kèm phiên bản hiện tại (version) để chống ghi "
                  "đè: hai người cùng sửa thì đúng một người thắng, người còn lại phải tải lại đề tài.", 1, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Đề tài, báo cáo nghiệm thu và KPI", GUTA_VERSION, AUTHORED_SOURCE, "Điều 3",
                  "Nhân viên nộp báo cáo nghiệm thu khi đề tài chuyển sang PENDING_REVIEW. Báo cáo gồm "
                  "nội dung thực hiện và minh chứng; báo cáo bị từ chối phải nêu lý do và được nộp lại.", 2, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Đề tài, báo cáo nghiệm thu và KPI", GUTA_VERSION, AUTHORED_SOURCE, "Điều 4",
                  "Điểm KPI được tính từ dữ liệu thật của đề tài (mức hoàn thành và chất lượng báo cáo), "
                  "không do mô hình AI quyết định. AI chỉ gợi ý/phân tích; điểm cuối cùng do quản lý chốt "
                  "và phải giữ lịch sử giải thích khi điều chỉnh.", 3, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Đề tài, báo cáo nghiệm thu và KPI", GUTA_VERSION, AUTHORED_SOURCE, "Điều 5",
                  "Nhân viên chỉ được xem KPI của chính mình; quản lý xem KPI trong phạm vi phòng ban "
                  "được phân quyền. Mọi nỗ lực truy cập ngoài phạm vi bị từ chối và ghi log.", 4, GUTA_EFFECTIVE),
            chunk(f"{GUTA} — Đề tài, báo cáo nghiệm thu và KPI", GUTA_VERSION, AUTHORED_SOURCE, "Điều 6",
                  "Khiếu nại KPI gửi trong 05 ngày làm việc kể từ ngày công bố; quản lý phản hồi trong "
                  "03 ngày làm việc. Không tự sửa điểm đã chốt — mọi điều chỉnh phải có lý do và người "
                  "chịu trách nhiệm.", 5, GUTA_EFFECTIVE),
        ],
    ),
]


def connect():
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("FATAL: MONGODB_URI chưa đặt (không in giá trị URI ra log)")
    client = MongoClient(uri, serverSelectionTimeoutMS=15000)
    db = client.get_default_database(default="hr_bot")
    assert db.name == "hr_bot", f"từ chối chạy trên DB {db.name}: chỉ cho phép hr_bot"
    return db


def validate(policies):
    failures = []
    for p in policies:
        if not p.get("source"):
            failures.append(f"{p.get('title')}: thiếu source")
        if not p.get("version"):
            failures.append(f"{p.get('title')}: thiếu version")
        if len(p.get("chunks", [])) < MIN_CHUNKS:
            failures.append(f"{p['title']}: chỉ {len(p['chunks'])} chunk (< {MIN_CHUNKS})")
        for i, c in enumerate(p.get("chunks", [])):
            if not c.get("text"):
                failures.append(f"{p['title']} chunk#{i}: thiếu text")
            if not c.get("source") or not c.get("version") or not c.get("document"):
                failures.append(f"{p['title']} chunk#{i}: thiếu source/version/document")
            if "embedding" in c:
                failures.append(f"{p['title']} chunk#{i}: KHÔNG được embed ở Phase 1")
    return failures


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--revert", action="store_true")
    args = ap.parse_args()

    db = connect()

    if args.revert:
        removed = db.policies.delete_many({"seededBy": SEED}).deleted_count
        print(f"revert: xoá {removed} policy (seededBy={SEED})")
        return

    failures = validate(POLICIES)
    if failures:
        print("FAILED validate:")
        for f in failures:
            print("  -", f)
        sys.exit(1)

    now = datetime.datetime.now(datetime.timezone.utc)
    ops = []
    for p in POLICIES:
        doc = dict(p)
        doc["updatedAt"] = GUTA_EFFECTIVE
        ops.append(UpdateOne(
            {"title": p["title"], "version": p["version"]},
            {"$set": {**doc, "provenance": p["provenance"]},
             "$setOnInsert": {"seededBy": SEED, "seededAt": now}},
            upsert=True,
        ))

    total_chunks = sum(len(p["chunks"]) for p in POLICIES)
    print(f"policies: {len(POLICIES)} document | chunks: {total_chunks} "
          f"(min {MIN_CHUNKS}/document) | embedding: không")
    print(f"{'title':<52}{'ver':<13}{'chunks':>7}  provenance")
    for p in POLICIES:
        print(f"{p['title'][:51]:<52}{p['version']:<13}{len(p['chunks']):>7}  {p['provenance']}")

    if args.dry_run:
        print("\n[dry-run] không ghi DB")
        return

    res = db.policies.bulk_write(ops, ordered=False)

    # Verify sau khi ghi (acceptance phase-01)
    docs = list(db.policies.find({"seededBy": SEED}, {"title": 1, "version": 1, "source": 1,
                                                      "chunks": 1, "provenance": 1}))
    assert len(docs) >= 5, f"phải có >=5 policy, đang có {len(docs)}"
    for d in docs:
        assert d.get("source") and d.get("version"), f"{d['title']}: thiếu source/version"
        assert len(d["chunks"]) >= MIN_CHUNKS, f"{d['title']}: thiếu chunk"
        assert all(c.get("source") and c.get("version") for c in d["chunks"])
        assert all("embedding" not in c for c in d["chunks"]), "Phase 1 không được embed"

    print(f"\nupserted={len(res.upserted_ids)} modified={res.modified_count} "
          f"verified={len(docs)} document / {sum(len(d['chunks']) for d in docs)} chunk")


if __name__ == "__main__":
    main()
