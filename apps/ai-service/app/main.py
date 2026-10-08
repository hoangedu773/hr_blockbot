from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from app.rag.policy_engine import policy_engine
from app.agent.tools import route_agent_message

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

# --- Routes ---

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "ai-service",
        "database": "hr_bot",
        "rag_engine": "active"
    }

@app.post("/api/v1/rag/query", response_model=RagQueryResponse)
def query_policy(req: RagQueryRequest):
    try:
        res = policy_engine.query(req.question)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn RAG: {str(e)}")

@app.post("/api/v1/agent/chat", response_model=AgentChatResponse)
def chat_agent(req: AgentChatRequest):
    try:
        res = route_agent_message(req.message, req.user_context)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý Agent: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
