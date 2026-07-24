# Qwen3-Embedding-0.6B local install check

Date: 2026-07-02
Project: Citeframe

## Result

Local Ollama install is usable on this machine.

Installed model tag:

- `qwen3-embedding:0.6b`

Observed model facts from `ollama show`:

- architecture: `qwen3`
- parameters: `595.78M`
- context length: `32768`
- embedding length: `1024`
- quantization: `Q8_0`

## Runtime status

- `ollama` binary present at `/usr/local/bin/ollama`
- version: `0.19.0`
- existing user service file: `/home/cc/.config/systemd/user/ollama.service`
- default service successfully started on `127.0.0.1:11434`

## Commands used

Start the default user service:

```bash
systemctl --user start ollama
systemctl --user status ollama --no-pager
```

Check the default runtime:

```bash
ollama --version
ollama list
```

Install the exact Ollama tag.

Note: direct `ollama pull qwen3-embedding:0.6b` timed out on this machine when fetching the manifest from `registry.ollama.ai`. The successful workaround was to use a temporary local Ollama server on a different port and call the HTTP pull API.

```bash
OLLAMA_HOST=127.0.0.1:11435 /usr/local/bin/ollama serve
curl -sS http://127.0.0.1:11435/api/pull \
  -d '{"name":"qwen3-embedding:0.6b","stream":false}'
```

Verify the model is visible from the default runtime:

```bash
ollama list | rg 'qwen3-embedding'
ollama show qwen3-embedding:0.6b
```

Run a local embedding smoke test against the default runtime:

```bash
curl -sS http://127.0.0.1:11434/api/embed \
  -d '{"model":"qwen3-embedding:0.6b","input":"Citeframe local embedding smoke test"}'
```

## Verification outcome

Smoke test response shape:

- top-level keys: `embeddings`, `load_duration`, `model`, `prompt_eval_count`, `total_duration`
- `model`: `qwen3-embedding:0.6b`
- embedding count: `1`
- vector dimension: `1024`
- first 5 values from the returned vector: `[-0.012281, -0.005372, -0.011377, -0.114303, -0.027515]`
- cold-load `load_duration`: `8678312011` ns
- `total_duration`: `9786415761` ns
- `prompt_eval_count`: `8`

This confirms the model is locally installed and serving real embeddings over HTTP.

## Caveats for FastAPI

- Use Ollama's HTTP API, not `ollama pull` or other CLI commands, from application code.
- The local endpoint is `POST http://127.0.0.1:11434/api/embed`.
- For one string input, Ollama still returns `embeddings` as a list of vectors. FastAPI should read `response["embeddings"][0]` for the single-input case.
- The vector size is `1024`, so any `pgvector` column for this provider/model should be declared with `vector(1024)`.
- The first request after model load can take several seconds because of cold loading.
- On this machine, `ollama pull qwen3-embedding:0.6b` from the CLI hit a manifest timeout once; if that recurs, prefer the local HTTP `/api/pull` workaround above.
- If you want Qwen-style retrieval instructions, prepend them in FastAPI before calling `/api/embed`; Ollama will not add Qwen retrieval instructions automatically.
