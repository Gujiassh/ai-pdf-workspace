# 任务状态机设计

## 1. 文档定位

这份文档定义：

- 文档入库相关状态如何流转
- `documents.status` 和 `ingestion_jobs.status` 的职责如何区分
- 初次入库、失败重试、重建索引、删除清理分别如何建模

当前范围只覆盖 `文本 PDF 主链`。

## 2. 设计目标

当前状态机设计需要满足：

1. 前端能清楚知道文档当前是否可用
2. 后端能清楚记录每一次任务的执行过程
3. 初次入库和重建索引不能混为一谈
4. 失败后能够重试
5. 删除动作能被追踪，而不是直接“消失”

## 3. 为什么需要两层状态

系统里必须同时有：

- `documents.status`
- `ingestion_jobs.status`

它们不是重复字段，而是两种不同语义。

### 3.1 `documents.status` 是什么

它代表：

- 这份文档当前对用户来说处于什么可用状态

例如：

- 还没处理完
- 已经可以检索
- 当前失败
- 正在删除

它回答的是：

- “这个文档现在能不能用？”

### 3.2 `ingestion_jobs.status` 是什么

它代表：

- 某一次具体后台任务执行到哪了

例如：

- 这次 ingest 任务是否在排队
- 这次 reindex 是否执行成功
- 这次 delete cleanup 有没有失败

它回答的是：

- “这次任务现在跑到哪了？”

### 3.3 为什么不能只靠 `documents.status`

因为文档会经历多次任务：

- 第一次入库
- 失败重试
- 后续重建索引
- 删除清理

如果只有一份文档状态，你看不到：

- 失败历史
- 任务类型
- 尝试次数
- 当时使用的处理配置

所以必须把“文档可用状态”和“任务执行状态”拆开。

## 4. `documents.status` 设计

## 4.1 状态列表

当前建议值：

- `pending_upload`
- `uploaded`
- `parsing`
- `chunking`
- `embedding`
- `ready`
- `failed`
- `deleting`
- `deleted`

## 4.2 状态含义

### `pending_upload`

含义：

- 文档记录已经创建
- 但浏览器还没完成对象存储上传

用户可见性：

- 不可检索
- 不可聊天

### `uploaded`

含义：

- 文件已经存在于对象存储
- 任务已经可以开始或已入队

用户可见性：

- 不可检索
- 可看到“处理中”

### `parsing`

含义：

- Worker 正在解析 PDF 文本

### `chunking`

含义：

- Worker 正在根据页面文本生成 chunk

### `embedding`

含义：

- Worker 正在调用 embedding provider 并写入向量

### `ready`

含义：

- 文档当前在线索引已经可用
- 用户可以浏览、检索、问答引用

### `failed`

含义：

- 最近一次入库主任务失败
- 当前没有可用在线索引

### `deleting`

含义：

- 文档正在被删除清理
- 用户侧不应继续操作

### `deleted`

含义：

- 文档逻辑上已被删除
- 后续可由清理任务做最终回收

## 4.3 状态语义规则

1. `ready` 是唯一“当前可用”状态
2. `failed` 只表示当前没有可用在线索引
3. `deleting` 表示进入删除流程后，前端应把文档视为不可用
4. `deleted` 主要用于软删语义，不是前端常态展示状态

## 5. `ingestion_jobs.status` 设计

## 5.1 任务类型

当前建议：

- `ingest`
- `reindex`
- `delete_cleanup`

## 5.2 任务状态值

当前建议：

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

## 5.3 任务状态含义

### `queued`

- 已创建
- 尚未开始执行

### `running`

- Worker 已取到任务并开始执行

### `succeeded`

- 任务成功完成

### `failed`

- 任务失败
- 应附带 `error_code` 和 `error_message`

### `cancelled`

- 任务被人工或系统取消

## 6. 初次入库状态机

## 6.1 主流程

```text
pending_upload
  -> uploaded
  -> parsing
  -> chunking
  -> embedding
  -> ready
```

## 6.2 失败流

```text
parsing  -> failed
chunking -> failed
embedding -> failed
```

## 6.3 对应任务状态

初次入库时会有一个 `job_type=ingest` 的任务：

```text
queued -> running -> succeeded
```

失败时：

```text
queued -> running -> failed
```

## 6.4 关键规则

1. 初次入库过程中，`documents.status` 跟随处理阶段变化
2. 只有 `ready` 才表示这份文档可进入检索与问答
3. 一旦任务失败，`documents.status` 必须进入 `failed`
4. `documents.latest_ingestion_job_id` 应始终指向最近一次主任务

