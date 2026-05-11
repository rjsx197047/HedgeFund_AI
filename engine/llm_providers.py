"""LLM provider adapters for the live debate path.

Each adapter exposes the same minimal Protocol so `live_debate.py` can call
any provider without per-provider branching. Cost caps (`max_tokens`,
`MAX_AGENTS_PER_SESSION`) are enforced by `live_debate.py`, not here —
adapters cannot accidentally raise them.

Today's allowlist: `openai`, `anthropic`, `openrouter`, `gemini`, `ollama`.
OpenAI also has a sibling `OpenAICodexAdapter` for the OAuth/subscription
path that hits `chatgpt.com/backend-api/codex/responses` instead of the
standard chat-completions endpoint — the factory picks based on
`config.auth.type`. `ollama` is a local-only adapter that piggybacks on
the OpenAI-compatible endpoint Ollama exposes at `:11434/v1`; no API key
required, $0 cost since inference runs on the user's own hardware.

Cost rates are local approximations refreshed manually. They are budgeting
hints for the founder, never billing records — providers update prices
quarterly and this table will drift. **Subscription-billed routes
(OpenAI Codex / OAuth) are NOT per-token billed**; the engine's logged
cost estimate overstates true cost for OAuth sessions. The founder's
billing dashboard is the source of truth.
"""

from __future__ import annotations

