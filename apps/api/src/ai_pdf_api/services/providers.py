from __future__ import annotations

from dataclasses import dataclass
import logging
import json
from collections.abc import Iterator
from typing import Protocol, TypeAlias
from urllib.parse import urlsplit

import httpx

from ai_pdf_api.core.settings import settings
from ai_pdf_api.core.metrics import observe_provider_request

logger = logging.getLogger(__name__)


class ModelProviderError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class EmbeddingProvider(Protocol):
    provider: str
    model: str
    dimensions: int
    version: str

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        ...

    def embed_query(self, text: str) -> list[float]:
        ...


GenerationMessage: TypeAlias = dict[str, object]


class GenerationProvider(Protocol):
    provider: str
    model: str

    def generate(self, messages: list[GenerationMessage]) -> str:
        ...

    def stream(self, messages: list[GenerationMessage]) -> Iterator[str]:
        ...


@dataclass(frozen=True)
class ProviderMetadata:
    provider: str
    model: str
    dimensions: int
    version: str


class OpenAIEmbeddingProvider:
    provider = "openai"

    def __init__(
        self,
        *,
        model: str,
        dimensions: int,
        version: str,
        api_key: str | None,
        api_base: str,
        timeout_seconds: float,
        client: httpx.Client | None = None,
    ) -> None:
        self.model = model
        self.dimensions = dimensions
        self.version = version
        self._api_key = api_key
        self._api_base = _normalize_openai_base(api_base)
        self._timeout_seconds = timeout_seconds
        self._client = client

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return self._embed(texts)

    def embed_query(self, text: str) -> list[float]:
        vectors = self._embed([text])
        return vectors[0]

    def _embed(self, texts: list[str]) -> list[list[float]]:
        with observe_provider_request(self.provider, "embedding"):
            if not self._api_key:
                raise ModelProviderError("embedding_provider_not_configured", "OpenAI embedding API key is not configured.")
            payload = {
                "model": self.model,
                "input": texts,
                "dimensions": self.dimensions,
                "encoding_format": "float",
            }
            response = self._post(
                f"{self._api_base}/embeddings",
                payload,
                headers={"Authorization": f"Bearer {self._api_key}"},
            )
            data = response.get("data")
            if not isinstance(data, list) or len(data) != len(texts):
                raise ModelProviderError("embedding_invalid_response", "Embedding provider returned an invalid vector count.")
            indexes = [item.get("index") if isinstance(item, dict) else None for item in data]
            if sorted(index for index in indexes if isinstance(index, int)) != list(range(len(texts))):
                raise ModelProviderError("embedding_invalid_response", "Embedding provider returned invalid vector indexes.")
            ordered = sorted(data, key=lambda item: item["index"])
            vectors = [item.get("embedding") for item in ordered if isinstance(item, dict)]
            if len(vectors) != len(texts) or any(not isinstance(vector, list) for vector in vectors):
                raise ModelProviderError("embedding_invalid_response", "Embedding provider returned invalid vectors.")
            _validate_dimensions(vectors, self.dimensions)
            return vectors

    def _post(self, url: str, payload: dict, *, headers: dict[str, str]) -> dict:
        request_headers = {"Content-Type": "application/json", **headers}
        try:
            if self._client is not None:
                response = self._client.post(url, json=payload, headers=request_headers, timeout=self._timeout_seconds)
            else:
                response = httpx.post(url, json=payload, headers=request_headers, timeout=self._timeout_seconds)
        except httpx.RequestError as error:
            logger.error("model_provider_request_failed provider=openai kind=embedding error_type=%s", type(error).__name__)
            raise ModelProviderError("embedding_provider_unreachable", "Embedding provider is unreachable.") from error
        if response.is_error:
            raise ModelProviderError(
                "embedding_provider_error",
                f"Embedding provider returned HTTP {response.status_code}.",
            )
        try:
            data = response.json()
        except ValueError as error:
            raise ModelProviderError("embedding_invalid_response", "Embedding provider returned invalid JSON.") from error
        if not isinstance(data, dict):
            raise ModelProviderError("embedding_invalid_response", "Embedding provider returned an invalid payload.")
        return data


