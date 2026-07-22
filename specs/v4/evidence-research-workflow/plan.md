# V4 Evidence Research Workflow 实施计划提案

## 0. 与当前主线衔接

1. 完成当前 M403A binary ANN S2 diagnostic。
2. 只有新的完整 S0/S1/S2 canonical 全部门通过，才关闭 M403A。
3. 经单独批准完成 M403B，正式同步启用 Image 数据库目录、API registry、Worker adapter、caption 配置和 Web 上传入口。
4. 同步 V3 SSoT、测试与运行证据，并在用户明确授权后形成可恢复的 Git commit/push 边界。
5. V4 设计可以提前评审，但实现不得与未完成的 M403A/M403B 交叉修改同一数据、检索或 Chat 合同。

M404 真实用户验证继续推进。它不阻塞内部技术演示开发，但未完成时 V4 仍是 `internal_preview`，不得宣称用户价值已验证。

## 1. R000 合同与语义 Oracle

- 冻结固定 DAG、节点输入输出、状态机、事件协议和预算语义。
- 冻结 Workflow/Prompt version、Run/Step/Event/Artifact/HumanDecision 数据合同。
- 冻结现有 Asset scope、EvidenceLocator、Citation、NoteSource 和 Chat 语义不变条件。
- 明确 LangGraph 只负责图执行/checkpoint，PostgreSQL 业务账本仍是运行事实来源。
- 完成持久化、权限、删除、取消、备份恢复和版本重放影响评审并取得明确批准。

## 2. R100 Evaluation-first Baseline

- 从现有黄金集和真实 PDF baseline 中构造复杂研究任务，不把原有 retrieval case 直接冒充 Agent 质量证明。
- 覆盖比较、综合、冲突、证据不足和明确拒答。
- 先冻结单 Agent baseline，再运行多 Agent；两者使用相同 Asset scope、provider/model 和评价规则。
- 外部模型调用继续遵守显式批准边界；默认使用 scripted provider 验证编排，不把 scripted 输出当模型质量证据。

## 3. R200 运行账本与版本

- 实现不可变 WorkflowVersion 和 PromptVersion 快照。
- 实现 ResearchRun、ResearchStep、ResearchEvent、ResearchArtifact、HumanDecision 及迁移/恢复测试。
- Artifact bytes 进入 MinIO，PostgreSQL 保存 metadata、hash、provenance 和状态。
- 事件先持久化后推送，保证重连和审计使用同一事实源。

## 4. R300 固定多 Agent 执行器

- 实现 Planner、Researcher fan-out、Verifier、Critic、Synthesizer、ArtifactPublisher。
- Agent 只能调用注册的 Evidence search/load 工具，不直接访问 ORM、对象存储或任意网络。
- 使用受限并发、provider semaphore、run/step 预算和 join barrier。
- 保存 step attempt、工具输入输出摘要、Evidence locator IDs 和 provider usage；不保存模型思维链。

## 5. R400 Streaming、HITL 与失败恢复

- 扩展 SSE 为运行事件流，支持 `Last-Event-ID` 重放。
- 增加计划审批和冲突裁决两个受控暂停点。
- 实现 cancel、timeout、bounded retry、checkpoint、lease/heartbeat 和失败分支恢复。
- 验证 API/Worker 重启、客户端断线、provider timeout 和重复提交下的幂等持久化。

## 6. R500 Web Research Run 体验

- 在 Chat 输入区提供明确的 Quick/Research 模式选择。
- Research 运行页展示只读 DAG/步骤时间线、并行状态、审批请求、Evidence 数量、错误和 Artifact。
- 继续复用 Evidence Viewer 打开 locator，不新增解释性营销模块或通用低代码画布。
- Artifact 提供 Markdown 阅读、Evidence 跳转和结构化 trace 导出。

## 7. R600 Observability

- 使用 OpenTelemetry 关联 run/node/tool/provider/DB spans。
- 复用 Prometheus 输出运行数、成功率、step latency、retry、token/cost 和并发指标。
- 日志使用扁平字段：`tag run_id= step_id= attempt= status= duration_ms=`。
- 可接 Langfuse 做开发侧 trace/prompt/eval 深挖，但产品 Dashboard 不依赖外部服务作为事实源。

## 8. R700 Evaluation Dashboard

- 展示 suite -> run -> case -> claim/evidence failure 的逐层下钻。
- 支持 Workflow/Prompt version 和 Quick/Research 成对比较。
- 保存报告输入 hash、运行环境、provider/model 和原始 Artifact hash。
- 合成工程门、真实模型质量门和 M404 用户价值门保持分层显示。

## 9. R800 Critical Hardening 与面试演示

- 完成权限、跨 Workspace、prompt injection/tool boundary、Evidence provenance 和成本失控审查。
- 完成并行时间重叠、unsupported claim 拒绝、HITL、断线恢复、进程重启恢复和 Artifact 去重演示。
- 完成桌面/移动端运行轨迹、Evidence 跳转和 Evaluation Dashboard Playwright 证据。
- 形成 5 分钟可重复演示脚本和架构决策记录。

## 依赖选择

- 编排：优先评估 LangGraph；不从零实现通用 Agent runtime。
- 业务账本：PostgreSQL/Alembic。
- Artifact：现有 MinIO/object storage。
- 事件：持久化 ResearchEvent + SSE。
- 观测：OpenTelemetry + 现有 Prometheus；Langfuse 只作为可替换的开发观测适配器。
