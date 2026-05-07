"""Entry point. `python -m engine` starts the sidecar.

On startup, prints a JSON line `{"port": <int>, "token": "<uuid>"}` to stdout
so the parent process (Electron main) can read the connection details.
"""

from __future__ import annotations

import json
import os
import secrets
import socket
import sys
import uvicorn

from .server import build_app


def _pick_port() -> int:
    """Reserve a free TCP port on localhost."""
    requested = os.environ.get("TAL_ENGINE_PORT")
    if requested:
        return int(requested)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    token = os.environ.get("TAL_ENGINE_TOKEN") or secrets.token_urlsafe(24)
    port = _pick_port()

    # Hand connection details to the parent process before binding the server.
    sys.stdout.write(json.dumps({"port": port, "token": token}) + "\n")
    sys.stdout.flush()

    app = build_app(token=token)
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level=os.environ.get("TAL_ENGINE_LOG_LEVEL", "warning"),
        access_log=False,
    )


if __name__ == "__main__":
    main()
