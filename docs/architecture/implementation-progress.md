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

当前项目状态：`V1、Chat-first 工作台、V2-A Hybrid/RRF 和阶段 9 可复现单机生产基线均已完成。当前进入用户任务验证与 Evidence 合同设计；现有 PDF/Citation/NoteSource 持久化和保存语义保持冻结，未批准前不实施 Asset/typed locator 迁移。`

说明：

- 产品设计与架构、数据库设计、API 契约均已完成
- **前端交互外壳已全部完成**（页面布局、PDF 浏览器、章节大纲导航树、划词提问浮窗、随手记、流式对话气泡、多语言与暗黑模式切换、自适应抽屉布局与微动效都已具备；后续继续保留 UI 壳，但对应旧 mock 数据流会逐段替换并删除，不作为正式逻辑继续维护）
- `web / api / worker` 基础工程已初始化完成
- 真实后端认证接口与 BFF session cookie 已接通
- `users / workspaces / workspace_memberships` 最小真表链路已接通
- 首页与工作区详情页的 workspace 可见范围、创建、归档已切到真实 BFF/API
- API 侧已接入数据库结构版本步骤工具，当前数据库 head 为 `a8c9d0e1f2a3`
- 文档、向量检索、Chat thread/message/citation、notes/tags 已进入真实链路

## 3. 阶段进度

| 阶段 | 内容 | 状态 (前端原型) | 状态 (真实对接) | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 项目定位与架构总览 | 已完成 | 已完成 | 产品设计、系统架构、详细架构已落文档 |
| 2 | 前端骨架与 BFF 接入 | 已完成 | 已完成 | Workspace、Documents、Chat、Notes、Tags、settings 的真实 BFF 已落地；feature hooks 负责数据域，Provider 只做组合与视图状态暴露 |
| 3 | 鉴权与 Workspace 隔离 | 已完成 | 已完成 | BFF session、membership 校验和 API 内部 token 边界已接通；业务 API 不再只信任可伪造的 `x-user-id` |
| 4 | 对象存储与上传链路 | 已完成 | 已完成 | BFF/API 使用请求流和 spool 临时文件上传，保留 100 MB 限制并校验 upload-session 字节数；预签名直传仍是后续优化项 |
| 5 | Worker 与任务状态机 | 已完成 | 已完成 | Worker 已消费 `ingest` / `embed_chunks` / `delete_cleanup`，具备 lease 回收、结构化日志、SIGTERM/SIGINT 优雅退出和 5 次有限退避；异步删除失败可由 owner 重新入队 |
| 6 | PDF 原始阅读、文本解析与切块 | 已完成 | 已完成 | `document_pages` 与 `document_chunks` 已落真实表；文本 PDF 和扫描 PDF 的 OCR 结果都按页、按块持久化，扫描页额外保存归一化 OCR block 坐标并叠加透明可选层，原始文件通过文件流供 PDF.js 阅读，Viewer 不再用提取文本替代源页面 |
| 7 | Embedding 与检索 | 已完成 | 已完成 | `vector(1024)`、HNSW、PostgreSQL FTS/pg_trgm、页级 RRF 和 Dense/Hybrid 显式策略已接通；40 条生产评测通过后默认使用 Hybrid |
| 8 | Chat、citation、笔记与标签 | 已完成 | 已完成 | Chat thread/message/citation、真实 Responses API delta 流、消息父节点分支、编辑旧问题继续、notes、note_sources、tags、document_tags、note_tags 真表、API、BFF 和 citation -> note 已接通 |
| 9 | 部署、日志与观测 | 已完成 | 已完成 | 锁定镜像、迁移 gate、Prometheus、Worker 私网指标、同批备份销卷恢复、Caddy 安全入口和全业务 smoke 已通过 |

## 4. 已完成的设计文档

- `docs/ssot/product-design.md`
- `docs/ssot/system-architecture.md`
- `docs/architecture/detailed-system-architecture.md`
- `docs/architecture/feature-map.md`
- `docs/architecture/database-design.md`
- `docs/architecture/api-contracts.md`
- `docs/architecture/job-state-machine.md`

## 5. 当前建议实施顺序

V1、V2-A 与阶段 9 已完成。后续按以下顺序推进：

1. 第一用户真实复杂 PDF 任务验证与产品指标基线
2. Evidence 合同 RFC/ADR 和持久化/API 迁移影响设计（只设计，批准前不实施）
3. 索引重建、解析版本和黄金集基础设施
4. 多模态 PDF：布局/OCR bbox、表格、图表/图片和区域 citation
5. 独立图片、音频、视频或 Omnilabel 必须分别通过 discovery 门禁

