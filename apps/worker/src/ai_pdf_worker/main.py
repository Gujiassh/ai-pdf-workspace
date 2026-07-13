from __future__ import annotations

import logging
import time

from ai_pdf_api.db.session import SessionLocal
from ai_pdf_api.services.ingestion import claim_next_ingestion_job, process_ingestion_job

from ai_pdf_worker.ocr import extract_page_texts_with_ocr

POLL_INTERVAL_SECONDS = 1.0


def process_one_job() -> bool:
    with SessionLocal() as db:
        job_id = claim_next_ingestion_job(db)
        if job_id is None:
            return False
        process_ingestion_job(db, job_id, ocr_extract_page_texts=extract_page_texts_with_ocr)
        return True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.info("worker_start poll_interval_seconds=%s", POLL_INTERVAL_SECONDS)
    while True:
        if not process_one_job():
            time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
