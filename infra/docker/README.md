# Docker

本目录放本地开发依赖的基础设施配置。

当前提供：
- `compose.yml`: Postgres(pgvector) / Redis / MinIO

说明：
- 当前先把数据依赖放进 Compose
- `web / api / worker` 暂时默认本机原生运行
