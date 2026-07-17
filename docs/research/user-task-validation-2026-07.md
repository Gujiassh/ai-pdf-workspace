# 第一用户复杂 PDF 任务验证协议

## 状态

- 状态：待执行
- 建立日期：2026-07-16
- 适用阶段：Evidence 合同设计与多模态 PDF 立项前

## 1. 要验证的核心假设

第一用户是需要反复审阅论文、技术规范、评测报告和方案文档的 AI/软件工程师与技术研究者。

核心假设是：相比手工搜索和普通 PDF 阅读器，用户会持续使用 `提问 -> 阅读结论 -> 打开 citation -> 核验证据 -> 保存或继续追问`，并因证据核验更快、更可靠而回到同一个 Workspace。

本阶段不验证“系统能否接入所有媒体格式”，也不以模型名称、功能数量或演示效果作为成功证据。

## 2. 最小样本

首轮产品判断至少需要 5 名符合第一用户画像的参与者和 20 个可评分真实任务。建议招募 5-8 名参与者，每人完成 4-6 个任务。

如果暂时没有参与者，可以先用 20-30 个来自真实项目的问题做内部质量预评测，但该结果不能替代用户任务验证、工作流观察或复用信号。

样本必须覆盖至少 5 份真实复杂 PDF，不能全部来自同一论文、同一版式或人为简化文档。

## 3. 任务分层

| 任务类型 | 示例 | 主要观察 |
| --- | --- | --- |
| 精确事实定位 | 某模型的上下文长度、阈值或实验设置是什么 | lexical/Dense 召回、页码准确性 |
| 跨文档比较 | 两份评测报告对同一方法的结论有何差异 | 多文档证据组织、引用覆盖 |
| 方法与约束理解 | 某方案成立依赖哪些前提，失败条件是什么 | 回答支持率、遗漏和误读 |
| 表格读取 | 某数据集或模型在指定指标上的结果是多少 | 页码是否足够、是否需要表格结构 |
| 图表解释 | 图中趋势、拐点或异常代表什么 | 是否需要区域级或视觉证据 |
| 无答案问题 | 文档是否真的包含某项声明 | 拒答质量、虚构率 |

每轮至少包含 2 个表格/图表任务和 2 个无答案任务。只有真实失败样本证明页码级 citation 不足，才能把区域级证据作为产品需求，而不是工程预设。

## 4. 对照方式

采用同一参与者内的交叉对照：

1. 为每个任务准备人工核验的答案要点和证据页。
2. 一半任务先使用原 PDF 阅读器/搜索完成，另一半先使用 AI PDF Workspace 完成。
3. 后续参与者交换任务顺序，降低熟悉度和题目难度偏差。
4. 记录从看到问题到形成可提交结论的时间，而不是只记录模型首 token。
5. 要求参与者明确指出最终采用了哪些证据；没有核验的答案不能记为成功。

不在首轮为产品增加埋点或修改持久化合同。可使用观察记录、屏幕录制和会后表格收集数据。

## 5. 指标定义

| 指标 | 定义 |
| --- | --- |
| 支持结论完成率 | 在任务开始前为同一道题设定相同时间上限；在上限内形成结论，且关键陈述都有原文支持的任务比例 |
| 核验后任务耗时 | 从开始任务到完成最后一次证据核验的时长 |
| Citation 页码准确率 | citation 指向的页是否包含支持回答的证据 |
| 引用支持率 | 回答中的关键可验证陈述被 citation 实际支持的比例 |
| 无证据拒答率 | 无答案任务中明确说明证据不足、未编造结论的比例 |
| Citation 打开率 | 有 citation 的回答中，参与者至少打开一次原文的比例 |
| 回答转笔记率 | 完成任务后被保存为 note 的回答比例 |
| 区域定位缺口率 | 页码正确但仍需明显翻找表格单元格、图中区域或扫描块的任务比例 |
| 七日复用信号 | 参与者是否在 7 天内主动回到同一 Workspace 继续真实任务 |

主指标是 `支持结论完成率` 和 `核验后任务耗时`。Citation 打开率与转笔记率只解释行为，不替代任务价值。

## 6. 首轮决策门禁

以下阈值是首轮立项门禁，不是长期产品 SLA：

- 至少 20 个可评分任务，且不少于 5 名目标参与者。
- 支持结论完成率不低于 80%。
- Citation 页码准确率不低于 90%。
- 无答案任务不得出现关键事实编造；任何一例都必须进入失败样本集。
- AI 工作流的核验后任务耗时中位数相对手工流程至少降低 25%。
- 至少 3 个真实任务证明“页码正确仍不足以快速核验”，并能明确归因到表格、图表、图片或扫描区域。
- 至少一半参与者表示愿意把同类真实项目继续放在 Workspace 中；七日复用作为方向性证据单独报告。

如果只有检索质量问题，不进入多模态合同实施，先修黄金集、解析或 Hybrid。只有区域定位缺口稳定出现，才进入 `pdf_region` 实施审批。

## 7. 单任务记录模板

```text
participant_id:
document_set:
task_id:
task_type:
question:
expected_answer_points:
expected_evidence_pages:
workflow: manual | ai_pdf_workspace
started_at:
completed_at:
answer:
opened_citations:
saved_note: yes | no
supported_conclusion: pass | fail
citation_page_accuracy: pass | fail | not_applicable
unsupported_claims:
region_gap: none | table | chart | image | scan | other
observer_notes:
```

参与者标识使用研究编号，不在研究文档中记录真实姓名、账号、文档机密或 API key。

批量记录可使用 `docs/research/user-task-results-template.csv`。问题、答案和观察文本若包含逗号、引号或换行，必须按标准 CSV 规则引用，不能用简单字符串拼接生成。

CSV 枚举值统一使用以下机器可读口径：

- `task_type`：`exact_fact | cross_document_compare | method_constraints | table | chart | no_answer`
- `workflow`：`manual | ai_pdf_workspace`
- `saved_note`：`yes | no`
- `supported_conclusion`：`pass | fail`
- `citation_page_accuracy`：`pass | fail | not_applicable`
- `region_gap`：`none | table | chart | image | scan | other`

`started_at` 和 `completed_at` 必须使用带 UTC offset 的 ISO 8601 时间。`opened_citations` 记录实际打开的 citation 标识，未打开时留空。对于 `no_answer` 任务，`supported_conclusion=pass` 且 `unsupported_claims` 为空表示正确拒答；任何 `unsupported_claims` 内容都计为无答案任务中的事实编造。

使用分析工具校验 CSV 并生成 JSON 报告：

```bash
cd apps/api
uv run python scripts/analyze_user_task_results.py \
  --dataset ../../docs/research/user-task-results.csv \
  --output ../../docs/research/user-task-results-report.json
```

报告包含分工作流的支持结论完成率、中位耗时、Citation 页码准确率/打开率、转笔记率、正确拒答率、无答案编造数和区域定位缺口，以及整体和参与者内耗时降幅。自动门禁只判断 CSV 能直接证明的指标；真实 PDF 数量、继续使用意愿和七日复用仍需人工证据，不能因自动检查通过而宣称产品验证完成。

## 8. 失败样本写回

每个失败任务必须归入一个主要原因：

- 文档未正确解析
- Dense/lexical 候选缺失
- RRF 排序错误
- 回答未受候选支持
- 页码正确但区域难定位
- 表格结构缺失
- 图表/图片语义缺失
- 应拒答但生成了结论
- Viewer 跳转或高亮问题
- 用户工作流问题

只有可复现、可核验的失败样本进入后续黄金集。访谈意见可以影响优先级，但不能替代任务证据。