class OllamaEmbeddingProvider:
    provider = "ollama"

    def __init__(
        self,
        *,
        model: str,
        dimensions: int,
        version: str,
        base_url: str,
        query_instruction: str,
        timeout_seconds: float,
        client: httpx.Client | None = None,
    ) -> None:
        self.model = model
        self.dimensions = dimensions
        self.version = version
        self._base_url = base_url.rstrip("/")
        self._query_instruction = query_instruction
        self._timeout_seconds = timeout_seconds
        self._client = client

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return self._embed(texts)

    def embed_query(self, text: str) -> list[float]:
        query = f"Instruct: {self._query_instruction}\nQuery: {text}"
        return self._embed([query])[0]

    def _embed(self, texts: list[str]) -> list[list[float]]:
        with observe_provider_request(self.provider, "embedding"):
            response = self._post(
                f"{self._base_url}/api/embed",
                {"model": self.model, "input": texts},
            )
            vectors = response.get("embeddings")
            if not isinstance(vectors, list) or len(vectors) != len(texts) or any(not isinstance(v, list) for v in vectors):
                raise ModelProviderError("embedding_invalid_response", "Ollama returned invalid embedding vectors.")
            _validate_dimensions(vectors, self.dimensions)
            return vectors

    def _post(self, url: str, payload: dict) -> dict:
        try:
            if self._client is not None:
                response = self._client.post(url, json=payload, timeout=self._timeout_seconds)
            else:
                response = httpx.post(url, json=payload, timeout=self._timeout_seconds)
        except httpx.RequestError as error:
            logger.error("model_provider_request_failed provider=ollama kind=embedding error_type=%s", type(error).__name__)
            raise ModelProviderError("embedding_provider_unreachable", "Ollama embedding provider is unreachable.") from error
        if response.is_error:
            raise ModelProviderError("embedding_provider_error", f"Ollama returned HTTP {response.status_code}.")
        try:
            data = response.json()
        except ValueError as error:
            raise ModelProviderError("embedding_invalid_response", "Ollama returned invalid JSON.") from error
        if not isinstance(data, dict):
            raise ModelProviderError("embedding_invalid_response", "Ollama returned an invalid payload.")
        return data


class OpenAIGenerationProvider:
    provider = "openai"

    def __init__(
        self,
        *,
        model: str,
        api_key: str | None,
        api_base: str,
        timeout_seconds: float,
        max_output_tokens: int,
        client: httpx.Client | None = None,
    ) -> None:
        self.model = model
        self._api_key = api_key
        self._api_base = _normalize_openai_base(api_base)
        self._timeout_seconds = timeout_seconds
        self._max_output_tokens = max_output_tokens
        self._client = client

    def generate(self, messages: list[GenerationMessage]) -> str:
        with observe_provider_request(self.provider, "generation"):
            if not self._api_key:
                raise ModelProviderError("generation_provider_not_configured", "OpenAI generation API key is not configured.")
            response = self._post(
                f"{self._api_base}/responses",
                {
                    "model": self.model,
                    "input": messages,
                    "max_output_tokens": self._max_output_tokens,
                },
            )
            output_text = response.get("output_text")
            if isinstance(output_text, str) and output_text.strip():
                return output_text.strip()
            output = response.get("output")
            if isinstance(output, list):
                parts: list[str] = []
                for item in output:
                    if not isinstance(item, dict):
                        continue
                    content_items = item.get("content")
                    if not isinstance(content_items, list):
                        continue
                    for content in content_items:
                        if isinstance(content, dict) and content.get("type") in {"output_text", "text"}:
                            text = content.get("text")
                            if isinstance(text, str):
                                parts.append(text)
                if parts:
                    return "".join(parts).strip()
            raise ModelProviderError("generation_invalid_response", "Generation provider returned no answer text.")

    def stream(self, messages: list[GenerationMessage]) -> Iterator[str]:
        with observe_provider_request(self.provider, "generation_stream"):
            if not self._api_key:
                raise ModelProviderError("generation_provider_not_configured", "OpenAI generation API key is not configured.")
            payload = {
                "model": self.model,
                "input": messages,
                "max_output_tokens": self._max_output_tokens,
                "stream": True,
            }
            headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self._api_key}"}
            try:
                if self._client is not None:
                    response_context = self._client.stream(
                        "POST",
                        f"{self._api_base}/responses",
                        json=payload,
                        headers=headers,
                        timeout=self._timeout_seconds,
                    )
                else:
                    response_context = httpx.stream(
                        "POST",
                        f"{self._api_base}/responses",
                        json=payload,
                        headers=headers,
                        timeout=self._timeout_seconds,
                    )
                with response_context as response:
                    if response.is_error:
                        raise ModelProviderError(
                            "generation_provider_error",
                            f"Generation provider returned HTTP {response.status_code}.",
                        )
                    yield from _read_response_stream(response)
            except httpx.RequestError as error:
                logger.error("model_provider_request_failed provider=openai kind=generation_stream error_type=%s", type(error).__name__)
                raise ModelProviderError("generation_provider_unreachable", "Generation provider is unreachable.") from error

    def _post(self, url: str, payload: dict) -> dict:
        if not self._api_key:
            raise ModelProviderError("generation_provider_not_configured", "OpenAI generation API key is not configured.")
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self._api_key}"}
        try:
            if self._client is not None:
                response = self._client.post(url, json=payload, headers=headers, timeout=self._timeout_seconds)
            else:
                response = httpx.post(url, json=payload, headers=headers, timeout=self._timeout_seconds)
        except httpx.RequestError as error:
            logger.error("model_provider_request_failed provider=openai kind=generation error_type=%s", type(error).__name__)
            raise ModelProviderError("generation_provider_unreachable", "Generation provider is unreachable.") from error
        if response.is_error:
            raise ModelProviderError("generation_provider_error", f"Generation provider returned HTTP {response.status_code}.")
        try:
            data = response.json()
        except ValueError as error:
            raise ModelProviderError("generation_invalid_response", "Generation provider returned invalid JSON.") from error
        if not isinstance(data, dict):
            raise ModelProviderError("generation_invalid_response", "Generation provider returned an invalid payload.")
        return data


