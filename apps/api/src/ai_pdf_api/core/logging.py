from __future__ import annotations

import logging


APPLICATION_LOGGER_NAME = "ai_pdf_api"
APPLICATION_HANDLER_NAME = "ai_pdf_application"


def configure_application_logging() -> None:
    logger = logging.getLogger(APPLICATION_LOGGER_NAME)
    logger.setLevel(logging.INFO)
    logger.propagate = True
    if any(handler.get_name() == APPLICATION_HANDLER_NAME for handler in logger.handlers):
        return

    handler = logging.StreamHandler()
    handler.set_name(APPLICATION_HANDLER_NAME)
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
