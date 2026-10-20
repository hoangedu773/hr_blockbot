# HR BlockBot — AI Service

FastAPI service cung cấp:
1. **Policy RAG Engine:** Tra cứu quy chế, nội quy lao động, quy định chấm công & kiểm quỹ của Guta Cafe kèm trích dẫn văn bản (BR-15: document, version, article, score) và cơ chế từ chối đoán (Abstention Rule FR-018).
2. **Agent Function Calling & Mock Tools:** Khóa an toàn theo mặc định (`AI_AGENT_ENABLED=false`) để bảo vệ dữ liệu nhân sự trong giai đoạn bootstrap.
3. **Trung thực trong Liveness & Readiness:** Phân biệt tiến trình hoạt động (`/health/live`) và kết nối MongoDB Atlas thật (`/health/ready`), không báo xanh giả khi mất kết nối DB.

## Cài đặt & Chạy:

```bash
cd apps/ai-service
pip install -r requirements.txt
python start.py
```

## Kiểm thử:

```bash
# Chạy toàn bộ test probes
pytest tests/ -v

# Chạy kiểm tra liveness/readiness và mock lockdown
python tests/test_health_probe.py

# Probe tra cứu văn bản chính sách & kiểm định Vector capability
python tests/test_vector_probe.py --query "Chu kỳ tính lương của Guta"
```

Endpoints:
- Swagger API Docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`
- Liveness probe: `http://localhost:8000/health/live`
- Readiness probe: `http://localhost:8000/health/ready`