## 6. 当前正在做什么

当前：`阶段 9 已完成；第一用户复杂 PDF 任务验证协议、Evidence 合同 Draft RFC 和设计阶段 spec/plan/tasks 已建立。下一步需要真实参与者/问题和 PDF fixture；在合同获批前不实施迁移。`

收口结果：

- 架构和数据库口径已经统一
- API 契约和状态机已经补齐
- 文档已完成一次交叉评审
- `apps / packages / infra` 目录骨架已经建立
- `apps/web`、`apps/api`、`apps/worker` 基础工程已初始化
- Workspace 列表与详情的最小 API/BFF/页面链路已建立
- `users / workspaces / workspace_memberships` 最小真表、查询、创建、归档链路已落地
- API 侧已从启动时自动建表切换到显式数据库版本步骤；当前 head 版本为 `a8c9d0e1f2a3`
- `documents / ingestion_jobs` 真表、迁移、列表、upload-session、二进制上传、finalize-upload、job 查询与删除链路已落地
- `document_pages / document_chunks` 真表和迁移已落地；Worker 会领取 queued ingest job、回收超时任务，先提取文本层，必要时用 RapidOCR + ONNX Runtime 渲染页面并识别，再按页切块、批量调用 embedding provider、写入向量并推进 `chunked -> embedding -> ready`，同时支持 `embed_chunks` 回填已有 chunk。
- 原始 PDF 文件流已接通 API/BFF；`PdfViewer` 使用 PDF.js canvas 作为主页面、text layer 支持原生 PDF 文本选取、扫描 PDF 使用透明 OCR block 层支持划词、annotation layer 支持 PDF 内置链接/批注，OCR 文本不覆盖源页面视觉内容
- 2026-07-14 回归：真实 84 页扫描 PDF 的 API/BFF 文件流返回 `200 application/pdf`，浏览器确认 canvas 页面非空、84 页翻页、110% 缩放、目录跳页均可用；桌面端无横向溢出，移动端默认收起两侧面板且打开目录后仍无横向溢出。扫描页额外使用透明 OCR 文本层支持选取，不重排或覆盖源 PDF 的图片与排版
- BFF 现已从登录 cookie session 中透传 `x-user-id` 和 `x-ai-pdf-internal-token` 到 FastAPI，按当前用户 membership 返回可见工作区并代理 documents 上传请求；FastAPI 不再只信任可伪造的用户 header
- 主工作台的 Workspace、Documents、Chat、Notes、Tags 和 settings 已删除 localStorage/mock 数据流，改为按 workspace hydrate 真实列表；Notes 支持新建、编辑、归档删除和 citation 来源跳转，Tags 支持创建、删除、文档/笔记绑定和筛选；threads 继续使用真实表、API、BFF 和 hydrate/send/归档链路
- 已支持真实后端注册/登录与 BFF httpOnly cookie session（不自动注册，要求显式配置 `AI_PDF_SESSION_SECRET`）
- 已补 FastAPI auth / workspace / documents / ingestion / provider / retrieval / chat / notes / health service 自动化测试；阶段 9 最终全量门禁为 API 82 tests、Worker 18 tests、Web 48 unit tests，并增加可选 Playwright smoke，真实回归验证了 Ollama 1024 维向量、扫描 PDF 84 页 OCR block、83 个扫描文档 chunk ready、Hybrid/RRF、Responses API 真实 delta SSE、消息分支编辑、citation 快照、notes/tags workspace 隔离、历史 Chat 会话切换保留和真实 BFF 页面读写
- 2026-07-15 回归：修复旧聊天迁移按 UUID 排序导致的同时间问答倒序，新增 `e6a7b8c9d0f1` 重建历史父节点链；真实工作区确认问题始终显示在对应答案前，编辑旧问题后只显示新活动分支，旧分支仍保留。
- 2026-07-15 回归：真实扫描页存在 23 个 OCR 可选块；选区文字通过“问 AI”进入当前 thread，Responses API 流先显示加载态再持续增量渲染，完成后 citations 和分支状态可刷新恢复。
- 2026-07-15 回归：修复历史 Chat 会话切换时的状态覆盖。列表 hydrate 继续按 workspace 替换服务端线程列表，单线程详情 hydrate 改为只按 `(workspaceId, threadId)` 精确替换缓存项，保留其他会话消息；补齐 A/B 切换、切回和跨 workspace 同 ID 隔离测试。
- 2026-07-15 回归：Chat 助手回答改用 `react-markdown + remark-gfm` 渲染标题、强调、列表、引用块、代码、表格和安全外链；正文中的已知 `[n]` 按服务端 0-based `citationIndex` 转为内联跳转按钮，未知编号、代码块和已有 Markdown 链接保持原样。引用跳转会打开对应文档、切到快照页码、平滑回到阅读区并短暂提示目标页面；工作区主题统一由 ThemeProvider、CSS 变量和 light/dark surface 样式控制，创建工作区弹窗也跟随主题。
- 2026-07-15 回归：修复上传处理中 PDF 阅读区反复刷新。文档状态轮询现在对未变化的文档复用对象和数组引用，无状态变化时不触发 Provider 更新；Viewer OCR 页面请求只依赖 workspace、document ID 和页码，不再依赖轮询生成的新文档对象。临时上传观测确认同一页请求不再持续重复，canvas 尺寸保持稳定。
- 2026-07-15 回归：修复 Chat 流式输出期间滚动条强制回到底部的问题。消息列表仅在用户已经停留底部时自动跟随新 token；用户主动上滑后暂停自动滚动，切换会话时重新定位到底部，并改为直接设置 `scrollTop`，避免每个 delta 排队平滑动画。
- 2026-07-15 回归：修复刷新后默认首个 Chat 会话只显示标题、不显示历史消息的问题。原因是线程列表更新 `threadCount` 后，工作区详情页重复调用 `switchWorkspace`，把刚选中的 `activeThreadId` 清空；现在重复选择同一 workspace 不再重置 workspace 视图状态，并补充选择状态回归测试。
- 2026-07-15 回归：补齐失败文档重试入库链路。失败文档可从侧边栏直接创建新的 `ingest` job，保留失败 job 历史并递增 `attemptCount`，清理旧错误后重新进入 `uploaded -> parsing -> chunking -> embedding -> ready`；API、BFF、Web Hook 和入口均已接通。
- 2026-07-15 回归：将文档删除从同步清理改为 `delete_cleanup` 异步任务。DELETE 先返回 `deleting + job`，Worker 成功后再删除对象、页面、chunk 并写入 `deleted_at`；清理失败保留错误并支持 `delete-retry` 重新入队，前端继续轮询文档状态。
- 2026-07-15 回归：建立 40 条人工标注检索评测集与 dense baseline CLI；当前 Ollama `qwen3-embedding:0.6b`、top-k=6 的 Recall@6=0.7708、MRR=0.7229、nDCG@6=0.6935、候选 citation 命中=0.8500，下一步在同一数据集上对比 hybrid/RRF 与 rerank。
- 2026-07-15 回归：增加离线 lexical/RRF 对比工具；同一 40 条数据集上 RRF 的 Recall@6=0.8167、MRR=0.7667、nDCG@6=0.7426、候选 citation 命中=0.9000，结果支持继续做 hybrid/RRF 生产实验，但尚未切换 Chat 默认检索。
- 2026-07-16 体验重构：工作区从固定 `PDF 主视图 + 窄 Chat 侧栏` 调整为 `Chat 主画布 + 按需 PDF 证据面板`；侧栏文档、citation 与笔记来源统一打开证据面板，支持全宽阅读模式和移动端覆盖层，Notes/Settings 改为主画布同级视图。后端契约、citation 定位、消息分支、PDF/OCR 渲染和保存语义保持不变。
- 2026-07-16 交互修正：Chat Markdown 使用标准 soft-break AST 插件，修复选择题题干与 A 选项粘连；笔记编辑改为原卡片内联替换；桌面 PDF 证据面板增加拖拽/键盘调宽和双击复位；PDF 工具栏增加指定页码输入并做范围收口。
- 2026-07-16 视觉修正：笔记编辑态改用固定主题表面，不再继承浏览态整卡 hover；普通卡片和编辑操作按钮补齐明暗主题 hover 前景/背景组合，避免低对比文字。
- 2026-07-16 检索质量验收：PostgreSQL 增加 lexical FTS GIN 与 trigram GiST 索引，拉丁术语使用全文检索、纯中文使用 Workspace 内 KNN 候选，Dense/lexical 按文档页执行稳定 RRF；同轮 40 条生产评测中 Hybrid Recall@6=0.8417、MRR=0.7354、nDCG@6=0.7394、citationHit@6=0.9250，端到端 p95=109.9ms，对比 Dense 增加 24.3ms；4 并发 40 条无错误和结果漂移。全部门禁通过，默认策略切换 Hybrid，保留显式 Dense 配置；API 同时启用 `ai_pdf_api` INFO 平面日志，使检索策略与阶段耗时在运行态可直接检索。收口验证为 API 76 passed、Alembic 单一 head 且模型无漂移、compileall 与 diff check 通过。
- 2026-07-16 阶段 9 收口：API/Worker/Web 镜像均为非 root，migration 从空库升级到 `a8c9d0e1f2a3`；API 暴露 HTTP/provider/retrieval/storage/job Prometheus 指标，Worker 私网 9101 暴露 job/active 指标。真实业务触发 Hybrid success、Ollama embedding、OpenAI stream success/error、storage 和 Worker claimed/handled，指标按 route template 与有界 outcome 记录。
- 2026-07-16 恢复演练：隔离 Compose project 中注册用户、创建 Workspace、上传两页 PDF、Worker ready、Chat 返回第 2 页 citation、保存 note；同批备份生成 PostgreSQL custom dump、MinIO mirror 和闭集 SHA-256 manifest。最终脚本在数据库用户对象、Redis key 和 MinIO bucket 均为空后执行恢复，MinIO list/find 失败显式中断；销毁全部容器/网络/卷后 55 秒完成恢复，用户/Workspace/ready 文档/citation/note/note_source 和 Alembic head 完整，恢复对象 SHA-256 与源 PDF 一致，七个长期服务达到 healthy/running 后才报告完成。
- 2026-07-16 安全与业务验收：Caddy 成为唯一公开入口，本地显式 HTTP smoke 返回 200、HSTS、nosniff、frame deny 和 referrer policy；Web/API/Worker/Postgres/Redis/MinIO API 未发布宿主端口。恢复后异步删除返回 202，delete job succeeded，文档列表和 MinIO 对象均消失。
- 2026-07-16 战略调整：保留 Chat-first 主画布和按需 PDF 证据层；第一用户收敛为基于论文、技术规范和评测报告做判断的 AI/软件工程师与技术研究者。下一阶段只设计并验证多模态 PDF Evidence；Asset/Representation/ContentUnit/EvidenceLocator 是目标域，不是已实施合同。Omnilabel 作为独立产品赌注，不作为普通格式扩展。
- 2026-07-16 Evidence 设计启动：建立第一用户任务验证协议，按事实、比较、方法、表格、图表和无答案任务记录支持结论完成率、核验后耗时和区域定位缺口；建立 `pdf_page/pdf_region` Draft RFC，明确当前 Citation/NoteSource 冻结合同、CropBox/旋转/多区域坐标提案、持久化选项和 6 项待批准决策。当前没有数据库、API、SSE 或保存语义变更。
- 2026-07-16 Evidence 设计夹具：新增不含机密数据的 8 页合成 PDF，覆盖 0/90/180/270 度旋转、CropBox、表格单元格、图表同页多区域和无文本层扫描页；生成器和 manifest 反向验证通过。当前 Citation/NoteSource fixture 严格通过现行 Pydantic schema，候选 `.draft.json` 只用于 payload 对照且明确未获批准。

