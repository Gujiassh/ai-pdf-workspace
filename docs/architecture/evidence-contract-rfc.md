# RFC：PDF Evidence 合同设计

## 状态

- 状态：Draft，待评审与用户明确批准
- 建立日期：2026-07-16
- 当前影响：仅设计文档，不修改数据库、API、SSE、Viewer 或保存语义

## 1. 问题

当前 citation 可以稳定回到 PDF 页码，但表格单元格、图表区域、图片和扫描文本块仍需要用户在整页中继续翻找。下一阶段需要判断是否引入区域级 Evidence，同时保持历史回答、笔记来源、删除和重索引语义稳定。

本 RFC 不把 AI PDF Workspace 一次性改造成全模态 Asset 平台。第一候选切片只讨论 PDF 内部的 `pdf_page` 与 `pdf_region`。

## 2. 当前合同基线

当前实现事实：

- `documents` 是 Workspace 下的 PDF 资产和生命周期边界。
- `document_pages` 保存 1-based 页码、提取文本和扫描页 OCR blocks。
- `document_chunks` 保存页内字符范围、索引版本和 embedding 元数据。
- `message_citations` 保存 `document_id / chunk_id / page_number_snapshot / title / excerpt / index_version`。
- `note_sources` 从真实 citation 复制 `document_id / page_number / title / excerpt` 快照。
- Chat SSE 和历史消息 API 返回当前 `Citation` 结构。
- Viewer 使用 `documentId + pageNumber` 打开原始 PDF。
- 删除文档可以清理原文件、页面和 chunk，但历史 citation/note source 快照仍可读。

这些合同在本 RFC 获批并形成迁移方案前保持冻结。

## 3. 不可破坏的不变量

任何后续方案必须证明：

1. Workspace 隔离不变，不能跨 Workspace 解析或跳转 locator。
2. 已保存的历史 citation 在重索引、parser 升级或 chunk 替换后含义不变。
3. `citationIndex` 仍按单条 assistant message 从 0 开始，正文 `[n]` 映射不变。
4. citation 转 note 仍只接受当前 Workspace 的真实 citation，并复制不可变来源快照。
5. 文档删除后，历史回答和 note source 仍可显示标题、摘要和定位快照；源文件不可用时 Viewer 明确显示源已删除。
6. 重索引只替换可重建投影，不能原位改写已保存 Evidence 的含义。
7. 运行时缩放、滚动、焦点和面板状态不进入持久化 locator。
8. 聚合、数量和分布问题走结构化分析路径，不能让 LLM 根据少量召回结果猜总量。

## 4. 目标职责边界

以下是目标职责，不是已批准的表结构：

- `Asset`：Workspace 归属、权限、生命周期、源对象身份和类型。
- `Representation`：原 PDF、OCR、页面布局、表格结构、caption 等版本化派生物。
- `ContentUnit`：段落、区域、表格或图像等可寻址的检索/分析单元。
- `Embedding`：ContentUnit 的可重建索引投影，可存在多个 provider/model/version。
- `EvidenceLocator`：带 discriminator 和版本的稳定源定位值。
- `Citation`：回答生成时冻结 locator、展示快照和索引语义的证据记录。

当前 `Document/Page/Chunk` 不在第一步直接重命名或迁移为通用 Asset 模型。

## 5. Locator 提案

### 5.1 `pdf_page`

```json
{
  "kind": "pdf_page",
  "version": 1,
  "pageNumber": 8
}
```

规则：

- `pageNumber` 从 1 开始。
- 它表达整页证据，语义等同当前 `pageNumber` citation。
- 旧 citation 迁移时只能机械映射为 `pdf_page`，不能推断不存在的区域。

### 5.2 `pdf_region`

```json
{
  "kind": "pdf_region",
  "version": 1,
  "pageNumber": 8,
  "coordinateSpace": "pdf_crop_box_normalized_top_left_v1",
  "pageGeometry": {
    "cropBoxPoints": [0, 0, 612, 792],
    "rotationDegrees": 0,
    "displayWidthPoints": 612,
    "displayHeightPoints": 792
  },
  "regions": [
    { "x": 0.12, "y": 0.31, "width": 0.48, "height": 0.08 }
  ]
}
```

提议规则：

