# 实施路线

## 1. 这份文档是什么

这份文档定义项目的推荐实施顺序，用来指导：

- 先做什么
- 后做什么
- 哪些依赖必须先打通

它不是产品范围文档，也不是教学文档，而是 `实现阶段路线图`。

## 2. 总体路线

建议按 9 个阶段推进：

1. 项目定位与架构总览
2. 前端骨架与 BFF
3. 鉴权与 Workspace 隔离
4. 对象存储与上传链路
5. Worker 与任务状态机
6. PDF 解析与 chunk
7. Embedding、pgvector 与检索
8. Chat、citation、笔记与标签
9. 部署、日志与观测

## 3. 各阶段目标

### 阶段 1：项目定位与架构总览

目标：

- 明确产品范围
- 明确系统分层
- 明确主业务链路

完成标准：

- 产品设计、系统架构、详细架构文档齐备

### 阶段 2：前端骨架与 BFF

目标：

- 建立 Next.js 项目骨架
- 划分页面、layout、feature 模块
- 收口浏览器侧入口到 BFF

完成标准：

- Web 项目结构清晰
- BFF 入口位置明确

### 阶段 3：鉴权与 Workspace 隔离

目标：

- 接入登录
- 建立 membership 关系
- 明确 `workspace_id` 如何贯穿全链路

完成标准：

- 用户访问和 Workspace 授权路径清楚

### 阶段 4：对象存储与上传链路

目标：

- 设计 MinIO / S3 对象路径
- 打通上传 session、直传、finalize

完成标准：

- 一份 PDF 能被上传并生成文档记录

### 阶段 5：Worker 与任务状态机

目标：

- 引入任务队列
- 设计 `ingestion_jobs`
- 明确 `documents.status` 与任务状态关系

完成标准：

- 上传后可以看到稳定的任务状态变化

### 阶段 6：PDF 解析与 chunk

目标：

- 解析文本 PDF
- 建立 `document_pages`
- 建立 `document_chunks`

完成标准：

- 文档可被切成稳定的检索单元

### 阶段 7：Embedding、pgvector 与检索

目标：

- 接入 embedding provider
- 把 chunk 写入 pgvector
- 建立 top-k 检索链路

完成标准：

- 用户问题可以召回相关 chunk

### 阶段 8：Chat、citation、笔记与标签

目标：

- 打通 Chat
- 保存 threads/messages
- 保存 citations
- 实现 citation -> note
- 实现 tags

完成标准：

- 用户可以问答、查看引用、保存笔记、打标签

### 阶段 9：部署、日志与观测

目标：

- 梳理本地 Docker Compose
- 设计日志字段
- 设计关键指标

完成标准：

- 本地环境可复现
- 关键链路可诊断

## 4. 当前优先级

如果从当前状态继续推进，最优先的工作是：

1. 项目骨架
2. 鉴权与 Workspace
3. 文档上传链
4. Worker 与任务队列
5. 检索与 Chat 主链

## 5. 当前不进入主线的内容

当前不进入主线：

- 多模态 PDF
- OCR
- Agent 自动编排平台
- 多模型策略路由
- 复杂权限系统
- 过细的微服务拆分

原因：

这些会稀释当前文本 PDF 主链的实现节奏。
