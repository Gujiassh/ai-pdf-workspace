# V1 任务拆分

## T1 Workspace 基础

- 定义 Workspace 数据模型
- 实现 Workspace CRUD API
- 实现 Workspace 列表与概览页
- 实现 Workspace Prompt 配置页

## T2 文档上传与状态机

- 接入 MinIO
- 实现 PDF 上传 API
- 创建 ingestion_jobs 与 documents 状态流转
- 实现前端任务状态展示

## T3 解析与索引

- 接入 PDF 文本解析
- 定义 chunk 策略
- 接入 embedding provider
- 写入 pgvector

## T4 检索与问答

- 实现 Workspace 范围检索
- 实现 citation 结构
- 接入 AI SDK 流式回答
- 实现 citation 点击跳页

## T5 笔记与标签

- 实现 notes CRUD
- 实现 tags CRUD
- 实现 citation 创建笔记
- 实现标签筛选

## T6 演示与验证

- 准备 demo PDF
- 跑通端到端流程
- 补齐错误场景
- 形成演示脚本
