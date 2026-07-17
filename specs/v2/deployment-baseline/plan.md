# 阶段 9 部署、日志与观测实施计划

## 技术上下文

- 编排：Docker Compose，使用独立部署文件，不覆盖现有本地依赖 Compose。
- Python：API 与 Worker 使用 Python 3.12；部署 requirements 由各自 `uv.lock` 导出并带分发包 hash，镜像用 pip 校验安装。
- Web：Node.js 22、pnpm 锁文件、Next.js standalone 输出。
- 数据：Postgres 17 + pgvector、Redis 7、MinIO，使用具名卷。
- 观测：Prometheus Python client；API `/metrics` 与 Worker 内部指标端口。
- 入口：Caddy 反向代理与自动 HTTPS。
- 备份：`pg_dump/pg_restore` 与 MinIO Client mirror，使用同批 manifest 和 SHA-256 校验。

## 架构边界

1. 部署文件只负责构建、配置、依赖顺序、健康检查与进程生命周期。
2. migration 复用现有 API 镜像和 Alembic，不在 API 启动时隐式建表。
3. Worker 继续复用现有任务领取、有限退避和信号退出逻辑。
4. Web 继续通过服务端 BFF 访问 API；浏览器只访问 Caddy，Web 不发布宿主端口。
5. 当前本地 `compose.yml` 与它的 bind-mounted 数据保持不变，部署基线使用独立具名卷。
6. 指标只暴露运行与容量信号，不包含业务正文、用户输入和对象 key。
7. 备份恢复脚本只操作部署 Compose project，并要求显式环境文件与恢复确认。
8. Caddy 只代理 Web；浏览器仍不直接访问 FastAPI。

## 实施步骤

### Phase 1 镜像

- 为 API 和 Worker 建立锁文件导出、hash 校验驱动的 Python 多目标镜像。
- 为 Web 启用 standalone 产物并建立 Node 运行镜像。
- 使用非 root 用户运行三个应用进程。

### Phase 2 编排与迁移门禁

- 新增完整部署 Compose，配置基础依赖健康检查。
- migration 在 Postgres healthy 后执行 `alembic upgrade head`。
- API/Worker 依赖 migration 成功，Web 依赖 API healthy。
- 仅发布 Caddy 的 HTTP/HTTPS 端口，MinIO console 只绑定回环地址。

### Phase 3 配置与文档

- 提供无真实密钥的部署环境模板。
- 记录构建、启动、查看状态/日志、停止和重跑迁移命令。
- 保留 Ollama 作为宿主机 embedding provider 的显式地址配置。

### Phase 4 验证

- 静态解析 Compose 并检查依赖、端口、卷与健康检查。
- 构建 API、Worker 与 Web 镜像。
- 在隔离的部署 project/volume 下完成启动与健康 smoke。
- 重启后验证数据卷仍存在，随后清理隔离 smoke 资源。

### Phase 5 观测

- API middleware 记录 route template、method、status 和耗时。
- provider、retrieval 和 storage 在各自服务边界记录计数、失败和阶段耗时。
- `/metrics` 刷新 ingestion job queued/running/failed 数量；Worker 启动内部 metrics server。

### Phase 6 备份恢复

- 备份脚本在同一停写窗口停止 Caddy/Web/API/Worker，生成 PostgreSQL custom dump、MinIO bucket mirror、绑定 project/database/bucket 的 manifest 和闭集 checksum。
- 恢复脚本要求 `--confirm`，在任何写入前验证文件闭集、checksum、custom archive、空 database、空 Redis 和空 bucket；MinIO list/find 失败必须显式中断，再单事务恢复、回读对象、重跑 migration。
- 在隔离 Compose project 销毁数据卷后执行真实恢复演练。

### Phase 7 安全入口与业务 smoke

- Caddy 作为唯一宿主入口，生产域名启用自动 HTTPS和最小安全头。
- 本地 smoke 使用显式 HTTP site address 验证 proxy，不伪造 TLS 成功。
- 在隔离部署中执行上传、Worker、Chat/citation、笔记和删除完整路径。

## 风险

- Worker OCR 依赖会显著增大镜像；构建层要分离锁文件与源码以复用缓存。
- RapidOCR 自身依赖 OpenCV，Worker 不得再并装另一个 OpenCV 发行包覆盖同一 `cv2` 文件。
- 宿主 Ollama 在容器内不能使用 `127.0.0.1`，默认通过 `host.docker.internal` 映射访问。
- Compose 实现版本存在差异，静态验证和 smoke 使用仓库当前支持的 `docker-compose` 命令。
- generation provider 不可用会让 API readiness 失败；部署环境必须显式提供 OpenAI key/base URL。
- 指标 route label 必须使用路由模板，不能记录原始 path 中的 UUID。
- 恢复操作具有破坏性，必须先校验备份并要求 `--confirm`，不能提供隐式覆盖模式。

## 验证门禁

- Dockerfile 构建
- Compose config 静态解析
- migration 一次执行与重复执行
- API/Web health smoke
- Worker 进程和日志 smoke
- 持久卷重启验证
- API、Worker、Web 既有测试与 `git diff --check`
- Prometheus 文本解析与真实指标变化
- PostgreSQL/MinIO 备份恢复演练
- Caddy proxy、安全头和未发布端口检查
- 完整业务 smoke
