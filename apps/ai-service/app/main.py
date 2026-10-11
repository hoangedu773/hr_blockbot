import os
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException, Header, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.rag.policy_engine import policy_engine
from app.agent.tools import db_client, is_agent_enabled, route_agent_message

app = FastAPI(
    title="HR BlockBot AI Service",
    description="Lõi AI xử lý Policy RAG & Function Calling cho hệ thống HR chuỗi Guta Cafe",
    version="1.0.0"
)

# Enable CORS for Express API and Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AI_SERVICE_API_KEY = os.getenv("AI_SERVICE_API_KEY")


# --- Pydantic Schemas ---

class RagQueryRequest(BaseModel):
    question: str
    store_name: Optional[str] = None
    user_role: Optional[str] = "employee"


class CitationItem(BaseModel):
    document: str
    version: str
    article: str
    score: float


class RagQueryResponse(BaseModel):
    answer: str
    citations: List[CitationItem]
    abstain: bool


class AgentChatRequest(BaseModel):
    message: str
    user_context: Optional[Dict[str, Any]] = Field(default_factory=dict)


class AgentChatResponse(BaseModel):
    intent: str
    reply: str
    tool_called: Optional[str] = None
    citations: Optional[List[CitationItem]] = None
    abstain: Optional[bool] = False
    data: Optional[Dict[str, Any]] = None


# --- Health & Probes (Trung thực, không báo xanh giả) ---

@app.get("/health")
def health_check():
    """
    Health check tổng hợp: Phân biệt liveness và readiness.
    Thực hiện ping DB thật, không hardcode status 'ok' hay rag_engine 'active'.
    """
    db_connected = db_client.ping()
    agent_enabled = is_agent_enabled()
    vector_cap = policy_engine.check_vector_search_capability(db_client.db if db_connected else None)

    if db_connected:
        overall_status = "ok"
        readiness_status = "ready"
        db_payload = {
            "status": "connected",
            "name": "hr_bot"
        }
        rag_status = "active"
    else:
        overall_status = "degraded"
        readiness_status = "not_ready"
        db_payload = {
            "status": "disconnected",
            "error": "MongoDB ping failed or URI not configured"
        }
        rag_status = "degraded"

    return {
        "status": overall_status,
        "service": "ai-service",
        "liveness": "alive",
        "readiness": readiness_status,
        "database": db_payload,
        "rag_engine": {
            "status": rag_status,
            "mode": "seed_in_memory",
            "vector_search": vector_cap.get("status", "BLOCKED")
        },
        "mock_tools": {
            "status": "unlocked" if agent_enabled else "locked",
            "agent_enabled": agent_enabled
        }
    }


@app.get("/health/live")
def liveness_probe():
    """Liveness probe: Tiến trình FastAPI đang chạy."""
    return {"status": "alive"}


@app.get("/health/ready")
def readiness_probe(response: Response):
    """
    Readiness probe: Kiểm tra DB Atlas thật.
    Nếu DB không kết nối được -> trả HTTP 503 và status 'not_ready'.
    """
    db_connected = db_client.ping()
    if not db_connected:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "not_ready",
            "database": "disconnected"
        }
    return {
        "status": "ready",
        "database": "connected"
    }


# --- API Routes ---

@app.post("/api/v1/rag/query", response_model=RagQueryResponse)
def query_policy(req: RagQueryRequest):
    """Tra cứu chính sách Guta Cafe theo tiêu chuẩn BR-15 (Grounded citations + Abstention)."""
    try:
        # Nếu DB kết nối, đồng bộ chính sách dạng read-only
        if db_client.is_connected() and db_client.db is not None:
            policy_engine.sync_policies_from_db(db_client.db)
        res = policy_engine.query(req.question)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn RAG: {str(e)}")


@app.post("/api/v1/agent/chat", response_model=AgentChatResponse)
def chat_agent(
    req: AgentChatRequest,
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None)
):
    """
    Endpoint Agent Chat & Mock Tools: Khóa an toàn trong giai đoạn Bootstrap.
    Yêu cầu bật AI_AGENT_ENABLED=true và xác thực hợp lệ để ngăn ngừa bypass DB nhân sự.
    """
    if not is_agent_enabled():
        raise HTTPException(
            status_code=403,
            detail="Agent chat and mock tools are locked down in bootstrap phase. Set AI_AGENT_ENABLED=true with valid authentication to enable."
        )

    # Kiểm tra API Key nếu đã cấu hình
    if AI_SERVICE_API_KEY:
        token = None
        if authorization and authorization.startswith("Bearer "):
            token = authorization[7:].strip()
        elif x_api_key:
            token = x_api_key.strip()

        if token != AI_SERVICE_API_KEY:
            raise HTTPException(
                status_code=401,
                detail="Unauthorized: invalid or missing authentication key for agent chat."
            )

    try:
        res = route_agent_message(req.message, req.user_context)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý Agent: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
