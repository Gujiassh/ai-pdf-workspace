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
- `evidence-contract-rfc.md`：`pdf_page/pdf_region` Evidence 合同 Draft、迁移选项和待批准决策
- `evidence-migration-impact.md`：Evidence 合同迁移、回滚、历史回放、删除/重索引和备份恢复影响设计
- `../../specs/v2/retrieval-quality/`：已完成的 V2-A 检索质量需求、计划和任务
- `../../specs/v2/deployment-baseline/`：已完成的阶段 9 部署、观测、恢复和入口基线
- `../../specs/v3/evidence-contract/`：当前进行中的用户验证与 Evidence 合同设计；不包含实施授权

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

当前开发应优先阅读 `implementation-progress.md`、`implementation-roadmap.md` 和产品/系统 SSoT。下一阶段先做用户验证和 Evidence 合同设计；V1、V2-A 与阶段 9 规格均是已完成历史基线。
