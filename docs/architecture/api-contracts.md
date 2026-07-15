# API 契约设计

## 1. 文档定位

这份文档定义：

- 浏览器与 Next.js BFF 之间的接口契约
- Next.js BFF 与 FastAPI 之间的业务接口契约
- 各类接口的请求/响应语义
- 哪些接口是同步读写，哪些接口是异步任务触发，哪些接口是流式接口

当前范围覆盖 `原始 PDF 阅读 + 文本检索主链`：原始 PDF 通过文件流接口供 Viewer 阅读，扫描 PDF 的 OCR 结果通过页面详情返回为坐标化可选文本块，供 Viewer 叠加透明选区层。

不覆盖：

- 独立 OCR 识别接口 / 多模态页面理解接口
- 图表 / 图片理解接口
- 后台管理接口

## 2. 设计目标

当前 API 契约需要满足：

1. 浏览器只接触 Next.js BFF
2. FastAPI 不直接暴露给浏览器
3. Workspace 权限上下文不能由浏览器自报自填
4. 文件上传链要区分“上传文件”和“开始入库”
5. Chat 接口要支持流式回答和 citation 持久化
6. 异步任务必须显式返回 `job`，不能伪装成同步成功

## 3. 设计原则

### 3.1 双层接口面

系统有两个接口面：

#### 面 A：浏览器可见接口

由 `Next.js BFF` 暴露，路径建议统一为：

- `/api/...`

浏览器永远只打这一层。

#### 面 B：内部业务接口

由 `FastAPI` 暴露，仅供 BFF 调用，路径建议统一为：

- `/v1/...`

浏览器不能直接访问这一层。

### 3.2 资源路径按业务组织

接口路径按资源组织，不按技术动作组织。

推荐：

- `/workspaces/:workspaceId/documents`
- `/workspaces/:workspaceId/threads/:threadId/messages`

不推荐：

- `/uploadPdfAndParse`
- `/searchEverything`

### 3.3 身份字段不从浏览器 body 传入

以下字段不允许由浏览器 body 自传：

- `user_id`
- `role`

`workspaceId` 可以出现在 URL path 中，但最终是否可信，要由 BFF 和 FastAPI 根据已认证上下文校验。

### 3.4 异步任务必须显式建模

以下接口属于异步任务触发型接口：

- finalize upload
- retry ingest
- reindex document
- delete document cleanup

它们的响应必须包含：

- `jobId`
- `status`
- 相关资源 id

### 3.5 流式接口单独处理

Chat 不用普通 JSON 完整返回。

它是：

- 输入：一个问题 + 可选 thread 上下文
- 输出：一个流式回答
- 结束后持久化 messages 和 citations

## 4. 通用约定

## 4.1 资源标识

所有核心资源都使用 `uuid` 作为主标识：

- `workspaceId`
- `documentId`
- `jobId`
- `threadId`
- `messageId`
- `noteId`
- `tagId`
- `promptVersionId`

## 4.2 时间字段

所有时间字段统一使用 ISO 8601 字符串，例如：

- `2026-07-07T12:00:00Z`

## 4.3 错误返回格式

统一错误格式：

```json
{
  "error": {
    "code": "workspace_forbidden",
    "message": "You do not have access to this workspace.",
    "details": null
  }
}
```

说明：

- `code` 是程序判断字段
- `message` 是可展示文案
- `details` 可选，默认给调试信息或字段错误信息

## 4.4 列表返回格式

列表接口统一返回：

```json
{
  "items": [],
  "nextCursor": null
}
```

当前 V1 即使先不做真正 cursor 翻页，也保留这个外形，避免以后接口形状变动太大。

## 4.5 命令型接口返回格式

命令型接口默认返回“结果资源”或“动作结果”，而不是只返回 `success: true`。

例如创建 note 时，返回：

```json
{
  "note": {
    "id": "...",
    "workspaceId": "...",
    "title": "...",
    "bodyMd": "...",
    "createdAt": "..."
  }
}
```

