from __future__ import annotations

from prometheus_client import Counter, Gauge, start_http_server


WORKER_JOBS = Counter(
    "ai_pdf_worker_jobs_total",
    "Jobs observed by the worker loop.",
    ("outcome",),
)
WORKER_ACTIVE_JOBS = Gauge(
    "ai_pdf_worker_active_jobs",
    "Jobs currently handled by this worker process.",
)


def start_metrics_server(host: str, port: int):
    return start_http_server(port, addr=host)