## 7. 重试状态机

## 7.1 触发条件

当文档状态为：

- `failed`

并且用户执行“重试”时：

1. 创建一个新的 `ingest` 任务
2. 增加 `attempt_count`
3. 文档重新进入处理链

## 7.2 主流程

```text
failed
  -> uploaded
  -> parsing
  -> chunking
  -> embedding
  -> ready
```

## 7.3 关键规则

1. 重试不是复活旧 job，而是新建一条 job 记录
2. 失败历史必须保留
3. 文档是否恢复可用，仍以 `documents.status=ready` 为准

## 8. 重建索引状态机

这是最容易设计错的一块。

## 8.1 为什么重建索引不能直接把文档重新置为 `parsing`

因为重建索引时，很多文档本来已经 `ready`，用户还在用它。

如果重建索引一开始就把 `documents.status` 改回 `parsing`：

- 用户会突然看见文档不可用
- 当前在线索引会被错误地当成失效
- 体验很差

## 8.2 正确设计

对于 `job_type=reindex`：

- 文档现有 `documents.status` 保持 `ready`
- 新建一条 `reindex` job
- Worker 在后台生成新的 `index_version`
- 只有新索引成功后，才切换 `documents.current_index_version`

## 8.3 主流程

```text
Document stays: ready
Reindex job: queued -> running -> succeeded
After success: switch current_index_version
```

## 8.4 失败流

```text
Document stays: ready
Reindex job: queued -> running -> failed
Current index remains unchanged
```

## 8.5 关键规则

1. 重建索引不应该让当前文档下线
2. 当前在线索引版本只有在新版本完全成功后才切换
3. reindex 失败不能把现有 ready 文档误标成 failed

## 9. 删除状态机

## 9.1 为什么删除不是同步动作

删除文档不只是删一行 `documents` 记录。

还涉及：

- page/chunk 数据清理
- citation 关系保留策略
- 对象存储文件删除
- 失败补偿

所以删除必须建成异步动作。

## 9.2 主流程

```text
documents.status: ready|failed -> deleting -> deleted
job_type=delete_cleanup: queued -> running -> succeeded
```

## 9.3 关键规则

1. 一旦进入 `deleting`，前端应把该文档视为不可操作
2. 清理过程中失败时，删除任务进入 `failed`
3. 文档主记录是否立即隐藏，由前端列表策略决定，但业务上不应继续让它参与检索

## 10. 前端如何消费这些状态

## 10.1 文档列表

前端主要看：

- `documents.status`
- `last_error_message`

用于展示：

- 正在上传
- 正在解析
- 正在切块
- 正在向量化
- 可用
- 失败
- 正在删除

## 10.2 Job 详情 / 轮询

前端在需要展示详细进度时，再查：

- `GET /jobs/:jobId`

主要看：

- `job_type`
- `status`
- `attempt_count`
- `error_code`
- `error_message`

## 10.3 为什么前端不应该只轮询 job

因为用户列表层最关心的是：

- 这份文档现在能不能用

这是 `documents.status` 的职责，不是 `jobs.status` 的职责。

## 11. 关键异常场景

### 场景 1：上传会话创建成功，但浏览器没真正上传文件

处理：

- 文档停留在 `pending_upload`
- 不创建 ingest job
- 可由前端超时清理或用户重新发起上传

### 场景 2：对象存储上传成功，但 finalize 失败

处理：

- 文档停留在 `pending_upload` 或由服务端修正为失败前状态
- 不进入处理链
- 前端应允许再次 finalize 或重传

### 场景 3：embedding 失败

处理：

- 文档进入 `failed`
- job 进入 `failed`
- 保留错误原因，允许 retry

### 场景 4：reindex 失败

处理：

- 现有文档仍保持 `ready`
- 旧索引继续服务
- 只有 reindex job 失败

### 场景 5：删除时对象存储清理失败

处理：

- delete_cleanup job 标记 `failed`
- 文档保持 `deleting` 或进入明确的恢复策略
- 不应让它重新回到可检索状态

## 12. 当前状态机边界

这份状态机设计当前不覆盖：

- OCR 流程状态
- 多模态页面理解状态
- 批量导入多个文档的聚合状态
- 多 worker 竞争同一文档的并发控制细节

这些可以在后续扩展时单独加层，不应该现在压进主线。
