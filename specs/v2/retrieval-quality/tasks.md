# V2-A 检索质量任务

## Phase 1：规格与基线

- [x] T001 统一 V1 完成状态与当前开发路线到 `docs/architecture/implementation-roadmap.md`
- [x] T002 [P] 建立检索质量需求与门禁到 `specs/v2/retrieval-quality/spec.md`
- [x] T003 [P] 建立技术计划与风险到 `specs/v2/retrieval-quality/plan.md`
- [x] T004 记录 Dense 与离线 RRF 基线到 `docs/evals/retrieval-evaluation.md`

## Phase 2：US1 生产 Hybrid 查询

- [x] T005 [US1] 完成可逆 lexical 索引迁移 `apps/api/alembic/versions/a8c9d0e1f2a3_add_lexical_retrieval_index.py`
- [x] T006 [US1] 完成 PostgreSQL lexical 查询与稳定 RRF `apps/api/src/ai_pdf_api/services/retrieval.py`
- [x] T007 [US1] 验收前保持 Dense，验收通过后切换 Hybrid 并支持显式策略覆盖 `apps/api/src/ai_pdf_api/core/settings.py`
- [x] T008 [US1] 补齐 workspace、索引版本、空查询和 Dense-only 单测 `apps/api/tests/test_chat_service.py`

## Phase 3：US3 检索观测

- [x] T009 [US3] 增加各阶段单调时钟计时、应用 INFO 输出与平面日志 `apps/api/src/ai_pdf_api/core/logging.py`、`apps/api/src/ai_pdf_api/services/retrieval.py`
- [x] T010 [US3] 验证 Chat 继续使用现有错误与 citation 契约 `apps/api/src/ai_pdf_api/services/chat.py`

## Phase 4：US2 真实质量与延迟验收

- [x] T011 [US2] 增加生产 Dense/Hybrid 评测与 warm-up 脚本 `apps/api/scripts/evaluate_production_retrieval.py`
- [x] T012 [US2] 增加独立 Session 的并发延迟测试 `apps/api/scripts/evaluate_production_retrieval.py`
- [x] T013 [US2] 在真实 PostgreSQL 执行迁移、EXPLAIN 和中文/英文查询验证
- [x] T014 [US2] 在 40 条标注集执行同轮 Dense/Hybrid 质量与延迟对比

## Phase 5：裁决与收口

- [x] T015 对照 `specs/v2/retrieval-quality/spec.md` 逐项判定默认策略
- [x] T016 更新 `docs/evals/retrieval-evaluation.md` 与 `docs/architecture/implementation-progress.md`
- [x] T017 运行 API 全量测试、迁移检查、compileall 与 diff check

## 依赖

- T005-T008 完成后才能执行真实生产查询。
- T009-T010 完成后才能把运行日志作为验收证据。
- T011-T012 依赖显式策略覆盖，不能通过修改全局配置在并发中切换策略。
- T015 依赖 T013-T014 的真实证据；没有证据不得切换默认策略。
