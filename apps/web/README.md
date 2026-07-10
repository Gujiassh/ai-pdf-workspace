# Web App (AI PDF Workspace 前端交互原型)

本模块是基于 Next.js App Router 构建的高阶 PDF 研究协同工作台前端应用。

## 1. 当前实施状态 (Current Implementation State)

目前处于 **“真实链路逐段替换 UI 壳”** 阶段：页面外观与交互原型已跑通，`workspace` 与 `documents` 的核心真实链路也已接入；未接真的部分仍可保留 UI 壳，但旧 mock 数据流不再作为兼容目标继续维护。

* **已落地功能 (Implemented)**：
  * **工作区大盘门户 (`/`)**：100% 宽度极简 SaaS 表格行布局，支持开发模式下的显式注册、显式登录与工作区隔离删除。
  * **三栏分屏控制台 (`/workspaces/[workspaceId]`)**：嵌入式分屏协同工作台，中栏 PDF 浏览器与右侧 Copilot 多面板联动。
  * **物理解耦组件群**：
    * `OutlineTree`：树形大纲折叠导航。
    * `SelectionPopover`：精确定位划词 AI 问答/记录笔记浮层。
    * `ChatBubble`：AI 对话气泡与内嵌随手记编辑器。
    * `CreateWorkspaceDialog`：工作区创建 Modal 对话框。
  * **原型期本地沙盒遗留**：部分尚未接真的页面仍临时使用 LocalStorage 挂住 UI 壳；这些本地状态只作为短期过渡，不再作为长期逻辑或兼容层继续扩展。
  * **多语言与暗黑模式**：内嵌统一的 `i18n-context` 与 `theme-context`。
  * **响应式定位抽屉**：手机/平板等宽幅下自动绝对化浮动（`absolute z-40`）并带有遮罩蒙层。
* **规划目标态 (Target to Implement)**：
  * 按垂直切片继续把真实链路接入 `React Query` / 正式状态层，并在接通后删除对应 mock 数据流。
  * 将当前 mock PDF 文本数据源替换为基于真实解析结果的 Viewer / Chat / Notes 数据链。

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
