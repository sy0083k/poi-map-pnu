import logging


def configure_logging() -> None:
    """Configure a minimal shared logging format for API diagnostics."""
    logging.basicConfig(
        level=logging.INFO,
        format=(
            "%(asctime)s %(levelname)s [%(name)s] [req:%(request_id)s] "
            "[event:%(event)s] [actor:%(actor)s] [ip:%(ip)s] "
            "[status:%(status)s] [latency_ms:%(latency_ms)s] %(message)s"
        ),
    )
    request_filter = RequestIdFilter()
    root_logger = logging.getLogger()
    root_logger.addFilter(request_filter)
    for handler in root_logger.handlers:
        handler.addFilter(request_filter)


class RequestIdFilter(logging.Filter):
    """Attach request id on log records so formatters can safely reference it."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        if not hasattr(record, "event"):
            record.event = "-"
        if not hasattr(record, "actor"):
            record.actor = "-"
        if not hasattr(record, "ip"):
            record.ip = "-"
        if not hasattr(record, "status"):
            record.status = "-"
        if not hasattr(record, "latency_ms"):
            record.latency_ms = "-"
        return True
