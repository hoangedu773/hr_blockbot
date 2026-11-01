"""Separate local F4 process. Never mount legacy/chat endpoints or Mongo access."""
import os
import secrets
import threading
import anyio
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.f4_encoder import MODEL, REVISION, PhoBertEncoder, semantic_rank

app = FastAPI(title="HR BlockBot F4 local worker", docs_url=None, redoc_url=None)
capacity = threading.BoundedSemaphore(1)
encoder = None

class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^c\d+$")
    skills: list[str] = Field(max_length=30)

    @field_validator("skills")
    @classmethod
    def valid_skills(cls, values):
        if any(not value.strip() or len(value) > 100 for value in values):
            raise ValueError("Invalid skill")
        return values

class RankRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requestId: str = Field(pattern=r"^[a-f0-9-]{36}$")
    requiredSkills: list[str] = Field(min_length=1, max_length=30)
    description: str = Field(max_length=10000)
    candidates: list[Candidate] = Field(min_length=1, max_length=200)

    @field_validator("requiredSkills")
    @classmethod
    def valid_required(cls, values):
        return Candidate.valid_skills(values)

@app.get("/health")
def health():
    return {"mode": "f4-read-only", "loaded": encoder is not None}

@app.post("/rank")
async def rank(request: RankRequest, x_f4_service_key: str | None = Header(default=None)):
    expected = os.environ.get("F4_SERVICE_KEY", "")
    if len(expected) < 32:
        raise HTTPException(503, "F4 service is not configured")
    if not x_f4_service_key or not secrets.compare_digest(expected, x_f4_service_key):
        raise HTTPException(401, "Service authentication required")
    if len({item.id for item in request.candidates}) != len(request.candidates):
        raise HTTPException(422, "Duplicate candidate")
    if not capacity.acquire(blocking=False):
        raise HTTPException(503, "F4 capacity unavailable")

    def execute():
        global encoder
        try:
            if encoder is None:
                encoder = PhoBertEncoder()
            items = semantic_rank(request.requiredSkills, request.description, [item.model_dump() for item in request.candidates], encoder)
            return {"requestId": request.requestId, "model": MODEL, "revision": REVISION, "items": items}
        except Exception:
            # Never leak input, paths, JVM errors or credentials to response/log.
            raise HTTPException(503, "Local PhoBERT unavailable") from None
        finally:
            capacity.release()
    # If caller disconnects, capacity stays held until real inference finishes.
    return await anyio.to_thread.run_sync(execute)
