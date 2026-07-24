# V1 计划书

## 状态

- 阶段：已完成
- 完成日期：2026-07-16
- 当前后续：V2-A 检索质量生产验收，见 [`../v2/retrieval-quality/spec.md`](../v2/retrieval-quality/spec.md)

本文件保留 V1 当时的范围与技术决策。Hybrid/RRF、部署收口和后续 Workspace 增强不回填为 V1 必做项。

## 1. V1 目标

V1 的目标是交付一个可演示、可使用、可扩展的 Citeframe 最小可用版本，完成以下闭环：

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

- 多模态视觉理解（当前支持 Worker RapidOCR fallback 和 OCR 可选层）
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
- 会话校验与 BFF 转发
- 上传交互
- Viewer 交互
- Chat 输入与流式展示

### 8.2 FastAPI 负责

- 上传会话创建、finalize 与对象存储签名上传编排
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

- 扫描版 PDF 当前通过 Worker 内 RapidOCR fallback 处理；识别质量和复杂版面仍需持续评估
- 仅使用 embedding 不带 rerank 时，复杂问题质量有限
- 没有 bbox 时，V1 引用只能做到页级跳转，不能保证精确高亮
- 多 provider embedding 需要在 schema 里提前预留维度与模型字段

## 11. 验收标准

- 能创建至少 3 个 Workspace，并验证数据隔离
- 能上传至少 1 份文本型 PDF，并能处理 1 份无文本层扫描 PDF，完成索引
- 能在 Workspace 内提出问题并获得带页码引用的回答
- 能点击引用并跳到对应 PDF 页面
- 能基于引用生成笔记并打标签

## 12. 下一阶段预留

V1 完成后，优先进入 V2：

- OCR 质量评估与复杂版面/表格能力升级
- rerank
- structured output 抽取模板
- embedding provider 抽象，接入开源本地模型


## 当前实现偏差记录（2026-07-15）

V1 已从原型计划进入真实数据链：前端 mock/localStorage 只保留无需持久化的 UI 状态，Workspace、Documents、Ingestion、Embedding、Chat、Notes、Tags 和 settings 均走真实 API/BFF/数据库。模型 provider 选择由服务端运行配置控制，设置页只读展示 provider/model，不提供无效的浏览器切换。

## 完成补充（2026-07-16）

- 工作区已调整为 Chat-first 主画布，PDF 作为按需原文核验与精读面板。
- 扫描 PDF 已支持 Worker RapidOCR fallback 与坐标化 OCR 可选层。
- Chat 已支持真实 delta 流、Markdown/GFM、citation 内联跳转和消息分支编辑。
- 文档失败支持重试，删除使用异步 cleanup 并支持失败重试。
- 笔记与标签已接真实 API，笔记编辑在原卡片内完成。
- V1 验收以 Dense 检索为稳定基线；Hybrid/RRF 属于 V2-A，不因实验代码存在而视为已上线。