## 7. 下一步

下一步：`招募至少 5 名第一用户，以至少 20 个真实任务执行验证；依据结果评审 Evidence RFC，并继续完成迁移/回滚/历史回放影响设计。在明确批准持久化/Citation API 迁移前，不实施 Asset/typed locator。`

具体建议从这些内容开始：

1. 以至少 5 名第一用户完成至少 20 个真实研究任务，建立任务耗时、核验率、支持率、转笔记率和周回访基线；无参与者的内部问题集只能做质量预评测。
2. 使用已建立的合成 PDF 与旧/新 payload fixture 评审 `pdf_page / pdf_region` 坐标和回放语义，并补迁移/回滚影响设计。
3. 在合同批准后再建立 `specs/v3/multimodal-pdf/`，从布局/OCR bbox 和区域高亮的最小纵向切片开始。

## 8. 当前不进入主线

当前不进入主线：

- 未批准合同前的多模态 PDF 持久化实现
- 独立图片、音频、视频的一次性全模态接入
- 把 Omnilabel 标注/预测/数据集分析当作文件格式扩展
- 复杂 Agent 编排平台
- 多模型策略路由
- 复杂权限系统

## 9. 更新方式

后续每推进一个大步骤，都更新这份文档的：

- `当前总状态`
- `阶段进度`
- `当前正在做什么`
- `下一步`
