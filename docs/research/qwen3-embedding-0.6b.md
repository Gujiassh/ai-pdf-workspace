# Qwen3-Embedding-0.6B for AI PDF Workspace

## Recommendation

**Use `Qwen/Qwen3-Embedding-0.6B` as the leading open-source embedding candidate for a local-first AI PDF Workspace, especially if Chinese or multilingual retrieval matters.** It is a good planning fit when we want Apache-2.0 weights, self-hosting, and strong multilingual retrieval signals without jumping straight to a much larger model.

Recommended default evaluation setup:

- Serve `Qwen/Qwen3-Embedding-0.6B` behind FastAPI via `vLLM`.
- Start with **1024 dimensions** and cosine similarity in `pgvector`.
- Add an English query instruction, because Qwen reports a **1% to 5%** retrieval gain from instructions and explicitly recommends English instructions for multilingual use.
- Rerank the top 20 to 50 candidates with `Qwen/Qwen3-Reranker-0.6B` if latency budget allows.
- Keep `text-embedding-3-small` as the managed baseline during evaluation, not as the architecture default.

## Why It Fits

| Topic | Planning take |
| --- | --- |
| License / commercial use | Strong fit. Hugging Face lists `apache-2.0`, so it is open-weight and commercially usable with normal Apache obligations. |
| Chinese / multilingual | Strong fit. Qwen publishes support for **100+ languages** and reports competitive multilingual and Chinese benchmark results. |
| Size / deployability | Good fit. At **0.6B params**, it is much lighter than the 4B and 8B siblings, so it is realistic for single-node self-hosting. |
| API ergonomics | Good fit. Official examples exist for `sentence-transformers`, `transformers`, `vLLM`, and TEI; Ollama also ships an official `qwen3-embedding` model family. |
| Retrieval quality | Promising, but not final. Published results are strong enough to justify a bake-off, but we still need internal PDF retrieval evals. |
| Operational complexity | Higher than OpenAI. Self-hosting adds batching, monitoring, GPU sizing, cold-start, and model lifecycle work. |

## Model Facts

Primary-source facts from the official model card and Qwen technical report:

- Model: `Qwen/Qwen3-Embedding-0.6B`
- License: `apache-2.0`
- Parameters: `0.6B`
- Context length: `32K`
- Embedding size: **up to 1024**, with user-defined output dimensions from **32 to 1024**
- Instruction-aware: yes
- MRL/custom-dimension support: yes
- Supported languages: **100+**

Important implementation note from Qwen:

- For retrieval, **queries should carry an instruction** and documents should not.
- For multilingual scenarios, Qwen recommends writing the instruction **in English**.

For an AI PDF Workspace, that means the query side should look more like:

```text
Instruct: Given a user question, retrieve the most relevant PDF chunks that answer it.
Query: <user query>
```

## Deployment Options

### 1. `sentence-transformers`

Best for:

- offline indexing jobs
- quick Python experiments
- a simple first integration without standing up a model server

Official Qwen requirements:

- `transformers>=4.51.0`
- `sentence-transformers>=2.7.0`

Planning take:

- Good for batch ingestion workers.
- Less ideal than `vLLM` if we want a shared network service with standard HTTP APIs.

### 2. `vLLM`

Best for:

- production service in the FastAPI layer
- batching and higher-throughput embedding workloads
- minimizing app-specific serving glue

Official Qwen requirement:

- `vllm>=0.8.5`

Useful vLLM endpoints:

- `/v1/embeddings` for the embedding model
- `/rerank` or `/v1/rerank` for rerankers
- `/score` for scoring models

Planning take:

- This is the best default for a Next.js + FastAPI stack because it gives us a clean HTTP boundary and lets FastAPI stay provider-focused instead of model-runtime-focused.
- vLLM docs also note that it handles the **model inference component** of RAG, not full orchestration; that separation matches the architecture we want anyway.

### 3. `Ollama`

Best for:

- local developer machines
- quick prototypes
- small internal demos

Applicability:

