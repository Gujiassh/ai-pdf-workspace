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

当前项目状态：`真实后端登录/注册、workspace membership、documents、ingestion_jobs、pgvector embedding、workspace 内检索、Chat citation、notes/tags API 与 Web BFF 已接通；Worker 可消费 ingest/embed_chunks 任务，将文本 PDF 或 OCR fallback 结果写入页面、文本块和向量；Viewer 通过原始 PDF 文件流使用 PDF.js 保留页面图片与排版，并支持 canvas、原生文本层、扫描 PDF 坐标化 OCR 可选层、PDF annotation layer、缩放、翻页和目录跳转；Chat 支持真实 provider delta 流式输出、消息父节点分支和编辑旧问题后从当前节点继续。`

说明：

- 产品设计与架构、数据库设计、API 契约均已完成
- **前端交互外壳已全部完成**（页面布局、PDF 浏览器、章节大纲导航树、划词提问浮窗、随手记、流式对话气泡、多语言与暗黑模式切换、自适应抽屉布局与微动效都已具备；后续继续保留 UI 壳，但对应旧 mock 数据流会逐段替换并删除，不作为正式逻辑继续维护）
- `web / api / worker` 基础工程已初始化完成
- 真实后端认证接口与 BFF session cookie 已接通
- `users / workspaces / workspace_memberships` 最小真表链路已接通
- 首页与工作区详情页的 workspace 可见范围、创建、归档已切到真实 BFF/API
- API 侧已接入数据库结构版本步骤工具，当前数据库 head 为 `f7b8c9d0e1f2`
- 文档、向量检索、Chat thread/message/citation、notes/tags 已进入真实链路

## 3. 阶段进度

| 阶段 | 内容 | 状态 (前端原型) | 状态 (真实对接) | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 项目定位与架构总览 | 已完成 | 已完成 | 产品设计、系统架构、详细架构已落文档 |
| 2 | 前端骨架与 BFF 接入 | 已完成 | 已完成 | Workspace、Documents、Chat、Notes、Tags、settings 的真实 BFF 已落地；feature hooks 负责数据域，Provider 只做组合与视图状态暴露 |
| 3 | 鉴权与 Workspace 隔离 | 已完成 | 已完成 | BFF session、membership 校验和 API 内部 token 边界已接通；业务 API 不再只信任可伪造的 `x-user-id` |
| 4 | 对象存储与上传链路 | 已完成 | 已完成 | BFF/API 使用请求流和 spool 临时文件上传，保留 100 MB 限制并校验 upload-session 字节数；预签名直传仍是后续优化项 |
| 5 | Worker 与任务状态机 | 已完成 | 已完成 | Worker 已消费 `ingest` / `embed_chunks`，具备 lease 回收、结构化日志、SIGTERM/SIGINT 优雅退出和 5 次有限退避；异步删除任务仍待接入 |
| 6 | PDF 原始阅读、文本解析与切块 | 已完成 | 已完成 | `document_pages` 与 `document_chunks` 已落真实表；文本 PDF 和扫描 PDF 的 OCR 结果都按页、按块持久化，扫描页额外保存归一化 OCR block 坐标并叠加透明可选层，原始文件通过文件流供 PDF.js 阅读，Viewer 不再用提取文本替代源页面 |
| 7 | Embedding 与检索 | 已完成 | 已完成 | `vector(1024)`、provider 元数据、HNSW 索引、Worker embedding、workspace 隔离的 cosine 检索已接通；当前运行回归使用 Ollama Qwen3 embedding |
| 8 | Chat、citation、笔记与标签 | 已完成 | 已完成 | Chat thread/message/citation、真实 Responses API delta 流、消息父节点分支、编辑旧问题继续、notes、note_sources、tags、document_tags、note_tags 真表、API、BFF 和 citation -> note 已接通 |
| 9 | 部署、日志与观测 | 未开始 | 进行中 | API liveness/readiness、Worker grep-friendly 日志、CI/API-Worker-Web 门禁和可选 Playwright smoke 已落地；生产部署接线仍待补齐 |

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

当前：`原始 PDF 阅读、OCR fallback 与坐标化可选层、切块、embedding、pgvector 检索、真实 Chat delta 流、消息分支编辑、Workspace settings、Web BFF、Notes/Tags CRUD 与标签关系已接通；当前进入运行可靠性和部署观测收口。`

收口结果：

