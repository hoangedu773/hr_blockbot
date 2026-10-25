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

# Enable tool agent for reading real DB
os.environ["AI_AGENT_ENABLED"] = "true"

db_wrapper = DatabaseClient()
print(f"MongoDB Ping: {db_wrapper.ping()} | DB Name: {db_wrapper.db.name if db_wrapper.db is not None else None}")

# Configure upstream proxy
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

# Fetch a real employee from DB
emp = db_wrapper.db.employees.find_one({"employee_code": {"$exists": True}})
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

test_queries = [
    "Xem hồ sơ nhân viên của tôi",
    "Tôi đi trễ 20 phút tại Guta thì bị trừ bao nhiêu tiền?",
    "Tôi muốn đổi ca chiều mai với bạn Nam ở chi nhánh Phan Xích Long",
    "Quỹ két ca sáng bị hụt 50.000đ thì xử lý thế nào?",
]

for q in test_queries:
    print("\n" + "=" * 70)
    print(f"HỎI: {q}")
    turn = loop.run(q, user_ctx)
    res = turn.as_dict()
    print(f"INTENT: {res.get('intent')}")
    print(f"TOOL EXECUTED: {res.get('tool')}")
    if res.get("citations"):
        print(f"CITATIONS: {res.get('citations')}")
    if res.get("proposedAction"):
        print(f"ACTION CARD: {res.get('proposedAction')}")
    print(f"TRẢ LỜI:\n{res.get('reply')}")
