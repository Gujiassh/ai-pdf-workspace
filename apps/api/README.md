# API App

FastAPI 业务后端入口。

当前状态：
- 提供 `/health`、`/v1/auth/*`、`/v1/workspaces*`、documents/ingestion、threads/messages、chat stream、notes/tags CRUD 与 document/note tag bindings 链路
- 数据库结构现在通过显式版本步骤管理，不再依赖应用启动时自动建表

## 本地常用命令

初始化或升级本地数据库结构：

```bash
cd apps/api
uv run alembic upgrade head
```

如果你的本地库是在接入数据库版本步骤之前就已经用旧方式自动建好的，而且当前表结构已经与代码一致，可以只打版本标记而不重建表：

```bash
cd apps/api
uv run alembic stamp head
```

新增下一版数据库结构变更草稿：

```bash
cd apps/api
uv run alembic revision --autogenerate -m "描述这次改表做了什么"
```

运行后端测试：

```bash
cd /home/cc/code/ai-pdf-workspace
uv run --project apps/api pytest apps/api/tests
```


## 模型运行时配置

API 和 Worker 共享 embedding 配置。当前本地回归使用 Ollama：

```bash
export AI_PDF_EMBEDDING_PROVIDER=ollama
export AI_PDF_EMBEDDING_MODEL=qwen3-embedding:0.6b
```

这个模型返回 1024 维向量，对应数据库里的 `vector(1024)`。如果使用支持 Embeddings API 的 OpenAI 账号，可以改成：

```bash
export AI_PDF_EMBEDDING_PROVIDER=openai
export AI_PDF_EMBEDDING_MODEL=text-embedding-3-small
export OPENAI_API_KEY=...
export OPENAI_API_BASE=https://api.openai.com/v1
```

`OPENAI_API_BASE` 可以填写网关根地址，代码会自动补 `/v1`。当前项目的 OpenAI 网关如果不提供 embedding 模型，必须使用 Ollama 或换成支持 embedding 的账号/网关；不会自动把失败请求伪装成可用结果。

Chat generation 当前使用 OpenAI Responses API。API 与 Worker 还必须共享同一个数据库、MinIO endpoint 和 embedding provider/model/version 配置；本机 MinIO 若不是 Compose 默认的 `127.0.0.1:9000`，请同时设置 `AI_PDF_MINIO_ENDPOINT`。

数据库升级：

```bash
cd apps/api
uv run alembic upgrade head
```