import json
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

    `base_url` is an optional override for self-hosted / local providers
    (today: Ollama). When set, the adapter routes chat-completion calls to
    this URL instead of the provider's default endpoint. Ignored by cloud
    providers (OpenAI/Anthropic/Gemini/OpenRouter).
    """

    provider: str
    auth: dict[str, Any] = field(default_factory=dict)
    model: str = ""
    max_tokens: int = 400
    base_url: str = ""

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
            auth = _normalize_auth(raw_auth, provider=provider)
        else:
            api_key = (raw.get("api_key") or "").strip()
            if not api_key:
                # Ollama runs locally — no auth required for the default
                # localhost setup. Inject a sentinel so the rest of the
                # pipeline (which insists on a non-empty bearer) stays
                # uniform; the Ollama daemon ignores Authorization headers.
                if provider == "ollama":
                    auth = {"type": "api_key", "api_key": "ollama"}
                else:
                    return None
            else:
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

        base_url = (raw.get("base_url") or "").strip()

        return cls(
            provider=provider,
            auth=auth,
            model=model,
            max_tokens=max_tokens,
            base_url=base_url,
        )


def _normalize_auth(raw: dict, *, provider: str = "") -> Optional[dict[str, Any]]:
    t = (raw.get("type") or "").lower()
    if t == "api_key":
        api_key = (raw.get("api_key") or "").strip()
        if not api_key:
            # Ollama is the one provider where empty auth is acceptable.
            if provider == "ollama":
                return {"type": "api_key", "api_key": "ollama"}
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
        account_id = (raw.get("account_id") or raw.get("accountId") or "").strip()
        out: dict[str, Any] = {
            "type": "oauth",
            "access": access,
            "refresh": refresh,
            "expires": expires,
        }
        if account_id:
            out["account_id"] = account_id
        return out
    return None


_DEFAULT_MAX_TOKENS = 400
_MAX_TOKENS_HARD_CAP = 800  # Defense in depth — caller can't blow past this.

_DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-haiku-4-5",
    "openrouter": "openai/gpt-4o-mini",
    "gemini": "gemini-2.0-flash",
    "ollama": "llama3.1:8b",
}

# Default Ollama base URL — overridable per-session via ProviderConfig.base_url
# for users who run Ollama on a different host (e.g. a GPU box on the LAN).
OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1"

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


# ---- Ollama adapter -------------------------------------------------------


class OllamaAdapter(OpenAIAdapter):
    """Ollama exposes an OpenAI-compatible chat-completions endpoint at
    `http://<host>:11434/v1/chat/completions`. We piggyback on the OpenAI
    client and override the base URL.

    Ollama runs locally on the user's machine (or a LAN GPU box) so:

    - No API key needed for default localhost; the daemon ignores the
      Authorization header. We pass a sentinel "ollama" token to satisfy
      the OpenAI client's non-empty-key requirement.
    - $0 cost — inference uses the user's own hardware. The model name
      is whatever the user has `ollama pull`'d (e.g. `llama3.1:8b`,
      `qwen2.5:14b`, `mistral:7b`). Default `_DEFAULT_MODELS["ollama"]`
      assumes `llama3.1:8b` is installed; the user can pick another in
      the renderer.
    - `_base_url` is set at the class level to the default localhost URL
      but is overridable per-instance — the factory writes
      `config.base_url` onto the adapter before `open()` is called.
    """

    name = "ollama"
    _base_url = OLLAMA_DEFAULT_BASE_URL
    _extra_headers: dict[str, str] = {}


# ---- Health probe for local providers -------------------------------------


async def ollama_health(base_url: str = "") -> dict[str, Any]:
    """Return a quick liveness probe of a local Ollama daemon.

    Used by the renderer's settings page to show a green "Connected" pill
    and the list of installed models the user can pick from. Hits Ollama's
    native `/api/tags` endpoint (NOT the OpenAI-compatible `/v1` surface —
    `/api/tags` returns the full model list, which is more useful than
    `/v1/models` for the settings UI).

    Never raises. On failure returns `{"ok": False, "error": "..."}`.
    """
    import httpx

    # `base_url` here is the OpenAI-compatible base (`.../v1`); strip the
    # trailing `/v1` to reach the native API.
    root = (base_url or OLLAMA_DEFAULT_BASE_URL).rstrip("/")
    if root.endswith("/v1"):
        root = root[: -len("/v1")]
    url = f"{root}/api/tags"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=2.0, read=5.0, write=2.0, pool=2.0)) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return {"ok": False, "error": f"http {resp.status_code}"}
            data = resp.json()
            models = [m.get("name") for m in (data.get("models") or []) if m.get("name")]
            return {"ok": True, "models": models, "base_url": root}
    except Exception as exc:  # noqa: BLE001 — health checks must not raise
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


# ---- OpenAI Codex adapter (OAuth / ChatGPT-subscription path) -------------


class OpenAICodexAdapter:
    """OpenAI Codex Responses API — the path that routes through the user's
    ChatGPT subscription instead of their per-token API tier.

    OAuth tokens issued by `loginOpenAICodex` are NOT API tokens. Attaching
    them as `Authorization: Bearer …` to the standard `/v1/chat/completions`
    endpoint hits the user's API quota, not their subscription (founder
    smoke-tested this 2026-05-09 and got `insufficient_quota` 429).

    Subscription routing requires a different endpoint:

        URL: https://chatgpt.com/backend-api/codex/responses
        Headers: Authorization: Bearer <oauth_access>
                 chatgpt-account-id: <accountId from oauth credentials>
                 originator: pi
                 User-Agent: pi (...)
        Body: OpenAI Responses-API shape (`input` not `messages`,
              `instructions` not `system` role, etc.)

    This adapter implements the same `LLMAdapter` Protocol as the
    `OpenAIAdapter` (Chat Completions, API key) but talks to the Codex
    backend. The factory `adapter_for(config)` picks one or the other based
    on `config.auth["type"]`.

    Replicates the request shape pi-ai (@earendil-works/pi-ai/oauth) uses
    for Clawless desktop's OAuth path. The header set + body shape is taken
    directly from `openai-codex-responses.js` `buildBaseCodexHeaders` and
    `buildRequestBody`.

    Cost note: when a session runs through this adapter, the founder is
    NOT being billed per-token — the cost is amortized into their ChatGPT
    subscription. The cost-estimate the engine logs on session.complete is
    technically wrong-direction (overstates) for OAuth runs. We don't try
    to "fix" that with a $0 calculation; the founder's billing dashboard
    is the source of truth.
    """

    name = "openai-codex"
    BASE_URL = "https://chatgpt.com/backend-api/codex/responses"

    def __init__(self) -> None:
        self._client = None  # type: ignore[assignment]
        self._token: Optional[str] = None
        self._account_id: Optional[str] = None

    async def open(self, *, api_key: str) -> None:
        """Open with `api_key` carrying the OAuth access token (per
        `LLMAdapter` Protocol — name kept for consistency, value is the
        Bearer token regardless of auth flow). The `accountId` is supplied
        out-of-band via `set_account_id` because the Protocol surface
        doesn't pass arbitrary metadata.
        """
        import httpx

        self._token = api_key
        # 30s connect, 90s read — Codex responses can take a beat on big
        # context windows. No retries; the engine's outer error path
        # surfaces failures as session events.
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=30.0, read=90.0, write=30.0, pool=30.0),
        )

    def set_account_id(self, account_id: str) -> None:
        """Codex backend requires `chatgpt-account-id` — set after `open`
        from the same OAuth credential blob the renderer sent.
        """
        self._account_id = account_id

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception:  # noqa: BLE001
                pass
            self._client = None
        self._token = None
        self._account_id = None

    async def complete(
        self,
        *,
        system: str,
        user: str,
        model: str,
        max_tokens: int,
    ) -> tuple[str, int, int]:
        if self._client is None or self._token is None:
            raise RuntimeError("OpenAICodexAdapter not opened")

        # Header set per pi-ai (openai-codex-responses.js:buildBaseCodexHeaders +
        # buildSSEHeaders). `chatgpt-account-id` is required; if we don't
        # have one the Codex backend will 401.
        headers: dict[str, str] = {
            "Authorization": f"Bearer {self._token}",
            "originator": "pi",
            "User-Agent": "pi (TradingAgentsLab)",
            "OpenAI-Beta": "responses=experimental",
            "accept": "text/event-stream",
            "content-type": "application/json",
        }
        if self._account_id:
            headers["chatgpt-account-id"] = self._account_id

        # Body matches pi-ai's `buildRequestBody` exactly — every field
        # present here is one pi-ai sends unconditionally to Codex; every
        # field pi-ai sends conditionally (temperature, service_tier,
        # tools, reasoning, prompt_cache_key) is omitted because we
        # don't supply those options.
        #
        # On `max_output_tokens`: NOT in pi-ai's body. I tried adding
        # it as the Responses API equivalent of `max_tokens` and Codex
        # backend returned 400 Unsupported parameter (founder hit
        # this 2026-05-09). Output length is bounded by the system
        # prompts (each agent's prompt explicitly says "3-5
        # sentences" / "2-3 sentences"), not by an enforced cap. The
        # `max_tokens` arg here is ignored on the Codex path; the
        # API-key adapter (`OpenAIAdapter`) still enforces it via
        # `client.chat.completions.create(max_tokens=...)`.
        del max_tokens  # noqa — argument intentionally unused on this path
        body = {
            "model": model,
            "store": False,
            "stream": True,
            "instructions": system,
            "input": [
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": user}],
                }
            ],
            "text": {"verbosity": "low"},
            "include": ["reasoning.encrypted_content"],
            "tool_choice": "auto",
            "parallel_tool_calls": True,
        }

        content_parts: list[str] = []
        in_tokens = 0
        out_tokens = 0

        # SSE response: each event is `event: <type>\ndata: <json>\n\n`.
        # We care about `response.output_text.delta` (incremental text)
        # and `response.completed` (final usage). We DON'T stream tokens
        # back to the WS — `LLMAdapter.complete` returns the full message
        # so the existing `live_debate.py` orchestration is unchanged.
        try:
            async with self._client.stream(
                "POST",
                self.BASE_URL,
                headers=headers,
                json=body,
            ) as response:
                if response.status_code != 200:
                    # Read error body before raising — Codex returns
                    # JSON error blobs that are useful to surface.
                    error_body = await response.aread()
                    error_text = error_body.decode("utf-8", errors="replace")[:500]
                    raise RuntimeError(
                        f"Codex {response.status_code}: {error_text}"
                    )

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[len("data:") :].strip()
                    if payload == "[DONE]" or not payload:
                        continue
                    try:
                        evt = json.loads(payload)
                    except json.JSONDecodeError:
                        continue

                    evt_type = evt.get("type")
                    if evt_type == "response.output_text.delta":
                        delta = evt.get("delta") or ""
                        if isinstance(delta, str):
                            content_parts.append(delta)
                    elif evt_type == "response.completed":
                        # Final response carries `usage` and the full
                        # `output` array. Prefer `usage` from here.
                        resp = evt.get("response") or {}
                        usage = resp.get("usage") or {}
                        in_tokens = int(usage.get("input_tokens") or 0)
                        out_tokens = int(usage.get("output_tokens") or 0)
                        # If we missed the deltas (unlikely but possible),
                        # extract text from the completed output as fallback.
                        if not content_parts:
                            for item in resp.get("output") or []:
                                for part in item.get("content") or []:
                                    text = part.get("text")
                                    if isinstance(text, str):
                                        content_parts.append(text)
        except RuntimeError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Codex stream failed: {type(exc).__name__}: {exc}")

        return "".join(content_parts).strip(), in_tokens, out_tokens


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
        # OAuth → Codex backend (subscription-routed). API key → standard
        # /v1/chat/completions (per-token billed). The two endpoints have
        # totally different request/response shapes; the factory picks the
        # right adapter so `live_debate.py` stays auth-agnostic.
        if config.auth.get("type") == "oauth":
            return OpenAICodexAdapter()
        return OpenAIAdapter()
    if config.provider == "openrouter":
        return OpenRouterAdapter()
    if config.provider == "anthropic":
        return AnthropicAdapter()
    if config.provider == "gemini":
        return GeminiAdapter()
    if config.provider == "ollama":
        adapter = OllamaAdapter()
        # Allow per-session override of the Ollama base URL (LAN GPU box,
        # alternate port, etc.). Empty config.base_url keeps the class default.
        if config.base_url:
            base = config.base_url.rstrip("/")
            # Renderer may send either the root (".../11434") or the v1
            # surface (".../11434/v1"). Normalize to the v1 surface that
            # the OpenAI client expects.
            if not base.endswith("/v1"):
                base = f"{base}/v1"
            adapter._base_url = base
        return adapter
    # Allowlist guarantees this is unreachable, but defend anyway.
    raise ValueError(f"unsupported provider: {config.provider!r}")
