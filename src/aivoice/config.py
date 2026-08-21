from __future__ import annotations

import os
from pathlib import Path


def load_env_file(path: Path) -> None:
    """Load a simple local env file without logging secret values."""
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if name and value:
            os.environ.setdefault(name, value)
