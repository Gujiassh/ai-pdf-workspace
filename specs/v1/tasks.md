# V1 任务拆分 (前端全闭环已完成)

## T1 Workspace 基础

- [x] 定义 Workspace 数据模型
- [x] 实现 Workspace CRUD API（真实 API/BFF/数据库链路）
- [x] 实现 Workspace 列表与概览页 (100% 宽度极简 SaaS 行列表)
- [x] 实现 Workspace Prompt 配置页 (独立系统 Prompt 版本隔离)

## T2 文档上传与状态机

- [x] 接入 MinIO 对象存储与真实上传状态机
- [x] 实现 PDF 上传交互与 API
- [x] 创建 ingestion_jobs 与 documents 状态流转 (上传/解析中/就绪状态机)
- [x] 实现前端任务状态与进度条展示

## T3 解析与索引

- [x] 接入 Worker PDF 文本解析与 OCR fallback
- [x] 定义 chunk 切片与提取策略
- [x] 接入真实 embedding provider 与任务配置快照
- [x] 写入 pgvector 并按 Workspace 隔离检索

## T4 检索与问答

- [x] 实现 Workspace 范围检索 (单库与全局联合检索)
- [x] 实现 citation 物理引用结构
- [x] 接入真实 Responses API delta 流式回复
- [x] 实现 citation 点击物理页码回跳与闪烁高亮

## T5 笔记与标签

- [x] 实现 notes CRUD (自由笔记/关联引文随手记)
- [x] 实现 tags CRUD 与随机配色生成
- [x] 实现从 citation 行内一键唤起编辑器创建笔记
- [x] 实现多标签复合过滤与快速检索筛选

## T6 演示与验证

- [x] 准备 demo PDF (多份预置论文数据)
- [x] 跑通端到端完整闭环 (创建-上传-检索-引用-沉淀笔记)
- [x] 删除正式数据链路中的 LocalStorage/mock 状态流
- [x] 整合移动端与平板自适应毛玻璃抽屉交互
- [x] 形成演示设计蓝图文档与架构规约



## T7 运行可靠性与契约收口

- [x] Workspace system prompt、retrieval top-k、chunk size 持久化并在 Chat/Worker 使用
- [x] BFF 到 FastAPI 的内部 token 鉴权
- [x] API liveness/readiness 与依赖检查
- [x] Worker 有限退避、结构化日志、信号优雅退出
- [x] BFF/API 流式上传和 100 MB/字节数校验
- [x] SSE 截断流与错误事件回归
- [x] API、Worker、Web 单测、迁移检查、CI 与可选 Playwright smoke
