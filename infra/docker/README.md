# Docker

本目录放本地开发依赖的基础设施配置。

当前提供：
- `compose.yml`: Postgres(pgvector) / Redis / MinIO

说明：
- 当前先把数据依赖放进 Compose
- `web / api / worker` 暂时默认本机原生运行


Postgres 使用 `pgvector/pgvector:pg17`。启动数据库后，在 API 目录执行 `uv run alembic upgrade head`，迁移会启用 `vector` 扩展并创建 `vector(1024)` 列、HNSW 索引、聊天真表以及 notes/tags/来源和绑定关系真表。

本地 Ollama 不是 Compose 服务。需要本地 embedding 时，确保 `http://127.0.0.1:11434` 提供 `qwen3-embedding:0.6b`，并让 API 与 Worker 同时设置 `AI_PDF_EMBEDDING_PROVIDER=ollama` 和 `AI_PDF_EMBEDDING_MODEL=qwen3-embedding:0.6b`。


## 服务探针与内部鉴权

- API liveness：`GET http://127.0.0.1:8000/health/live`
- API readiness：`GET http://127.0.0.1:8000/health/ready`
- Web BFF 与 API 必须共享 `AI_PDF_API_INTERNAL_TOKEN`。该 token 只放服务端环境变量，浏览器不应携带。
- MinIO 默认端口是 `9000`；如果本机使用其他端口，同时更新 API、Worker 和 `.env` 中的 `AI_PDF_MINIO_ENDPOINT`。
