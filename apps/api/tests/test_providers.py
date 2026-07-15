import httpx
import pytest

from ai_pdf_api.services.providers import ModelProviderError, OpenAIEmbeddingProvider, OpenAIGenerationProvider


def test_openai_embedding_provider_batches_and_validates_dimensions() -> None:
    requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = request.read()
        requests.append({"url": str(request.url), "body": payload})
        return httpx.Response(
            200,
            json={
                "data": [
                    {"index": 1, "embedding": [0.0, 1.0, 0.0]},
                    {"index": 0, "embedding": [1.0, 0.0, 0.0]},
                ]
            },
        )

    provider = OpenAIEmbeddingProvider(
        model="text-embedding-3-small",
        dimensions=3,
        version="test-v1",
        api_key="test-key",
        api_base="https://example.test/v1",
        timeout_seconds=2,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    vectors = provider.embed_documents(["first", "second"])

    assert vectors == [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
    assert requests[0]["url"] == "https://example.test/v1/embeddings"


def test_openai_embedding_provider_rejects_invalid_indexes() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": [
                    {"index": 0, "embedding": [1.0, 0.0, 0.0]},
                    {"index": 0, "embedding": [0.0, 1.0, 0.0]},
                ]
            },
        )

    provider = OpenAIEmbeddingProvider(
        model="text-embedding-3-small",
        dimensions=3,
        version="test-v1",
        api_key="test-key",
        api_base="https://example.test/v1",
        timeout_seconds=2,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(ModelProviderError, match="invalid vector indexes"):
        provider.embed_documents(["first", "second"])


def test_openai_embedding_provider_requires_key() -> None:
    provider = OpenAIEmbeddingProvider(
        model="text-embedding-3-small",
        dimensions=3,
        version="test-v1",
        api_key=None,
        api_base="https://example.test/v1",
        timeout_seconds=2,
    )

    with pytest.raises(ModelProviderError, match="not configured"):
        provider.embed_query("question")


def test_openai_generation_provider_reads_responses_output_text() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"output_text": "answer from provider"})

    provider = OpenAIGenerationProvider(
        model="gpt-5.5",
        api_key="test-key",
        api_base="https://example.test/v1",
        timeout_seconds=2,
        max_output_tokens=100,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert provider.generate([{"role": "user", "content": "question"}]) == "answer from provider"


def test_openai_generation_provider_streams_response_text_deltas() -> None:
    requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request.read())
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=(
                'event: response.output_text.delta\n'
                'data: {"type":"response.output_text.delta","delta":"first"}\n\n'
                'data: {"type":"response.output_text.delta","delta":" second"}\n\n'
                'data: {"type":"response.completed"}\n\n'
            ).encode(),
        )

    provider = OpenAIGenerationProvider(
        model="gpt-5.5",
        api_key="test-key",
        api_base="https://example.test/v1",
        timeout_seconds=2,
        max_output_tokens=100,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert list(provider.stream([{"role": "user", "content": "question"}])) == ["first", " second"]
    assert '"stream":true' in requests[0].decode()


def test_openai_generation_provider_rejects_null_content_items() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"output": [{"content": None}]})

    provider = OpenAIGenerationProvider(
        model="gpt-5.5",
        api_key="test-key",
        api_base="https://example.test/v1",
        timeout_seconds=2,
        max_output_tokens=100,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(ModelProviderError, match="no answer text"):
        provider.generate([{"role": "user", "content": "question"}])
