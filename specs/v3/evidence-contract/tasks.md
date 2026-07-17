# V3 Evidence 合同发现与设计任务

## Phase 1：基线与协议

- [x] T001 建立第一用户复杂 PDF 任务验证协议
- [x] T002 记录当前 Citation/NoteSource 持久化、API 和回放不变量
- [x] T003 建立 Evidence 合同 Draft RFC
- [x] T004 建立设计阶段 spec、plan 和审批门禁

## Phase 2：研究准备

- [ ] T005 招募至少 5 名第一用户，并准备至少 20 个真实复杂 PDF 任务
- [ ] T006 准备至少 5 份真实 PDF 和人工核验答案/证据页
- [ ] T007 覆盖事实、比较、方法、表格、图表和无答案任务
- [x] T008 建立匿名任务记录模板 `docs/research/user-task-results-template.csv`
- [ ] T009 在真实执行中建立失败样本台账

## Phase 3：执行与判断

- [ ] T010 执行手工/产品交叉对照
- [ ] T011 计算支持结论完成率、核验后耗时、页码准确率和拒答结果
- [ ] T012 区分检索、回答、区域定位和 Viewer 失败
- [ ] T013 判断是否满足 `pdf_region` 进入详细设计的用户证据门禁

## Phase 4：合同评审包

- [x] T014 准备旋转、CropBox、扫描、表格、图表和多区域合成 fixture
- [x] T015 提供当前 Citation/NoteSource 与候选新 payload 对照 fixture
- [x] T016 提供数据库迁移、回滚、历史回放、删除/重索引和备份恢复影响设计
- [ ] T017 对 RFC 待批准决策逐项取得用户明确裁决

## 实施禁区

- G001：用户批准前不得创建 Asset/Representation/ContentUnit/locator migration。
- G002：用户批准前不得修改 Citation/NoteSource API、Chat SSE 或保存语义。

G001-G002 是持续门禁，不是待完成任务。