- 架构和数据库口径已经统一
- API 契约和状态机已经补齐
- 文档已完成一次交叉评审
- `apps / packages / infra` 目录骨架已经建立
- `apps/web`、`apps/api`、`apps/worker` 基础工程已初始化
- Workspace 列表与详情的最小 API/BFF/页面链路已建立
- `users / workspaces / workspace_memberships` 最小真表、查询、创建、归档链路已落地
- API 侧已从启动时自动建表切换到显式数据库版本步骤；当前 head 版本为 `f7b8c9d0e1f2`
- `documents / ingestion_jobs` 真表、迁移、列表、upload-session、二进制上传、finalize-upload、job 查询与删除链路已落地
- `document_pages / document_chunks` 真表和迁移已落地；Worker 会领取 queued ingest job、回收超时任务，先提取文本层，必要时用 RapidOCR + ONNX Runtime 渲染页面并识别，再按页切块、批量调用 embedding provider、写入向量并推进 `chunked -> embedding -> ready`，同时支持 `embed_chunks` 回填已有 chunk。
- 原始 PDF 文件流已接通 API/BFF；`PdfViewer` 使用 PDF.js canvas 作为主页面、text layer 支持原生 PDF 文本选取、扫描 PDF 使用透明 OCR block 层支持划词、annotation layer 支持 PDF 内置链接/批注，OCR 文本不覆盖源页面视觉内容
- 2026-07-14 回归：真实 84 页扫描 PDF 的 API/BFF 文件流返回 `200 application/pdf`，浏览器确认 canvas 页面非空、84 页翻页、110% 缩放、目录跳页均可用；桌面端无横向溢出，移动端默认收起两侧面板且打开目录后仍无横向溢出。扫描页额外使用透明 OCR 文本层支持选取，不重排或覆盖源 PDF 的图片与排版
- BFF 现已从登录 cookie session 中透传 `x-user-id` 和 `x-ai-pdf-internal-token` 到 FastAPI，按当前用户 membership 返回可见工作区并代理 documents 上传请求；FastAPI 不再只信任可伪造的用户 header
- 主工作台的 Workspace、Documents、Chat、Notes、Tags 和 settings 已删除 localStorage/mock 数据流，改为按 workspace hydrate 真实列表；Notes 支持新建、编辑、归档删除和 citation 来源跳转，Tags 支持创建、删除、文档/笔记绑定和筛选；threads 继续使用真实表、API、BFF 和 hydrate/send/归档链路
- 已支持真实后端注册/登录与 BFF httpOnly cookie session（不自动注册，要求显式配置 `AI_PDF_SESSION_SECRET`）
- 已补 FastAPI auth / workspace / documents / ingestion / provider / retrieval / chat / notes / health service 自动化测试；当前 API 56 tests、Worker 17 tests、Web 43 unit tests，并增加可选 Playwright smoke，真实回归验证了 Ollama 1024 维向量、扫描 PDF 84 页 OCR block、83 个扫描文档 chunk ready、pgvector top-k、Responses API 真实 delta SSE、消息分支编辑、citation 快照、notes/tags workspace 隔离、历史 Chat 会话切换保留和真实 BFF 页面读写
- 2026-07-15 回归：修复旧聊天迁移按 UUID 排序导致的同时间问答倒序，新增 `e6a7b8c9d0f1` 重建历史父节点链；真实工作区确认问题始终显示在对应答案前，编辑旧问题后只显示新活动分支，旧分支仍保留。
- 2026-07-15 回归：真实扫描页存在 23 个 OCR 可选块；选区文字通过“问 AI”进入当前 thread，Responses API 流先显示加载态再持续增量渲染，完成后 citations 和分支状态可刷新恢复。
- 2026-07-15 回归：修复历史 Chat 会话切换时的状态覆盖。列表 hydrate 继续按 workspace 替换服务端线程列表，单线程详情 hydrate 改为只按 `(workspaceId, threadId)` 精确替换缓存项，保留其他会话消息；补齐 A/B 切换、切回和跨 workspace 同 ID 隔离测试。
- 2026-07-15 回归：Chat 助手回答改用 `react-markdown + remark-gfm` 渲染标题、强调、列表、引用块、代码、表格和安全外链；正文中的已知 `[n]` 按服务端 0-based `citationIndex` 转为内联跳转按钮，未知编号、代码块和已有 Markdown 链接保持原样。引用跳转会打开对应文档、切到快照页码、平滑回到阅读区并短暂提示目标页面；工作区主题统一由 ThemeProvider、CSS 变量和 light/dark surface 样式控制，创建工作区弹窗也跟随主题。
- 2026-07-15 回归：修复上传处理中 PDF 阅读区反复刷新。文档状态轮询现在对未变化的文档复用对象和数组引用，无状态变化时不触发 Provider 更新；Viewer OCR 页面请求只依赖 workspace、document ID 和页码，不再依赖轮询生成的新文档对象。临时上传观测确认同一页请求不再持续重复，canvas 尺寸保持稳定。
- 2026-07-15 回归：修复 Chat 流式输出期间滚动条强制回到底部的问题。消息列表仅在用户已经停留底部时自动跟随新 token；用户主动上滑后暂停自动滚动，切换会话时重新定位到底部，并改为直接设置 `scrollTop`，避免每个 delta 排队平滑动画。
- 2026-07-15 回归：修复刷新后默认首个 Chat 会话只显示标题、不显示历史消息的问题。原因是线程列表更新 `threadCount` 后，工作区详情页重复调用 `switchWorkspace`，把刚选中的 `activeThreadId` 清空；现在重复选择同一 workspace 不再重置 workspace 视图状态，并补充选择状态回归测试。

## 7. 下一步

下一步：`接入生产部署探针与日志采集，保持 settings、Chat 分支、OCR 选区和 citation 来源快照回归覆盖`

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
