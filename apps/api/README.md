# API App

FastAPI 业务后端入口。

当前状态：
- 已初始化基础工程
- 提供 `/health`、`/v1/auth/*`、`/v1/workspaces*` 最小链路
- 数据库结构现在通过显式版本步骤管理，不再依赖应用启动时自动建表

## 本地常用命令

初始化或升级本地数据库结构：

```bash
cd apps/api
uv run alembic upgrade head
```

如果你的本地库是在接入数据库版本步骤之前就已经用旧方式自动建好的，而且当前表结构已经与代码一致，可以只打版本标记而不重建表：

```bash
cd apps/api
uv run alembic stamp head
```

新增下一版数据库结构变更草稿：

```bash
cd apps/api
uv run alembic revision --autogenerate -m "描述这次改表做了什么"
```

运行后端测试：

```bash
cd /home/cc/code/ai-pdf-workspace
uv run --project apps/api pytest apps/api/tests
```