def get_embedding_provider() -> EmbeddingProvider:
    if settings.embedding_provider == "openai":
        return OpenAIEmbeddingProvider(
            model=settings.embedding_model,
            dimensions=settings.embedding_dimensions,
            version=settings.embedding_version,
            api_key=settings.openai_api_key,
            api_base=settings.openai_api_base,
            timeout_seconds=settings.embedding_timeout_seconds,
        )
    return OllamaEmbeddingProvider(
        model=settings.embedding_model,
        dimensions=settings.embedding_dimensions,
        version=settings.embedding_version,
        base_url=settings.ollama_base_url,
        query_instruction=settings.embedding_query_instruction,
        timeout_seconds=settings.embedding_timeout_seconds,
    )


def get_generation_provider() -> GenerationProvider:
    return OpenAIGenerationProvider(
        model=settings.generation_model,
        api_key=settings.openai_api_key,
        api_base=settings.openai_api_base,
        timeout_seconds=settings.generation_timeout_seconds,
        max_output_tokens=settings.generation_max_output_tokens,
    )


def _validate_dimensions(vectors: list[list[float]], dimensions: int) -> None:
    if any(len(vector) != dimensions for vector in vectors):
        raise ModelProviderError(
            "embedding_dimension_mismatch",
            f"Embedding provider returned a vector with dimensions other than {dimensions}.",
        )


def _normalize_openai_base(api_base: str) -> str:
    base = api_base.rstrip("/")
    path = urlsplit(base).path.rstrip("/")
    return base if path.endswith("/v1") else f"{base}/v1"


def _read_response_stream(response: httpx.Response) -> Iterator[str]:
    for line in response.iter_lines():
        if not line or not line.startswith("data:"):
            continue
        raw_data = line[5:].strip()
        if raw_data == "[DONE]":
            return
        try:
            event = json.loads(raw_data)
        except json.JSONDecodeError as error:
            raise ModelProviderError("generation_invalid_response", "Generation provider returned invalid stream data.") from error
        if not isinstance(event, dict):
            continue
        event_type = event.get("type")
        if event_type in {"response.failed", "error"}:
            raise ModelProviderError("generation_provider_error", "Generation provider reported a streaming error.")
        if event_type == "response.output_text.delta":
            delta = event.get("delta")
            if isinstance(delta, str) and delta:
                yield delta
