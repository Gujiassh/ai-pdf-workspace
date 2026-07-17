# AI PDF Workspace 系统架构

## 1. 架构结论

AI PDF Workspace 采用 `Web App + API Service + Worker + Data Plane` 的分层架构。

它不是前后端都各管一半业务逻辑的松散组合，而是：

- `Next.js` 负责用户界面、会话鉴权、BFF 网关、流式体验
- `FastAPI` 负责业务 API、文档处理编排、检索编排、模型调用编排
- `Worker` 负责长任务：解析、切块、embedding、索引、重建索引
- `Postgres + pgvector` 负责业务数据和检索向量
- `MinIO` 负责原始 PDF 与处理产物
- `Redis` 当前作为已部署的缓存/队列基础设施预留；业务任务真相源仍是 Postgres `ingestion_jobs`

V1 默认以 `模块化双服务系统` 落地，而不是微服务集群。
原因很直接：

- 前端体验和鉴权边界需要 `Next.js`
- PDF 解析、embedding、检索、后台任务明显更适合 Python
- 继续拆分更多服务会让学习/面试版本过重

## 2. 架构目标

### 2.1 主要目标

- 支撑多 Workspace 的强隔离知识边界
- 支撑 PDF 文档的异步入库与索引
- 支撑带引用的 RAG 问答
- 支撑笔记、标签、聊天历史沉淀
- 支撑本地学习部署和后续云上部署
- 支撑 OpenAI 与本地开源 embedding provider 并存

### 2.2 非目标

V1 架构不追求：

- 多租户企业级 IAM
- 多区域高可用
- 跨 Workspace 联邦检索
- 多模型 Agent 编排平台
- 超高吞吐搜索集群
- 独立图片、音频、视频和标注数据 Asset

当前范围支持可直接提取文本的 PDF，也支持无文本层的扫描 PDF 在 Worker 内通过 RapidOCR fallback 转为页面文本和归一化 OCR blocks。OCR 不提供独立识别 API，但页面详情会返回坐标块供 Viewer 叠加透明可选层。多模态 PDF 已进入下一阶段目标架构，但在 Evidence 合同获批前不改变当前持久化与 Citation API。

## 3. 顶层架构

### 3.1 逻辑分层

系统分为五层：

1. `Presentation Layer`
   - 浏览器
   - Next.js Web App

2. `Application Gateway Layer`
   - Next.js BFF Route Handlers / Server Actions
   - 会话校验、workspace 上下文注入、流式转发

3. `Domain Service Layer`
   - FastAPI Business API
   - Retrieval / Chat / Document / Notes / Tags / Prompt API

4. `Async Processing Layer`
   - Worker
   - Parse / Chunk / Embed / Reindex / Cleanup 任务

5. `Data & Model Layer`
   - Postgres + pgvector
   - MinIO
   - Redis
   - OpenAI / Ollama / 本地模型运行时

### 3.2 服务清单

#### `web`

Next.js 应用。
职责：

- 页面渲染
- 用户登录态维护
- Workspace 切换 UI
- Chat / Viewer / Notes / Tags 交互
- 作为浏览器唯一应用/BFF 边界，由 Caddy 在公网侧反向代理

#### `api`

FastAPI 主业务服务。
职责：

- Workspace、Document、Note、Tag、Thread、Prompt 业务 API
- 上传 finalize
- 检索编排
- Chat 编排
- 引用结构生成
- 对 Worker 投递任务

#### `worker`

后台异步任务服务。
职责：

- PDF 解析
- chunk 生成
- embedding 写入
- 索引重建
- 文档删除后的异步清理

#### `postgres`

唯一主业务数据库。
职责：

- 业务真相源
- pgvector 检索
- 任务状态持久化

#### `minio`

对象存储。
职责：

- 原始 PDF 文件
- 页面预览图
- 解析中间产物

#### `redis`

缓存与任务中间层。
职责：

- 任务队列
- 检索短缓存
- 限流计数
- 任务状态热点缓存

#### `model providers`

- OpenAI Responses API：问答与结构化输出
- OpenAI Embeddings：V1 默认托管 embedding provider
- Ollama `qwen3-embedding:0.6b`：本地 embedding provider
- 后续可选 reranker provider

## 4. 前端架构

