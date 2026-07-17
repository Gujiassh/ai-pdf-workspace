# V2-A 检索质量实施计划

## 技术上下文

- 运行时：Python 3.12、FastAPI、SQLAlchemy 2、PostgreSQL、pgvector。
- Dense：现有 HNSW `vector_cosine_ops` 查询。
- Lexical：PostgreSQL `pg_trgm` 与 `simple` text search 组合，不引入额外搜索服务。
- Fusion：RRF，候选数和常数由服务端环境配置控制。
- 评测：现有 40 条人工标注 JSONL，复用 Recall/MRR/nDCG/citation hit 指标。

## 架构边界

1. `retrieval.py` 只负责候选查询、融合和检索观测。
2. `chat.py` 只选择检索入口并消费返回候选，不解释 lexical 或 RRF 细节。
3. 评测与压测脚本只读业务数据，不写 Chat、Citation、Document 或配置表。
4. 策略是运行配置，不写入 Workspace 持久化模型，避免改变现有保存契约。
5. 数据库只增加 lexical 查询索引，不改变 chunk 内容、embedding 或索引版本语义。

## 实施步骤

### Phase 1 生产查询

- 完成 lexical PostgreSQL 查询和可逆 Alembic 索引迁移。
- 将策略作为显式内部参数传递，运行配置只提供默认值。
- 默认保持 Dense，防止未验收 Hybrid 自动进入 Chat。
- RRF 合并使用稳定 ID 处理并列。

### Phase 2 可观测性

- 分别计时 query embedding、Dense、lexical、merge、retrieval 总耗时和 embedding + retrieval 端到端耗时。
- 单行记录策略、范围、候选数量与耗时。
- 错误继续沿现有 Chat 错误边界返回，不增加静默降级。

### Phase 3 生产评测

- 增加生产查询对比脚本，复用现有标注和指标模块。
- 先 warm-up，再分别执行 Dense 与 Hybrid；默认切换的延迟门禁使用 embedding + retrieval 端到端 `p95`，纯 retrieval 延迟用于定位数据库成本。
- 并发执行时每个 worker 建立独立 Session。
- 保存机器、参数、质量和延迟证据。

### Phase 4 切换裁决

- 对照 spec 的质量、延迟和隔离门禁。
- 全部通过：把默认策略切为 Hybrid并记录证据。
- 任一门禁失败：默认保持 Dense，记录失败项，rerank 另行立项。

## 风险

- PostgreSQL `simple` parser 对中文不分词，中文召回主要依赖 trigram/substring 候选，必须用真实中文问题验证。
- 长 chunk 的全局 trigram similarity 可能稀释短术语得分，需要查询计划和真实标注共同判断。
- Ollama 首次 embedding 有冷启动，必须从 steady-state 延迟中单独排除。
- 单个 SQLAlchemy Session 不能跨线程共享，并发脚本必须独立建 Session。

## 验证门禁

- API 单元与集成测试
- Alembic upgrade/downgrade/check
- 真实 PostgreSQL 查询与 EXPLAIN
- 40 条标注质量报告
- warm-up 单并发和多并发延迟报告
- Dense-only 与 Workspace 隔离回归
- `compileall`、格式检查和 `git diff --check`