原因：

- 前端通常创建完就要刷新或插入列表
- 只返回 `success` 会迫使前端多查一次

## 5. 核心资源结构

## 5.1 WorkspaceSummary

```json
{
  "id": "ws_xxx",
  "name": "论文阅读",
  "description": "可选描述",
  "role": "owner",
  "documentCount": 12,
  "noteCount": 18,
  "threadCount": 6,
  "createdAt": "2026-07-07T12:00:00Z",
  "updatedAt": "2026-07-07T12:00:00Z"
}
```

## 5.2 DocumentSummary

```json
{
  "id": "doc_xxx",
  "workspaceId": "ws_xxx",
  "title": "Attention Is All You Need",
  "sourceFilename": "attention.pdf",
  "pageCount": 15,
  "status": "ready",
  "currentIndexVersion": 1,
  "lastErrorCode": null,
  "lastErrorMessage": null,
  "createdAt": "2026-07-07T12:00:00Z",
  "updatedAt": "2026-07-07T12:00:00Z"
}
```

## 5.3 JobStatus

允许的 `jobType` 值：

- `ingest`
- `embed_chunks`
- `delete_cleanup`

允许的 `status` 值：

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

```json
{
  "id": "job_xxx",
  "workspaceId": "ws_xxx",
  "documentId": "doc_xxx",
  "jobType": "ingest",
  "status": "running",
  "attemptCount": 1,
  "queuedAt": "2026-07-07T12:00:00Z",
  "startedAt": "2026-07-07T12:00:05Z",
  "finishedAt": null,
  "errorCode": null,
  "errorMessage": null
}
```

## 5.4 ThreadSummary

```json
{
  "id": "thread_xxx",
  "workspaceId": "ws_xxx",
  "title": "论文方法总结",
  "lastMessageAt": "2026-07-07T12:00:00Z",
  "createdAt": "2026-07-07T12:00:00Z"
}
```

## 5.5 Message

```json
{
  "id": "msg_xxx",
  "workspaceId": "ws_xxx",
  "threadId": "thread_xxx",
  "parentMessageId": "msg_parent_xxx",
  "role": "assistant",
  "content": "这是回答正文",
  "status": "completed",
  "modelProvider": "openai",
  "modelName": "gpt-5.5",
  "createdAt": "2026-07-07T12:00:00Z"
}
```

## 5.6 Citation

`Citation` 是从 `message_citations` 读取的稳定显示结构。

这里的 `documentTitle`、`pageNumber`、`excerpt` 应视为服务端保存的快照字段，不要求前端在展示时再次回查 chunk 才能显示。

```json
{
  "id": "cit_xxx",
  "messageId": "msg_xxx",
  "citationIndex": 0,
  "documentId": "doc_xxx",
  "documentTitle": "Attention Is All You Need",
  "pageNumber": 8,
  "chunkId": "chunk_xxx",
  "excerpt": "We propose a new simple network architecture..."
}
```

## 5.7 Note

```json
{
  "id": "note_xxx",
  "workspaceId": "ws_xxx",
  "title": "方法总结",
  "bodyMd": "这是我的笔记",
  "isPinned": false,
  "createdAt": "2026-07-07T12:00:00Z",
  "updatedAt": "2026-07-07T12:00:00Z",
  "sources": [],
  "tagIds": [],
  "tags": []
}
```

## 5.8 NoteSource

`NoteSource` 用来暴露已持久化的来源快照，而不是只暴露运行时 citation 引用。

```json
{
  "id": "ns_xxx",
  "messageCitationId": "cit_xxx",
  "documentId": "doc_xxx",
  "documentTitle": "Attention Is All You Need",
  "pageNumber": 8,
  "excerpt": "We propose a new simple network architecture...",
  "createdAt": "2026-07-07T12:00:00Z"
}
```

## 5.9 Tag

