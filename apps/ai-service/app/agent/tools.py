"""
Tool catalog and agent execution loop for Guta Cafe HR Bot.
Directly interfaces with MongoDB Atlas `hr_bot` collection data and the Policy RAG Engine.
"""

from typing import Dict, Any, List, Optional
import os
from pymongo import MongoClient
from app.rag.policy_engine import policy_engine

MONGODB_URI = os.getenv(
    "MONGODB_URI",
    "mongodb+srv://hr_admin:clajTXjKpf4O4HUh@hr-blockbot.a2gbplq.mongodb.net/hr_bot?retryWrites=true&w=majority&appName=hr-blockbot"
)

class DatabaseClient:
    def __init__(self):
        self.client = None
        self.db = None
        self._connect()

    def _connect(self):
        try:
            self.client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            self.db = self.client["hr_bot"]
        except Exception as e:
            print(f"[WARN] MongoDB connection failed in AI-Service: {e}")

db_client = DatabaseClient()

# --- Tool Implementations ---

def tool_get_my_schedule(employee_code: str, date: Optional[str] = None) -> Dict[str, Any]:
    """Tra cứu lịch ca làm việc của một nhân viên theo mã hoặc ngày."""
    if db_client.db is None:
        return {"error": "Database not connected"}

    query = {"employee_code": employee_code}
    if date:
        query["work_date"] = date

    entries = list(db_client.db.schedule_entries.find(query, {"_id": 0}).limit(10))
    if not entries:
        return {
            "status": "not_found",
            "message": f"Không tìm thấy ca làm việc cho nhân viên {employee_code} ngày {date or 'gần nhất'}."
        }
    return {
        "status": "success",
        "employee_code": employee_code,
        "count": len(entries),
        "schedules": entries
    }

def tool_get_shift_coworkers(shift_code: str, date: str, store_name: Optional[str] = None) -> Dict[str, Any]:
    """Tìm những nhân sự làm chung một ca (A, B, A1.749...) vào một ngày."""
    if db_client.db is None:
        return {"error": "Database not connected"}

    query = {"work_date": date, "shift_code": shift_code}
    entries = list(db_client.db.schedule_entries.find(query, {"_id": 0}).limit(15))
    return {
        "status": "success",
        "date": date,
        "shift_code": shift_code,
        "coworkers": entries
    }

def tool_submit_attendance_correction(employee_code: str, store_name: str, work_date: str, shift_code: str, note: str) -> Dict[str, Any]:
    """Nộp phiếu khiếu nại / giải trình điều chỉnh công (quên quẹt vân tay, lỗi IT...)."""
    if db_client.db is None:
        return {"error": "Database not connected"}

    # Tìm tên nhân viên nếu có
    emp = db_client.db.employees.find_one({"employee_code": employee_code})
    emp_name = emp.get("full_name") if emp else None

    # Lấy ID tăng tự động
    last = db_client.db.attendance_corrections.find_one(sort=[("id", -1)])
    next_id = (last.get("id", 0) + 1) if last else 1

    doc = {
        "id": next_id,
        "employee_code": employee_code,
        "employee_name": emp_name,
        "store_name": store_name,
        "work_date": work_date,
        "shift_code": shift_code,
        "period_banner": "CHẤM THEO KỲ LƯƠNG 6/5-5/6/2026",
        "note": note,
        "status": "PENDING"
    }
    db_client.db.attendance_corrections.insert_one(doc)
    doc.pop("_id", None)
    return {
        "status": "success",
        "message": f"Đã ghi nhận phiếu giải trình công #{next_id} cho nhân viên {employee_code}.",
        "correction": doc
    }

def tool_get_cash_reconciliation(store_name: str) -> Dict[str, Any]:
    """Tra cứu kiểm kê quỹ két tiền mặt và đối soát chênh lệch."""
    if db_client.db is None:
        return {"error": "Database not connected"}

    count_item = db_client.db.cash_counts.find_one({"store_name": {"$regex": store_name, "$options": "i"}}, {"_id": 0})
    if not count_item:
        return {"status": "not_found", "message": f"Chưa có số liệu kiểm két cho điểm bán {store_name}."}

    return {
        "status": "success",
        "store_name": count_item.get("store_name"),
        "cash_total_vnd": count_item.get("cash_total_vnd", 0),
        "walkin_total_vnd": count_item.get("walkin_total_vnd", 0),
        "grand_total_vnd": count_item.get("grand_total_vnd", 0)
    }

def tool_find_replacement_staff(job_title: str, date: str, shift_code: str) -> Dict[str, Any]:
    """Tìm nhân sự cùng chức danh đang rảnh để thay ca đột xuất."""
    if db_client.db is None:
        return {"error": "Database not connected"}

    # Lấy danh sách nhân viên có chức danh này
    candidates = list(db_client.db.employees.find(
        {"job_title": {"$regex": job_title, "$options": "i"}},
        {"_id": 0, "employee_code": 1, "full_name": 1, "job_title": 1, "store_raw": 1}
    ).limit(10))

    # Lọc những người chưa có lịch làm vào ngày và ca đó
    busy_codes = set(db_client.db.schedule_entries.distinct("employee_code", {"work_date": date, "shift_code": shift_code}))
    available = [c for c in candidates if c["employee_code"] not in busy_codes][:5]

    return {
        "status": "success",
        "job_title": job_title,
        "date": date,
        "available_staff": available
    }