- 坐标相对应用页面旋转后的 CropBox 显示空间归一化，原点在左上角，x 向右、y 向下。
- `x/y/width/height` 范围为 `0..1`，且区域必须落在页面内。
- `pageGeometry` 是生成 citation 时的快照，用于检查 parser/Viewer 对同一页的几何解释是否一致。
- v1 的多个 `regions` 必须位于同一页，按阅读顺序排列，语义是共同支持同一条 citation 的区域集合。
- 跨页证据使用多条 citation，不在一个 locator 中混合多个页。
- 现有 OCR block 坐标同样是左上角归一化坐标，但不能直接假设与本提案等价；必须用真实旋转页、CropBox 和扫描 PDF fixture 验证后再决定转换规则。

## 6. Citation 快照提案

区域级 citation 仍需要保留：

- citation ID、message ID 和 `citationIndex`
- Workspace 和源资产关联
- locator kind/version 与完整定位快照
- document title 和 excerpt 快照
- 生成时使用的 representation/parser/index 版本
- 可选 ContentUnit 关联；关联失效不能让历史 citation 无法显示

`NoteSource` 应复制 locator 和展示快照，而不是只保留对 citation 的外键。具体列和 API 字段尚未批准。

## 7. 持久化选项

### 选项 A：PDF 专用类型表，推荐进入详细设计

- 保留 citation 主表。
- 页码仍是显式快照字段。
- 区域存入按 citation 排序的 PDF region 子表，字段可约束和查询。
- 后续音频/视频使用独立 locator 子表，不把所有模态塞进任意 JSON。

优点：PDF v1 约束清楚，数据库可验证，历史迁移可机械证明。缺点：每种新 locator 需要独立 schema 和迁移。

### 选项 B：带 discriminator 的通用 JSONB locator

- citation 保存 `locator_kind / locator_version / locator_payload`。
- 应用层使用 discriminated schema 校验 payload。

优点：扩展快。缺点：数据库约束弱，容易把模态业务规则堆进共享代码；当前不推荐直接采用。

### 选项 C：立即迁移完整 Asset/Representation/ContentUnit 模型

当前不推荐。它同时改变资产生命周期、解析版本、检索单元和 citation，超出首个 PDF 区域切片的必要范围。

## 8. API 演进要求

正式实施前必须提供：

- 当前 Citation/NoteSource payload 与候选新 payload 的并列 fixture。
- Chat 历史、Chat SSE、citation 点击和 note source 的版本策略。
- 旧客户端遇到 `pdf_region` 时的明确行为；不能静默丢区域或猜字段。
- OpenAPI schema 和前后端 discriminated union 类型。
- 删除源文件、缺失 ContentUnit、parser 升级和重索引后的回放结果。

本 RFC 不批准增加字段，也不批准兼容层。API 方案需要单独评审。

当前与候选 payload 对照位于 `docs/fixtures/evidence-contract/`。文件名含 `.draft` 且 payload 包含 `contractStatus=draft-not-approved` 的 fixture 只用于评审，不能作为生成代码、迁移或运行时校验的输入。

迁移、回滚、历史回放、删除/重索引和备份恢复影响见 `docs/architecture/evidence-migration-impact.md`。该文档同样是 Draft，不构成实施授权。

## 9. 评测与运行证据

合同实施至少需要以下 fixture：

- 无旋转、90/180/270 度旋转 PDF 页面。
- MediaBox 与 CropBox 不同的页面。
- 原生文本 PDF、扫描 PDF、表格、图表和多区域证据。
- 旧 `pageNumber` citation 与 note source 回放。
- 源文档删除、重索引和 parser 版本升级。
- 桌面与移动 Viewer 在不同缩放下的同一区域高亮像素对比。
- 备份后销卷恢复，locator 和历史来源快照保持一致。

## 10. 待批准决策

进入任何代码或 migration 前，需要用户明确批准：

1. 是否确认 `pdf_page/pdf_region` 是第一批 locator，独立图片/音频/视频继续不进入。
2. 是否采用 `pdf_crop_box_normalized_top_left_v1` 坐标定义。
3. 多区域是否限制为同页、有序、联合支持语义。
4. 是否以 PDF 专用类型表作为第一实现方向。
5. Citation 和 NoteSource API 是否引入新版本，旧 payload 如何终止或迁移。
6. 历史数据迁移、回滚、备份恢复和删除后的显示语义。

未完成以上批准时，本 RFC 保持 Draft，开发只允许继续用户验证、fixture 调研和方案评审。
