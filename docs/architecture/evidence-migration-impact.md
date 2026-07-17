# Evidence 合同迁移影响设计
## 状态

- 状态：Draft，待 Evidence RFC 决策后细化
- 实施授权：未获得
- 当前影响：只记录迁移、回滚和验证要求

## 1. 当前冻结边界

在用户明确批准前，以下内容不变：

- `documents / document_pages / document_chunks / message_citations / note_sources` 表与字段语义
- Chat 历史响应和 Chat SSE citation payload
- `citationIndex` 与正文 `[n]` 映射
- citation -> note 的 Workspace 校验和快照复制
- Viewer 的 `documentId + pageNumber` 跳转
- 文档删除、重索引和历史来源回放
- PostgreSQL/MinIO 备份恢复格式

## 2. 迁移前语义 oracle

| 场景 | 当前必须保持的结果 | 证据 |
| --- | --- | --- |
| 读取历史 Chat | Citation 标题、页码、摘要和编号不变 | `current-citation.json` + API fixture |
| 流式完成回答 | citation 在 `done` 前持久化，刷新后结果一致 | SSE 事件记录 + DB 快照 |
| Citation 转 Note | 只接受当前 Workspace citation，并复制标题、页码和摘要 | `current-note-source.json` + payload/DB 对照 |
| 重索引 | 新 chunk 可替换，旧 citation 快照含义不变 | 重索引前后历史响应比较 |
| 删除文档 | 原对象/page/chunk 可清理，历史 citation/note source 文本仍可读 | 删除前后 API 和 DB 快照 |
| Viewer 跳转 | 有源文件时打开相同文档和 1-based 页码 | Playwright DOM/canvas 证据 |
| 备份恢复 | 用户、Workspace、文档、citation、note source 和对象字节保持一致 | 销卷恢复 + SHA-256 |

## 3. 候选迁移阶段

以下阶段是评审顺序，不是已批准实施计划。

### Stage 0：冻结旧 fixture

- 从真实但脱敏的当前数据库导出 page citation、已删除源 citation 和 citation -> note fixture。
- 保存当前 API、SSE、数据库行和 Viewer 跳转证据。
- 固定 Alembic head、备份格式和应用镜像版本。

### Stage 1：增加候选存储

- 只在 RFC 批准后添加 locator discriminator/version 和 PDF region 存储。
- 新字段或子表必须有数据库约束，不能以“先放任意 JSON”代替合同。
- 现有 `page_number_snapshot` 在迁移期间继续作为旧语义真相源，除非另有明确裁决。

### Stage 2：机械回填旧记录

- 每条旧 citation 只能映射为 `pdf_page(pageNumber=page_number_snapshot)`。
- 禁止从 chunk 文本、OCR block 或当前 parser 结果猜测历史 bbox。
- NoteSource 必须从其自身快照机械回填，不能重新读取当前 Citation 覆盖历史来源。
- 回填前后记录数、Workspace 归属、页码、标题、摘要和 source order 必须逐行比较。

### Stage 3：双读验证

- 使用同一 fixture 分别从旧字段和候选 locator 生成响应，仅比较必须保持的不变量。
- 不在生产业务逻辑中引入无期限 fallback chain。
- 只有旧/新结果对照通过后，才能请求切换读路径批准。

### Stage 4：写路径与 API 切换

- 需要单独的 API 版本和前后端类型评审。
- 新生成 citation 可以写 `pdf_page` 或 `pdf_region`；旧客户端行为必须明确。
- Citation -> Note 必须复制 locator 快照，不能只保存关联 ID。
- 切换必须有可执行回滚点和数据库备份。

### Stage 5：删除旧字段

本阶段不预设删除旧页码字段。只有所有历史数据、客户端和备份恢复都完成迁移，并再次获得明确批准，才讨论删除。

## 4. 回滚要求

### DDL 回滚

- 新增表/列的 downgrade 只能删除可证明未成为唯一真相源的数据。
- 一旦新区域 citation 在生产创建，直接 downgrade 会丢失区域语义；必须先导出或机械降为页码级快照，并明确这是信息损失。

### 应用回滚

- 回滚版本必须能读取迁移窗口内所有已提交记录。
- 如果旧应用不能理解新 locator，不能仅依赖部署回滚；需要先停止新写入并执行受控数据转换。
- 不提供静默忽略 `pdf_region` 的 fallback。

### 失败恢复

- 回填必须分批、可重复、带稳定游标和计数，不通过“第一个可用字段”猜含义。
- 单批失败不得留下部分更新；使用事务并记录平面日志 `evidence_backfill batch=... status=...`。
- PostgreSQL 与 MinIO/派生表示若同时变化，必须建立停写窗口或版本切换协议，不能假设跨存储事务。

## 5. API 与客户端影响

正式设计至少要回答：

- 新 Citation 是替换当前对象还是引入新版本 endpoint/event。
- `pageNumber` 是否继续作为 `pdf_page/pdf_region` 的公共快速字段。
- Web 端 discriminated union 如何禁止未知 kind 被猜测渲染。
- 历史 Chat、SSE、note list 和 note create 的旧/新 payload 如何演进。
- Viewer 源已删除、region 几何不匹配或 parser version 缺失时展示什么状态。

当前与候选 payload 位于 `docs/fixtures/evidence-contract/`，候选文件仅用于设计对照。

## 6. 删除与重索引影响

- 删除原 PDF 后 locator 快照仍保留，但无法再执行视觉高亮；历史界面显示来源已删除，仍展示标题、页码、excerpt 和区域摘要。
- 重索引不得更新历史 locator、excerpt 或 representation/parser version 快照。
- 如果源文件不变但 parser 输出变化，新 ContentUnit 可以替换，旧 citation 仍按生成时快照解释。
- 如果源文件内容变化，应创建新资产版本或新文档，不原位复用旧 locator 身份。

## 7. 备份恢复影响

合同实施后必须扩展阶段 9 恢复 oracle：

- locator 主记录和 PDF regions 数量、顺序、坐标及版本逐行一致。
- Citation 与 NoteSource 的 locator 快照一致。
- 原 PDF 和必要的版本化 Representation 对象字节一致。
- 恢复后 Viewer 在相同 PDF fixture、相同 viewport 下高亮同一区域。
- 旧 page citation 和新 region citation 都能历史回放。

备份格式变更需要提高 format version；旧 restore 脚本不得接受未知格式。

## 8. 实施审批包

请求代码实施批准时必须同时提交：

1. 最终 RFC 决策和 ADR。
2. Alembic upgrade/downgrade 草案与数据回填算法。
3. 当前/候选 API 与 SSE fixture。
4. 历史、删除、重索引、坐标和 Viewer 验收矩阵。
5. 备份恢复变化和破坏性回滚说明。
6. 单元、集成、Playwright 和销卷恢复命令。

缺少任一项时，只能继续设计，不能修改持久化或保存合同。
