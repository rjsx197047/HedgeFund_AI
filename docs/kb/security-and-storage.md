# Security and Storage

*Where TradingAgentsLab stores data on disk, how secrets are protected, and what to do when you change machines.*

---

## Summary

| What | Where | Format | Protection |
|---|---|---|---|
| API keys and tokens | `<userData>/secrets.json` | Encrypted ciphertext | OS keychain (safeStorage) |
| Session history + paper-trade log | `<userData>/sessions.db` | SQLite (planned, not yet present) | File-system permissions only |
| Engine sidecar process | spawned at runtime | n/a | Binds to 127.0.0.1 only; bearer token auth |

---

## The userData directory

Electron stores application data in a platform-specific location:

- **macOS:** `~/Library/Application Support/TradingAgentsLab/`
- **Windows:** `%APPDATA%\TradingAgentsLab\`
- **Linux:** `~/.config/TradingAgentsLab/`

You can find the exact path in **Settings → About → Secrets file**. The path shown is `<userData>/secrets.json`.

---

## secrets.json — how key storage works

### Encryption model

TradingAgentsLab uses Electron's `safeStorage` API, which delegates encryption to the OS:

- **macOS:** Keychain Services. The encryption key is bound to your macOS user account.
- **Windows:** DPAPI (Data Protection API). The encryption key is bound to your Windows user session.
- **Linux:** libsecret / secret-service. Requires a running keyring daemon (GNOME Keyring, KWallet, etc.).

Plaintext is never written to disk. The `secrets.json` file contains:

```json
{
  "version": 1,
  "entries": {
    "llm:openai": {
      "hint": "…k3f9",
      "updatedAt": "2026-05-08T14:23:00.000Z",
      "cipher": "<base64-encoded encrypted bytes>"
    }
  }
}
```

The `hint` field (last 4 characters of the original value) is stored in plaintext solely for UI identification. It is not usable for decryption.

### Hard-fail design

If `safeStorage.isEncryptionAvailable()` returns false, the app refuses to store or read secrets rather than silently falling back to plaintext. On Linux without a keyring, all Settings operations will show an error banner: "Encryption backend unavailable on this OS."

### Atomic writes

The `secrets.json` file is written atomically: the new content is written to a `.tmp` file first, then renamed over the original. This prevents partial writes.

### File permissions

`secrets.json` is written with mode `0600` (readable only by the file owner on macOS/Linux).

---

## Engine sidecar — process isolation

The Python sidecar binds exclusively to `127.0.0.1` (loopback). It cannot be reached from the network. Every request requires a per-process bearer token that is generated at startup and passed to the renderer via an IPC channel — the token is never written to disk.

WebSocket authentication uses a query parameter (`?token=…`) because browsers cannot set Authorization headers on WebSocket connections. The token changes every time the sidecar restarts (i.e., every time you launch the app).

---

## Planned storage (sessions.db)

Session history, past debates, and paper-trade records will be persisted in a SQLite database at `<userData>/sessions.db`. This is planned for Phase 7. It does not exist yet. No past analysis results are retained between app restarts in the current version.

---

## Machine migration

Because `safeStorage` encryption is machine- and user-bound, you cannot copy `secrets.json` to a new machine and have it work. The ciphertext cannot be decrypted outside the original machine + user context.

### Recovery procedure

1. On your new machine, install TradingAgentsLab from scratch (see [getting-started.md](getting-started.md)).
2. Open Settings and re-paste each API key from your password manager or the provider's dashboard.

There is no secrets export/import feature yet. Manual re-entry is the current migration path.

---

## What is never stored

- Plaintext API keys — never written anywhere.
- Engine bearer tokens — generated at runtime, held in memory only.
- Debate transcripts — currently not persisted (sessions.db is pending).
- Clawless gateway tokens — stored via the same safeStorage path as API keys.

---

## Further reading

- [Configuring LLM providers](configuring-llm-providers.md) — how to paste and manage keys
- [Troubleshooting](troubleshooting.md) — encryption unavailable on Linux
- [Getting started](getting-started.md) — initial setup
