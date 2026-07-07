# 实施进度

## 1. 这份文档是什么

这份文档记录项目当前的实施进度，用来回答：

- 已经设计到哪
- 已经完成哪些阶段
- 当前正在做什么
- 下一步应该做什么

更新规则：

- 进入新阶段时更新
- 某个阶段完成后更新状态
- 如果实施顺序调整，也在这里同步记录

## 2. 当前总状态

当前项目状态：`项目骨架目录已建立，进入应用初始化阶段`

说明：

- 产品设计已完成
- 系统架构已完成
- 详细架构已完成
- 数据库设计已完成
- API 契约已完成
- 任务状态机已完成
- 基础目录骨架已建立，但应用工程尚未初始化

## 3. 阶段进度

| 阶段 | 内容 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 项目定位与架构总览 | 已完成 | 产品设计、系统架构、详细架构已落文档 |
| 2 | 前端骨架与 BFF | 进行中 | 目录已建立，应用工程尚未初始化 |
| 3 | 鉴权与 Workspace 隔离 | 未开始 | 依赖项目骨架 |
| 4 | 对象存储与上传链路 | 未开始 | 依赖 Web/API/Worker 基础框架 |
| 5 | Worker 与任务状态机 | 设计完成 / 实现未开始 | 状态机文档已完成，代码未开始 |
| 6 | PDF 解析与 chunk | 未开始 | 依赖 Worker 和文档链落地 |
| 7 | Embedding、pgvector 与检索 | 未开始 | 依赖 chunk 数据入库 |
| 8 | Chat、citation、笔记与标签 | 未开始 | 依赖检索和文档链 |
| 9 | 部署、日志与观测 | 未开始 | 依赖项目骨架与主链实现 |

## 4. 已完成的设计文档

- `docs/ssot/product-design.md`
- `docs/ssot/system-architecture.md`
- `docs/architecture/detailed-system-architecture.md`
- `docs/architecture/feature-map.md`
- `docs/architecture/database-design.md`
- `docs/architecture/api-contracts.md`
- `docs/architecture/job-state-machine.md`

## 5. 当前建议实施顺序

从现在开始，建议按以下顺序推进代码实现：

1. 项目骨架
2. 鉴权与 Workspace
3. 对象存储上传链
4. Worker 基础与任务队列
5. 文本 PDF 解析与 chunk
6. embedding 与 pgvector 检索
7. Chat + citation
8. notes + tags
9. 部署、日志、观测

## 6. 当前正在做什么

当前：`项目骨架目录已建立，准备初始化应用工程`

收口结果：

- 架构和数据库口径已经统一
- API 契约和状态机已经补齐
- 文档已完成一次交叉评审
- `apps / packages / infra` 目录骨架已经建立

## 7. 下一步

下一步：`初始化应用工程与本地运行基础`

具体建议从这些内容开始：

1. 初始化 `apps/web`
   - Next.js 基础工程
   - 最小健康页

2. 初始化 `apps/api`
   - FastAPI 基础工程
   - `/health` 接口

3. 初始化 `apps/worker`
   - Worker 基础入口
   - 最小启动脚本

4. 初始化 `infra/docker`
   - Postgres / Redis / MinIO / 应用服务的 Compose 草案

5. 打通最小健康检查链路
   - `web` 可启动
   - `api` 可启动
   - `worker` 可启动
   - 数据依赖可联通

## 8. 当前不进入主线

当前不进入主线：

- 多模态 PDF
- OCR
- 图表 / 图片理解
- 复杂 Agent 编排平台
- 多模型策略路由
- 复杂权限系统

## 9. 更新方式

后续每推进一个大步骤，都更新这份文档的：

- `当前总状态`
- `阶段进度`
- `当前正在做什么`
- `下一步`
