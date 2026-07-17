# V3 Evidence 合同发现与设计计划
## Phase 1：基线冻结

- 记录当前 Document/Page/Chunk/Citation/NoteSource 字段、API payload 和 Viewer 跳页链路。
- 把 Workspace 隔离、历史回放、删除和重索引语义写成可验证不变量。

## Phase 2：用户任务验证

- 选取目标参与者和真实复杂 PDF。
- 准备任务、人工答案要点和证据页。
- 执行手工/产品交叉对照并记录失败原因。
- 判断主要缺口是解析、检索、回答还是区域定位。

## Phase 3：合同设计

- 设计 `pdf_page/pdf_region` discriminated locator。
- 冻结候选坐标空间、页面几何和多区域语义。
- 比较 PDF 专用类型表、通用 JSONB 和完整 Asset 迁移。
- 设计 Citation/NoteSource payload、历史迁移和回滚影响，但不实施。

## Phase 4：Fixture 与评审包

- 准备旋转页、CropBox、扫描页、表格、图表、多区域和删除/重索引 fixture。
- 形成旧/新 API payload、数据库映射、Viewer 高亮和备份恢复验收矩阵。
- 提交用户明确批准；未批准时继续研究，不创建 migration 或实现分支。

## 风险

- 小样本会高估留存，需要把七日复用视为方向性证据。
- 区域定位问题可能实际来自 OCR/解析质量，不能提前归因到 locator 合同。
- PDF 坐标系容易因旋转、CropBox 和渲染 viewport 产生漂移，必须用像素证据验证。
- 一次性通用 Asset 迁移会扩大合同和恢复范围，默认不进入首个切片。

## 质量门禁

- 研究记录不包含真实姓名、密钥或机密文档内容。
- 不伪造参与者、任务结果或复用数据。
- RFC 中“当前事实”“提案”“已批准决策”必须明确区分。
- 任何实施计划都必须包含旧/新 fixture、单元测试、运行时 Viewer 证据和备份恢复演练。
