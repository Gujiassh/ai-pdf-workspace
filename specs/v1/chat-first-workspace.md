# Chat-first 工作台重构

## 状态

- 阶段：已完成
- 决策日期：2026-07-16

## 目标

将工作区默认体验从“PDF 主视图 + 窄 Chat 侧栏”调整为“问答主画布 + 按需 PDF 证据面板”，让用户围绕多文档提问，同时保留可追溯原文核验和独立阅读能力。

## 交互模型

1. 进入已有可用文档的 Workspace 时，默认展示 Chat 主画布。
2. 点击侧栏文档或回答 citation 时，打开 PDF 证据面板并定位对应文档与页码。
3. 证据面板可关闭，也可展开为全宽阅读模式。
4. 在 PDF 中划词提问后回到 Chat 主画布，并保留选中文本上下文。
5. Notes 和 Settings 与 Chat 共用主画布标签，不长期挤占 PDF 或 Chat 空间。
6. 窄屏设备使用全屏证据层；关闭后回到原 Chat 位置和会话上下文。
7. 桌面端证据面板支持拖拽调宽、方向键微调和双击复位，并始终保留 Chat 最小工作宽度。
8. PDF 工具栏支持输入指定页码跳转；越界页码收口到首页或末页。
9. 笔记编辑在原笔记卡片位置展开，不在列表顶部新建第二个编辑表面。
10. Chat Markdown 的普通换行按语义渲染为 `<br>`，选择题题干与 A/B/C/D 选项不得粘连。
11. 笔记卡片进入编辑态后使用稳定表面，不继承浏览态整卡 hover；编辑按钮在明暗主题下保持可读对比度。

## 行为不变量

- Workspace、Document、Thread、Message、Citation、Note 和 Tag 的后端契约不变。
- citation 点击仍使用持久化的 `documentId + pageNumber` 精确定位。
- Workspace 切换、thread hydrate、消息分支和保存语义不变。
- 文档上传、失败重试、异步删除和状态轮询不变。
- 原始 PDF、文本层、OCR 选择层、annotation layer 和目录导航能力不变。

## 验收标准

- [x] 桌面端 Chat 是默认最大工作区域，回答和输入框不受窄侧栏限制。
- [x] 点击 citation 后 PDF 面板打开到正确文档和页码，Chat 上下文不丢失。
- [x] PDF 面板支持关闭和全宽阅读模式。
- [x] 从 PDF 划词提问后可回到 Chat，并保留选区上下文。
- [x] Notes、Settings、Chat 切换不影响当前文档、页码和会话。
- [x] 移动端无横向溢出，Chat 与证据页可以稳定往返。
- [x] 桌面端证据面板可在安全范围内调宽，Chat 不被压缩到不可用宽度。
- [x] PDF 可输入指定页码并完成页面重绘。
- [x] 笔记编辑表单原位替换目标笔记卡片，取消后恢复原卡片。
- [x] 单行 Markdown 软换行输出 `<br>`，题干与 A 选项分行。
- [x] 笔记编辑态的卡片与操作按钮在明暗主题 hover 下保持清晰对比。
- [x] Web 单测、TypeScript、ESLint、build 和 Playwright 桌面/移动 smoke 通过。

## 验证记录

- Web：46 项单测通过，TypeScript、ESLint、production build、`git diff --check` 通过。
- 桌面端：`1440x960` 默认 Chat 主画布无溢出；citation 点击打开 Shape Up 第 `125/133` 页，分栏状态下 Chat 约 `653px`、证据面板约 `490px`；阅读模式全屏正常。
- 移动端：`390x844` 下 Chat 和证据面板宽度均为 `390px`，页面 `scrollWidth=390`；PDF canvas 为 `293x379`，像素采样确认非空。
- 截图：`/home/cc/.local/state/playwright-system/artifacts/ai-pdf-workspace-chat-first-desktop.png`、`/home/cc/.local/state/playwright-system/artifacts/ai-pdf-workspace-citation-evidence-desktop.png`、`/home/cc/.local/state/playwright-system/artifacts/ai-pdf-workspace-reader-mode-desktop.png`、`/home/cc/tmp/playwright/ai-pdf-chat-first-mobile.png`、`/home/cc/tmp/playwright/ai-pdf-evidence-mobile.png`。
- 交互补充：`222.txt` 对应选择题题干后生成 `<br>`；笔记编辑 form 位于原 `data-note-card`；证据面板由 `500px` 调至约 `628px` 时 Chat 保留约 `524px`；页码输入 `5` 后 PDF 显示第 `5/133` 页。截图见 `/home/cc/.local/state/playwright-system/artifacts/ai-pdf-note-inline-edit.png` 与 `/home/cc/.local/state/playwright-system/artifacts/ai-pdf-resize-page-jump.png`。
