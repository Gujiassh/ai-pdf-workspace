# Web App (AI PDF Workspace 前端交互原型)

本模块是基于 Next.js App Router 构建的高阶 PDF 研究协同工作台前端应用。

## 1. 当前实施状态 (Current Implementation State)

目前核心数据链路已接通：`workspace`、`documents`、Chat thread/message/citation、notes、tags 及其 BFF/API 均已接入真实数据；旧 mock 数据流不再作为兼容目标继续维护。

* **已落地功能 (Implemented)**：
  * **工作区大盘门户 (`/`)**：100% 宽度极简 SaaS 表格行布局，支持开发模式下的显式注册、显式登录与工作区隔离删除。
  * **三栏分屏控制台 (`/workspaces/[workspaceId]`)**：嵌入式分屏协同工作台，中栏 PDF 浏览器与右侧 Copilot 多面板联动。
  * **原始 PDF 阅读**：通过受权限保护的文件流读取源 PDF，PDF.js canvas 保留图片与排版；原生文本 PDF 叠加 text layer，PDF 内置链接/批注使用 annotation layer。
  * **物理解耦组件群**：
    * `OutlineTree`：树形大纲折叠导航。
    * `SelectionPopover`：精确定位划词 AI 问答/记录笔记浮层。
    * `ChatBubble`：AI 对话气泡与内嵌随手记编辑器。
    * `CreateWorkspaceDialog`：工作区创建 Modal 对话框。
  * **真实知识沉淀**：Notes 使用真实 CRUD、来源快照和 workspace 隔离；Tags 使用真实 CRUD，并支持 document/note 多对多绑定与筛选。
  * **多语言与暗黑模式**：内嵌统一的 `i18n-context` 与 `theme-context`。
  * **响应式定位抽屉**：手机/平板等宽幅下自动绝对化浮动（`absolute z-40`）并带有遮罩蒙层。
* **规划目标态 (Target to Implement)**：
  * 后续按部署、日志与观测切片完善运行保障。
  * 继续保持 citation -> note 的真实 `message_citations` 来源快照回归覆盖。

说明：Worker 生成的 `document_pages` / `document_chunks` / OCR 文本用于检索与 citation，不会替代 Viewer 中的原始 PDF 页面。

## 2. 运行与编译 (Development)

### 在仓库根目录运行

启动 Web 开发服务器：
```bash
pnpm dev
```

构建 Web：
```bash
pnpm build:web
```

### 在 `apps/web` 目录内单独运行

启动开发服务器：
```bash
pnpm dev
```

构建生产版本：
```bash
pnpm build
```

`predev` 和 `prebuild` 会从已安装的 `pdfjs-dist` 自动复制浏览器端 PDF.js 主文件、worker 和 annotation 图标到 `public/pdfjs/`；这些生成文件不作为源码维护。
