# Web App (AI PDF Workspace 前端交互原型)

本模块是基于 Next.js App Router 构建的高阶 PDF 研究协同工作台前端应用。

## 1. 当前实施状态 (Current Implementation State)

目前处于 **“高仿真前端交互原型”** 阶段，主要交互流程与本地沙盒状态机已 100% 跑通。

* **已落地功能 (Implemented)**：
  * **工作区大盘门户 (`/`)**：100% 宽度极简 SaaS 表格行布局，支持开发模式下的显式注册、显式登录与工作区隔离删除。
  * **三栏分屏控制台 (`/workspaces/[workspaceId]`)**：嵌入式分屏协同工作台，中栏 PDF 浏览器与右侧 Copilot 多面板联动。
  * **物理解耦组件群**：
    * `OutlineTree`：树形大纲折叠导航。
    * `SelectionPopover`：精确定位划词 AI 问答/记录笔记浮层。
    * `ChatBubble`：AI 对话气泡与内嵌随手记编辑器。
    * `CreateWorkspaceDialog`：工作区创建 Modal 对话框。
  * **本地沙盒持久化**：使用 LocalStorage 序列化并同步本地账号注册表、用户 session、工作区、文档上传列表、历史会话以及自定义标签等，并附加 Zod-like 数据结构校验以防止 undefined 崩溃。
  * **多语言与暗黑模式**：内嵌统一的 `i18n-context` 与 `theme-context`。
  * **响应式定位抽屉**：手机/平板等宽幅下自动绝对化浮动（`absolute z-40`）并带有遮罩蒙层。
* **规划目标态 (Target to Implement)**：
  * 待通过 `React Query` 将当前 LocalStorage mock 沙盒的数据读写全面对接至底层 FastAPI 真实 BFF 接口。
  * 将 mock PDF 文本数据源替换为基于真实的 PDF 解析服务。

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
