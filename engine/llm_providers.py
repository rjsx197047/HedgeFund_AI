"""LLM provider adapters for the live debate path.

Each adapter exposes the same minimal Protocol so `live_debate.py` can call
any provider without per-provider branching. Cost caps (`max_tokens`,
`MAX_AGENTS_PER_SESSION`) are enforced by `live_debate.py`, not here —
adapters cannot accidentally raise them.

Today's allowlist: `openai`, `anthropic`, `openrouter`, `gemini`.

Cost rates are local approximations refreshed manually. They are budgeting
hints for the founder, never billing records — providers update prices
quarterly and this table will drift.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol


# ---- Cost rate tables -----------------------------------------------------
#
# As of 2026-05-09. Refresh annually; do not trust these for billing.
# Conservative numbers preferred — over-estimate so the logged total is a
# ceiling rather than a floor.

_COST_PER_M_TOKENS: dict[str, dict[str, float]] = {
    # OpenAI
    "gpt-4o-mini":         {"input": 0.15, "output": 0.60},
    "gpt-4o":              {"input": 2.50, "output": 10.00},
    "gpt-4-turbo":         {"input": 10.00, "output": 30.00},
    "gpt-4.1-mini":        {"input": 0.40, "output": 1.60},
    "gpt-4.1":             {"input": 2.00, "output": 8.00},
    # Anthropic
    "claude-haiku-4-5":    {"input": 1.00, "output": 5.00},
    "claude-sonnet-4-5":   {"input": 3.00, "output": 15.00},
    "claude-sonnet-4-6":   {"input": 3.00, "output": 15.00},
    "claude-opus-4-7":     {"input": 15.00, "output": 75.00},
    # Google Gemini
    "gemini-2.0-flash":    {"input": 0.10, "output": 0.40},
    "gemini-2.5-flash":    {"input": 0.30, "output": 2.50},
    "gemini-2.5-pro":      {"input": 1.25, "output": 10.00},
    # OpenRouter (passthrough — actual cost depends on the underlying model;
    # we record the model string with no rate and the engine logs zero,
    # which the UI surfaces as "unknown".)
}


def estimate_cost(model: str, in_tokens: int, out_tokens: int) -> float:
    rates = _COST_PER_M_TOKENS.get(model)
    if rates is None:
        return 0.0
    return (in_tokens * rates["input"] + out_tokens * rates["output"]) / 1_000_000


# ---- Provider config ------------------------------------------------------


@dataclass
class ProviderConfig:
    """Renderer-supplied config for a single live-debate session.

    `auth` is a discriminated dict:

    - `{"type": "api_key", "api_key": "sk-..."}`  — API-key flow (all providers)
    - `{"type": "oauth", "access": "...", "refresh": "...", "expires": 1234}` — OAuth (OpenAI only today)

    Use `bearer_token` to get the value to attach as `Authorization: Bearer ...`
    regardless of which flow is active. Adapters never branch on auth shape.
    """

    provider: str
    auth: dict[str, Any] = field(default_factory=dict)
    model: str = ""
    max_tokens: int = 400

    @property
    def bearer_token(self) -> str:
        """Token for the `Authorization: Bearer …` header.

        Works for both api_key and oauth auth types. Raises ValueError on
        an unrecognised auth type so adapter-level mistakes are loud.
        """
        t = self.auth.get("type")
        if t == "api_key":
            return str(self.auth.get("api_key") or "")
        if t == "oauth":
            return str(self.auth.get("access") or "")
        raise ValueError(f"ProviderConfig.auth has unknown type: {t!r}")

    @property
    def auth_kind(self) -> str:
        """`"api_key"` or `"oauth"` — for telemetry / logging."""
        return str(self.auth.get("type") or "unknown")

    @classmethod
    def from_dict(cls, raw: Optional[dict]) -> "ProviderConfig | None":
        if not isinstance(raw, dict):
            return None

        provider = (raw.get("provider") or "openai").lower()
        if provider not in _ALLOWED_PROVIDERS:
            return None

        # Two accepted shapes:
        #   New (preferred): {"auth": {"type": "...", ...}, ...}
        #   Old (back-compat): {"api_key": "sk-..."} at top level
        # Renderers ship the new shape; we accept the old so that an
        # outdated WS frame (e.g. dev hot-reload race) doesn't drop the
        # session silently into the stub path.
        raw_auth = raw.get("auth")
        if isinstance(raw_auth, dict):
            auth = _normalize_auth(raw_auth)
        else:
            api_key = (raw.get("api_key") or "").strip()
            if not api_key:
                return None
            auth = {"type": "api_key", "api_key": api_key}

        if auth is None:
            return None

        # Only OpenAI accepts OAuth at the moment.
        if auth["type"] == "oauth" and provider != "openai":
            return None

        model = (raw.get("model") or "").strip() or _DEFAULT_MODELS[provider]
        try:
            requested_max = int(raw.get("max_tokens") or _DEFAULT_MAX_TOKENS)
        except (TypeError, ValueError):
            requested_max = _DEFAULT_MAX_TOKENS
        max_tokens = max(1, min(requested_max, _MAX_TOKENS_HARD_CAP))

        return cls(
            provider=provider,
            auth=auth,
            model=model,
            max_tokens=max_tokens,
        )


def _normalize_auth(raw: dict) -> Optional[dict[str, Any]]:
    t = (raw.get("type") or "").lower()
    if t == "api_key":
        api_key = (raw.get("api_key") or "").strip()
        if not api_key:
            return None
        return {"type": "api_key", "api_key": api_key}
    if t == "oauth":
        access = (raw.get("access") or "").strip()
        refresh = (raw.get("refresh") or "").strip()
        if not access:
            return None
        try:
            expires = int(raw.get("expires") or 0)
        except (TypeError, ValueError):
            expires = 0
        return {
            "type": "oauth",
            "access": access,
            "refresh": refresh,
            "expires": expires,
        }
    return None


_DEFAULT_MAX_TOKENS = 400
_MAX_TOKENS_HARD_CAP = 800  # Defense in depth — caller can't blow past this.

_DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-haiku-4-5",
    "openrouter": "openai/gpt-4o-mini",
    "gemini": "gemini-2.0-flash",
}

_ALLOWED_PROVIDERS = frozenset(_DEFAULT_MODELS.keys())


def default_model_for(provider: str) -> str:
    return _DEFAULT_MODELS.get(provider, _DEFAULT_MODELS["openai"])


# ---- Adapter Protocol -----------------------------------------------------


class LLMAdapter(Protocol):
    name: str

    async def open(self, *, api_key: str) -> None: ...
    async def close(self) -> None: ...
    async def complete(
        self,
        *,
        system: str,
        user: str,
        model: str,
        max_tokens: int,
    ) -> tuple[str, int, int]:
        """Returns (content, input_tokens, output_tokens)."""
        ...


# ---- OpenAI adapter (also covers OpenRouter via base_url override) --------


class OpenAIAdapter:
    """Direct OpenAI Chat Completions. Single client per session."""

    name = "openai"
    _base_url: Optional[str] = None
    _extra_headers: dict[str, str] = {}

    def __init__(self) -> None:
        self._client = None  # type: ignore[assignment]

    async def open(self, *, api_key: str) -> None:
        """Open the client with a Bearer token.

        The argument name `api_key` is kept for adapter-Protocol consistency,
        but the value is whatever bearer token the caller supplies — for
        OpenAI's `/v1/chat/completions` endpoint, both `sk-…` API keys and
        OAuth access tokens are accepted as `Authorization: Bearer …`. The
        caller (`live_debate.py`) reads `config.bearer_token` so this stays
        auth-shape-agnostic.
        """
        from openai import AsyncOpenAI

        kwargs: dict = {"api_key": api_key}
        if self._base_url:
            kwargs["base_url"] = self._base_url
        if self._extra_headers:
            kwargs["default_headers"] = self._extra_headers
        self._client = AsyncOpenAI(**kwargs)

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:  # noqa: BLE001 — cleanup is best-effort
                pass
            self._client = None

    async def complete(
        self,
        *,
        system: str,
        user: str,
        model: str,
        max_tokens: int,
    ) -> tuple[str, int, int]:
        if self._client is None:
            raise RuntimeError("adapter not opened")
        resp = await self._client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            temperature=0.7,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        choice = resp.choices[0].message.content or ""
        usage = resp.usage
        in_tok = getattr(usage, "prompt_tokens", 0) if usage else 0
        out_tok = getattr(usage, "completion_tokens", 0) if usage else 0
        return choice.strip(), in_tok, out_tok


class OpenRouterAdapter(OpenAIAdapter):
    """OpenRouter is OpenAI-compatible at openrouter.ai."""

    name = "openrouter"
    _base_url = "https://openrouter.ai/api/v1"
    # OpenRouter recommends an HTTP-Referer + X-Title for analytics. These
    # don't gate access — they're courtesy headers.
    _extra_headers = {
        "HTTP-Referer": "https://github.com/jaysidd/TradingAgentsLab",
        "X-Title": "TradingAgentsLab",
    }


# ---- Anthropic adapter ----------------------------------------------------


class AnthropicAdapter:
    """Anthropic Messages API. Single async client per session."""

    name = "anthropic"

    def __init__(self) -> None:
        self._client = None  # type: ignore[assignment]

    async def open(self, *, api_key: str) -> None:
        from anthropic import AsyncAnthropic

        self._client = AsyncAnthropic(api_key=api_key)

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:  # noqa: BLE001
                pass
            self._client = None

    async def complete(
        self,
        *,
        system: str,
        user: str,
        model: str,
        max_tokens: int,
    ) -> tuple[str, int, int]:
        if self._client is None:
            raise RuntimeError("adapter not opened")
        # Anthropic puts the system prompt at the top level, NOT in messages.
        # `max_tokens` is required (not optional like OpenAI).
        resp = await self._client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=0.7,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        # `resp.content` is a list of content blocks. For non-tool responses
        # we expect a single TextBlock; concatenate all text blocks defensively.
        parts: list[str] = []
        for block in resp.content or []:
            text = getattr(block, "text", None)
            if isinstance(text, str):
                parts.append(text)
        content = "".join(parts).strip()
        # `resp.usage.input_tokens` / `output_tokens` are the canonical fields.
        usage = resp.usage
        in_tok = int(getattr(usage, "input_tokens", 0) or 0)
        out_tok = int(getattr(usage, "output_tokens", 0) or 0)
        # Note on stop_reason: "max_tokens" indicates truncation. The content
        # is still valid text; we surface it as-is — the founder can see
        # truncation in the transcript and re-run with a higher cap if needed.
        # If we wanted to be stricter we could append "[truncated]" to the
        # content; intentionally not doing that to keep stub/live UX identical.
        return content, in_tok, out_tok


# ---- Google Gemini adapter ------------------------------------------------


class GeminiAdapter:
    """Google Gemini via the maintained `google-genai` SDK.

    The deprecated `google-generativeai` package is intentionally NOT used.
    """

    name = "gemini"

    def __init__(self) -> None:
        self._client = None  # type: ignore[assignment]

    async def open(self, *, api_key: str) -> None:
        from google import genai

        # Sync client is fine — we run completions in a thread to keep the
        # asyncio loop responsive. (genai also offers an async client; the
        # sync one is simpler and we already pay the threading cost.)
        self._client = genai.Client(api_key=api_key)

    async def close(self) -> None:
        # google-genai client has no explicit close; rely on GC.
        self._client = None

    async def complete(
        self,
        *,
        system: str,
        user: str,
        model: str,
        max_tokens: int,
    ) -> tuple[str, int, int]:
        if self._client is None:
            raise RuntimeError("adapter not opened")
        import asyncio

        from google.genai import types

        # Combine system + user. Gemini's `system_instruction` is a separate
        # config field; we pass it that way so the user message stays clean.
        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            temperature=0.7,
        )

        def _call() -> tuple[str, int, int]:
            assert self._client is not None
            resp = self._client.models.generate_content(
                model=model,
                contents=user,
                config=config,
            )
            # `resp.text` raises ValueError when the candidate was filtered
            # by Gemini's safety system (finish_reason=SAFETY/RECITATION).
            # Surface a clean empty-string in that case so the engine's
            # outer error handler turns it into a graceful debate event
            # rather than a SDK stacktrace.
            try:
                content = (resp.text or "").strip()
            except ValueError as exc:
                content = f"[gemini blocked: {exc}]"
            usage = getattr(resp, "usage_metadata", None)
            in_tok = int(getattr(usage, "prompt_token_count", 0) or 0) if usage else 0
            out_tok = int(getattr(usage, "candidates_token_count", 0) or 0) if usage else 0
            return content, in_tok, out_tok

        return await asyncio.to_thread(_call)


# ---- Factory --------------------------------------------------------------


def adapter_for(config: ProviderConfig) -> LLMAdapter:
    if config.provider == "openai":
        return OpenAIAdapter()
    if config.provider == "openrouter":
        return OpenRouterAdapter()
    if config.provider == "anthropic":
        return AnthropicAdapter()
    if config.provider == "gemini":
        return GeminiAdapter()
    # Allowlist guarantees this is unreachable, but defend anyway.
    raise ValueError(f"unsupported provider: {config.provider!r}")
