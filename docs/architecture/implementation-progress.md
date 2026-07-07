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

当前项目状态：`Workspace 最小业务骨架已接通，进入真实鉴权接入阶段`

说明：

- 产品设计已完成
- 系统架构已完成
- 详细架构已完成
- 数据库设计已完成
- API 契约已完成
- 任务状态机已完成
- `web / api / worker` 基础工程已初始化
- 数据依赖的 Compose 草案已建立

## 3. 阶段进度

| 阶段 | 内容 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 项目定位与架构总览 | 已完成 | 产品设计、系统架构、详细架构已落文档 |
| 2 | 前端骨架与 BFF | 进行中 | Web 基础工程已初始化，Workspace 列表/详情的最小 BFF 已接入 |
| 3 | 鉴权与 Workspace 隔离 | 进行中 | 先用占位 Workspace 数据打通边界，真实登录和成员关系未接入 |
| 4 | 对象存储与上传链路 | 未开始 | 依赖 Web/API/Worker 基础框架 |
| 5 | Worker 与任务状态机 | 进行中 | Worker 占位入口已建立，任务逻辑尚未接入 |
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

当前：`Workspace 最小业务边界已接入，准备继续接真实鉴权与成员关系`

收口结果：

- 架构和数据库口径已经统一
- API 契约和状态机已经补齐
- 文档已完成一次交叉评审
- `apps / packages / infra` 目录骨架已经建立
- `apps/web`、`apps/api`、`apps/worker` 基础工程已初始化
- Workspace 列表与详情的最小 API/BFF/页面链路已建立

## 7. 下一步

下一步：`接入真实鉴权与 Workspace 成员关系`

具体建议从这些内容开始：

1. 接入登录方案占位
   - 选定 Auth.js 目录结构
   - 准备 session 获取入口

2. 接入 Workspace 成员关系占位
   - 让 BFF 不再直接返回匿名 mock，而是消费“当前用户可见工作区”结构

3. 补 API 与 Web 的上下文边界
   - `x-user-id`
   - `x-workspace-id`
   - 内部调用占位

4. 然后进入上传链
   - upload-session
   - finalize-upload

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