```json
{
  "id": "tag_xxx",
  "workspaceId": "ws_xxx",
  "name": "重点",
  "slug": "important",
  "color": "#f97316",
  "createdAt": "2026-07-07T12:00:00Z",
  "documentIds": [],
  "noteIds": []
}
```

## 6. 浏览器可见接口（BFF）

## 6.1 Workspace

### `GET /api/workspaces`

作用：

- 获取当前用户可见的 Workspace 列表

返回：

```json
{
  "items": ["WorkspaceSummary"],
  "nextCursor": null
}
```

### `POST /api/workspaces`

作用：

- 创建 Workspace

请求体：

```json
{
  "name": "论文阅读",
  "description": "可选描述"
}
```

返回：

```json
{
  "workspace": "WorkspaceSummary"
}
```

### `GET /api/workspaces/:workspaceId`

作用：

- 获取某个 Workspace 的概览数据

返回：

```json
{
  "workspace": "WorkspaceSummary"
}
```

### `PATCH /api/workspaces/:workspaceId`

作用：

- 更新 Workspace 名称或描述

请求体：

```json
{
  "name": "新名称",
  "description": "新描述"
}
```

## 6.2 Prompt

### `GET /api/workspaces/:workspaceId/prompt`

作用：

- 获取当前生效的 Prompt 版本

返回：

```json
{
  "promptVersion": {
    "id": "pv_xxx",
    "workspaceId": "ws_xxx",
    "versionNo": 3,
    "systemPrompt": "...",
    "answerStyle": {}
  }
}
```

### `POST /api/workspaces/:workspaceId/prompt`

作用：

- 创建一个新的 Prompt 版本并设为当前版本

请求体：

```json
{
  "systemPrompt": "...",
  "answerStyle": {}
}
```

返回：

```json
{
  "promptVersion": {
    "id": "pv_xxx",
    "workspaceId": "ws_xxx",
    "versionNo": 4,
    "systemPrompt": "...",
    "answerStyle": {}
  }
}
```

## 6.3 Document

### `GET /api/workspaces/:workspaceId/documents`

作用：

- 获取文档列表

返回：

```json
{
  "items": ["DocumentSummary"],
  "nextCursor": null
}
```

### `POST /api/workspaces/:workspaceId/documents/upload-session`

作用：

- 创建文档记录和对象存储上传会话

请求体：

```json
{
  "sourceFilename": "attention.pdf",
  "mimeType": "application/pdf",
  "byteSize": 1234567,
  "title": "Attention Is All You Need"
}
```

返回：

```json
{
  "document": {
    "id": "doc_xxx",
    "workspaceId": "ws_xxx",
    "title": "Attention Is All You Need",
    "status": "pending_upload"
  },
  "upload": {
    "method": "PUT",
    "url": "https://...",
    "objectKey": "workspaces/ws_xxx/documents/doc_xxx/original.pdf",
    "headers": {
      "Content-Type": "application/pdf"
    }
  }
}
```

说明：

- 这个接口只负责创建上传会话，不开始索引

### `POST /api/workspaces/:workspaceId/documents/:documentId/finalize-upload`

作用：

- 确认对象存储中已有文件，并触发入库任务

请求体：

```json
{
  "objectKey": "workspaces/ws_xxx/documents/doc_xxx/original.pdf"
}
```

返回：

```json
{
  "document": {
    "id": "doc_xxx",
    "workspaceId": "ws_xxx",
    "status": "uploaded"
  },
  "job": "JobStatus"
}
```

### `GET /api/workspaces/:workspaceId/documents/:documentId?pageNumber=8`

作用：

- 获取文档摘要和指定页文本
- `pageNumber` 从 1 开始，默认读取第 1 页
- 只返回请求页，避免一次返回整份 PDF 的全部正文

返回：

