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
