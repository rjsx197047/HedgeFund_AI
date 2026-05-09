# Configuring LLM Providers

*How to paste API keys for OpenAI, Anthropic, DeepSeek, and OpenRouter; how keys are stored; and what each provider enables today.*

---

## Where to go

Open Settings from the sidebar or press `Cmd+,`. Select the **LLM Providers** tab.

Each provider appears as a row with a **Configure** button. Once a key is stored, the row shows the last 4 characters (`…last4`) and a relative timestamp. You can **Replace** or **Delete** a stored key at any time.

---

## Providers available today

| Provider | Key format | Live debate support | Notes |
|---|---|---|---|
| **OpenAI** | `sk-…` | Yes — routes to `gpt-4o-mini` by default | Only provider wired end-to-end today |
| **Anthropic** | `sk-ant-…` | Key stored; debate routing pending | API key only — see below |
| **DeepSeek** | `sk-…` | Key stored; debate routing pending | OpenAI-compatible API |
| **OpenRouter** | `sk-or-…` | Key stored; debate routing pending | One key, many models |

### What "live debate support" means

The engine's live-debate path (`engine/live_debate.py`) currently routes to OpenAI only. Storing an Anthropic, DeepSeek, or OpenRouter key is supported — the Settings UI accepts and securely stores the key — but the engine won't use it for debates until those provider adapters are wired in a follow-up commit.

To run a real-LLM debate today, configure an OpenAI key.

### Why no Anthropic OAuth

Anthropic's Terms of Service prohibit OAuth flows for their API. TradingAgentsLab respects this: Anthropic is API key only. OpenAI supports both API key and OAuth; OAuth for OpenAI will land in a later commit — paste your key for now.

---

## Pasting a key

1. Go to **Settings → LLM Providers**.
2. Click **Configure** next to the provider you want.
3. Paste your key into the password field. The field is masked.
4. Click **Save**.

The key is encrypted immediately by your OS keychain before touching disk. You never see it again — only the `…last4` hint is displayed afterward.

To replace a key, click **Replace** and paste the new value. The old ciphertext is overwritten.

To remove a key, click **Delete**. The encrypted entry is erased from `secrets.json`.

---

## How keys are stored

TradingAgentsLab uses Electron's `safeStorage` API, which wraps:

- **macOS:** Keychain Services
- **Windows:** DPAPI (Data Protection API)
- **Linux:** libsecret / secret-service

The file at `<userData>/secrets.json` contains only base64-encoded ciphertext — never plaintext. The exact path is shown in **Settings → About**.

Each entry records:
- `hint` — the last 4 plaintext characters (for UI identification, not security)
- `updatedAt` — ISO-8601 timestamp of the last save
- `cipher` — base64 of the OS-encrypted bytes

**The encrypted blob is machine- and user-bound.** If you copy `secrets.json` to another machine, it cannot be decrypted there. See [security-and-storage.md](security-and-storage.md) for migration guidance.

---

## The live-debate path and cost

When an OpenAI key is configured and the renderer-to-engine wiring is complete (Phase 2.1), each Analyze run will:

1. Pass your OpenAI key to the engine in the WebSocket start frame.
2. The engine calls OpenAI for each of the 12 agents in sequence.
3. Default model: `gpt-4o-mini`. Default cap: 400 tokens per agent.
4. Estimated cost per full debate: $0.001–$0.003 at `gpt-4o-mini` pricing.

The `session.complete` event in live mode carries `estimated_cost_usd` so you can see what each run cost. Costs are logged to the engine's stderr (prefixed `[live_debate]`) for session-level tracking.

To keep costs low:
- Use `gpt-4o-mini` (the default).
- Use the Stop button (`Cmd+.`) if you want to abort mid-debate.
- Stub mode (no key configured) has zero API cost.

---

## Current wiring status

The Settings page stores keys. The engine accepts a `provider_config` in the WebSocket start frame and will use it for live debates. The missing piece is the renderer reading the stored OpenAI key and injecting it into `streamDebate()`. This wiring is in progress (Phase 2.1). Until it lands, the Analyze page always runs in stub mode regardless of what is stored in Settings.

Watch the decision card when stub mode is active — the reasoning text says "Stub canned debate" to make this clear.

---

## Further reading

- [How it works](how-it-works.md) — stub mode vs. live mode explained
- [Security and storage](security-and-storage.md) — detailed key storage model
- [Troubleshooting](troubleshooting.md) — what to do when the debate falls back to stub unexpectedly
- Engine API reference: [docs/api.md](../api.md)
