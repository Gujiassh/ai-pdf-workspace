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

当前项目状态：`真实后端登录/注册、workspace membership、documents 与 ingestion_jobs 已接通；Worker 已可消费 ingest 任务、回收超时任务，并将文本 PDF 或 OCR fallback 结果写入页面和文本块，文档详情按页读取，Viewer 可读真实页面文本。向量化与检索仍未接通。`

说明：

- 产品设计与架构、数据库设计、API 契约均已完成
- **前端交互外壳已全部完成**（页面布局、PDF 浏览器、章节大纲导航树、划词提问浮窗、随手记、流式对话气泡、多语言与暗黑模式切换、自适应抽屉布局与微动效都已具备；后续继续保留 UI 壳，但对应旧 mock 数据流会逐段替换并删除，不作为正式逻辑继续维护）
- `web / api / worker` 基础工程已初始化完成
- 真实后端认证接口与 BFF session cookie 已接通
- `users / workspaces / workspace_memberships` 最小真表链路已接通
- 首页与工作区详情页的 workspace 可见范围、创建、归档已切到真实 BFF/API
- API 侧已接入数据库结构版本步骤工具，当前最小真表基线版本为 `b139cbaa9e15`
- 接下来进入文档上传链与主工作台业务数据替换

## 3. 阶段进度

| 阶段 | 内容 | 状态 (前端原型) | 状态 (真实对接) | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 项目定位与架构总览 | 已完成 | 已完成 | 产品设计、系统架构、详细架构已落文档 |
| 2 | 前端骨架与 BFF 接入 | 已完成 | 进行中 | 交互页面已完备；Workspace 与 Documents 的核心 BFF 已落地，主工作台其余真实接口仍在补齐；未接真的部分只保留 UI 外壳，不再保留 mock 逻辑兼容目标 |
| 3 | 鉴权与 Workspace 隔离 | 已完成 | 进行中 | 真实用户 Session、自定义 BFF session 与 workspace membership 已接通；正式 Auth.js 与页面级守卫仍未完成 |
| 4 | 对象存储与上传链路 | 已完成 (Mock) | 进行中 | 上传会话、BFF 代理上传、MinIO 落盘与 finalize-upload 已落地；浏览器直传与正式对象存储策略仍可后续演进 |
| 5 | Worker 与任务状态机 | 已完成 (Mock) | 进行中 | Worker 已消费 `ingest` 队列，完成任务领取、超时回收、成功/失败落库与解析/切块状态推进；无文本层 PDF 会进入 OCR fallback；重试、重建和异步删除任务待接入 |
| 6 | PDF 文本解析与切块 | 已完成 (Mock) | 进行中 | `document_pages` 与 `document_chunks` 已落真实表；文本 PDF 和扫描 PDF 的 OCR 结果都按页、按块持久化，详情接口按页返回，Viewer 已切真实页面数据 |
| 7 | Embedding 与检索检索 | 已完成 (Mock) | 未开始 | 模拟检索命中与高亮已闭环；真实向量索引未对接 |
| 8 | Chat、citation、笔记与标签 | 已完成 | 未开始 | 气泡流展示与引文保存笔记、标签复合过滤已全部闭环 |
| 9 | 部署、日志与观测 | 未开始 | 未开始 | 待后端联调与 Docker Compose 部署落地后开展 |

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

当前：`Worker ingest 消费、页面解析、扫描 PDF OCR fallback 与文本切块已接通；下一步接 embedding 与检索。`

收口结果：

- 架构和数据库口径已经统一
- API 契约和状态机已经补齐
- 文档已完成一次交叉评审
- `apps / packages / infra` 目录骨架已经建立
- `apps/web`、`apps/api`、`apps/worker` 基础工程已初始化
- Workspace 列表与详情的最小 API/BFF/页面链路已建立
- `users / workspaces / workspace_memberships` 最小真表、查询、创建、归档链路已落地
- API 侧已从启动时自动建表切换到显式数据库版本步骤；当前 head 版本为 `d7f3aab48fe1`
- `documents / ingestion_jobs` 真表、迁移、列表、upload-session、二进制上传、finalize-upload、job 查询与删除链路已落地
- `document_pages / document_chunks` 真表和迁移已落地；Worker 会领取 queued ingest job、回收超时任务，先提取文本层，必要时用 RapidOCR + ONNX Runtime 渲染页面并识别，再按页切块、更新任务状态，并提供按页文档详情查询
- BFF 现已从登录 cookie session 中透传 `x-user-id` 到 FastAPI，按当前用户 membership 返回可见工作区并代理 documents 上传请求
- 当前主工作台里的 notes / threads / tags 仍只保留 UI 外壳与临时本地状态；这些 mock 数据流会在接入真实链路时直接替换并删除，不作为长期结构继续维护
- 已支持真实后端注册/登录与 BFF httpOnly cookie session（不自动注册，要求显式配置 `AI_PDF_SESSION_SECRET`）
- 已补 FastAPI auth / workspace / documents 路由自动化测试，覆盖注册、workspace 权限、文档上传会话、上传确认、job 查询与删除

## 7. 下一步

下一步：`接入真实 embedding 与检索`

具体建议从这些内容开始：

1. 接入 embedding provider 与向量列
   - `chunked -> embedding -> ready`
   - pgvector 检索

2. 然后进入主工作台替换
   - PDF viewer 数据
   - chat 检索前置条件
   - notes source 对真实文档 id 的依赖

## 8. 当前不进入主线

当前不进入主线：

- 多模态 PDF 页面理解
- 图表 / 图片理解
- 表格结构化提取与区域级 citation
- 复杂 Agent 编排平台
- 多模型策略路由
- 复杂权限系统

## 9. 更新方式

后续每推进一个大步骤，都更新这份文档的：

- `当前总状态`
- `阶段进度`
- `当前正在做什么`
- `下一步`
