"""Live test probe: AgentLoop with real MongoDB Atlas DB and real LLM proxy."""

import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import dotenv

dotenv.load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")
dotenv.load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.agent.loop import AgentLoop
from app.agent.tools import ToolRuntime, UserContext
from app.db import DatabaseClient
from app.llm.base import ProviderConfig
from app.llm.chain import ProviderChain
from app.llm.openai_compatible import OpenAICompatibleProvider
from app.rag.policy_engine import policy_engine

import pytest


def test_live_db_chat_probe(monkeypatch):
    """Live probe only runs if RUN_LIVE_TESTS is explicitly set and DB is reachable."""
    monkeypatch.setenv("AI_AGENT_ENABLED", "true")
    if not os.getenv("RUN_LIVE_TESTS"):
        pytest.skip("Set RUN_LIVE_TESTS=1 to run live MongoDB Atlas & LLM probe")

    db_wrapper = DatabaseClient()
    if not db_wrapper.ping() or db_wrapper.db is None:
        pytest.skip("MongoDB Atlas unreachable")

    cfg = ProviderConfig(
        id="gemini-live",
        type="openai_compatible",
        model=os.getenv("AI_LLM_MODEL", "ag/gemini-3.8-flash-low"),
        base_url=os.getenv("AI_LLM_BASE_URL", "https://rbnvqls.abc-tunnel.us/v1"),
        api_key=os.getenv("AI_LLM_API_KEY", "sk-6391717b21217848-40w3qp-d43413fb"),
        max_tokens=1024,
        timeout_ms=15000,
    )
    provider = OpenAICompatibleProvider(cfg)
    chain = ProviderChain([provider])
    runtime = ToolRuntime(db=db_wrapper.db, policy=policy_engine)
    loop = AgentLoop(runtime, chain)

    emp = db_wrapper.db.employees.find_one({"employee_code": {"$exists": True}})
    if not emp:
        pytest.skip("No employee found in live DB")
    emp_id = str(emp.get("_id"))
    emp_name = emp.get("full_name") or emp.get("fullName")
    emp_code = emp.get("employee_code") or emp.get("employeeCode")
    dept_id = str(emp.get("departmentId", ""))

    user_ctx = UserContext(
        user_id=emp_id,
        role="Employee",
        employee_id=emp_id,
        employee_code=emp_code,
        department_id=dept_id,
    )

    test_queries = [
        "Xem hồ sơ nhân viên của tôi",
        "Tôi đi trễ 20 phút tại Guta thì bị trừ bao nhiêu tiền?",
        "Tôi muốn đổi ca chiều mai với bạn Nam ở chi nhánh Phan Xích Long",
        "Quỹ két ca sáng bị hụt 50.000đ thì xử lý thế nào?",
    ]

    for q in test_queries:
        turn = loop.run(q, user_ctx)
        assert turn is not None


if __name__ == "__main__":
    os.environ["AI_AGENT_ENABLED"] = "true"
    db_wrapper = DatabaseClient()
    print(f"MongoDB Ping: {db_wrapper.ping()} | DB Name: {db_wrapper.db.name if db_wrapper.db is not None else None}")
    if db_wrapper.ping() and db_wrapper.db is not None:
        cfg = ProviderConfig(
            id="gemini-live",
            type="openai_compatible",
            model=os.getenv("AI_LLM_MODEL", "ag/gemini-3.8-flash-low"),
            base_url=os.getenv("AI_LLM_BASE_URL", "https://rbnvqls.abc-tunnel.us/v1"),
            api_key=os.getenv("AI_LLM_API_KEY", "sk-6391717b21217848-40w3qp-d43413fb"),
            max_tokens=1024,
            timeout_ms=15000,
        )
        provider = OpenAICompatibleProvider(cfg)
        chain = ProviderChain([provider])
        runtime = ToolRuntime(db=db_wrapper.db, policy=policy_engine)
        loop = AgentLoop(runtime, chain)
        emp = db_wrapper.db.employees.find_one({"employee_code": {"$exists": True}})
        if emp:
            emp_id = str(emp.get("_id"))
            emp_name = emp.get("full_name") or emp.get("fullName")
            emp_code = emp.get("employee_code") or emp.get("employeeCode")
            dept_id = str(emp.get("departmentId", ""))
            print(f"Loaded Real Employee from MongoDB: {emp_name} | Code: {emp_code} | Title: {emp.get('job_title')}")
            user_ctx = UserContext(
                user_id=emp_id,
                role="Employee",
                employee_id=emp_id,
                employee_code=emp_code,
                department_id=dept_id,
            )
            for q in ["Xem hồ sơ nhân viên của tôi", "Tôi đi trễ 20 phút tại Guta thì bị trừ bao nhiêu tiền?"]:
                print("\n" + "=" * 70)
                print(f"HỎI: {q}")
                turn = loop.run(q, user_ctx)
                res = turn.as_dict()
                print(f"TRẢ LỜI:\n{res.get('reply')}")
