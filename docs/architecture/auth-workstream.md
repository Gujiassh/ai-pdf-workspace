# 认证工作流任务清单

## 1. 目标

本工作流负责把当前 `mock 登录 + 本地工作区沙盒` 逐步替换为更接近真实系统边界的认证链。

当前按模块推进，避免一次把登录、数据库、membership、BFF 全部卷在一起。

## 2. 模块拆分

### 模块 1：开发模式最小登录/注册

目标：

- 支持显式注册
- 支持显式登录
- 支持本地 session 持久化
- 登录不自动注册

边界：

- 实现真实 FastAPI 注册/登录接口
- 通过 Next.js BFF 接入登录、注册、登出、session cookie
- 不做 workspace membership
- 不做页面级权限守卫

完成标准：

- 用户未注册时不能登录
- 用户可手动注册新账号
- 注册成功后不会自动登录
- 用户登录后 BFF 通过 httpOnly cookie 保存 7 天 session
- 用户刷新页面后仍能保持登录态
- 退出登录后 session 被清理

### 模块 2：Workspace membership 真数据链

目标：

- 用真实用户上下文替换当前匿名工作区数据
- 按当前用户 membership 返回可见工作区

边界：

- 接入 `users / workspaces / workspace_memberships`
- 替换 `/api/workspaces` 和 `/v1/workspaces` 的 mock 数据

### 模块 3：真实 session / BFF 上下文

目标：

- 用正式 session 替换开发模式本地 session
- 让 BFF 带着真实用户上下文访问 FastAPI

边界：

- 接入 Auth.js 或等价方案
- 让页面与 BFF 使用统一 session 获取入口

### 模块 4：权限守卫与页面保护

目标：

- 未登录用户不能进入工作区页
- 无 membership 的用户不能访问不属于自己的 workspace

边界：

- 页面保护
- BFF 保护
- API 侧 workspace 校验

## 3. 当前执行策略

当前只执行：`模块 1：开发模式最小登录/注册`

当前状态：
- 模块 1 已完成真实后端认证接入（register/login/logout/session），并已从前端 workspace mock 状态中拆出独立 auth context
- BFF session 现已要求显式配置 `AI_PDF_SESSION_SECRET`，cookie 的 `secure` 将随 `NODE_ENV` 自动切换
- 已补 FastAPI auth 接口自动化测试：覆盖注册成功、重复注册、正确登录、错误密码四个基本行为
- Workspace membership 尚未开始
- 模块 2 及之后尚未开始
