from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlalchemy.orm import Session

from ai_pdf_api.models import Asset


class IngestionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class GeneratedObject:
    object_key: str
    payload: bytes
    content_type: str
    content_sha256: str


@dataclass(frozen=True)
class IngestionResult:
    generated_objects: tuple[GeneratedObject, ...] = ()


class IngestionAdapter(Protocol):
    asset_kind: str

    def ingest(
        self,
        db: Session,
        *,
        asset: Asset,
        payload: bytes,
        processing_generation: int,
        config_snapshot: Mapping[str, object],
        created_at: datetime,
    ) -> IngestionResult: ...

    def cleanup(self, db: Session, *, asset: Asset) -> None: ...


class IngestionAdapterRegistry:
    def __init__(self, adapters: Iterable[IngestionAdapter]) -> None:
        self._by_asset_kind: dict[str, IngestionAdapter] = {}
        for adapter in adapters:
            if not adapter.asset_kind:
                raise ValueError("Ingestion adapter requires an asset kind")
            if adapter.asset_kind in self._by_asset_kind:
                raise ValueError(f"Duplicate ingestion adapter: {adapter.asset_kind}")
            self._by_asset_kind[adapter.asset_kind] = adapter

    @property
    def asset_kinds(self) -> frozenset[str]:
        return frozenset(self._by_asset_kind)

    def get(self, asset_kind: str) -> IngestionAdapter:
        try:
            return self._by_asset_kind[asset_kind]
        except KeyError as error:
            raise IngestionError(
                "modality_adapter_unavailable",
                f"The {asset_kind} ingestion adapter is not enabled in this worker build.",
            ) from error