- Yes. Ollama has an official `qwen3-embedding` library entry and a `qwen3-embedding:0.6b` tag.
- Ollama docs recommend `qwen3-embedding` for embeddings and expose `/api/embed`.

Notable published tags:

- `qwen3-embedding:0.6b` at **639MB**
- `qwen3-embedding:0.6b-fp16` at **1.2GB**
- context window listed as **32K**

Planning take:

- Good dev default.
- Not my first production choice if we want stronger observability, standardized serving, or tighter batching control.

## Dimensions and `pgvector`

This model's flexible dimensions are useful, but `pgvector` schema and index design still need a fixed choice per indexed embedding column.

Recommended planning default:

- Start with **1024 dimensions**.
- Only cut to **512** after we have recall/latency/storage measurements on our own PDF corpus.

Why:

- Qwen publishes the full 32 to 1024 range, but does not publish a simple decision table saying where recall drops enough for our corpus.
- `text-embedding-3-small` uses **1536 dimensions** by default, so 1024 is already a leaner storage profile.
- Lowering dimension is a schema decision, not just a runtime toggle, once `pgvector` indexes exist.

Practical rule:

- Do **not** mix different dimensions in the same indexed vector column.
- Treat `provider + model + dim + version` as part of the embedding contract.
- If we switch dimensions or providers, do it as a new embedding version and backfill, not as an in-place silent change.

## Planning-Level Tradeoffs vs `text-embedding-3-small`

| Topic | Qwen3-Embedding-0.6B | OpenAI `text-embedding-3-small` |
| --- | --- | --- |
| Hosting model | Self-hosted / open-weight | Managed API |
| License status | Apache-2.0 | Proprietary API |
| Chinese evidence | Direct C-MTEB result published by Qwen | OpenAI public docs emphasize MTEB and MIRACL, not Chinese-specific evals |
| Multilingual evidence | Qwen publishes MMTEB and 100+ language support | OpenAI publishes MIRACL improvement and general multilingual positioning |
| Storage profile | 32 to 1024 configurable | 1536 default, with API-side shortening support |
| Ops burden | Higher | Lower |
| Privacy / data locality | Strong | External API boundary |
| Cost shape | Infra cost, no per-call vendor fee | Usage-priced API |
| Time to first result | Slower | Faster |

Published quality signals:

- OpenAI reports `text-embedding-3-small` at **62.3 MTEB average** and **44.0 MIRACL average**.
- Qwen reports `Qwen3-Embedding-0.6B` at **64.33 MMTEB mean(task)**, **70.70 MTEB English v2 mean(task)**, and **66.33 C-MTEB mean(task)**.
- In Qwen's published tables, the 0.6B model also scores above OpenAI's `text-embedding-3-large` on the reported MMTEB and MTEB English v2 tables.

Important caution:

- These numbers are **directional**, not a clean apples-to-apples winner declaration.
- Qwen and OpenAI are publishing different benchmark slices and evaluation setups.
- For product planning, the right reading is: **Qwen3-Embedding-0.6B is clearly strong enough to deserve a serious internal bake-off, especially for Chinese/multilingual PDF retrieval.**

## Reranker Pairing Options

### Default pairing: `Qwen/Qwen3-Reranker-0.6B`

Why this is the default:

- Same model family and same Apache-2.0 licensing.
- Same **100+ language** positioning.
- Same instruction-aware design.
- Lowest-cost reranker option in the family.

Qwen's reranker card reports these retrieval-oriented scores for `Qwen3-Reranker-0.6B`:

- `MTEB-R`: **65.80**
- `CMTEB-R`: **71.31**
- `MMTEB-R`: **66.36**

Use it when:

- dense retrieval gets us to top 20 to 50 chunks
- answer quality matters enough to justify a second pass
- we want a fully open-source retrieval stack

### Larger-family options

- `Qwen/Qwen3-Reranker-4B`: better quality if we can afford more latency and GPU memory
- `Qwen/Qwen3-Reranker-8B`: highest family quality, likely too heavy for an MVP PDF workspace unless search quality is the core differentiator

### vLLM note for rerankers

