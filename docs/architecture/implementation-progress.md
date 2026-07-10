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

当前项目状态：`真实后端登录/注册与 workspace membership 已接通，Workspace 列表/详情/创建/归档已走真实链路，主工作台业务数据仍以 LocalStorage mock 沙盒驱动`

说明：

- 产品设计与架构、数据库设计、API 契约均已完成
- **前端交互原型已全部完成**（基于 LocalStorage 模拟沙盒，实现了多工作区 CRUD、PDF 浏览器、章节大纲导航树、划词提问浮窗、随手记、流式对话气泡、多语言与暗黑模式切换、自适应抽屉布局与微动效）
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
| 2 | 前端骨架与 BFF 接入 | 已完成 | 进行中 | 交互页面已完备；Workspace 列表/详情/创建/归档 BFF 已落地，但主工作台主体数据仍未切到真实 BFF 数据 |
| 3 | 鉴权与 Workspace 隔离 | 已完成 | 进行中 | 真实用户 Session、自定义 BFF session 与 workspace membership 已接通；正式 Auth.js 与页面级守卫仍未完成 |
| 4 | 对象存储与上传链路 | 已完成 (Mock) | 未开始 | 前端拖拽与状态显示就绪；MinIO 真实上传未开始 |
| 5 | Worker 与任务状态机 | 已完成 (Mock) | 进行中 | 前端解析中/失败重试状态显示就绪；Worker 实装未开始 |
| 6 | PDF 文本解析与切块 | 已完成 (Mock) | 未开始 | 页面数据渲染已打通；真实文本切块分段未对接 |
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

当前：`真实后端登录/注册、BFF session 与 workspace membership 真数据链第一段已接通，下一步进入文档上传链与主工作台真实数据替换`

收口结果：

- 架构和数据库口径已经统一
- API 契约和状态机已经补齐
- 文档已完成一次交叉评审
- `apps / packages / infra` 目录骨架已经建立
- `apps/web`、`apps/api`、`apps/worker` 基础工程已初始化
- Workspace 列表与详情的最小 API/BFF/页面链路已建立
- `users / workspaces / workspace_memberships` 最小真表、查询、创建、归档链路已落地
- API 侧已从启动时自动建表切换到显式数据库版本步骤；当前基线版本为 `b139cbaa9e15`
- BFF 现已从登录 cookie session 中透传 `x-user-id` 到 FastAPI，按当前用户 membership 返回可见工作区
- 当前主工作台里的 documents / notes / threads / tags 仍主要消费 `workspace-context` 的本地沙盒状态
- 已支持真实后端注册/登录与 BFF httpOnly cookie session（不自动注册，要求显式配置 `AI_PDF_SESSION_SECRET`）
- 已补 FastAPI auth 与 workspace 路由自动化测试，覆盖注册/重复注册/登录成功/登录失败，以及 workspace 列表可见性、创建、详情权限、归档与 owner 限制

## 7. 下一步

下一步：`接入文档上传链与主工作台真实数据替换`

具体建议从这些内容开始：

1. 接入文档主表与任务主表
   - `documents`
   - `ingestion_jobs`
   - 通过新的数据库版本步骤继续演进，不再回退到启动自动建表

2. 打通上传链
   - upload-session
   - finalize-upload
   - MinIO object key 落库

3. 补 API 与 Web 的工作区上下文边界
   - `x-workspace-id`
   - Workspace 级写操作校验

4. 然后进入主工作台替换
   - 首页统计
   - sidebar documents
   - 详情页 document 状态展示

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
