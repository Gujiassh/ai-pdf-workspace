# V3 Evidence 合同发现与设计任务（历史阶段）

当前实施任务已转入 `../multimodal-workspace/tasks.md`；本文件保留研究协议、fixture 和分析工具记录。

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
- [ ] T013 在 Beta 前判断区域级 Evidence 的真实用户价值

## Phase 4：合同评审包

- [x] T014 准备旋转、CropBox、扫描、表格、图表和多区域合成 fixture
- [x] T015 提供当前 Citation/NoteSource 与候选新 payload 对照 fixture
- [x] T016 提供数据库迁移、回滚、历史回放、删除/重索引和备份恢复影响设计
- [x] T017 对 RFC 六项决策逐项取得用户明确裁决

## 支持工具

- [x] T018 严格校验匿名结果 CSV 的 18 列表头、枚举、带时区时间和重复任务
- [x] T019 计算完成率、耗时、Citation、拒答、转笔记和区域定位缺口指标
- [x] T020 提供确定性 JSON CLI、自动门禁状态和单元测试

## 历史实施门禁

- G001：用户批准前不得创建 Asset/Representation/ContentUnit/locator migration；已于 2026-07-17 满足。
- G002：用户批准前不得修改 Citation/NoteSource API、Chat SSE 或保存语义；已于 2026-07-17 满足。

后续合同版本仍需重新经过同等级审批；当前 v1 不再处于待批准状态。