If we serve the official original Qwen reranker on `vLLM`, the docs show specific `--hf_overrides` are needed. For planning, that means:

- embedding service on `vLLM` is straightforward
- reranker service on `vLLM` is still viable, but needs a slightly more explicit deployment recipe

## Integration Behind an `EmbeddingProvider` Abstraction

Recommended boundary:

- **Next.js**: upload PDFs, submit queries, render search / answer UI
- **FastAPI**: own chunking, embedding, reranking, retrieval, and provider selection
- **Postgres + pgvector**: store chunk vectors and ANN indexes

Do not let Next.js call the embedding runtime directly.

### Suggested provider contract

TypeScript / product-level shape:

```ts
export type EmbeddingConfig = {
  provider: 'openai' | 'qwen-vllm' | 'qwen-st' | 'ollama'
  model: string
  dimensions: number
  queryInstruction?: string
  normalize: boolean
}
```

Python / FastAPI boundary:

```python
class EmbeddingProvider(Protocol):
    name: str
    model: str
    dimensions: int

    async def embed_query(self, text: str) -> list[float]: ...
    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
```

### Qwen-specific provider behavior

For the Qwen provider:

- `embed_query()` should prepend a stored English instruction.
- `embed_documents()` should embed raw chunk text with no instruction.
- Normalize vectors before persistence if the serving backend does not guarantee normalized output.
  - Qwen's raw `transformers` example explicitly normalizes.
  - Ollama states that `/api/embed` returns **L2-normalized** vectors.

### Retrieval flow

1. Parse PDF and chunk it in FastAPI.
2. Batch `embed_documents()` calls through the selected provider.
3. Store vectors plus metadata such as `provider`, `model`, `dim`, and `embedding_version`.
4. At query time, run `embed_query()`.
5. Fetch top-K candidates from `pgvector` with cosine distance.
6. Optionally rerank top 20 to 50 with `Qwen3-Reranker-0.6B`.
7. Pass the final top chunks into answer generation.

### Schema/versioning guidance

Because vector dimension is part of the storage/index contract, use one active embedding config per indexed table or per indexed column. A practical approach is:

- `document_chunks`
- `chunk_embeddings_qwen3_1024_v1`
- `chunk_embeddings_openai_1536_v1`

That keeps migrations explicit and avoids mixed-dimension confusion.

## Decision Summary

Adopt `Qwen3-Embedding-0.6B` as the **primary open-source candidate** for the product plan.

Recommended next step for evaluation:

1. Run a bake-off between:
   - `Qwen3-Embedding-0.6B` via `vLLM` at 1024 dims
   - `text-embedding-3-small`
2. Use the same PDF chunk set, same retrieval logic, and same top-K.
3. Measure:
   - recall@k / nDCG on labeled queries
   - Chinese vs English query quality
   - ingest throughput
   - query latency
   - storage size in Postgres
4. If Chinese retrieval is a top-level requirement and 0.6B is close but not enough, test `Qwen3-Embedding-4B` before abandoning the Qwen path.

## Sources

- Qwen official model card: <https://huggingface.co/Qwen/Qwen3-Embedding-0.6B>
- Qwen official reranker card: <https://huggingface.co/Qwen/Qwen3-Reranker-0.6B>
- Qwen official blog: <https://qwenlm.github.io/blog/qwen3-embedding/>
- Qwen technical report: <https://arxiv.org/abs/2506.05176>
- vLLM online serving docs: <https://docs.vllm.ai/en/stable/serving/online_serving/>
- vLLM scoring/rerank docs: <https://docs.vllm.ai/en/latest/models/pooling_models/scoring/>
- Ollama embeddings docs: <https://docs.ollama.com/capabilities/embeddings>
- Ollama `qwen3-embedding` library: <https://ollama.com/library/qwen3-embedding>
- Ollama `qwen3-embedding` tags: <https://ollama.com/library/qwen3-embedding/tags>
- OpenAI embedding announcement: <https://openai.com/index/new-embedding-models-and-api-updates/>
- OpenAI embeddings guide: <https://developers.openai.com/api/docs/guides/embeddings>
