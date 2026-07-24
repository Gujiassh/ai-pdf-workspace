# 第一用户复杂资产任务验证协议

## 状态

- 状态：延期到 Beta 验收，未执行、`not_evaluable`
- 建立日期：2026-07-16
- 适用阶段：多模态 PDF + 图片内部工程验收后、Beta 发布前

## 1. 要验证的核心假设

第一用户是需要反复审阅论文、技术规范、评测报告、方案文档和技术图片的 AI/软件工程师与技术研究者。

核心假设是：相比手工搜索和普通 PDF 阅读器，用户会持续使用 `提问 -> 阅读结论 -> 打开 citation -> 核验证据 -> 保存或继续追问`，并因证据核验更快、更可靠而回到同一个 Workspace。

本阶段不验证“系统能否接入所有媒体格式”，也不以模型名称、功能数量或演示效果作为成功证据。该验证不阻塞 V3 内部工程开发，但未完成前只能标记内部预览，不能宣称产品价值已验证。

## 2. 最小样本

首轮产品判断至少需要 5 名符合第一用户画像的参与者和 20 个可评分真实任务。建议招募 5-8 名参与者，每人完成 4-6 个任务。

如果暂时没有参与者，可以先用 20-30 个来自真实项目的问题做内部质量预评测，但该结果不能替代用户任务验证、工作流观察或复用信号。

样本必须覆盖至少 5 份真实复杂资产，其中至少 3 份 PDF 和 2 张独立图片，不能全部来自同一来源、同一版式或人为简化内容。

M404 只在以下自动资格门槛同时满足后进入质量 `pass/fail` 判定：

- 至少 5 名已由研究负责人确认画像的真实目标用户；
- 至少 20 个去重后的合格任务完成，去重键为 `(participant_id, task_id)`；
- 合格任务实际引用至少 3 份真实复杂 PDF；
- 合格任务实际引用至少 2 张真实复杂独立图片。
- 上述合格资产至少覆盖 2 个匿名来源组和 2 个版式组，不能全部来自同一来源或同一版式。

任一资格门槛不足时，顶层状态必须为 `not_evaluable`，全部质量门禁也保持 `not_evaluable`。不得把质量指标的局部高分解释为用户价值通过。

自动报告中的 `status=pass` 也只表示结构化样本资格和 CSV 可计算的质量门禁通过。继续使用意愿、七日复用和研究负责人最终裁决仍是人工证据，因此本自动化不会自行宣布 M404 完成：所有自动报告都固定输出 `userValueValidated=false`、`productStage=internal_preview`。只有后续人工验收完成并把最终裁决写入正式 M404 SSoT，才能在该 SSoT 中改变这两个产品结论；不能通过修改 CSV 或填入虚构 qualification ID 绕过。

## 3. 任务分层

| 任务类型 | 示例 | 主要观察 |
| --- | --- | --- |
| 精确事实定位 | 某模型的上下文长度、阈值或实验设置是什么 | lexical/Dense 召回、页码准确性 |
| 跨文档比较 | 两份评测报告对同一方法的结论有何差异 | 多文档证据组织、引用覆盖 |
| 方法与约束理解 | 某方案成立依赖哪些前提，失败条件是什么 | 回答支持率、遗漏和误读 |
| 表格读取 | 某数据集或模型在指定指标上的结果是多少 | 页码是否足够、是否需要表格结构 |
| 图表解释 | 图中趋势、拐点或异常代表什么 | 是否需要区域级或视觉证据 |
| 独立图片 | 图片中的结构、对象、标注或趋势说明什么 | OCR/caption 召回、图片区域定位 |
| 无答案问题 | 文档是否真的包含某项声明 | 拒答质量、虚构率 |

每轮至少包含 2 个表格/图表任务和 2 个无答案任务。只有真实失败样本证明页码级 citation 不足，才能把区域级证据作为产品需求，而不是工程预设。

## 4. 对照方式

采用同一参与者内的交叉对照：