def tool_search_policy(query: str) -> Dict[str, Any]:
    """Tra cứu văn bản quy chế chính sách bằng RAG Engine."""
    return policy_engine.query(query)


# --- Intent Router / Agent Loop ---

def route_agent_message(message: str, user_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Phân loại intent và điều phối gọi tool tương ứng (Function Calling).
    """
    msg_lower = message.lower().strip()
    ctx = user_context or {}
    emp_code = ctx.get("employee_code", "GT-CH25036607")
    store = ctx.get("store_name", "120 Hai Bà Trưng")

    # Intent 1: Tra cứu lịch ca của bản thân
    if any(k in msg_lower for k in ["lịch ca", "hôm nay làm ca mấy", "mai làm ca nào", "lịch làm"]):
        res = tool_get_my_schedule(emp_code, "2026-10-05")
        if res.get("status") == "success":
            shifts = ", ".join([f"{s['shift_code']} ngày {s['work_date']}" for s in res["schedules"]])
            return {
                "intent": "get_my_schedule",
                "tool_called": "tool_get_my_schedule",
                "reply": f"Lịch ca của bạn ({emp_code}): Bạn có ca **{shifts}** tại khối ca {res['schedules'][0].get('block_code')}.",
                "data": res
            }
        return {
            "intent": "get_my_schedule",
            "reply": f"Hiện chưa có lịch ca sắp tới được phân bổ cho mã nhân viên {emp_code}."
        }

    # Intent 2: Tìm bạn làm chung ca
    if any(k in msg_lower for k in ["làm chung", "ai làm ca a", "ai làm ca b", "chung ca"]):
        shift = "A" if "ca a" in msg_lower else ("B" if "ca b" in msg_lower else "A1.749")
        res = tool_get_shift_coworkers(shift, "2026-10-05")
        coworkers = res.get("coworkers", [])
        names = ", ".join([f"**{c['employee_name']}** ({c['employee_code']})" for c in coworkers[:3]])
        return {
            "intent": "get_shift_coworkers",
            "tool_called": "tool_get_shift_coworkers",
            "reply": f"Các nhân sự làm chung **Ca {shift}** ngày 05/10/2026 gồm có: {names}.",
            "data": res
        }

    # Intent 3: Nộp giải trình công
    if any(k in msg_lower for k in ["quên bấm", "quên chấm công", "giải trình", "bổ sung công", "chưa thêm mã ca"]):
        res = tool_submit_attendance_correction(emp_code, store, "2026-10-05", "A", message)
        return {
            "intent": "submit_attendance_correction",
            "tool_called": "tool_submit_attendance_correction",
            "reply": f"Đã ghi nhận phiếu giải trình điều chỉnh công cho bạn vào ngày 05/10/2026. Cửa hàng trưởng sẽ kiểm tra và phê duyệt trước khi chốt kỳ lương ngày 05.",
            "data": res
        }

    # Intent 4: Kiểm két tiền
    if any(k in msg_lower for k in ["két tiền", "tiền mặt", "kiểm két", "quỹ tiền"]):
        res = tool_get_cash_reconciliation("Nguyễn Kiệm")
        return {
            "intent": "get_cash_reconciliation",
            "tool_called": "tool_get_cash_reconciliation",
            "reply": f"Số liệu quỹ két tại {res.get('store_name')}: Tiền mặt đếm thực tế: **{res.get('cash_total_vnd', 0):,} đ**, Doanh thu vãng lai: **{res.get('walkin_total_vnd', 0):,} đ**, Tổng bàn giao: **{res.get('grand_total_vnd', 0):,} đ**.",
            "data": res
        }

    # Intent 5: Tìm người bù ca / đổi ca
    if any(k in msg_lower for k in ["tìm người", "bù ca", "đổi ca", "thiếu người", "nghỉ đột xuất"]):
        role = "BẾP" if "bếp" in msg_lower else "PHA CHẾ"
        res = tool_find_replacement_staff(role, "2026-10-05", "A")
        staff_list = ", ".join([f"**{s['full_name']}** ({s['employee_code']} - {s.get('store_raw','')})" for s in res.get("available_staff", [])[:3]])
        return {
            "intent": "find_replacement_staff",
            "tool_called": "tool_find_replacement_staff",
            "reply": f"Đã tìm thấy các nhân sự {role} đang rảnh ca A ngày 05/10 có thể điều phối thay thế: {staff_list}.",
            "data": res
        }

    # Default Intent: RAG Policy Query
    rag_res = tool_search_policy(message)
    return {
        "intent": "search_policy",
        "tool_called": "tool_search_policy",
        "reply": rag_res["answer"],
        "citations": rag_res.get("citations", []),
        "abstain": rag_res.get("abstain", False)
    }
