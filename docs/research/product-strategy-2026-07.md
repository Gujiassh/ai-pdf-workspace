# 产品战略调研：从 PDF Chat 到证据型研究工作台

## 调研输入

- 当前产品、路线、功能地图和系统架构 SSoT
- `/home/cc/tmp/555.txt` 提出的多模态知识工作台、Asset 模型、Evidence locator、Omnilabel 和多路检索方案
- 已完成的 Chat-first、Hybrid/RRF、阶段 9 部署与恢复运行证据
- `product-manager`、`before-you-build`、`project-architecture` 和 `deployment-pipeline-design` 方法

## 核心结论

Chat-first 主次不推翻，但资产管理、证据范围和右侧 Viewer 需要按 PDF + 图片重新设计。Chat 继续是主任务，右侧从 PDF 阅读器演进为按 locator 打开的通用 Evidence Viewer。

需要改变的是产品定位：从宽泛的个人学习、知识整理和面试展示，收敛为帮助 AI/软件工程师与技术研究者基于多份论文、技术规范和评测报告形成可核验、可复用的技术结论。

`555.txt` 中“先多模态 PDF，再独立图片、音频、视频”的工程顺序合理，但开头一次性承诺 PDF、图片、音频、视频和标注数据会跨越多个用户与 JTBD。Omnilabel 的标签、预测、数据集分布和质量分析是独立业务域，不应当作普通文件格式接入。

## 风险判断

- 产品风险：中高。尚无证据证明第一用户会为区域级证据核验持续回访。
- 工程连续性：中等偏强。现有 Workspace、Chat、citation、note、Hybrid 与 Viewer 为多模态 PDF 提供了可靠基线。
- 最大假设：用户会反复使用“得到答案 -> 核验证据 -> 沉淀结论”，而不是技术上能否解析视频。
- 最小产品验证：至少 5 名第一用户完成至少 20 个真实复杂资产任务，对比手工与产品流程的任务耗时、核验率、支持率和转笔记率；该验证延期为 Beta 门禁，不再阻塞内部工程实现，也不能被内部题库替代。

## 战略裁决

### Now

- V3 范围固定为多模态 PDF + 独立图片。
- 完成资产栏、Chat 证据范围和 Evidence Viewer 的重新设计。
- 批准 Asset/Representation/ContentUnit/Embedding、locator、API 与迁移合同。
- 真实用户任务验证延期为 Beta 门禁。

### Next

- 先迁移统一 Asset 基础，再完成多模态 PDF 和独立图片纵向闭环。
- 顺序为 Asset 合同迁移、布局/OCR bbox、表格/图表、`pdf_region`、独立图片 OCR/caption、`image_region` 和 Evidence Viewer 精确高亮。
- 视觉向量和 reranker 只有在评测证明 caption/text/现有 RRF 不足时才进入。

### Later

- Audio、Video 分别立项和验收。
- Omnilabel 作为独立 discovery/edition/integration，先解决用户、权限、数据连接、结构化查询和质量分析语义。

## 目标架构与当前合同

目标域采用 `Asset / Representation / ContentUnit / Embedding / EvidenceLocator / Citation` 职责划分，但这不是当前实现事实。

当前 `documents / document_pages / document_chunks / message_citations / note_sources`、Chat SSE、历史回放、citation -> note、Viewer 跳页和删除/重索引语义保持冻结。正式实施前必须提交并获批：

- 数据迁移与回滚
- Citation API 版本和 locator 联合类型
- bbox 坐标原点、单位、页面尺寸、旋转、CropBox 和多区域语义
- 图片方向归一化、像素几何和区域坐标语义
- 历史聊天/笔记来源回放
- 重索引不改变旧 citation 快照
- 源删除后的快照语义
- 备份恢复、旧/新 payload 和真实 fixture 验证

## Skill 结论

当前已安装 skills 足够覆盖产品定位、风险预演、路线规划、架构边界和阶段 9 部署。没有发现一个具体能力缺口值得去 GitHub 随机安装新的 system-design skill。

真实缺口是项目领域知识和证据：多模态 PDF/图片解析方案、区域定位合同、真实复杂 fixture 和多模态 RAG 评测集。实施时应定向研究 Docling、MinerU、PaddleOCR、PyMuPDF 等实现与公开评测；Evidence 合同稳定后，可用 `skill-creator` 把本项目的合同/评审清单固化为 repo-specific skill。
