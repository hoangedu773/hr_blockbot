# HR BlockBot — AI Service

FastAPI service cung cấp:
1. **Policy RAG Engine:** Tra cứu quy chế, nội quy lao động, quy định chấm công & kiểm quỹ của Guta Cafe kèm trích dẫn văn bản và cơ chế từ chối đoán (Abstention).
2. **Agent Function Calling:** Điều phối ý định người dùng (hỏi lịch ca, tìm đồng nghiệp làm chung ca, nộp giải trình công, kiểm két, tìm người thay ca).

## Cài đặt & Chạy:

```bash
cd apps/ai-service
pip install -r requirements.txt
python start.py
```

Swagger API Docs: `http://localhost:8000/docs`
Health check: `http://localhost:8000/health`
