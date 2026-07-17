# V2-A 检索质量生产验收

## 状态

- 阶段：已完成
- 建立日期：2026-07-16
- 完成日期：2026-07-16
- 前置：V1 Dense 检索、Chat 与 citation 闭环已完成

## 问题

当前 Dense 检索能稳定工作，但对专有名词、章节词和精确术语仍可能漏召回。离线 40 条标注集显示 RRF 优于 Dense，但离线 Python 语料实验不能证明 PostgreSQL 生产查询的质量和延迟可接受。

## 目标

在不改变 Workspace、Document、Chat、Citation 与保存契约的前提下，将 lexical + Dense + RRF 做成可切换、可观测、可回归的生产查询，并用真实 PostgreSQL 证据决定是否切换默认策略。

## 用户故事

### US1 精确术语也能召回（P1）

用户针对当前 Workspace 中的专有名词或章节术语提问时，系统能利用 lexical 候选补充 Dense 漏掉的相关页面，同时仍只返回当前 Workspace、当前索引版本和 ready 文档内容。

### US2 检索升级不拖慢问答（P1）

维护者可以比较 Dense 与 Hybrid 在 warm-up 和并发场景下的延迟，只有质量收益与延迟成本同时达标时才启用 Hybrid。

### US3 检索行为可诊断（P2）

维护者可以从平面日志和评测报告中看到策略、候选数量、各阶段耗时、最终数量与失败位置，不需要展开嵌套对象。

## 功能需求

- FR-001：系统必须支持显式 `dense` 和 `hybrid` 检索策略。
- FR-002：未完成生产验收前，默认策略必须保持 `dense`；全部门禁通过后可切换为 `hybrid`，并继续支持环境变量显式选择 `dense`。
- FR-003：lexical 查询必须在 PostgreSQL 中执行，不能在 Chat 请求中扫描并加载全部 chunk。
- FR-004：Hybrid 必须分别取得 Dense 和 lexical 候选，再使用确定性的 RRF 合并。
- FR-005：所有候选必须同时满足 workspace、文档 workspace、页面 workspace、ready、未删除和当前索引版本约束。
- FR-006：相同输入、相同数据和相同策略必须产生稳定排序；并列时使用稳定 ID 规则。
- FR-007：Dense 模式不得执行 lexical 查询。
- FR-008：评测工具必须在同一人工标注集上比较 Dense 与 Hybrid，并输出 Recall@k、MRR、nDCG、citation 命中和延迟。
- FR-009：并发验证必须为每个执行单元使用独立数据库 Session，不共享非线程安全 Session。
- FR-010：检索日志必须为 grep-friendly 单行字段，至少包含 strategy、workspace_id、dense_count、lexical_count、result_count、dense_ms、lexical_ms、merge_ms、total_ms。

## 非功能需求

- NFR-001：不改变现有业务表字段含义、Chat/Citation API 响应和保存语义。
- NFR-002：允许新增 PostgreSQL 查询索引；迁移必须可升级、可降级且不重写业务数据。
- NFR-003：Hybrid 的质量指标不得低于同轮 Dense 基线，Recall@6 和 citation hit 至少各提升 `0.03` 才具备默认切换资格。
- NFR-004：warm-up 后按“query embedding + retrieval”统计的 Hybrid 端到端 `p95` 不得超过 Dense 端到端 `p95` 的 2 倍且绝对增量不得超过 `100 ms`；纯 retrieval 与并发 retrieval 延迟继续单独报告，用于诊断但不替代用户可感知口径。
- NFR-005：并发验证不得出现跨 Workspace 结果、数据库错误或结果数量漂移。

## 成功标准

- SC-001：真实 PostgreSQL 迁移和查询计划验证通过，lexical 查询命中预期索引路径或具有可解释的查询成本。
- SC-002：40 条标注集完成同轮 Dense/Hybrid 生产路径对比并保存报告。
- SC-003：warm-up 与并发延迟报告满足 NFR-004。
- SC-004：Dense-only、Workspace 隔离、当前索引版本和 citation 页码回归通过。
- SC-005：全部门禁通过后才允许把默认策略从 Dense 改为 Hybrid；否则保持 Dense 并记录未通过原因。

## 非目标

- reranker 模型接入
- Chat API 或 citation 数据结构调整
- 前端检索策略开关
- 跨 Workspace 检索
- 多模态或区域级检索