### 4.1 组成与组件划分

前端采用 `Next.js App Router + React Context Provider + feature hooks + Tailwind CSS + Lucide Icons`。Provider 只暴露稳定的 WorkspaceContext API；Workspace、Documents、Chat、Notes/Tags 和视图状态分别由 feature hooks/纯工具模块承载。

1. `Shell & Navigation`
   - [WorkspaceSidebar](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/workspace-sidebar.tsx)：折叠/抽屉式导航栏。
   - [CreateWorkspaceDialog](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/create-workspace-dialog.tsx)：工作区创建 Modal 对话框。
   - [WorkspaceList](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/workspace-list.tsx)：主门户 100% 宽度 cardless 行列表。

2. `Document Workspace UI`
   - [PdfViewer](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/pdf-viewer.tsx)：标签式多 PDF 阅读器，负责工作区级文档切换和阅读状态。
   - [PdfRenderer](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/pdf-renderer.tsx)：通过 PDF.js 文件流渲染原始页面 canvas、原生文本层和 annotation layer，保留图片、排版与 PDF 内置链接。
   - [OutlineTree](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/outline-tree.tsx)：文档章节目录大纲树，支持基于 `${activeDocumentId}-${node.page}-${node.title}` 复合 Key 进行无冲突折叠。
   - [SelectionPopover](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/selection-popover.tsx)：划词即时问答/记录笔记浮空菜单。

