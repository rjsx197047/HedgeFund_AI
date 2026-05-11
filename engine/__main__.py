"""Entry point. `python -m engine` starts the sidecar.

On startup, prints a JSON line `{"port": <int>, "token": "<uuid>"}` to stdout
so the parent process (Electron main) can read the connection details.

If `TAL_ENGINE_PIDFILE` is set (Electron main passes a path under the app's
userData dir), the engine writes its OS pid there on startup and removes it on
clean exit. This lets the parent reap exactly the engine it spawned on a prior
crashed session, rather than broad-matching every `python -m engine` process
(which would kill an unrelated dev engine running in another terminal).
"""

from __future__ import annotations

import atexit
import json
import os
import secrets
import socket
import sys

# SSL CA bundle — must be set BEFORE any HTTP library (urllib3, requests,
# httpx, curl_cffi, yfinance) is imported. On macOS the system Python may
# ship without a usable cert store, and curl_cffi bundles its own libcurl
# that doesn't honor /etc/ssl/cert.pem. Pointing the standard env vars at
# certifi's bundle fixes:
#   - yfinance failing with CertificateVerifyError
#   - Alpaca data fetches failing intermittently
#   - LLM provider SDK calls (rare, but theoretically possible)
# These have no effect when set after the import so the order matters.
import certifi  # noqa: E402

_CA_BUNDLE = certifi.where()
os.environ.setdefault("SSL_CERT_FILE", _CA_BUNDLE)
os.environ.setdefault("REQUESTS_CA_BUNDLE", _CA_BUNDLE)
os.environ.setdefault("CURL_CA_BUNDLE", _CA_BUNDLE)


def _patch_curl_cffi_verify() -> None:
    """Disable SSL verification on curl_cffi sessions.

    curl_cffi 0.15 ships a libcurl built against BoringSSL that, on macOS,
    rejects every CA bundle we throw at it — certifi, /etc/ssl/cert.pem,
    Python.org's installer cert.pem, all fail with CURLE_SSL_CACERT (60).
    Yahoo Finance, Alpaca, and the other data providers we hit are public
    endpoints; verification adds no security boundary in this educational
    context, and the alternative (no market data, ever) is worse.

    The Anthropic / OpenAI / Gemini SDKs use httpx, not curl_cffi, so they
    still verify normally — only yfinance's curl_cffi-based requests are
    affected by this patch.

    If a future curl_cffi release fixes the macOS bundle, drop this patch.
    """
    try:
        import curl_cffi.requests as _cr  # type: ignore[import-untyped]
    except ImportError:
        return

    _orig_init = _cr.Session.__init__

    def _patched_init(self, *args, **kwargs):
        kwargs.setdefault("verify", False)
        _orig_init(self, *args, **kwargs)

    _cr.Session.__init__ = _patched_init

    # Suppress the urllib3-style InsecureRequestWarning the underlying
    # libcurl emits — we know we're insecure here.
    import warnings as _w  # noqa: I001

    _w.filterwarnings("ignore", message=".*[Uu]nverified.*")


_patch_curl_cffi_verify()

import uvicorn  # noqa: E402

from .server import build_app  # noqa: E402


def _pick_port() -> int:
    """Reserve a free TCP port on localhost."""
    requested = os.environ.get("TAL_ENGINE_PORT")
    if requested:
        return int(requested)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _write_pidfile(path: str) -> None:
    """Write this process's pid to `path` (atomic-ish: write tmp + replace).

    Best-effort: a failure to write the pidfile must never stop the engine
    from starting — the orphan-reaping it enables is a convenience, not a
    correctness requirement. Creates parent dirs if missing.
    """
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = f"{path}.{os.getpid()}.tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(str(os.getpid()))
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except OSError:
        pass


def _remove_pidfile(path: str) -> None:
    """Remove the pidfile, but only if it still holds *our* pid.

    Guards against deleting a newer engine's pidfile if ours is shutting
    down late: only unlink when the recorded pid matches getpid().
    """
    try:
        with open(path, "r", encoding="utf-8") as fh:
            recorded = fh.read().strip()
        if recorded == str(os.getpid()):
            os.unlink(path)
    except OSError:
        pass


def main() -> None:
    token = os.environ.get("TAL_ENGINE_TOKEN") or secrets.token_urlsafe(24)
    port = _pick_port()

    pidfile = os.environ.get("TAL_ENGINE_PIDFILE")
    if pidfile:
        _write_pidfile(pidfile)
        # atexit covers a clean uvicorn shutdown (SIGTERM/SIGINT). A SIGKILL
        # can't be caught, so the pidfile is left behind — that's the orphan
        # case the parent reaps on next launch, exactly as intended.
        atexit.register(_remove_pidfile, pidfile)

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
