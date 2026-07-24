from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlalchemy.orm import Session

from ai_pdf_api.models import Asset, AssetRepresentation, EvidenceLocator
from ai_pdf_api.schemas.chat import EvidenceTargetRequest


class EvidenceTargetError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class ResolvedEvidenceTarget:
    asset: Asset
    locator: EvidenceLocator
    representation: AssetRepresentation
    excerpt: str
    image_payloads: tuple[bytes, ...]


ImageBytesLoader = Callable[[str], bytes]


class EvidenceTargetResolver(Protocol):
    kind: str

    def resolve(
        self,
        db: Session,
        *,
        workspace_id: str,
        target: EvidenceTargetRequest,
        created_at: datetime,
        image_bytes_loader: ImageBytesLoader,
        include_image_payloads: bool,
    ) -> ResolvedEvidenceTarget: ...


class EvidenceTargetResolverRegistry:
    def __init__(self, resolvers: Iterable[EvidenceTargetResolver]) -> None:
        self._by_kind: dict[str, EvidenceTargetResolver] = {}
        for resolver in resolvers:
            if resolver.kind in self._by_kind:
                raise ValueError(f"Duplicate Evidence target resolver: {resolver.kind}")
            self._by_kind[resolver.kind] = resolver

    def resolve(
        self,
        db: Session,
        *,
        workspace_id: str,
        targets: list[EvidenceTargetRequest],
        created_at: datetime,
        image_bytes_loader: ImageBytesLoader,
        include_image_payloads: bool,
    ) -> list[ResolvedEvidenceTarget]:
        resolved: list[ResolvedEvidenceTarget] = []
        for target in targets:
            resolver = self._by_kind.get(target.kind)
            if resolver is None:
                raise EvidenceTargetError(
                    "evidence_target_kind_unsupported",
                    f"Unsupported Evidence target kind: {target.kind}",
                )
            resolved.append(
                resolver.resolve(
                    db,
                    workspace_id=workspace_id,
                    target=target,
                    created_at=created_at,
                    image_bytes_loader=image_bytes_loader,
                    include_image_payloads=include_image_payloads,
                )
            )
        return resolved
