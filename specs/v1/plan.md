# V1 计划书

## 1. V1 目标

V1 的目标是交付一个可演示、可使用、可扩展的 AI PDF Workspace 最小可用版本，完成以下闭环：

`创建 Workspace -> 上传 PDF -> 解析建索引 -> 浏览 PDF -> 提问 -> 获得引用 -> 生成笔记 -> 管理工作区内容`

## 2. 范围定义

### 2.1 In Scope

- Workspace CRUD
- Workspace 独立 Prompt 配置
- Workspace 独立聊天历史
- Workspace 独立标签
- Workspace 独立笔记
- PDF 上传到本地 S3 兼容对象存储
- PDF 解析与 chunk 生成
- embedding 与 pgvector 检索
- Workspace 内问答
- 回答引用回跳页码

### 2.2 Out of Scope

- OCR fallback
- rerank
- hybrid search
- 多人协作
- 权限与分享
- 自动摘要工作流
- 跨 Workspace 检索

## 3. 用户故事

### 3.1 Workspace 建立

作为用户，我希望可以创建多个 Workspace，这样我能按主题隔离我的知识库与对话上下文。

### 3.2 文档入库

作为用户，我希望上传 PDF 后系统能自动完成解析与索引，这样我不需要手动管理知识库。

### 3.3 检索与问答

作为用户，我希望针对当前 Workspace 提问，并得到带引用的回答，这样我能信任答案来源。

### 3.4 笔记沉淀

作为用户，我希望把引用结果快速保存成笔记，这样我能积累自己的结论与摘录。

## 4. 功能需求

### 4.1 Workspace 模块

Must:

- 创建、编辑、删除或归档 Workspace
- 切换当前 Workspace
- 展示 Workspace 概览信息

### 4.2 Prompt 模块

Must:

- 为每个 Workspace 保存独立系统 Prompt
- 问答时加载对应 Workspace Prompt

### 4.3 文档模块

Must:

- 上传 PDF
- 查看文档列表
- 查看文档状态
- 删除文档

### 4.4 解析与索引模块

Must:

- 解析文本 PDF
- 按页和段落生成 chunk
- 生成 embedding
- 存储到 pgvector

### 4.5 问答模块

Must:

- 在当前 Workspace 范围内检索
- 用检索片段生成回答
- 返回 citations 数组

### 4.6 浏览模块

Must:

- 预览 PDF
- 根据 citation 跳转页码

### 4.7 笔记与标签模块

Must:

- 创建自由笔记
- 从 citation 创建笔记
- 为文档和笔记打标签

## 5. 体验要求

- 上传后能清晰看到文档处理进度
- 文档 ready 前不能进入可用问答状态
- 回答中的引用必须有来源文档和页码
- 笔记创建流程应不超过 2 次点击
- Workspace 切换后所有数据即时切换，不允许串库

## 6. 技术方案

### 6.1 前端

- Next.js: 页面与路由
- Tailwind + shadcn/ui: UI 基础组件
- React Query: 数据获取、缓存、轮询任务状态
- AI SDK: 流式聊天展示

### 6.2 后端

- FastAPI: 文档处理、索引、检索、问答编排
- OpenAI Responses API: 问答与结构化生成
- OpenAI Embeddings: V1 默认 embedding provider

### 6.3 存储

- Postgres: 业务数据
- pgvector: chunk 向量检索
- MinIO: 原始 PDF 与产物存储

## 7. 建议数据表

- workspaces
- workspace_prompt_versions
- documents
- document_pages
- document_chunks
- chat_threads
- chat_messages
- message_citations
- notes
- tags
- note_sources
- document_tags
- note_tags
- ingestion_jobs

## 8. API 边界

### 8.1 Next.js 负责

- 页面渲染
- 上传交互
- Viewer 交互
- Chat 输入与流式展示

### 8.2 FastAPI 负责

- 文件接收或签名上传接收
- PDF 解析任务
- 索引任务
- 检索
- 回答生成
- citation 结构返回

## 9. 交付拆分

### 阶段 1：Workspace 基础

- 数据库建表
- Workspace CRUD
- Prompt 配置基础页

### 阶段 2：文档入库

- 上传 PDF
- MinIO 存储
- 文档状态机
- 解析/索引后台任务

### 阶段 3：检索问答

- chunk 检索
- Chat UI
- citation 返回与跳页

### 阶段 4：笔记与标签

- Notes 列表与创建
- citation -> note
- 标签管理

### 阶段 5：联调与演示打磨

- 主流程 smoke test
- 错误状态补齐
- 演示路径优化

## 10. 风险与约束

- 扫描版 PDF 在 V1 可能无法稳定处理
- 仅使用 embedding 不带 rerank 时，复杂问题质量有限
- 没有 bbox 时，V1 引用只能做到页级跳转，不能保证精确高亮
- 多 provider embedding 需要在 schema 里提前预留维度与模型字段

## 11. 验收标准

- 能创建至少 3 个 Workspace，并验证数据隔离
- 能上传至少 1 份文本型 PDF 并完成索引
- 能在 Workspace 内提出问题并获得带页码引用的回答
- 能点击引用并跳到对应 PDF 页面
- 能基于引用生成笔记并打标签

## 12. 下一阶段预留

V1 完成后，优先进入 V2：

- OCR fallback
- rerank
- structured output 抽取模板
- embedding provider 抽象，接入开源本地模型
