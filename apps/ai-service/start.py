from pathlib import Path

import uvicorn

# Load .env next to this file so JEV_USEJEVAI_KEYS / JEV_API_KEY reach app.config
# without exporting them by hand. Missing python-dotenv must not block startup.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:  # pragma: no cover - dotenv is in requirements.txt
    pass

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
