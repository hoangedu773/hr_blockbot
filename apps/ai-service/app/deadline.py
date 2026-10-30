"""Request-local monotonic budgets; no shared provider/client mutation."""

from contextlib import contextmanager
from contextvars import ContextVar
import math
import time
from typing import Iterator

_expiry: ContextVar[float | None] = ContextVar("request_expiry", default=None)


@contextmanager
def use_deadline(deadline_at_ms: int | None) -> Iterator[None]:
    if deadline_at_ms is not None and type(deadline_at_ms) is not int:
        raise ValueError("deadlineAtMs must be an integer timestamp")
    budget = 15.0 if deadline_at_ms is None else max(0.0, min(15000, deadline_at_ms - int(time.time() * 1000))) / 1000.0
    expiry = time.monotonic() + budget
    existing = _expiry.get()
    token = _expiry.set(min(existing, expiry) if existing is not None else expiry)
    try:
        yield
    finally:
        _expiry.reset(token)


def remaining_seconds(cap: float) -> float:
    if not math.isfinite(cap) or cap <= 0:
        raise ValueError("timeout cap must be finite and positive")
    expiry = _expiry.get()
    remaining = min(cap, expiry - time.monotonic()) if expiry is not None else cap
    if remaining <= 0:
        raise TimeoutError("Request deadline exceeded")
    return remaining
