# V4 Evidence Research Workflow 规格提案

## 状态

- 阶段：设计提案，尚未批准实施
- 前置门：先完成 V3 M403A；M403B 图片生产启用单独审批并完成后，再把本能力作为正式多模态演示主线
- 产品结论：M404 未完成前继续标记 `internal_preview`，本提案不替代真实用户价值验证

## 目标

在现有 Asset/Evidence、检索、Citation 和 Viewer 基础上，增加一个可选的深度研究模式。系统使用固定、版本化的多 Agent 工作流拆解复杂问题，并行检索证据，验证结论，经过必要的人工审批后生成可追溯的 Research Artifact。

默认 Quick Answer 单 Agent 链路保持不变。V4 不建设通用 Agent 平台。

## 工作流

```text
Planner
  -> Human plan approval
  -> Researcher fan-out (bounded parallelism)
  -> Verifier
  -> Critic / conflict detection
  -> Human decision when required
  -> Synthesizer
  -> ResearchArtifact
  -> Evaluation
```

## 功能需求

- FR-001：用户显式选择 `quick_answer` 或 `deep_research`，系统不得隐式把普通问题升级为高成本研究运行。
- FR-002：每次运行冻结 Workspace、Asset scope、Workflow version、Prompt versions、provider/model 和预算快照。
- FR-003：Planner 只输出结构化研究计划；Researcher 按子问题和 Asset scope 通过注册工具检索，不直接访问数据库。
- FR-004：Researcher fan-out 必须在运行证据中证明真实时间重叠，并受并发与预算上限约束。
- FR-005：Verifier 对 claim 与 EvidenceLocator 的支持关系做 fail-closed 判定；未通过的 claim 不能进入最终报告。
- FR-006：Critic 记录冲突、缺口和无证据结论；需要人工裁决时运行进入持久化等待状态。
- FR-007：Human in the Loop 决策必须记录操作者、动作、时间、输入版本和可选说明，并从同一 checkpoint 恢复。
- FR-008：节点失败按版本化策略重试；超过上限后只重跑失败分支，不重复持久化已完成步骤和 Artifact。
- FR-009：运行事件使用持久化递增序号并通过 SSE 推送；客户端使用 `Last-Event-ID` 重连后不得缺失或乱序。
- FR-010：ResearchArtifact 使用独立命名空间，至少支持研究计划、Evidence bundle、验证结果、冲突清单和最终 Markdown 报告。
- FR-011：Artifact 保存 SHA-256、Content-Type、生成 Step、Workflow/Prompt versions、provider/model 和 Evidence provenance。
- FR-012：Prompt version 不可变；运行只引用冻结版本，后续编辑不得改变历史运行解释。
- FR-013：Observability 关联 `run_id / step_id / attempt / workflow_version / prompt_version`，提供 trace、结构化日志、延迟、token、成本、重试和 Evidence 数量。
- FR-014：Evaluation Dashboard 对同一 fixture、Asset scope、provider/model 下的单 Agent 与多 Agent 做成对比较。

## Evaluation Dashboard

至少展示：

- Evidence Recall/Precision
- Claim Support Rate
- unsupported claim 数量
- Citation locator accuracy
- 冲突发现率
- 完成率、重试率和恢复成功率
- 并行加速比、p50/p95 wall time
- token、provider 调用次数和成本
- Workflow/Prompt version 对比
- Human intervention 次数和等待时间

现有 40-case PDF baseline、21-case PDF/Image/mixed 工程集和 M404 用户任务分析只能作为输入来源；工程集通过不等于真实用户价值通过。

## 数据与 API 影响提案

实施预计新增版本化 Workflow/Prompt、ResearchRun、ResearchStep、ResearchEvent、ResearchArtifact 和 HumanDecision 持久化记录，以及 run/create/read/cancel/stream/decision/artifact/evaluation API。

这些是新合同，当前尚未批准。正式实施前必须冻结字段、状态机、删除/恢复、权限、备份和旧版本重放语义。不得改变现有 Asset、EvidenceLocator、Citation、NoteSource、Chat SSE 或保存语义来迁就工作流。

## 非目标

- 拖拽式 Workflow 编辑器
- 任意第三方插件、插件市场或运行时任意代码加载
- 自动长期记忆或模型思维链持久化
- 通用 Agent 角色/组织平台
- 自动写入 Note 或修改 Workspace 事实
- Audio/Video 接入
- 以 LangGraph、模型名称或 Agent 数量作为产品卖点

Research Memory 暂由经过验证的 ResearchArtifact、Citation 和用户主动保存的 Note 承担。

## 成功标准

- SC-001：默认 Quick Answer 的请求、持久化、Citation 和恢复行为保持不变。
- SC-002：至少一个复杂研究 case 产生三个真实并行 Researcher 分支，并在 trace 中证明执行时间重叠。
- SC-003：至少一个 unsupported claim 被 Verifier 拒绝且未进入最终 Artifact。
- SC-004：至少一个冲突进入人工审批，API/Worker 重启后可从原 checkpoint 恢复。
- SC-005：注入一个分支失败后仅该分支重试，最终无重复 Step、Event、Evidence link 或 Artifact。
- SC-006：SSE 断线重连后事件序列完整、单调且可重放。
- SC-007：最终报告中的每个事实 claim 都能回到冻结 EvidenceLocator；源 Asset 重处理不改写历史 provenance。
- SC-008：Dashboard 可复现同一批 case 的单 Agent/多 Agent质量、延迟、成本和恢复对比。
