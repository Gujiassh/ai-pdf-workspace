# 实施路线

## 1. 当前结论

AI PDF Workspace 已完成 V1 可用闭环、Chat-first 工作台、V2-A Hybrid/RRF 生产验收和阶段 9 单机生产基线，不再处于 mock 或“先搭骨架”阶段。

当前主线调整为：

`可复现 PDF 基线（已完成） -> 用户任务验证 + Evidence 合同设计 -> 多模态 PDF 证据链 -> 经验证的独立模态`

Chat 继续是主任务画布，PDF 继续是按需展开的证据与精读层。战略调整不要求再次推翻当前页面，也不改变现有 Document/Citation/Note 保存语义。

## 2. 已完成基线

| 阶段 | 内容 | 状态 | 完成口径 |
| --- | --- | --- | --- |
| 1-6 | 定位、前端、鉴权、上传、Worker、PDF/OCR | 已完成 | Workspace 隔离、真实 PDF、OCR blocks、页面与 chunk 已接通 |
| 7 | Embedding 与检索 | 已完成 | pgvector、PostgreSQL lexical、页级 RRF 与显式 Dense/Hybrid 已接通 |
| 8 | Chat 与知识沉淀 | 已完成 | 流式回答、citation、消息分支、笔记、标签和 Chat-first 工作台已接通 |
| V2-A | 检索质量 | 已完成 | 40 条真实评测、warm-up、延迟和 4 并发门禁通过，默认 Hybrid |
| 9 | 部署、日志与观测 | 已完成 | 锁定镜像、迁移 gate、Prometheus、备份销卷恢复、Caddy 与全业务 smoke 通过 |

历史规格保留在 `specs/v1/`、`specs/v2/retrieval-quality/` 和 `specs/v2/deployment-baseline/`。

## 3. Now：验证问题与冻结合同

目标不是立即重命名表或支持所有格式，而是先证明第一用户会反复使用证据工作流。

1. 由至少 5 名 AI/软件工程师完成至少 20 个真实研究任务，验证复杂 PDF JTBD；无参与者的问题集只作内部质量预评测。
2. 记录 citation 打开核验率、引用支持率、回答转笔记率、任务耗时和 Workspace 周回访。
3. 建立多模态 PDF 分层黄金集：文本、扫描页、表格、图表、图片和无答案问题。
4. 完成索引重建与解析版本管理，它们是后续重处理的必要运维前置。
5. 形成 Evidence 合同 RFC/ADR，明确 Asset、Representation、ContentUnit 和 EvidenceLocator 边界。
6. 设计 `pdf_page / pdf_region` 联合类型，冻结 bbox 坐标系、单位、原点、旋转、CropBox 和多区域语义。
7. 提交持久化迁移、Citation API 版本、历史回放、删除/重索引和备份恢复影响包，获得明确批准前不改合同。

完成门禁：用户任务和成功指标有真实基线；Evidence 设计包经评审批准；当前 Citation/NoteSource 回放不变量有旧/新 fixture。

## 4. Next：多模态 PDF 纵向闭环

按一个完整用户链推进，不先抽象所有模态：

1. 页面布局、段落区域与 OCR bbox 质量。
2. 表格结构化提取和表格专项问题。
3. 图片/图表区域描述；只有 caption/text 召回被评测证明不足时才加入视觉向量。
4. 文本 Dense、lexical、caption/视觉候选和元数据过滤的有界融合。
5. `pdf_region` citation 快照、Chat SSE/API 和 note source 落库。
6. Viewer 根据 locator 精确高亮原文区域，不把缩放/焦点等运行时状态写入持久化模型。
7. 以定位准确率、答案支持率、拒答率、p95、成本和失败分布验收。

完成门禁：真实复杂 PDF 黄金集达标；历史页码 citation 仍可回放；重索引不改变已保存证据含义。

## 5. Later：经验证的独立模态

- 独立图片 Asset：只在同一技术研究 JTBD 有真实需求时进入。
- Audio：ASR、说话人和时间段 locator 独立立项。
- Video：镜头、关键帧、字幕和时间段 locator 独立立项。
- Omnilabel：作为独立 discovery/edition/integration；先验证标注团队、权限、数据集 schema、预测对比和 SQL/分析查询语义。

每种模态必须有单独用户价值、数据合同、评测集和成本门禁，不能以“格式覆盖面”打包上线。

## 6. 持续非目标

- 未经验证的一次性全模态平台化
- 没有质量缺口就接 reranker、GraphRAG 或统一向量空间
- 为规模话题提前迁移 Milvus
- 无业务需求的 Agent/LangGraph 编排
- TinyBERT、LoRA、DPO 等与核心证据任务无关的模型训练
- 未批准的持久化、Citation API 或保存语义变更
