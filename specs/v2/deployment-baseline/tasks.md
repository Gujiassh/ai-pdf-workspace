# 阶段 9 部署、日志与观测任务

## Phase 1：规格与镜像

- [x] T001 建立部署基线需求、边界和验收标准
- [x] T002 [US1] 建立 API/Worker 锁定依赖多目标镜像 `infra/docker/Dockerfile.python`
- [x] T003 [US1] 建立 Web standalone 镜像 `infra/docker/Dockerfile.web`

## Phase 2：编排与迁移门禁

- [x] T004 [US1] 建立完整部署编排 `infra/docker/compose.deploy.yml`
- [x] T005 [US2] 配置 Postgres healthy -> migration completed -> API/Worker -> Web 启动顺序
- [x] T006 [US3] 为基础依赖、API 和 Web 配置健康检查与运行日志

## Phase 3：配置与文档

- [x] T007 [US1] 提供部署环境模板 `infra/docker/.env.deploy.example`
- [x] T008 [US3] 更新 `infra/docker/README.md` 的部署运行手册
- [x] T009 同步架构路线与实施进度文档

## Phase 4：验证

- [x] T010 通过 Compose 静态解析和镜像构建
- [x] T011 在隔离 project/volume 完成 migration、API、Worker、Web 健康 smoke
- [x] T012 验证重启持久性、迁移幂等与 smoke 资源清理

## Phase 5：观测

- [x] T013 [US4] 增加 HTTP、provider、retrieval、storage 和 ingestion job Prometheus 指标
- [x] T014 [US4] 增加 Worker metrics server 和任务状态指标测试
- [x] T015 [US4] 在隔离部署验证指标文本与真实请求变化

## Phase 6：备份恢复

- [x] T016 [US5] 实现 PostgreSQL + MinIO 同批备份脚本和 checksum manifest
- [x] T017 [US5] 实现显式确认、停写和迁移复验的恢复脚本
- [x] T018 [US5] 在隔离 project 销毁数据卷后完成真实恢复演练

## Phase 7：安全入口与业务 smoke

- [x] T019 [US6] 接入 Caddy 唯一入口、自动 HTTPS 和安全响应头
- [x] T020 [US6] 验证 proxy 200、安全头和内部端口未发布
- [x] T021 [US1] 在隔离部署完成上传、入库、Chat/citation、笔记和删除真实 smoke

## Phase 8：收口

- [x] T022 同步架构路线、实施进度和运行手册
- [x] T023 运行 API、Worker、Web 全量回归、镜像检查与 `git diff --check`

## 运行证据

- 隔离 project：`aipdf-phase9-*`，使用独立网络、端口和具名卷；未触碰开发数据。
- 指标：真实业务触发 Hybrid retrieval、Ollama embedding、OpenAI stream success/error、storage、ingestion succeeded 和 Worker claimed/handled。
- 恢复：使用最终 digest 锁定配置销毁容器、网络和全部卷后，从空部署恢复；数据库用户对象、Redis key 和 MinIO bucket 空目标门禁通过，MinIO list/find 失败会在数据回放前中断。用户、Workspace、ready 文档、citation、note、note_source 和 `a8c9d0e1f2a3` 完整，PDF SHA-256 一致；七个长期服务均达到 healthy/running 后才打印 `restore_complete`。
- 入口：本地 `http://:80` Caddy smoke 返回 200 和四项安全头；生产 `CADDY_SITE_ADDRESS` 域名使用 Caddy 自动 HTTPS。
- 业务：注册、Workspace、上传、ready、Hybrid Chat/citation、note、恢复、异步删除和对象清理通过。
- 最终门禁：API `82 passed`、Worker `18 passed`、Web `48 passed`、ESLint、TypeScript、Next build、Alembic check、compileall、Compose config、API/Worker/Web 非 root 镜像、基础服务 digest、Caddy headers、备份恢复失败注入、只读备份 preflight、最终销卷恢复和 `git diff --check` 全部通过。

## 依赖

- T004-T006 依赖 T002-T003。
- T010 依赖 T002-T008。
- T011-T012 依赖 T010。
- T013-T015 依赖 T010-T012。
- T016-T018 依赖 T010-T012。
- T019-T021 依赖 T013-T018。
- T022-T023 在所有运行态 smoke 后执行。