```json
{
  "document": "DocumentSummary",
  "pages": [
    {
      "pageNumber": 1,
      "text": "这一页已提取的文本",
      "charCount": 12,
      "ocrBlocks": [
        {
          "text": "这一页已提取的文本",
          "x": 0.08,
          "y": 0.12,
          "width": 0.56,
          "height": 0.06
        }
      ]
    }
  ]
}
```

`ocrBlocks` 是扫描 PDF OCR 产生的可选文本层。`x`、`y`、`width`、`height` 使用页面左上角为原点的归一化坐标，范围均为 `0..1`；原生文本 PDF 页面返回空数组，原始 PDF 文件流仍是阅读器的主视觉来源。

### `GET /api/workspaces/:workspaceId/documents/:documentId/file`

作用：

- 返回当前用户有权访问的原始 PDF 文件流
- 供浏览器端 PDF.js 渲染原始页面、图片、排版和 PDF 内置链接

返回：

- 二进制 PDF，不是 JSON
- `Content-Type: application/pdf`
- `Content-Disposition: inline`，浏览器内嵌打开

说明：

- 这个接口返回的是对象存储中的源文件，不返回 `document_pages` 的 OCR/提取文本
- PDF.js 的 canvas 是页面主视觉结果；原生文本 PDF 额外渲染 text layer，PDF 内置链接/批注额外渲染 annotation layer
- `document_pages`、`document_chunks` 仍由详情和后续检索接口读取，不能反向替代源 PDF 阅读

### `DELETE /api/workspaces/:workspaceId/documents/:documentId`

作用：

- 发起删除文档动作

返回：

```json
{
  "document": {
    "id": "doc_xxx",
    "workspaceId": "ws_xxx",
    "status": "deleting"
  },
  "job": "JobStatus"
}
```

说明：

- 删除不是纯同步动作，因为需要清理 chunk 和对象存储文件

### `POST /api/workspaces/:workspaceId/documents/:documentId/retry`

作用：

- 对失败文档重新发起入库

返回：

```json
{
  "document": {
    "id": "doc_xxx",
    "workspaceId": "ws_xxx",
    "status": "uploaded"
  },
  "job": "JobStatus"
}
```

### `POST /api/workspaces/:workspaceId/documents/:documentId/reindex`

作用：

- 对当前文档发起重建索引

返回：

```json
{
  "document": {
    "id": "doc_xxx",
    "workspaceId": "ws_xxx",
    "status": "ready",
    "currentIndexVersion": 1
  },
  "job": {
    "id": "job_xxx",
    "jobType": "embed_chunks",
    "status": "queued"
  }
}
```

说明：

- 重建索引排队时，现有 `ready` 文档保持可用；Worker 开始运行后文档进入 `embedding`，当前 V1 不维护 shadow 向量，检索会暂时等待任务完成
- 当前 V1 的 `embed_chunks` 在现有 `currentIndexVersion` 上事务性替换向量；新版本并行索引和最终切换留给后续索引版本升级

## 6.4 Jobs

### `GET /api/workspaces/:workspaceId/jobs/:jobId`

作用：

- 查询任务状态

返回：

```json
{
  "job": "JobStatus"
}
```

## 6.5 Threads / Messages

### `GET /api/workspaces/:workspaceId/threads`

作用：

- 获取当前 Workspace 的 thread 列表

### `POST /api/workspaces/:workspaceId/threads`

作用：

- 创建 thread

请求体：

```json
{
  "title": "可选标题"
}
```

### `DELETE /api/workspaces/:workspaceId/threads/:threadId`

作用：

- 归档当前 thread；历史消息保留在数据库，但不再出现在默认列表

### `GET /api/workspaces/:workspaceId/threads/:threadId/messages`

作用：

- 获取 thread 下的消息和 citations
- 默认只返回当前活动分支路径；编辑旧问题产生的新分支会替代当前展示路径，旧分支仍保留在数据库

返回：

