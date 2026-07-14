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

当前项目状态：`真实后端登录/注册、workspace membership、documents、ingestion_jobs、pgvector embedding、workspace 内检索、Chat citation、notes/tags API 与 Web BFF 已接通；Worker 可消费 ingest/embed_chunks 任务，将文本 PDF 或 OCR fallback 结果写入页面、文本块和向量；Viewer 通过原始 PDF 文件流使用 PDF.js 保留页面图片与排版，并支持 canvas、原生文本层、PDF annotation layer、缩放、翻页和目录跳转。`

说明：

- 产品设计与架构、数据库设计、API 契约均已完成
- **前端交互外壳已全部完成**（页面布局、PDF 浏览器、章节大纲导航树、划词提问浮窗、随手记、流式对话气泡、多语言与暗黑模式切换、自适应抽屉布局与微动效都已具备；后续继续保留 UI 壳，但对应旧 mock 数据流会逐段替换并删除，不作为正式逻辑继续维护）
- `web / api / worker` 基础工程已初始化完成
- 真实后端认证接口与 BFF session cookie 已接通
- `users / workspaces / workspace_memberships` 最小真表链路已接通
- 首页与工作区详情页的 workspace 可见范围、创建、归档已切到真实 BFF/API
- API 侧已接入数据库结构版本步骤工具，当前数据库 head 为 `b7a1d2e4c6f8`
- 文档、向量检索、Chat thread/message/citation、notes/tags 已进入真实链路

## 3. 阶段进度

| 阶段 | 内容 | 状态 (前端原型) | 状态 (真实对接) | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 项目定位与架构总览 | 已完成 | 已完成 | 产品设计、系统架构、详细架构已落文档 |
| 2 | 前端骨架与 BFF 接入 | 已完成 | 进行中 | 交互页面已完备；Workspace、Documents、Chat、Notes 和 Tags 的核心 BFF 已落地，后续继续收敛正式状态层与部署边界 |
| 3 | 鉴权与 Workspace 隔离 | 已完成 | 进行中 | 真实用户 Session、自定义 BFF session 与 workspace membership 已接通；正式 Auth.js 与页面级守卫仍未完成 |
| 4 | 对象存储与上传链路 | 已完成 | 进行中 | 上传会话、BFF 代理上传、MinIO 落盘与 finalize-upload 已落地；正式预签名直传与对象存储策略仍可后续演进 |
| 5 | Worker 与任务状态机 | 已完成 | 进行中 | Worker 已消费 `ingest` / `embed_chunks` 队列，完成任务领取、超时回收、成功/失败落库、解析/切块/OCR/embedding 状态推进；重试和异步删除任务待接入 |
| 6 | PDF 原始阅读、文本解析与切块 | 已完成 | 已完成 | `document_pages` 与 `document_chunks` 已落真实表；文本 PDF 和扫描 PDF 的 OCR 结果都按页、按块持久化，原始文件通过文件流供 PDF.js 阅读，Viewer 不再用提取文本替代源页面 |
| 7 | Embedding 与检索 | 已完成 | 已完成 | `vector(1024)`、provider 元数据、HNSW 索引、Worker embedding、workspace 隔离的 cosine 检索已接通；当前运行回归使用 Ollama Qwen3 embedding |
| 8 | Chat、citation、笔记与标签 | 已完成 | 已完成 | Chat thread/message/citation、notes、note_sources、tags、document_tags、note_tags 真表、API、BFF 和 citation -> note 已接通 |
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

当前：`原始 PDF 阅读、OCR fallback、切块、embedding、pgvector 检索、Chat API、Web thread/message/citation BFF、Notes/Tags CRUD 与标签关系已接通；下一步进入部署、日志与观测。`

收口结果：

- 架构和数据库口径已经统一
- API 契约和状态机已经补齐
- 文档已完成一次交叉评审
- `apps / packages / infra` 目录骨架已经建立
- `apps/web`、`apps/api`、`apps/worker` 基础工程已初始化
- Workspace 列表与详情的最小 API/BFF/页面链路已建立
- `users / workspaces / workspace_memberships` 最小真表、查询、创建、归档链路已落地
- API 侧已从启动时自动建表切换到显式数据库版本步骤；当前 head 版本为 `b7a1d2e4c6f8`
- `documents / ingestion_jobs` 真表、迁移、列表、upload-session、二进制上传、finalize-upload、job 查询与删除链路已落地
- `document_pages / document_chunks` 真表和迁移已落地；Worker 会领取 queued ingest job、回收超时任务，先提取文本层，必要时用 RapidOCR + ONNX Runtime 渲染页面并识别，再按页切块、批量调用 embedding provider、写入向量并推进 `chunked -> embedding -> ready`，同时支持 `embed_chunks` 回填已有 chunk。
- 原始 PDF 文件流已接通 API/BFF；`PdfViewer` 使用 PDF.js canvas 作为主页面、text layer 支持原生 PDF 文本选取、annotation layer 支持 PDF 内置链接/批注，OCR 纯文本仍只用于检索和入库，不覆盖源页面视觉内容
- 2026-07-14 回归：真实 84 页扫描 PDF 的 API/BFF 文件流返回 `200 application/pdf`，浏览器确认 canvas 页面非空、84 页翻页、110% 缩放、目录跳页均可用；桌面端无横向溢出，移动端默认收起两侧面板且打开目录后仍无横向溢出。当前测试文件是扫描 PDF，原生 PDF text layer 与 PDF 内置 annotation layer 没有可渲染的文字/批注对象；OCR 文本仍作为检索数据，不伪造覆盖层
- BFF 现已从登录 cookie session 中透传 `x-user-id` 到 FastAPI，按当前用户 membership 返回可见工作区并代理 documents 上传请求
- 主工作台的 notes / tags 已删除 localStorage/mock 数据流，改为按 workspace hydrate 真实列表；Notes 支持新建、编辑、归档删除和 citation 来源跳转，Tags 支持创建、删除、文档/笔记绑定和筛选；threads 继续使用真实表、API、BFF 和 hydrate/send/归档链路
- 已支持真实后端注册/登录与 BFF httpOnly cookie session（不自动注册，要求显式配置 `AI_PDF_SESSION_SECRET`）
- 已补 FastAPI auth / workspace / documents / ingestion / provider / retrieval / chat / notes service 自动化测试；当前 API 43 tests、Worker 2 tests、Web 16 tests，真实回归验证了 Ollama 1024 维向量、83 个扫描文档 chunk ready、pgvector top-k、Responses API SSE、citation 快照、notes/tags workspace 隔离和真实 BFF 页面读写

## 7. 下一步

下一步：`进入部署、日志与观测，保持 notes/tags 与 citation 来源快照的回归覆盖`

具体建议从这些内容开始：

1. 部署、日志与观测
   - 整理 API、Worker、Postgres、pgvector、MinIO 的启动与健康检查
   - 统一任务失败、模型 provider、检索和保存链路的可检索日志

2. 保持知识沉淀链路稳定
   - 继续覆盖 note 来源快照、文档/笔记标签关系和 workspace 隔离
   - 后续再进入 hybrid search、rerank 等检索质量升级

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
