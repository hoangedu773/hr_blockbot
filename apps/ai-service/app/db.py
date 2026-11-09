"""Read-only MongoDB client used by health probes and the tool runtime.

The AI service never writes to MongoDB (phase-04 rule). Connection failures are
reported honestly (`ping()` false) and never log the connection string.
"""

from __future__ import annotations

import os
from typing import Optional

from pymongo import MongoClient


def get_mongodb_uri() -> Optional[str]:
    """Read the URI from env only; no hardcoded fallback credentials."""
    return os.getenv("MONGODB_URI") or os.getenv("ATLAS_URI") or None


class DatabaseClient:
    def __init__(self, uri: Optional[str] = None) -> None:
        self._custom_uri = uri
        self.client: Optional[MongoClient] = None
        self.db = None
        self._connect()

    def get_uri(self) -> Optional[str]:
        return self._custom_uri or get_mongodb_uri()

    def _connect(self) -> None:
        uri = self.get_uri()
        if not uri:
            self.client = None
            self.db = None
            return
        try:
            self.client = MongoClient(uri, serverSelectionTimeoutMS=2000, connectTimeoutMS=2000)
            self.db = self.client[self.db_name()]
        except Exception as exc:  # noqa: BLE001 - never log credentials
            print(f"[WARN] MongoDB client initialization failed: {type(exc).__name__}")
            self.client = None
            self.db = None

    @staticmethod
    def db_name() -> str:
        """Same precedence as `apps/api/src/db.ts::resolveDbName`.

        Hardcoding `hr_bot` sent the AI service to an empty database while the API
        read `hr_bot_test_363`, so `query_policy` returned nothing even though the
        corpus was populated and ACL-approved. Env first, then URI path, then the
        historical default so existing deployments keep working.
        """
        explicit = (os.getenv("MONGODB_DB_NAME") or "").strip()
        if explicit:
            return explicit
        uri = get_mongodb_uri() or ""
        after_scheme = uri.split("://", 1)[-1]
        path = after_scheme.split("/", 1)[1].split("?", 1)[0].strip() if "/" in after_scheme else ""
        return path or "hr_bot"

    def ping(self) -> bool:
        if not self.get_uri():
            return False
        try:
            if self.client is None:
                self._connect()
            if self.client is None:
                return False
            self.client.admin.command("ping")
            return True
        except Exception:  # noqa: BLE001 - honest failure, no URI in log
            return False

    def is_connected(self) -> bool:
        return self.ping()


db_client = DatabaseClient()
