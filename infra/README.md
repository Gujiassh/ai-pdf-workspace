# Infrastructure

基础设施与部署入口位于 [`docker/README.md`](docker/README.md)：

- 本地开发依赖 Compose
- Web、API、Worker 完整部署 Compose
- 环境变量、迁移门禁、健康检查和运行命令
- Prometheus 指标、Caddy HTTPS 入口和内部端口边界
- PostgreSQL/MinIO 同批备份、空部署恢复与校验门禁