```json
{
  "thread": "ThreadSummary",
  "messages": [
    {
      "id": "msg_xxx",
      "parentMessageId": null,
      "role": "user",
      "content": "这篇论文的核心方法是什么？",
      "citations": []
    },
    {
      "id": "msg_answer_xxx",
      "parentMessageId": "msg_xxx",
      "role": "assistant",
      "content": "这是回答正文",
      "citations": ["Citation"]
    }
  ]
}
```

## 6.6 Chat Stream

### `POST /api/workspaces/:workspaceId/chat/stream`

作用：

- 在当前 Workspace 内发问并获得流式回答

请求体：

```json
{
  "threadId": "thread_xxx",
  "question": "这篇论文的核心方法是什么？",
  "parentMessageId": "msg_previous_assistant_xxx",
  "editMessageId": null,
  "selectionText": null
}
```

行为约定：

- BFF 先校验 session 和 workspace
- 再转发到 FastAPI 的内部流式接口
- 普通追问挂在 `parentMessageId` 指向的当前答案节点下
- 传入 `editMessageId` 时，服务端以该用户问题的父节点创建新分支，不删除旧分支
- 流结束后，服务端将 assistant message 标记为 `completed` 并更新 thread 的活动叶子节点

流媒体使用 Server-Sent Events，事件格式为：

- `meta`：`threadId`、`userMessageId`、`assistantMessageId`
- `delta`：`text`，用于逐段展示已生成的回答
- `citations`：`items[]`，包含服务端保存的 citation 快照
- `done`：`threadId`、`assistantMessageId`
- `error`：`code`、`message`，生成失败时返回

消息节点和 citation 记录会在流开始前进入 `streaming` 准备状态；`delta` 来自 provider 的真实 Responses API 流，`done` 表示生成结果已持久化并且浏览器已收到完整结果。

## 6.7 Notes

### `GET /api/workspaces/:workspaceId/notes`

作用：

- 获取笔记列表

### `POST /api/workspaces/:workspaceId/notes`

作用：

- 创建 note

请求体（自由笔记）：

```json
{
  "title": "可选标题",
  "bodyMd": "笔记正文"
}
```

请求体（citation 转 note）：

```json
{
  "title": "可选标题",
  "bodyMd": "我对这段的理解",
  "sourceCitationIds": ["cit_xxx"]
}
```

返回：

```json
{
  "note": "Note",
  "sources": ["NoteSource"]
}
```

### `PATCH /api/workspaces/:workspaceId/notes/:noteId`

作用：

- 更新 note

### `DELETE /api/workspaces/:workspaceId/notes/:noteId`

作用：

- 归档或删除 note

实现约定：

- API 以归档为默认删除语义，保留来源快照；列表只返回未归档 note
- `sourceCitationIds` 必须属于当前 workspace 的 `message_citations`
- citation 来源会复制页码、文档标题和 excerpt 快照到 `note_sources`

## 6.8 Tags

### `GET /api/workspaces/:workspaceId/tags`

作用：

- 获取 tag 列表

### `POST /api/workspaces/:workspaceId/tags`

作用：

- 创建 tag

请求体：

```json
{
  "name": "重点",
  "slug": "important",
  "color": "#f97316"
}
```

### `POST /api/workspaces/:workspaceId/documents/:documentId/tags`

作用：

- 给文档打标签

请求体：

```json
{
  "tagIds": ["tag_xxx", "tag_yyy"]
}
```

### `POST /api/workspaces/:workspaceId/notes/:noteId/tags`

作用：

- 给 note 打标签

请求体：

```json
{
  "tagIds": ["tag_xxx"]
}
```

### `PATCH /api/workspaces/:workspaceId/tags/:tagId`

作用：

- 更新 workspace 内 tag 的名称、slug 或颜色

### `DELETE /api/workspaces/:workspaceId/tags/:tagId`

作用：

- 删除 tag，并清理 `document_tags` / `note_tags` 关系

## 7. FastAPI 内部业务接口

这一层接口不直接暴露给浏览器。

路径建议统一为：

- `/v1/...`

### 7.1 为什么还要写这一层

