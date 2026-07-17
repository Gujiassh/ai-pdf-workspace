from __future__ import annotations

from ai_pdf_api.core.metrics import STORAGE_OPERATIONS
from ai_pdf_api.services import storage


class FakeResponse:
    def __init__(self) -> None:
        self.reads = 0

    def read(self, _chunk_size: int) -> bytes:
        self.reads += 1
        return b"first" if self.reads == 1 else b"second"

    def close(self) -> None:
        return None

    def release_conn(self) -> None:
        return None


class FakeClient:
    def get_object(self, _bucket: str, _key: str) -> FakeResponse:
        return FakeResponse()


def test_storage_stream_records_cancelled_outcome(monkeypatch) -> None:
    monkeypatch.setattr(storage, "build_storage_client", FakeClient)
    cancelled = STORAGE_OPERATIONS.labels(operation="stream", outcome="cancelled")
    success = STORAGE_OPERATIONS.labels(operation="stream", outcome="success")
    before_cancelled = cancelled._value.get()
    before_success = success._value.get()

    stream = storage.stream_bytes("object.pdf")
    assert next(stream) == b"first"
    stream.close()

    assert cancelled._value.get() == before_cancelled + 1
    assert success._value.get() == before_success
