"""Configuration du logger Idriss : un fichier par jour dans logs/idriss/."""

from __future__ import annotations

import logging
import os
import sys
from datetime import date
from pathlib import Path


def setup_logging(home: Path, debug: bool = False) -> logging.Logger:
    """Configure root logger : fichier YYYY-MM-DD.log + stderr."""
    log_dir = home / "logs" / "idriss"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{date.today().isoformat()}.log"

    level = logging.DEBUG if (debug or os.getenv("IDRISS_DEBUG") == "1") else logging.INFO
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"

    root = logging.getLogger()
    root.setLevel(level)
    for handler in list(root.handlers):
        root.removeHandler(handler)

    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(logging.Formatter(fmt))
    root.addHandler(file_handler)

    stream_handler = logging.StreamHandler(sys.stderr)
    stream_handler.setFormatter(logging.Formatter(fmt))
    root.addHandler(stream_handler)

    return logging.getLogger("idriss")
