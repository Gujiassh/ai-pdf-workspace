# V3 Evidence 合同发现与设计
## 状态

- 阶段：设计中
- 建立日期：2026-07-16
- 实施授权：未获得

## 目标

用真实复杂 PDF 任务验证区域级证据的用户价值，并形成可评审的 Evidence 合同设计包。该阶段只产出研究、fixture、RFC/ADR、旧/新 payload 和迁移影响设计，不修改当前持久化、Citation API、Chat SSE、历史回放或保存语义。

## 功能需求

- FR-001：任务验证必须覆盖精确事实、跨文档比较、方法理解、表格、图表和无答案问题。
- FR-002：验证必须以支持结论完成率和核验后任务耗时为主指标。
- FR-003：失败样本必须区分检索缺口、回答缺口、区域定位缺口和 Viewer 缺口。
- FR-004：RFC 必须记录当前 Citation/NoteSource 合同和不可破坏不变量。
- FR-005：RFC 只能首先设计 `pdf_page/pdf_region`，不能一次性承诺独立图片、音频、视频或 Omnilabel。
- FR-006：坐标提案必须明确原点、单位、CropBox、旋转、页面几何和多区域语义。
- FR-007：必须比较 PDF 专用类型表、通用 JSONB 和完整 Asset 迁移的边界与风险。
- FR-008：必须提供历史回放、删除、重索引、parser 升级和备份恢复的验证设计。
- FR-009：任何数据库、API 或 save 合同实现任务必须等待用户明确批准。
- FR-010：匿名任务 CSV 必须经过严格表头、枚举、时间、重复任务校验，并可重复生成分工作流指标和自动门禁结果。

## 成功标准

- SC-001：完成首轮最小用户任务样本，结果可复核且没有伪造研究数据。
- SC-002：有真实失败样本证明页码级 citation 是否足够。
- SC-003：Evidence RFC 包含当前合同、目标边界、坐标提案、持久化选项和待批准决策。
- SC-004：当前 Citation/NoteSource 旧 fixture 和候选新 fixture 可并列比较。
- SC-005：评审明确给出批准、修改后批准或拒绝，不以“文档已写”替代合同批准。
- SC-006：同一份任务 CSV 重复分析得到相同 JSON 指标，缺失样本不能被误报为门禁通过。

## 非目标

- 新建 Asset、Representation、ContentUnit 或 locator 数据表
- 修改 Citation/NoteSource API、SSE 或前端类型
- 实现区域高亮、表格解析、视觉 embedding 或 reranker
- 接入独立图片、音频、视频或 Omnilabel
- 为尚未批准的合同添加兼容层或占位字段
