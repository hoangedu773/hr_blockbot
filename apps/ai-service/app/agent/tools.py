"""
Tool catalog and agent execution loop for Guta Cafe HR Bot.
Directly interfaces with MongoDB Atlas `hr_bot` collection data and the Policy RAG Engine.
Enforces security sanitization, honest DB checks, and mock tool lockdown in bootstrap mode.
"""

from typing import Dict, Any, List, Optional
import os
import re
from pymongo import MongoClient
from app.rag.policy_engine import policy_engine


def get_mongodb_uri() -> Optional[str]:
    """Lấy URI kết nối MongoDB từ biến môi trường. Tuyệt đối không hardcode credentials."""
    return os.getenv("MONGODB_URI") or os.getenv("ATLAS_URI") or None


def is_agent_enabled() -> bool:
    """Kiểm tra cờ mở khóa Agent Chat & Mock Tools."""
    return os.getenv("AI_AGENT_ENABLED", "false").lower() in ("true", "1")


AI_AGENT_ENABLED = is_agent_enabled()


class DatabaseClient:
    def __init__(self, uri: Optional[str] = None):
        self._custom_uri = uri
        self.client: Optional[MongoClient] = None
        self.db = None
        self._connect()

    def get_uri(self) -> Optional[str]:
        return self._custom_uri or get_mongodb_uri()

    def _connect(self):
        uri = self.get_uri()
        if not uri:
            self.client = None
            self.db = None
            return

        try:
            self.client = MongoClient(uri, serverSelectionTimeoutMS=2000, connectTimeoutMS=2000)
            self.db = self.client["hr_bot"]
        except Exception as e:
            # An toàn: Không log connection string chứa credentials
            print(f"[WARN] MongoDB client initialization failed: {type(e).__name__}")
            self.client = None
            self.db = None

    def ping(self) -> bool:
        """Kiểm tra kết nối thực tế tới MongoDB server bằng lệnh ping thật."""
        uri = self.get_uri()
        if not uri:
            return False
        try:
            if self.client is None:
                self._connect()
            if self.client is None:
                return False
            self.client.admin.command("ping")
            return True
        except Exception:
            # Thất bại trung thực, không log connection string
            return False

    def is_connected(self) -> bool:
        return self.ping()


db_client = DatabaseClient()


# --- Tool Implementations (Khóa an toàn trong Bootstrap Phase) ---

def _check_tool_access() -> Optional[Dict[str, Any]]:
    """Kiểm tra điều kiện mở khóa mock tool và trạng thái DB."""
    if not is_agent_enabled():
        return {
            "status": "locked",
            "error": "Mock tool is locked down. Requires AI_AGENT_ENABLED=true and valid authenticated context."
        }
    if not db_client.ping() or db_client.db is None:
        return {
            "status": "error",
            "error": "Database not connected. Mock fallback is strictly forbidden."
        }
    return None


def tool_get_my_schedule(employee_code: str, date: Optional[str] = None) -> Dict[str, Any]:
    """Tra cứu lịch ca làm việc của một nhân viên theo mã hoặc ngày."""
    lock_err = _check_tool_access()
    if lock_err:
        return lock_err

    if not employee_code or not employee_code.strip():
        return {"status": "error", "error": "employee_code is required"}

    query: Dict[str, Any] = {"employee_code": employee_code.strip()}
    if date:
        query["work_date"] = date.strip()

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
    """Tìm những nhân sự làm chung một ca vào một ngày."""
    lock_err = _check_tool_access()
    if lock_err:
        return lock_err

    if not shift_code or not date:
        return {"status": "error", "error": "shift_code and date are required"}

    query: Dict[str, Any] = {"work_date": date.strip(), "shift_code": shift_code.strip()}
    entries = list(db_client.db.schedule_entries.find(query, {"_id": 0}).limit(15))
    return {
        "status": "success",
        "date": date,
        "shift_code": shift_code,
        "coworkers": entries
    }


