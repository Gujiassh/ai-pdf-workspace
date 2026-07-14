# Worker App

后台任务消费者入口。

当前状态：
- 轮询持久化的 `ingestion_jobs` 队列
- 已消费 `ingest` 任务，将可提取文本的 PDF 拆成页面、文本块并写入 embedding
- 对没有文本层的 PDF 页面使用 RapidOCR fallback，再进入同一页面/文本块链路
- 已支持 `embed_chunks` 回填已有文本块；`delete_cleanup` 仍未接入

本地启动：

```bash
cd /home/cc/code/ai-pdf-workspace
AI_PDF_EMBEDDING_PROVIDER=ollama AI_PDF_EMBEDDING_MODEL=qwen3-embedding:0.6b uv run --python 3.12 --project apps/worker python -m ai_pdf_worker.main
```

Worker 使用 RapidOCR + ONNX Runtime 在 CPU 上识别扫描 PDF 页面。OCR 模型随依赖安装，不会写入仓库；首次处理扫描件时会占用更多 CPU 和内存。


Worker 不会自动切换 embedding provider。`AI_PDF_EMBEDDING_PROVIDER`、`AI_PDF_EMBEDDING_MODEL` 必须和 API 使用同一套索引配置；切换 provider 或版本后，需要重新执行文档 reindex。
