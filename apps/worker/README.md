# Worker App

后台任务消费者入口。

当前状态：
- 轮询持久化的 `ingestion_jobs` 队列
- 已消费 `ingest` 任务，将可提取文本的 PDF 拆成页面、文本块并写入 embedding
- 对没有文本层的 PDF 页面使用 RapidOCR fallback，再进入同一页面/文本块链路
- 已支持 `embed_chunks` 回填已有文本块；`delete_cleanup` 仍未接入
- 新建文档任务快照会记录 Workspace 的 `chunkSize`，Worker 按任务快照切块；旧任务缺少该字段时使用 1200 字符默认值

可靠性行为：
- 每次只领取并处理一个 job；API 已知的 PDF、OCR、embedding 业务错误仍由 API 写入 `ingestion_jobs.status=failed`，Worker 不会自动复活旧 job。
- Worker 捕获迭代级基础设施异常，按 `1s -> 2s -> 4s -> 8s` 退避，连续 5 次仍失败后记录 `worker_retry_exhausted` 并以非零状态退出，交由外部进程管理器重启。
- 收到 `SIGINT` 或 `SIGTERM` 后设置停止事件；正在处理的 job 允许自然结束，随后退出，不中断 API 当前的 job 状态事务。
- 日志使用 `ai_pdf_worker` logger，包含 `worker_job_claimed`、`worker_job_handled`、`worker_iteration_failed`、`worker_retry_scheduled`、`worker_fatal` 等平面事件标记，便于按事件名、`job_id`、`error_type` 检索。


本地启动：

```bash
cd /home/cc/code/ai-pdf-workspace
AI_PDF_EMBEDDING_PROVIDER=ollama AI_PDF_EMBEDDING_MODEL=qwen3-embedding:0.6b uv run --python 3.12 --project apps/worker python -m ai_pdf_worker.main
```

本地 metrics 默认只监听 `127.0.0.1:9101`。完整部署由 Compose 显式设置 `AI_PDF_WORKER_METRICS_HOST=0.0.0.0`，但端口只在 Compose 私网 expose，不发布到宿主机。

Worker 使用 RapidOCR + ONNX Runtime 在 CPU 上识别扫描 PDF 页面。OCR 模型随依赖安装，不会写入仓库；首次处理扫描件时会占用更多 CPU 和内存。
`rapidocr-onnxruntime` 自身提供并锁定 OpenCV 依赖，Worker 不再重复安装另一套 `opencv-python-headless`，避免两个发行包覆盖同一 `cv2` 文件。


Worker 不会自动切换 embedding provider。`AI_PDF_EMBEDDING_PROVIDER`、`AI_PDF_EMBEDDING_MODEL` 必须和 API 使用同一套索引配置；切换 provider 或版本后，需要重新执行文档 reindex。