3. `Knowledge UI`
   - [ChatPanel](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/chat-panel.tsx)：流式问答管理器。
   - [ChatBubble](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/chat-bubble.tsx)：对话气泡与行内快速笔记沉淀面板。
   - [ChatMarkdown](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/chat-markdown.tsx)：助手 Markdown/GFM 渲染和 citation `[n]` 内联引用映射；只允许 `http/https` 外链。
   - [NotesPanel](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/notes-panel.tsx)：沉淀笔记仓库。
   - [SettingsPanel](file:///home/cc/code/ai-pdf-workspace/apps/web/src/components/settings-panel.tsx)：Prompt 参数调优。

4. `BFF & Data Layer`
   - Next.jsbff 路由转发。
   - [workspace-context.tsx](file:///home/cc/code/ai-pdf-workspace/apps/web/src/lib/workspace-context.tsx) 只做 Provider 组合；数据域分别位于 `use-workspaces.ts`、`use-documents.ts`、`use-chat.ts`、`use-notes-tags.ts`，视图状态位于 `workspace-view-state.ts`。

### 4.2 前端自适应布局引擎 (Responsive Drawer Engine)

采用纯 CSS Breakpoints 实现大屏并排、小屏绝对定位浮出抽屉：
* 屏幕宽幅 $\ge 1024px$ 时：侧边栏与问答板在水平方向并排展示（`lg:relative`）。
* 屏幕宽幅 $< 1024px$ 时：侧边栏与问答面板自动重映射为 `absolute` 绝对定位浮层，增加半透明毛玻璃蒙层（Backdrop Blur overlay）控制点击外部空白区自动闭合抽屉，避免挤压中间阅读视窗。
* 屏幕宽幅 $< 768px$ 时：窄轨图标边栏被 `hidden md:flex` 隐藏，为手机屏幕腾出 100% 显示宽度。

### 4.3 状态划分与解析防御 (State & Sandbox Serialization)

前端状态分类与持久化定义：

1. `Server State`
   - Workspace、文档、任务、会话、笔记、标签和设置均以 FastAPI/Postgres/MinIO 为真实来源；Provider hydrate 后只保留当前页面运行时状态，不把业务数据写入 LocalStorage。
2. `Local UI Preferences`
   - 主题和语言可以写入 LocalStorage，因为它们不属于业务数据；不能用同一机制缓存 Workspace、文档、Chat 或设置。
3. `UI Runtime State`
   - 当前文档激活页码、划词位置坐标、缩放比、侧栏折叠状态。
   - Chat 消息列表是否跟随流式输出：用户在底部时自动跟随，主动上滑后保留用户阅读位置。
4. `Micro-Interaction Animations`
   - **纸张更新**：`activePdfPage` 作为 Content Key，翻页时触发 `animate-in fade-in` 动效。
   - **引用聚焦**：点击回答内联或来源列表中的 Citation 时打开对应文档并跳到快照页，阅读区平滑回到页面顶部，原始 PDF 页面短暂显示 `.animate-citation-pulse` 黄金脉冲。
   - **气泡滑入**：新对话产生时，组件以滑入渐显入场。

## 5. 后端架构

### 5.1 FastAPI 作为唯一业务后端

FastAPI 是业务 API 的单一实现层，不把一半业务逻辑留在 Next.js。

这样做的好处：

- 避免 JS/Python 各自维护一套文档逻辑
- 后续 Worker 与 API 可共享领域模块
- 检索、引用、笔记来源关系都在一处定义

### 5.2 后端模块拆分

#### `workspace service`

职责：

- Workspace CRUD
- Workspace 概览统计
- Workspace Prompt 配置
- Workspace membership / role 校验结果消费

#### `document service`

职责：

- 文档记录创建
- 文档状态流转
- 文档删除和重试
- 页面与 chunk 元数据读取

#### `ingestion orchestrator`

职责：

- 创建 ingestion job
- 投递解析任务
- 更新状态机
- 触发 embed/index 任务

#### `retrieval service`

职责：

- query embedding
- pgvector Dense 相似度召回
- PostgreSQL lexical 候选：拉丁术语使用 FTS GIN，纯中文使用 pg_trgm GiST KNN
- 按文档页执行稳定 RRF 融合
- 可选文档过滤
- 可选 rerank
- 返回引用片段候选

#### `chat orchestrator`

职责：

- 装配 Workspace Prompt
- 装配检索上下文
- 调用 Responses API
- 生成回答与 citation 结构
- 保存 thread/message/citation

#### `notes & tags service`

职责：

- 笔记 CRUD
- citation -> note
- 标签 CRUD
- 标签绑定与筛选

#### `provider adapters`

职责：

- OpenAI Responses 适配
- OpenAI Embeddings 适配
- Ollama/Qwen Embeddings 适配
- 后续 Rerank 适配

### 5.3 Worker 架构

Worker 是独立进程，不与 API 共用请求生命周期。

Worker 任务：

- `parse_pdf`
- `generate_page_artifacts`
- `chunk_document`
- `embed_chunks`
- `rebuild_index`
- `delete_document_artifacts`

当前已实现：Worker 通过 Postgres 轮询领取 `ingestion_jobs.status=queued` 的 `ingest/embed_chunks/delete_cleanup` 任务，先用 pypdf 提取文本；页面没有文本时，使用 RapidOCR + ONNX Runtime 渲染并识别，再统一写入 `document_pages`（含 OCR blocks）和按页文本块 `document_chunks`；随后批量调用配置的 embedding provider 写入 `vector(1024)` 和 provider 元数据，把文档推进到 `ready`。检索服务先以 workspace、ready、未删除、当前 index version 和 provider metadata 为硬边界，分别取得 Dense 与 PostgreSQL lexical 候选，按文档页执行 RRF；生产评测通过后默认使用 Hybrid，`AI_PDF_RETRIEVAL_STRATEGY=dense` 可显式选择 Dense。Chat API 将候选交给 Responses API，真实转发 delta 流并持久化 thread/message/citation 快照；Notes/Tags API 持久化知识沉淀关系，citation -> note 只接受当前 workspace 的真实 `message_citations` 并保存来源快照。

### 5.4 任务编排方式

目标架构采用：

- `Redis queue + Worker`
- `Postgres ingestion_jobs` 作为最终状态记录

即：

- 队列负责调度
- 数据库负责真相状态
- Redis 宕掉后可重新投递
- Postgres 仍保留任务最终结果与失败原因

当前实现采用 Postgres 轮询作为最小可运行调度：Worker 用 `FOR UPDATE SKIP LOCKED` 领取 queued job，再把 `running/succeeded/failed` 状态写回同一事务边界。Redis 队列会在重试、延迟任务和横向扩展进入主线时接入；当前不保留一套未使用的双队列逻辑。

## 6. 数据库架构

### 6.1 数据库选型

主数据库：`Postgres`

原因：

- 关系模型适合 Workspace / 文档 / 聊天 / 笔记 / 标签
- `pgvector` 足够支撑 V1 检索
- 运维复杂度比额外引入向量专用库更低

### 6.2 数据分层

数据库中存在四类数据：

1. `Identity & Auth Context`
   - users
   - sessions
   - workspace_memberships

2. `Knowledge Assets`
   - workspaces
   - documents
   - document_pages
   - document_chunks
   - ingestion_jobs

3. `Conversation & Knowledge Capture`
   - chat_threads
   - chat_messages
   - message_citations
   - notes
   - note_sources
   - tags
   - document_tags
   - note_tags

4. `Provider Metadata`
   - embedding_model
   - embedding_dimensions
   - embedding_provider
   - embedding_version

### 6.3 数据隔离原则

所有业务核心表都必须带 `workspace_id`，并遵守：

- 所有查询先按 `workspace_id` 过滤
- 所有缓存 key 带 `workspace_id`
- 所有对象存储路径带 `workspace_id`
- 所有检索操作先过 workspace 边界

### 6.4 向量存储原则

`document_chunks` 是检索主表。

每条 chunk 至少应保存：

- `workspace_id`
- `document_id`
- `page_number`
- `chunk_index`
- `text`
- `embedding`
- `embedding_provider`
- `embedding_model`
- `embedding_dimensions`
- `embedding_version`

原则：

- 一条向量列只对应一种维度
- 切换 provider 或维度时必须重建 embedding version
- 不做静默覆盖

## 7. 对象存储架构

### 7.1 选型

V1 使用 `MinIO` 作为本地 S3 兼容对象存储。

### 7.2 存储内容

- 原始 PDF
- 页面截图 / 预览图
- 解析 JSON 产物
- 后续可选导出文件

### 7.3 路径规范

推荐路径：

- `workspaces/{workspaceId}/documents/{documentId}/original.pdf`
- `workspaces/{workspaceId}/documents/{documentId}/pages/{page}.png`
- `workspaces/{workspaceId}/documents/{documentId}/artifacts/parsed.json`
- `workspaces/{workspaceId}/documents/{documentId}/artifacts/chunks.json`

### 7.4 上传策略

默认采用 `浏览器直传 MinIO + 预签名 URL`：

1. 浏览器向 Next.js 请求上传会话
2. Next.js 转发给 FastAPI 创建文档与上传令牌
3. 浏览器直接把 PDF 上传到 MinIO
4. 浏览器调用 finalize
5. FastAPI 创建 ingestion job

好处：

- 不让 Web 服务器承受大文件中转
- 本地和云上都通用
- 文件链路和业务链路分离

## 8. 鉴权架构

### 8.1 鉴权结论

V1 采用 `Next.js 会话鉴权 + 内部服务鉴权` 双层架构。

#### 浏览器侧

- 浏览器只信任 Next.js
- 用户登录态由 Next.js 管理
- 推荐 `Auth.js` 这类 Web 会话方案
- Cookie 只对 Web 入口生效

#### 服务侧

- FastAPI 不直接暴露给浏览器
- FastAPI 只接受来自 Next.js BFF 的内部请求
- Next.js 在转发时附带内部签名 token 与用户上下文

### 8.2 鉴权链路

1. 用户登录 Web
2. Next.js 校验用户 session
3. 用户进入某 Workspace
4. Next.js 校验该用户是否有该 workspace 权限
5. Next.js 将 `user_id / workspace_id / role` 放入内部签名头或短时 JWT
6. FastAPI 验签并执行业务逻辑

### 8.3 为什么这样设计

这样做比“浏览器直接拿 token 调 FastAPI”更适合 V1：

- 减少 Python 侧处理 Web session 的复杂度
- 让浏览器永远只有一个公开入口
- 更容易做统一限流、审计、流式转发

### 8.4 鉴权原则

- 任何写操作都必须校验 `workspace_id` 权限
- 任何检索都必须以 `workspace_id` 为硬边界
- FastAPI 不信任前端直接传来的 `workspace_id`
- `workspace_id` 必须来自已认证上下文

## 9. 缓存架构

### 9.1 缓存选型

V1 使用 `Redis`。

### 9.2 缓存用途

#### `retrieval cache`

缓存项：

- query embedding 结果
- 同一 workspace 下短时重复检索结果

适合缓存：

- 高频重复问题
- 相同筛选条件的短时间重查

不适合缓存：

- 长时间持久答案
- 跨 embedding_version 的结果

#### `rate limit cache`

缓存项：

- 用户请求频率计数
- 上传频率计数
- Chat 请求频率计数

#### `task hot cache`

缓存项：

- 最近 ingestion_jobs 状态
- 最近重建索引状态

### 9.3 缓存原则

- 所有缓存 key 必须带 `workspace_id`
- 所有检索缓存必须带 `embedding_version`
- 缓存是加速层，不是真相源
- 任务最终状态只认 Postgres

## 10. 模型与检索架构

### 10.1 生成模型

默认：`OpenAI Responses API`

职责：

- 问答生成
- 结构化输出
- 引用型回答编排

### 10.2 Embedding Provider

采用 provider 抽象。

V1 支持两类：

- `OpenAI text-embedding-3-small`
- `Ollama qwen3-embedding:0.6b`

系统不允许直接把 provider 写死到业务逻辑中。

### 10.3 本地 embedding 路线

当前本机已安装并验活：

- `qwen3-embedding:0.6b`
- 运行在 Ollama
- 可经 `POST /api/embed` 使用
- 当前维度：`1024`

### 10.4 检索流程

1. 问题进入 Retrieval Service
2. 根据当前 Workspace 的 provider 配置生成 query embedding
3. 在 `document_chunks` 里做 pgvector top-k 召回
4. 可选按 document filter 或 tag filter 再过滤
5. Dense 与 lexical 候选按文档页执行稳定 RRF，默认策略为 Hybrid
6. 只有黄金集证明 RRF 仍存在明确排序缺口时才评估 rerank

## 11. 部署架构

### 11.1 当前单机生产基线

采用 `Docker Compose`。

服务：

- `web`
- `api`
- `worker`
- `postgres`
- `redis`
- `minio`
- `ollama`
- `caddy`

特点：

- 单机可跑
- Alembic migration gate 可重复执行
- API/Worker/Web 使用锁定依赖和非 root 镜像
- Caddy 是唯一公开入口，Web 只在 Compose 私网
- PostgreSQL 与 MinIO 支持停写窗口同批备份、闭集 checksum 和空部署恢复

### 11.2 生产 / 云上部署

推荐 `Kubernetes` 或等价容器编排平台。

建议映射：

- `web` Deployment
- `api` Deployment
- `worker` Deployment
- `postgres` Stateful service 或托管数据库
- `redis` 托管或 Stateful service
- `minio` 或云对象存储 S3
- `ollama` 仅本地/内网实验环境保留
- 生产优先使用托管 OpenAI provider

### 11.3 网络拓扑

- 公网只暴露 `caddy`；生产域名由 Caddy 自动 HTTPS
- `web`、`api`、`worker`、`postgres`、`redis`、`minio` 在私网
- `api` 允许访问外部 OpenAI
- `worker` 允许访问 MinIO、Postgres、Redis、模型服务

## 12. 观测与运维架构

### 12.1 日志

- Web 请求日志
- API 业务日志
- Worker 任务日志
- 模型调用日志

日志格式统一为平铺键值格式。

### 12.2 指标

当前已采集：

- API HTTP route-template 请求数和完整响应生命周期
- embedding/generation provider success/error/cancelled 与操作时长
- Dense/Hybrid retrieval success/error、耗时和结果数
- MinIO 操作 success/error/cancelled 与生命周期
- ingestion job 各状态 gauge
- Worker claimed/handled/error counter 与 active gauge

正文、问题、文档名和对象 key 不进入 metric label。首 token、引用支持率和产品核验指标仍属于后续观测范围。

### 12.3 Trace / Correlation

关键链路统一带：

- `request_id`
- `workspace_id`
- `document_id`
- `thread_id`
- `ingestion_job_id`

## 13. 关键业务流程的架构链路

### 13.1 上传与索引

1. Browser 请求上传会话
2. Web 校验用户与 workspace
3. API 创建 document + ingestion_job
4. Browser 直传 MinIO
5. Browser finalize
6. API 创建 queued ingestion job
7. Worker 领取任务，提取文本；无文本层时执行 OCR fallback，再切块并持久化 pages/chunks
8. Worker 批量 embedding 并写入 pgvector
9. API/DB 更新状态为 `ready`

### 13.2 Chat 问答

1. Browser 发问
2. Web 校验会话和 workspace
3. API 执行 retrieval
4. API 调用 Responses API 生成答案
5. API 先持久化用户消息和 `streaming` assistant 节点及 citation 准备记录
6. API 通过 SSE 返回 `meta/delta/citations/done`
7. Web 转发流到浏览器，Browser 展示回答并支持 citation 跳页

### 13.3 Citation 生成笔记

1. Browser 选中 citation
2. Web 转发 note create 请求
3. API 保存 note 与来源关联
4. Browser 刷新 notes 列表

## 14. 安全边界

- 浏览器不可直连 Postgres
- 浏览器不可直连 Redis
- 浏览器不可直连 FastAPI 私有业务接口
- 模型调用密钥只存在服务端
- 对象存储通过预签名 URL 控制访问
- 删除文档时必须同步删除对象存储与向量引用关系

## 15. 演进路线

### V1

- OpenAI 生成
- OpenAI 或 Ollama/Qwen embedding
- pgvector 检索
- MinIO 本地对象存储
- Redis 缓存 + 队列

### 已完成的 V2 基线

- PostgreSQL lexical + Dense + RRF Hybrid
- 生产质量、延迟和并发门禁
- 可复现部署、指标、备份恢复和安全入口

### 下一目标：多模态 PDF Evidence

- 先设计并批准 Evidence 合同
- 页面布局、表格、图表、图片和 OCR 区域
- `pdf_page / pdf_region` 类型化 locator
- Viewer 区域高亮和多模态分层评测

## 16. 当前架构裁决

当前最重要的几条裁决是：

- `Workspace` 是顶层强隔离边界
- `Caddy` 是唯一宿主公开入口；`Next.js` 是浏览器唯一应用/BFF 边界
- `FastAPI` 是唯一业务后端
- `Worker` 负责所有长任务
- `Postgres` 是真相源，`Redis` 是加速层
- `MinIO` 存文件，`pgvector` 存检索向量
- `EmbeddingProvider` 必须可切换，不能把模型写死进业务层
- Workspace 视图状态只应在 workspace 实际切换时同步；重复选择当前 workspace 不能清空 active thread、文档或其他局部视图状态。

## 17. 目标 Evidence 域与迁移禁区

目标架构使用以下职责边界指导设计，但当前代码和数据库尚未迁移：

- `Asset`：Workspace 归属、权限、生命周期、源对象身份和资产类型
- `Representation`：原文件、OCR、布局、表格、caption、ASR 等不可变且可版本化的派生表示
- `ContentUnit`：段落、区域、表格、图像或时间片段等可寻址检索/分析单元
- `Embedding`：ContentUnit 的可重建索引投影，可存在多个空间和版本
- `EvidenceLocator`：带 discriminator 的稳定定位值；PDF 第一阶段只设计 `pdf_page / pdf_region`
- `Citation`：回答生成时冻结 locator、标题、摘要、索引映射和版本语义的证据快照

当前 `documents / document_pages / document_chunks / message_citations / note_sources` 以及 Chat SSE、citation -> note、Viewer 跳页和删除/重索引语义保持冻结。任何 typed locator、Asset 表或 Citation payload 变更都属于持久化/API/save 合同变更，必须先提交迁移、历史回放、坐标系、旧/新 fixture、回滚和备份恢复影响设计，并再次获得明确批准。

聚合、计数、类别分布和数据集质量问题必须走 SQL/分析路径，不能让 LLM 根据召回样本猜总量。Omnilabel 业务 schema 不进入通用 ContentUnit；它是独立业务域和产品赌注。


## 2026-07-15 运行边界

- 浏览器只访问 Next.js BFF；业务 API 额外要求 `x-ai-pdf-internal-token`，该值来自 Web/API 服务端环境变量 `AI_PDF_API_INTERNAL_TOKEN`。
- `/health/live` 只判断进程存活；`/health/ready` 检查数据库、对象存储、embedding provider 和 generation provider。
- Worker 采用有限退避、结构化事件日志和信号优雅退出；任务业务失败仍由 ingestion 服务落库，不能用进程重试替代任务状态机。