1. 为每个任务准备人工核验的答案要点和证据页。
2. 一半任务先使用原 PDF 阅读器/搜索完成，另一半先使用 Citeframe 完成。
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
asset_set:
task_id:
task_type:
question:
expected_answer_points:
expected_evidence_locations:
workflow: manual | ai_pdf_workspace
started_at:
completed_at:
answer:
opened_citations:
saved_note: yes | no
supported_conclusion: pass | fail
citation_locator_accuracy: pass | fail | not_applicable
unsupported_claims:
region_gap: none | table | chart | image | scan | other
observer_notes:
```

参与者标识使用研究编号，不在研究文档中记录真实姓名、账号、文档机密或 API key。

### 7.1 资格 manifest

CSV 只记录任务执行。参与者、资产和任务是否满足 M404 资格，由独立的 `user-task-validation-manifest-v1` JSON manifest 声明。空模板位于 `docs/research/user-task-validation-manifest-template.json`；模板故意不预填任何参与者、资产或任务，不能用示例数据冒充真实验证证据。

manifest 顶层只能包含以下字段：

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 固定为 `user-task-validation-manifest-v1` |
| `participants` | 匿名参与者资格记录 |
| `assets` | 匿名资产资格记录 |
| `tasks` | 任务资格和资产引用记录 |

参与者记录严格包含：

```json
{
  "participantId": "participant-001",
  "kind": "target_user",
  "targetProfileConfirmed": true,
  "qualificationEvidenceId": "research-review-001"
}
```

- `kind` 只能是 `target_user | developer_self_test | synthetic_user | model_agent`。
- 只有 `kind=target_user` 且 `targetProfileConfirmed=true` 才能计入；开发者自测、合成用户和模型代理永远不能计入。
- `qualificationEvidenceId` 是线下招募/审核记录的匿名引用，不是自证字段；不得写姓名、账号或联系方式。

资产记录严格包含：

```json
{
  "assetId": "asset-001",
  "modality": "pdf",
  "origin": "real_project",
  "complexityConfirmed": true,
  "qualificationEvidenceId": "asset-review-001",
  "sourceGroup": "anonymous-source-a",
  "layoutGroup": "technical-report"
}
```

- `modality` 只能是 `pdf | image`；`origin` 只能是 `real_project | synthetic | demo`。
- 只有 `origin=real_project` 且经人工确认 `complexityConfirmed=true` 的资产才能计入。
- 合格资产还必须被至少一个已完成的合格任务通过 `assetIds` 实际引用；仅列在 manifest 中的未使用资产不计入。
- `sourceGroup` 和 `layoutGroup` 使用匿名分类，供研究负责人核对样本没有全部来自同一来源或版式。

任务记录严格包含：

```json
{
  "taskId": "task-001",
  "taskType": "exact_fact",
  "origin": "real_project",
  "scoreable": true,
  "assetIds": ["asset-001"],
  "qualificationEvidenceId": "task-review-001"
}
```

- `origin` 只能是 `real_project | synthetic | demo`；只有真实项目且经人工确认可评分的任务才合格。
- `taskType` 必须与 CSV 同一任务的 `task_type` 一致，`assetIds` 必须引用 manifest 中存在的资产。
- 标为真实项目的任务若引用任何 `synthetic` 或 `demo` 资产，不计入 20 个合格任务完成。
- 重复 ID、未知字段、悬空引用、矛盾枚举或任务类型不一致均使整个输入成为 `invalid`，不得降级为可评估数据。

资格字段记录的是人工裁决结果，自动化只负责严格验证结构、引用、计数和门禁状态。分析器不能、也不会根据 ID、文件名、内容文本或模型判断自行推断“真实用户”“真实项目”或“复杂资产”。

### 7.2 执行 CSV

批量记录可使用 `docs/research/user-task-results-template.csv`。只有表头、没有记录行的 CSV 是合法输入，用于在尚未招募真实用户时确定性生成 `not_evaluable` 报告。问题、答案和观察文本若包含逗号、引号或换行，必须按标准 CSV 规则引用，不能用简单字符串拼接生成。

CSV 枚举值统一使用以下机器可读口径：

- `task_type`：`exact_fact | cross_document_compare | method_constraints | table | chart | image | no_answer`
- `workflow`：`manual | ai_pdf_workspace`
- `saved_note`：`yes | no`
- `supported_conclusion`：`pass | fail`
- `citation_locator_accuracy`：`pass | fail | not_applicable`
- `region_gap`：`none | table | chart | image | scan | other`

`started_at` 和 `completed_at` 必须使用带 UTC offset 的 ISO 8601 时间。`opened_citations` 记录实际打开的 citation 标识，未打开时留空。对于 `no_answer` 任务，`supported_conclusion=pass` 且 `unsupported_claims` 为空表示正确拒答；任何 `unsupported_claims` 内容都计为无答案任务中的事实编造。

使用分析工具校验 CSV 并生成 JSON 报告：

```bash
cd apps/api
uv run python scripts/analyze_user_task_results.py \
  --dataset ../../docs/research/user-task-results.csv \
  --manifest ../../docs/research/user-task-validation-manifest.json \
  --output ../../docs/research/user-task-results-report.json
```

不传参数时，CLI 使用仓库内的 header-only CSV 和空 manifest 模板，因此当前确定性状态是 `not_evaluable`、`userValueValidated=false`、`productStage=internal_preview`。仓库内的 canonical 空证据报告为 `docs/research/user-task-results-report.json`；它必须由上述模板经 CLI 生成，预期退出码为 `2`，不能手工改成通过。

CLI 退出码固定如下，供 CI 或发布脚本显式处理：

| 状态 | 退出码 | 含义 |
| --- | ---: | --- |
| `pass` | 0 | 资格门槛满足且全部自动质量门禁通过；不等于用户价值已最终验证 |
| `fail` | 1 | 资格门槛满足，但至少一项自动质量门禁失败 |
| `not_evaluable` | 2 | 真实用户、合格任务或真实复杂 PDF/Image 样本不足 |
| `invalid` | 3 | CSV/manifest 格式、枚举、引用或输出文件无效 |

报告包含分工作流的支持结论完成率、中位耗时、Citation locator 准确率/打开率、转笔记率、正确拒答率、无答案编造数和区域定位缺口，以及整体和参与者内耗时降幅。PDF/图片复杂性、目标用户画像和任务可评分性依赖 `qualificationEvidenceId` 指向的人工审核；继续使用意愿和七日复用仍需人工证据。不能因自动检查通过而隐藏或替代这些研究证据。

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
