"""UseJevAI transport with key rotation (trial accounts).

Why this module exists: `thejevai.com/v1/systemone` is a single synchronous POST,
but UseJevAI exposes a queued run API instead:

    POST /api/v1/runs        -> {"data": {"id": ...}}   (status: queued)
    GET  /api/v1/runs/{id}   -> {"data": {"status": "succeeded", "result": {...}}}

This module owns *transport only*: submit, poll, rotate keys, classify failures.
It knows nothing about HR intents — `jev_gateway.py` builds the questions and maps
the answers, so no domain vocabulary is duplicated here.

Key rotation rules (one trial key has a small budget and 3 concurrent runs):
- round-robin over the pool, skipping keys in cooldown;
- `401` disables a key permanently (bad key, never retry it);
- `402/403` disables it permanently (no trial budget left);
- `429` puts it in cooldown (`cooldown_seconds`), then it is eligible again;
- if every key is dead or cooling down, `NoKeyAvailable` is raised and the caller
  reports `LLMUnavailable` — never a silent fallback to another model.

The transport is injectable so tests run without network access.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable

DEFAULT_BASE_URL = "https://usejevai.com"
TERMINAL_OK = "succeeded"
TERMINAL_BAD = ("failed", "error", "cancelled", "canceled", "unknown")

# transport(method, path, key, payload) -> (status_code, body_text)
Transport = Callable[[str, str, str, dict[str, Any] | None], tuple[int, str]]


class NoKeyAvailable(RuntimeError):
    """Every key is either dead or cooling down."""


@dataclass
class KeyState:
    disabled: bool = False
    reason: str = ""
    cooldown_until: float = 0.0
    uses: int = 0
    failures: int = 0
    in_flight: int = 0

    def available(self, now: float) -> bool:
        return not self.disabled and self.cooldown_until <= now and self.in_flight < 3


@dataclass
class UseJevKeyPool:
    keys: list[str]
    cooldown_seconds: float = 60.0
    _states: dict[str, KeyState] = field(default_factory=dict)
    _cursor: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def __post_init__(self) -> None:
        seen: set[str] = set()
        deduped: list[str] = []
        for key in self.keys:
            cleaned = key.strip()
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                deduped.append(cleaned)
        self.keys = deduped
        self._states = {key: KeyState() for key in self.keys}

    def __bool__(self) -> bool:
        return bool(self.keys)

    def acquire(self) -> str:
        """Next usable key, advancing round-robin. Raises when none is usable."""
        with self._lock:
            now = time.monotonic()
            for _ in range(len(self.keys)):
                key = self.keys[self._cursor % len(self.keys)]
                self._cursor = (self._cursor + 1) % len(self.keys)
                state = self._states[key]
                if state.available(now):
                    state.uses += 1
                    state.in_flight += 1
                    return key
            raise NoKeyAvailable("all UseJevAI keys are disabled or cooling down")

    def release(self, key: str) -> None:
        with self._lock:
            state = self._states.get(key)
            if state and state.in_flight > 0:
                state.in_flight -= 1

    def report_ok(self, key: str) -> None:
        with self._lock:
            state = self._states.setdefault(key, KeyState())
            now = time.monotonic()
            if not state.disabled and state.cooldown_until <= now:
                state.cooldown_until = 0.0
                state.reason = ""

    def report_failure(self, key: str, code: str, status: int | None = None) -> None:
        """`code` is the machine reason: auth | quota | rate | transport | server."""
        with self._lock:
            state = self._states.setdefault(key, KeyState())
            state.failures += 1
            if code in ("auth", "quota"):
                state.disabled = True
                state.reason = code
            elif code in ("rate", "transport", "server", "timeout"):
                state.cooldown_until = time.monotonic() + self.cooldown_seconds
                state.reason = code
            else:
                state.reason = code

    def snapshot(self) -> list[dict[str, Any]]:
        """Masked, log-safe view of pool health."""
        with self._lock:
            now = time.monotonic()
            return [
                {
                    "key": f"{key[:6]}…{key[-4:]}",
                    "disabled": state.disabled,
                    "reason": state.reason,
                    "cooldown_s": max(0.0, round(state.cooldown_until - now, 1)),
                    "uses": state.uses,
                    "failures": state.failures,
                    "in_flight": state.in_flight,
                }
                for key, state in self._states.items()
            ]


def urllib_transport(base_url: str, default_timeout: float = 15.0) -> Transport:
    """Default transport: stdlib only, with a UA Cloudflare accepts."""

    def send(
        method: str,
        path: str,
        key: str,
        payload: dict[str, Any] | None,
        timeout: float | None = None,
    ) -> tuple[int, str]:
        import urllib.error
        import urllib.request

        data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            base_url.rstrip("/") + path,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "User-Agent": "python-httpx/0.27.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=default_timeout if timeout is None else timeout) as response:
                return response.status, response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return 0, f'{{"code":-1,"message":"{type(exc).__name__}"}}'

    return send


class UseJevClient:
    """Submit a run, poll it to a terminal state, return the raw `answers` object."""

    def __init__(
        self,
        pool: UseJevKeyPool,
        *,
        transport: Transport | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout_seconds: float = 6.0,
        poll_interval_seconds: float = 0.5,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.pool = pool
        self._transport = transport or urllib_transport(base_url, timeout_seconds)
        self.timeout_seconds = timeout_seconds
        self.poll_interval_seconds = poll_interval_seconds
        self._sleep = sleep
        self._clock = clock
        self.last_key = ""

    # -- public -----------------------------------------------------------------

    def decide(self, state: str, questions: list[dict[str, Any]]) -> dict[str, Any]:
        """Return `result.response.answers`; raise `NoKeyAvailable` or `UseJevError`."""
        payload = {
            "funding": "prefer_trial",
            "idempotencyKey": uuid.uuid4().hex,
            "input": {"state": state, "questions": questions},
        }
        deadline = self._clock() + self.timeout_seconds
        run_id, key = self._submit(payload, deadline)
        try:
            return self._await_result(run_id, key, deadline)
        finally:
            self.pool.release(key)

    def _http_timeout(self, deadline: float) -> float:
        local_remaining = deadline - self._clock()
        if local_remaining <= 0:
            raise UseJevError("timeout", None)
        try:
            from app.deadline import remaining_seconds
            return remaining_seconds(local_remaining)
        except ImportError:
            return local_remaining
        except TimeoutError as exc:
            raise UseJevError("timeout", None) from exc

    # -- internals --------------------------------------------------------------

    def _submit(self, payload: dict[str, Any], deadline: float) -> tuple[str, str]:
        attempts = max(1, len(self.pool.keys))
        last_error = "no_attempt"
        for _ in range(attempts):
            http_timeout = self._http_timeout(deadline)
            key = self.pool.acquire()
            self.last_key = f"{key[:6]}…{key[-4:]}"
            try:
                status, body = self._transport("POST", "/api/v1/runs", key, payload, http_timeout)
            except Exception as exc:
                self.pool.report_failure(key, "transport", 0)
                self.pool.release(key)
                raise UseJevError("transport", 0) from exc

            if self._clock() > deadline:
                self.pool.report_failure(key, "timeout")
                self.pool.release(key)
                raise UseJevError("timeout", None)
            if status in (200, 201, 202):  # the live API answers 202 Accepted
                try:
                    parsed = json.loads(body)
                    if not isinstance(parsed, dict) or not isinstance(parsed.get("data"), dict):
                        raise ValueError("Invalid submit response shape")
                    run_id = parsed["data"].get("id")
                    if not run_id:
                        raise ValueError("Missing run id")
                except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                    self.pool.report_failure(key, "server", status)
                    self.pool.release(key)
                    last_error = "bad_submit_body"
                    continue
                self.pool.report_ok(key)
                return str(run_id), key

            code = classify_status(status)
            self.pool.report_failure(key, code, status)
            self.pool.release(key)
            last_error = code
            if code in ("auth", "quota"):
                continue  # try the next account immediately
            raise UseJevError(code, status)
        raise UseJevError(last_error, None)

    def _await_result(self, run_id: str, key: str, deadline: float) -> dict[str, Any]:
        while self._clock() < deadline:
            http_timeout = self._http_timeout(deadline)
            try:
                status, body = self._transport("GET", f"/api/v1/runs/{run_id}", key, None, http_timeout)
            except Exception as exc:
                self.pool.report_failure(key, "transport", 0)
                raise UseJevError("transport", 0) from exc

            if status == 401:
                self.pool.report_failure(key, "auth", status)
                raise UseJevError("auth", status)
            if status in (402, 403):
                self.pool.report_failure(key, "quota", status)
                raise UseJevError("quota", status)
            if status == 429:
                self.pool.report_failure(key, "rate", status)
                raise UseJevError("rate", status)
            if status != 200:
                code = classify_status(status)
                self.pool.report_failure(key, code, status)
                raise UseJevError(code, status)

            try:
                parsed = json.loads(body)
                if not isinstance(parsed, dict) or not isinstance(parsed.get("data"), dict):
                    raise ValueError("Invalid poll shape")
                data = parsed["data"]
            except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
                raise UseJevError("bad_poll_body", status) from exc

            state = str(data.get("status") or "")
            if state == TERMINAL_OK:
                if self._clock() > deadline:
                    raise UseJevError("timeout", None)
                result = data.get("result")
                if not isinstance(result, dict):
                    raise UseJevError("bad_result_body", status)
                response = result.get("response")
                if not isinstance(response, dict):
                    raise UseJevError("bad_result_body", status)
                answers = response.get("answers")
                if not isinstance(answers, dict):
                    raise UseJevError("bad_result_body", status)
                self.pool.report_ok(key)
                return answers
            if state in TERMINAL_BAD:
                raise UseJevError(f"run_{state}", status)
            self._sleep(self.poll_interval_seconds)
        self.pool.report_failure(key, "timeout")
        raise UseJevError("timeout", None)


class UseJevError(RuntimeError):
    def __init__(self, code: str, status: int | None) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


def classify_status(status: int) -> str:
    if status == 401:
        return "auth"
    if status in (402, 403):
        return "quota"
    if status == 429:
        return "rate"
    if status == 0:
        return "transport"
    return "server"
