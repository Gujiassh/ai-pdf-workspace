# V4 Evidence Research Workflow 任务提案

## 当前状态

- [ ] V3 M403A 完成 binary ANN S2 与完整 canonical
- [ ] V3 M403B 经批准后完成 Image 生产启用
- [ ] V3 形成经授权的 Git 恢复点
- [ ] V4 数据/API/状态机方案获得明确批准

## R000 合同

- [ ] R001 冻结固定 DAG 与 Agent/Tool 输入输出 schema
- [ ] R002 冻结 Run/Step/Event/Artifact/HumanDecision 状态机
- [ ] R003 冻结 Workflow/Prompt version 和历史重放语义
- [ ] R004 完成权限、删除、取消、备份恢复和成本边界评审
- [ ] R005 定义现有 Chat/Citation/NoteSource 不变 oracle

## R100 Evaluation-first

- [ ] R101 建立复杂研究 case、failure taxonomy 和评分规则
- [ ] R102 生成相同 Asset scope/provider/model 的 Quick Answer baseline
- [ ] R103 定义 claim support、locator accuracy、conflict 和 refusal 指标
- [ ] R104 定义并行、恢复、token/cost 和 HITL 工程指标

## R200 运行账本

- [ ] R201 实现 WorkflowVersion 与 PromptVersion
- [ ] R202 实现 ResearchRun、ResearchStep 与 ResearchEvent
- [ ] R203 实现 ResearchArtifact、Evidence provenance 与 MinIO 存储
- [ ] R204 实现 HumanDecision 与等待/恢复状态
- [ ] R205 完成 Alembic、downgrade 限制、dump/restore 和跨 Workspace 测试

## R300 执行器

- [ ] R301 接入 LangGraph 或经评审的成熟图执行库
- [ ] R302 实现 Planner 和结构化计划校验
- [ ] R303 实现 bounded parallel Researcher fan-out/join
- [ ] R304 实现 Evidence-only Tool registry
- [ ] R305 实现 Verifier、Critic 和 fail-closed claim gate
- [ ] R306 实现 Synthesizer 和 ArtifactPublisher
- [ ] R307 实现预算、provider usage、attempt 和取消语义

## R400 可靠性

- [ ] R401 实现持久化 SSE 事件协议和 Last-Event-ID 重放
- [ ] R402 实现计划审批和冲突裁决
- [ ] R403 实现 lease/heartbeat、timeout、retry 和失败分支恢复
- [ ] R404 验证 API/Worker 重启和客户端断线恢复
- [ ] R405 验证重复请求不产生重复业务记录或 Artifact

## R500 Web

- [ ] R501 增加 Quick/Research 模式选择
- [ ] R502 实现只读 DAG/步骤时间线和并行状态
- [ ] R503 实现 HITL 审批界面
- [ ] R504 实现 ResearchArtifact 阅读和 Evidence Viewer 跳转
- [ ] R505 完成桌面/移动端 Playwright

## R600 Observability

- [ ] R601 增加 run/step/tool/provider OpenTelemetry spans
- [ ] R602 增加 Prometheus 质量、性能、成本和恢复指标
- [ ] R603 增加扁平结构化日志和 trace correlation
- [ ] R604 评估 Langfuse 可替换适配器

## R700 Evaluation Dashboard

- [ ] R701 实现 suite/run/case/claim 数据接口
- [ ] R702 实现 Quick/Research 和 Workflow/Prompt version 对比
- [ ] R703 实现质量、延迟、成本、并行和恢复图表
- [ ] R704 保持工程质量、真实模型和 M404 用户价值证据分层

## R800 验收

- [ ] R801 完成 Agent/tool/prompt-injection/权限 Critical review
- [ ] R802 完成并行、HITL、失败恢复和 Artifact provenance 运行证据
- [ ] R803 完成单 Agent/多 Agent 成对质量报告
- [ ] R804 完成架构文档、运行手册和 5 分钟演示脚本

## 明确不做

- [ ] 不做拖拽 Workflow 编辑器
- [ ] 不做自由插件或插件市场
- [ ] 不做自动长期记忆
- [ ] 不做通用 Agent 平台
