# 架构文档

本目录用于存放工程实现层的架构设计文档。

文档分工：

- `../ssot/product-design.md`：产品边界、模块划分与版本范围
- `../ssot/system-architecture.md`：系统级高层架构裁决
- `detailed-system-architecture.md`：可指导开发的详细架构设计
- `feature-map.md`：系统功能地图与拆分入口
- `database-design.md`：数据库设计、表职责、当前已落地 ER 图与 V1 目标全景 ER 图
- `database-er-current.mmd`：当前已落地最小真表关系图（当前维护源文件）
- `database-er.mmd` / `database-er.svg`：V1 目标全景关系图
- `api-contracts.md`：浏览器、BFF、FastAPI 之间的接口契约设计
- `job-state-machine.md`：文档入库、重试、重建索引、删除的状态机设计
- `auth-workstream.md`：认证链路的模块任务拆分与执行顺序
- `implementation-roadmap.md`：项目实施路线与阶段目标
- `implementation-progress.md`：当前实施进度、下一步与阶段状态
- `../research/product-strategy-2026-07.md`：`555.txt` 战略调研、风险判断与 skill 结论
- `../research/user-task-validation-2026-07.md`：第一用户复杂 PDF 任务验证协议、指标和立项门禁
- `evidence-contract-rfc.md`：已批准的 Evidence v1 合同、迁移裁决和不可破坏不变量
- `evidence-migration-impact.md`：Evidence 合同迁移、回滚、历史回放、删除/重索引和备份恢复影响设计
- `multimodal-workspace-interaction-design.md`：PDF + 图片工作区信息架构、交互状态和响应式设计
- `multimodal-asset-target-design.md`：Asset/Representation/ContentUnit/Embedding、PDF/Image locator 和迁移目标
- `multimodal-api-data-contract-draft.md`：字段级目标表、DTO、endpoint 切换和旧数据机械映射
- `modality-extension-contract.md`：后续音频、视频和结构化文件接入时保持核心模型与主链不变的扩展协议
- `../../specs/v2/retrieval-quality/`：已完成的 V2-A 检索质量需求、计划和任务
- `../../specs/v2/deployment-baseline/`：已完成的阶段 9 部署、观测、恢复和入口基线
- `../../specs/v3/evidence-contract/`：用户验证与早期 Evidence 合同发现记录
- `../../specs/v3/multimodal-workspace/`：当前 PDF + 图片 V3 需求、计划和任务；合同已批准，Phase 1 已落地，后续按阶段验收启用能力

建议阅读顺序：

1. `../ssot/product-design.md`
2. `../ssot/system-architecture.md`
3. `detailed-system-architecture.md`
4. `database-design.md`
5. `api-contracts.md`
6. `job-state-machine.md`
7. `auth-workstream.md`
8. `implementation-roadmap.md`
9. `implementation-progress.md`

当前开发应优先阅读 `implementation-progress.md`、`implementation-roadmap.md`、两个 multimodal 目标设计和产品/系统 SSoT。真实用户验证延期为 Beta 门禁；V3 Phase 1-3 与 M401-M402 已完成，当前进入 M403 恢复语义和 M403A 容量验收。
