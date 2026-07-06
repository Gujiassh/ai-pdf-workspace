# 学习路线

## 1. 这份文档是什么

这份文档定义：

- 这个项目应该按什么顺序学
- 每个阶段应该掌握什么
- 每个阶段建议做什么练习

它不是产品范围文档，而是 `项目实战学习路线`。

## 2. 总体路线

建议按 9 个阶段学习并推进项目：

1. 项目定位与架构总览
2. 前端骨架与 BFF
3. 鉴权与 Workspace 隔离
4. 对象存储与上传链路
5. Worker 与任务状态机
6. PDF 解析与 chunk
7. Embedding、pgvector 与检索
8. Chat、citation、笔记与标签
9. 部署、日志与观测

## 3. 各阶段要求

## 阶段 1：项目定位与架构总览

### 这一阶段要做什么

- 理解产品目标
- 理解系统为什么拆成 `web / api / worker / data plane`
- 看懂主业务链路

### 这一阶段你应该掌握什么

- 什么是 Workspace 边界
- 什么是文档型 AI 产品
- 什么是同步请求链和异步任务链
- 什么是检索增强问答（RAG）主链

### 建议练习

- 试着口述一遍：用户上传 PDF 到得到回答，中间经过了哪些组件

## 阶段 2：前端骨架与 BFF

### 这一阶段要做什么

- 建立 Next.js 项目骨架
- 划分页面、layout、feature 模块
- 理解为什么浏览器不直接打 FastAPI

### 这一阶段你应该掌握什么

- App Router 的路由与 layout 思维
- React Query、Zustand、AI SDK 的分工
- BFF 的作用和边界

### 建议练习

- 自己画一版前端目录结构
- 说清楚哪些状态放 React Query，哪些状态放 Zustand

## 阶段 3：鉴权与 Workspace 隔离

### 这一阶段要做什么

- 接入登录
- 设计 Workspace membership
- 明确 `workspace_id` 如何贯穿全链路

### 这一阶段你应该掌握什么

- 会话鉴权和 API 鉴权的区别
- 为什么 `workspace_id` 是核心业务隔离键
- 为什么浏览器不能直接信任自己传来的 `workspace_id`

### 建议练习

- 自己解释：为什么 `workspace_memberships` 必须单独建表

## 阶段 4：对象存储与上传链路

### 这一阶段要做什么

- 设计 MinIO / S3 对象路径
- 打通上传 session、直传、finalize
- 理解为什么文件不进数据库

### 这一阶段你应该掌握什么

- 对象存储和数据库的职责边界
- 预签名上传的基本原理
- 上传链路里的同步步骤和异步步骤分别是什么

### 建议练习

- 自己写出一条上传链的时序步骤

## 阶段 5：Worker 与任务状态机

### 这一阶段要做什么

- 引入任务队列
- 设计 `ingestion_jobs`
- 明确 `documents.status` 和 `ingestion_jobs.status` 的区别

### 这一阶段你应该掌握什么

- 为什么长任务不能跑在请求线程里
- 为什么 Redis 队列不是真相源
- 为什么需要持久化任务状态

### 建议练习

- 自己回答：为什么不能只靠 `documents.status` 不建 `ingestion_jobs`

## 阶段 6：PDF 解析与 chunk

### 这一阶段要做什么

- 解析文本 PDF
- 建立 `document_pages`
- 建立 `document_chunks`

### 这一阶段你应该掌握什么

- `documents` / `pages` / `chunks` 三层为什么要拆开
- 什么是 chunk
- 为什么 chunk 是检索的最小知识单元

### 建议练习

- 自己解释：为什么不能只保留全文文本，不建 `document_chunks`

## 阶段 7：Embedding、pgvector 与检索

### 这一阶段要做什么

- 接入 embedding provider
- 把 chunk 写入 pgvector
- 设计 top-k 检索链路

### 这一阶段你应该掌握什么

- embedding 的作用是什么
- 为什么 V1 用 `Postgres + pgvector`
- 为什么 embedding 要和 chunk 元数据一起保存

### 建议练习

- 自己说明：为什么这里不先上独立向量数据库

## 阶段 8：Chat、citation、笔记与标签

### 这一阶段要做什么

- 打通 Chat
- 保存 threads/messages
- 保存 citations
- 实现 citation -> note
- 实现 tags

### 这一阶段你应该掌握什么

- 为什么 `message_citations` 要独立成表
- 为什么 citation 要保存快照
- 为什么 `notes` 和 `note_sources` 要拆开
- 为什么标签不直接做一个泛型绑定表

### 建议练习

- 自己解释：为什么历史回答在文档重建索引后仍然要可回放

## 阶段 9：部署、日志与观测

### 这一阶段要做什么

- 梳理本地 Docker Compose
- 设计日志字段
- 设计关键指标

### 这一阶段你应该掌握什么

- 为什么 Web/API/Worker 要独立部署
- 为什么 `request_id / workspace_id / document_id` 很关键
- 哪些指标最能说明系统是否健康

### 建议练习

- 自己列一版“文档上传失败时应该看哪些日志和状态”

## 4. 老师模式默认输出模板

后续在这个项目里的每一步，默认按下面结构讲：

1. 当前目标
2. 为什么做这一步
3. 你应该掌握什么
4. 现在动哪几个文件 / 模块
5. 怎么验证成功
6. 可选练习题

## 5. 当前最应该掌握的内容

如果从现在开始继续推进，最应该优先掌握的是：

1. `Workspace 边界`
2. `文档入库链`
3. `documents/pages/chunks` 的分层原因
4. `embedding + pgvector` 的最小工作方式
5. `message_citations` / `notes` / `tags` 这条知识沉淀链

## 6. 不建议现在分心的内容

当前不建议过早深入：

- 多模态 PDF
- OCR
- Agent 自动编排平台
- 多模型策略路由
- 复杂权限系统
- 过细的微服务拆分

原因：

这些会让主链路学习被稀释，而你现在最应该先把 `文本 PDF 主链` 做扎实。