因为系统不是“浏览器直接调数据库”。

Next.js BFF 和 FastAPI 之间也需要稳定契约，至少要约定：

- BFF 传什么上下文
- FastAPI 接什么 body
- 流式接口如何返回

### 7.2 上下文注入

BFF 调 FastAPI 时，统一附带已认证上下文，例如：

- `x-user-id`
- `x-workspace-id`
- `x-user-role`
- `x-internal-signature`

FastAPI 只信任这组内部上下文，不信任浏览器 body 里的身份字段。

### 7.3 内部接口分组

#### Workspace / Prompt

- `GET /v1/workspaces`
- `POST /v1/workspaces`
- `GET /v1/workspaces/{workspaceId}`
- `PATCH /v1/workspaces/{workspaceId}`
- `GET /v1/workspaces/{workspaceId}/prompt/current`
- `POST /v1/workspaces/{workspaceId}/prompt/versions`

#### Documents / Jobs

- `POST /v1/workspaces/{workspaceId}/documents/upload-session`
- `POST /v1/workspaces/{workspaceId}/documents/{documentId}/finalize-upload`
- `GET /v1/workspaces/{workspaceId}/documents`
- `GET /v1/workspaces/{workspaceId}/documents/{documentId}`
- `GET /v1/workspaces/{workspaceId}/documents/{documentId}/file`
- `DELETE /v1/workspaces/{workspaceId}/documents/{documentId}`
- `POST /v1/workspaces/{workspaceId}/documents/{documentId}/retry`
- `POST /v1/workspaces/{workspaceId}/documents/{documentId}/reindex`
- `GET /v1/workspaces/{workspaceId}/jobs/{jobId}`

#### Threads / Chat

- `GET /v1/workspaces/{workspaceId}/threads`
- `POST /v1/workspaces/{workspaceId}/threads`
- `GET /v1/workspaces/{workspaceId}/threads/{threadId}/messages`
- `DELETE /v1/workspaces/{workspaceId}/threads/{threadId}`
- `POST /v1/workspaces/{workspaceId}/chat/stream`

#### Notes / Tags

- `GET /v1/workspaces/{workspaceId}/notes`
- `POST /v1/workspaces/{workspaceId}/notes`
- `PATCH /v1/workspaces/{workspaceId}/notes/{noteId}`
- `DELETE /v1/workspaces/{workspaceId}/notes/{noteId}`
- `GET /v1/workspaces/{workspaceId}/tags`
- `POST /v1/workspaces/{workspaceId}/tags`
- `POST /v1/workspaces/{workspaceId}/documents/{documentId}/tags`
- `POST /v1/workspaces/{workspaceId}/notes/{noteId}/tags`

## 8. 关键设计解释

### 8.1 为什么上传要拆成 upload-session 和 finalize-upload

因为：

- 上传大文件本身是对象存储行为
- 入库索引是业务行为

如果不拆，后端会混淆“文件传好了”和“文档可用了”这两个阶段。

### 8.2 为什么删除文档是命令型 + 异步任务

因为删除不只是删一条数据库记录，还涉及：

- 文档主记录软删
- chunk/page 清理
- MinIO 文件删除
- 失败时的补偿逻辑

所以删除接口要返回 `job`。

### 8.3 为什么创建 note 不接收 `userId`

因为身份来自已认证上下文，而不是前端 body。

前端只需要传：

- `workspaceId`（path）
- `title`
- `bodyMd`
- 可选 `sourceCitationIds[]`

### 8.4 为什么 chat/stream 不直接返回完整 JSON

因为它首先是一个流式体验接口。

用户需要尽快看到回答流，而不是等整条链全部完成后一次性返回。

## 9. 当前契约边界

这份文档当前不展开：

- OpenAPI 级字段必填/可选矩阵
- 失败重试和断线续传协议
- 内部签名算法
- 对象存储预签名细节

这些可以在正式实现前再下沉到更细的协议文档。