def tool_submit_attendance_correction(employee_code: str, store_name: str, work_date: str, shift_code: str, note: str) -> Dict[str, Any]:
    """Nộp phiếu khiếu nại / giải trình điều chỉnh công (yêu cầu DB thật và người dùng xác thực)."""
    lock_err = _check_tool_access()
    if lock_err:
        return lock_err

    if not employee_code or not store_name or not work_date or not shift_code:
        return {"status": "error", "error": "Missing required fields for attendance correction"}

    emp = db_client.db.employees.find_one({"employee_code": employee_code.strip()})
    emp_name = emp.get("full_name") if emp else None

    last = db_client.db.attendance_corrections.find_one(sort=[("id", -1)])
    next_id = (last.get("id", 0) + 1) if last else 1

    doc = {
        "id": next_id,
        "employee_code": employee_code.strip(),
        "employee_name": emp_name,
        "store_name": store_name.strip(),
        "work_date": work_date.strip(),
        "shift_code": shift_code.strip(),
        "period_banner": "CHẤM THEO KỲ LƯƠNG 6/5-5/6/2026",
        "note": note.strip() if note else "",
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
    lock_err = _check_tool_access()
    if lock_err:
        return lock_err

    if not store_name or not store_name.strip():
        return {"status": "error", "error": "store_name is required"}

    count_item = db_client.db.cash_counts.find_one(
        {"store_name": {"$regex": re.escape(store_name.strip()), "$options": "i"}},
        {"_id": 0}
    )
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
    lock_err = _check_tool_access()
    if lock_err:
        return lock_err

    if not job_title or not date or not shift_code:
        return {"status": "error", "error": "job_title, date, and shift_code are required"}

    candidates = list(db_client.db.employees.find(
        {"job_title": {"$regex": re.escape(job_title.strip()), "$options": "i"}},
        {"_id": 0, "employee_code": 1, "full_name": 1, "job_title": 1, "store_raw": 1}
    ).limit(10))

    busy_codes = set(db_client.db.schedule_entries.distinct(
        "employee_code",
        {"work_date": date.strip(), "shift_code": shift_code.strip()}
    ))
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
    Phân loại intent và điều phối gọi tool tương ứng.
    Bảo vệ: Nếu cờ AI_AGENT_ENABLED chưa bật, khóa toàn bộ mock intent.
    Không dùng fallback user_context hardcode để bypass DB nhân sự.
    """
    if not is_agent_enabled():
        return {
            "intent": "locked",
            "reply": "Tính năng Agent chat và Mock Tools đang bị khóa an toàn trong giai đoạn bootstrap để bảo vệ dữ liệu nhân sự.",
            "tool_called": None,
            "status": "locked"
        }

    msg_lower = message.lower().strip()
    ctx = user_context or {}
    emp_code = ctx.get("employee_code")
    store = ctx.get("store_name")

    # Intent 1: Tra cứu lịch ca của bản thân (yêu cầu employee_code từ authenticated context)
    if any(k in msg_lower for k in ["lịch ca", "hôm nay làm ca mấy", "mai làm ca nào", "lịch làm"]):
        if not emp_code:
            return {
                "intent": "get_my_schedule",
                "reply": "Yêu cầu cung cấp mã nhân viên xác thực (employee_code) trong user_context để tra cứu lịch làm việc.",
                "status": "unauthorized"
            }
        res = tool_get_my_schedule(emp_code, ctx.get("work_date"))
        if res.get("status") == "success":
            shifts = ", ".join([f"{s.get('shift_code', '')} ngày {s.get('work_date', '')}" for s in res["schedules"]])
            return {
                "intent": "get_my_schedule",
                "tool_called": "tool_get_my_schedule",
                "reply": f"Lịch ca của bạn ({emp_code}): {shifts}.",
                "data": res
            }
        return {
            "intent": "get_my_schedule",
            "reply": res.get("message", res.get("error", f"Không thể tra cứu lịch ca cho {emp_code}.")),
            "data": res
        }

    # Intent 2: Tìm bạn làm chung ca
    if any(k in msg_lower for k in ["làm chung", "ai làm ca a", "ai làm ca b", "chung ca"]):
        date = ctx.get("work_date")
        if not date:
            return {
                "intent": "get_shift_coworkers",
                "reply": "Vui lòng cung cấp ngày làm việc (work_date) để tìm đồng nghiệp làm chung ca.",
                "status": "missing_context"
            }
        shift = "A" if "ca a" in msg_lower else ("B" if "ca b" in msg_lower else "A1.749")
        res = tool_get_shift_coworkers(shift, date)
        if res.get("status") == "success":
            coworkers = res.get("coworkers", [])
            names = ", ".join([f"**{c.get('employee_name', '')}** ({c.get('employee_code', '')})" for c in coworkers[:3]])
            return {
                "intent": "get_shift_coworkers",
                "tool_called": "tool_get_shift_coworkers",
                "reply": f"Các nhân sự làm chung **Ca {shift}** ngày {date}: {names or 'Không có dữ liệu'}.",
                "data": res
            }
        return {
            "intent": "get_shift_coworkers",
            "reply": res.get("error", "Lỗi tra cứu đồng nghiệp chung ca."),
            "data": res
        }

    # Intent 3: Nộp giải trình công
    if any(k in msg_lower for k in ["quên bấm", "quên chấm công", "giải trình", "bổ sung công", "chưa thêm mã ca"]):
        if not emp_code or not store:
            return {
                "intent": "submit_attendance_correction",
                "reply": "Yêu cầu đầy đủ thông tin nhân viên và cửa hàng xác thực để nộp giải trình công.",
                "status": "unauthorized"
            }
        work_date = ctx.get("work_date")
        shift_code = ctx.get("shift_code", "A")
        if not work_date:
            return {
                "intent": "submit_attendance_correction",
                "reply": "Vui lòng cung cấp ngày làm việc cần giải trình công.",
                "status": "missing_context"
            }
        res = tool_submit_attendance_correction(emp_code, store, work_date, shift_code, message)
        if res.get("status") == "success":
            return {
                "intent": "submit_attendance_correction",
                "tool_called": "tool_submit_attendance_correction",
                "reply": f"Đã ghi nhận phiếu giải trình điều chỉnh công cho nhân viên {emp_code} vào ngày {work_date}.",
                "data": res
            }
        return {
            "intent": "submit_attendance_correction",
            "reply": res.get("error", "Không thể ghi nhận phiếu giải trình."),
            "data": res
        }

    # Intent 4: Kiểm két tiền
    if any(k in msg_lower for k in ["két tiền", "tiền mặt", "kiểm két", "quỹ tiền"]):
        target_store = store or ctx.get("target_store")
        if not target_store:
            return {
                "intent": "get_cash_reconciliation",
                "reply": "Vui lòng cung cấp tên cửa hàng cần kiểm két tiền.",
                "status": "missing_context"
            }
        res = tool_get_cash_reconciliation(target_store)
        if res.get("status") == "success":
            return {
                "intent": "get_cash_reconciliation",
                "tool_called": "tool_get_cash_reconciliation",
                "reply": f"Số liệu quỹ két tại {res.get('store_name')}: Tiền mặt thực tế: **{res.get('cash_total_vnd', 0):,} đ**, Doanh thu vãng lai: **{res.get('walkin_total_vnd', 0):,} đ**, Tổng bàn giao: **{res.get('grand_total_vnd', 0):,} đ**.",
                "data": res
            }
        return {
            "intent": "get_cash_reconciliation",
            "reply": res.get("message", res.get("error", "Không thể tra cứu kiểm két.")),
            "data": res
        }

    # Intent 5: Tìm người bù ca / đổi ca
    if any(k in msg_lower for k in ["tìm người", "bù ca", "đổi ca", "thiếu người", "nghỉ đột xuất"]):
        date = ctx.get("work_date")
        if not date:
            return {
                "intent": "find_replacement_staff",
                "reply": "Vui lòng cung cấp ngày cần tìm nhân sự thay ca.",
                "status": "missing_context"
            }
        role = "BẾP" if "bếp" in msg_lower else "PHA CHẾ"
        shift_code = ctx.get("shift_code", "A")
        res = tool_find_replacement_staff(role, date, shift_code)
        if res.get("status") == "success":
            staff_list = ", ".join([f"**{s.get('full_name')}** ({s.get('employee_code')} - {s.get('store_raw','')})" for s in res.get("available_staff", [])[:3]])
            return {
                "intent": "find_replacement_staff",
                "tool_called": "tool_find_replacement_staff",
                "reply": f"Đã tìm thấy các nhân sự {role} đang rảnh ca {shift_code} ngày {date}: {staff_list or 'Không có nhân sự rảnh'}.",
                "data": res
            }
        return {
            "intent": "find_replacement_staff",
            "reply": res.get("error", "Không thể tìm nhân sự thay ca."),
            "data": res
        }

    # Default Intent: RAG Policy Query (Không qua mock tools, trích dẫn văn bản quy chuẩn)
    rag_res = tool_search_policy(message)
    return {
        "intent": "search_policy",
        "tool_called": "tool_search_policy",
        "reply": rag_res["answer"],
        "citations": rag_res.get("citations", []),
        "abstain": rag_res.get("abstain", False)
    }
