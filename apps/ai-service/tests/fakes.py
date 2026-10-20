"""Minimal in-memory DB doubles for tool tests (never writes, records queries)."""

from __future__ import annotations


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, *args, **kwargs):
        return self

    def limit(self, count):
        self._docs = self._docs[:count]
        return self

    def __iter__(self):
        return iter(self._docs)


class FakeCollection:
    def __init__(self, find_one_result=None, find_result=None):
        self.find_one_result = find_one_result
        self.find_result = find_result or []
        self.calls: list[tuple] = []

    def find_one(self, query, projection=None):
        self.calls.append(("find_one", query, projection))
        return self.find_one_result

    def find(self, query, projection=None):
        self.calls.append(("find", query, projection))
        return FakeCursor(self.find_result)

    def insert_one(self, document):  # pragma: no cover - must never be called
        raise AssertionError("ai-service must not write to MongoDB")

    def update_one(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("ai-service must not write to MongoDB")


class FakeDb:
    def __init__(self) -> None:
        self.employees = FakeCollection()
        self.projects = FakeCollection()
        self.evaluations = FakeCollection()
        self.departments = FakeCollection()
        self.policies = FakeCollection()
