import httpx
import pytest
from prometheus_client import generate_latest

from ai_pdf_api.core.metrics import PROVIDER_REQUESTS
from ai_pdf_api.modalities.image_caption import OpenAIImageCaptionProvider
from ai_pdf_api.services.providers import (
    ModelProviderError,
    OpenAIEmbeddingProvider,
    OpenAIGenerationProvider,
)


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
    requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request.read())
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
    assert requests[0].decode() == (
        '{"model":"gpt-5.5","input":[{"role":"user","content":"question"}],'
        '"max_output_tokens":100}'
    )


def test_openai_generation_provider_preserves_multimodal_message_parts() -> None:
    requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request.read())
        return httpx.Response(200, json={"output_text": "visual answer"})

    provider = OpenAIGenerationProvider(
        model="gpt-5.5",
        api_key="test-key",
        api_base="https://example.test/v1",
        timeout_seconds=2,
        max_output_tokens=100,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": "Analyze this region."},
                {
                    "type": "input_image",
                    "image_url": "data:image/png;base64,Y3JvcHBlZC1wbmc=",
                    "detail": "high",
                },
            ],
        }
    ]

    assert provider.generate(messages) == "visual answer"
    payload = httpx.Response(200, content=requests[0]).json()
    assert payload["input"] == messages


def test_openai_image_caption_provider_sends_canonical_png_as_responses_image_input() -> None:
    requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append({"url": str(request.url), "body": request.read().decode()})
        return httpx.Response(200, json={"output_text": "Visible chart caption."})

    provider = OpenAIImageCaptionProvider(
        model="gpt-5.5",
        version="image-caption-v1",
        detail="high",
        api_key="test-key",
        api_base="https://example.test/v1",
        timeout_seconds=2,
        max_output_tokens=320,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    caption = provider.caption(b"canonical-png", content_type="image/png")

    assert caption == "Visible chart caption."
    assert requests[0]["url"] == "https://example.test/v1/responses"
    assert '"type":"input_text"' in requests[0]["body"]
    assert '"type":"input_image"' in requests[0]["body"]
    assert '"image_url":"data:image/png;base64,Y2Fub25pY2FsLXBuZw=="' in requests[0]["body"]
    assert '"detail":"high"' in requests[0]["body"]


def test_openai_image_caption_provider_rejects_invalid_input_and_empty_output() -> None:
    provider = OpenAIImageCaptionProvider(
        model="gpt-5.5",
        version="image-caption-v1",
        detail="high",
        api_key="test-key",
        api_base="https://example.test/v1",
        timeout_seconds=2,
        max_output_tokens=320,
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(200, json={"output": [{"content": []}]})
            )
        ),
    )

    with pytest.raises(ModelProviderError) as invalid_input:
        provider.caption(b"jpeg", content_type="image/jpeg")
    assert invalid_input.value.code == "image_caption_input_invalid"

    with pytest.raises(ModelProviderError) as empty_output:
        provider.caption(b"png", content_type="image/png")
    assert empty_output.value.code == "image_caption_invalid_response"


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


def test_openai_generation_provider_records_cancelled_stream() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=(
                'data: {"type":"response.output_text.delta","delta":"first"}\n\n'
                'data: {"type":"response.output_text.delta","delta":"second"}\n\n'
                'data: {"type":"response.completed"}\n\n'
            ).encode(),
        )

    provider = OpenAIGenerationProvider(
        model="gpt-5.5",
        api_key="test-key",
        api_base="https://cancelled-provider.test/v1",
        timeout_seconds=2,
        max_output_tokens=100,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    cancelled = PROVIDER_REQUESTS.labels(
        provider="openai", kind="generation_stream", outcome="cancelled"
    )
    success = PROVIDER_REQUESTS.labels(
        provider="openai", kind="generation_stream", outcome="success"
    )
    before_cancelled = cancelled._value.get()
    before_success = success._value.get()

    stream = provider.stream([{"role": "user", "content": "question"}])
    assert next(stream) == "first"
    stream.close()

    assert cancelled._value.get() == before_cancelled + 1
    assert success._value.get() == before_success


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


def test_provider_metrics_record_business_success_and_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"output_text": "answer"})

    provider = OpenAIGenerationProvider(
        model="gpt-5.5",
        api_key="test-key",
        api_base="https://metrics-provider.test/v1",
        timeout_seconds=2,
        max_output_tokens=100,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    missing_key_provider = OpenAIGenerationProvider(
        model="gpt-5.5",
        api_key=None,
        api_base="https://metrics-provider.test/v1",
        timeout_seconds=2,
        max_output_tokens=100,
    )

    success = PROVIDER_REQUESTS.labels(provider="openai", kind="generation", outcome="success")
    error = PROVIDER_REQUESTS.labels(provider="openai", kind="generation", outcome="error")
    before_success = success._value.get()
    before_error = error._value.get()

    assert provider.generate([{"role": "user", "content": "question"}]) == "answer"
    with pytest.raises(ModelProviderError):
        missing_key_provider.generate([{"role": "user", "content": "question"}])

    assert success._value.get() == before_success + 1
    assert error._value.get() == before_error + 1
    assert 'ai_pdf_provider_request_duration_seconds_bucket{kind="generation",le="120.0",provider="openai"}' in generate_latest().decode()
