# TradingAgentsLab — Knowledge Base

*Entry point for users of TradingAgentsLab: what it is, how to set it up, and how to get the most out of it.*

TradingAgentsLab is an open-source desktop application for educational market research and paper trading. It runs a panel of AI analyst agents — technical, fundamental, news, and sentiment — that debate a ticker on a date you specify, then converge on a BUY / SELL / HOLD recommendation. The analysis is for research and paper-trading purposes only. It is not investment advice.

TradingAgentsLab is a standalone trading companion for Clawless. You can use it independently; connecting it to a running Clawless instance is optional and adds gateway routing for LLM calls.

> **For educational research and paper trading. This is not investment advice.**

---

## Files in this knowledge base

| File | What it covers |
|---|---|
| [getting-started.md](getting-started.md) | Clone the repo, create the engine venv, install desktop deps, run in dev mode |
| [how-it-works.md](how-it-works.md) | Conceptual walkthrough of the multi-agent debate pipeline (with diagrams) |
| [configuring-llm-providers.md](configuring-llm-providers.md) | Add API keys for OpenAI, Anthropic, OpenRouter, Google Gemini; model picker; how keys are stored |
| [oauth.md](oauth.md) | ChatGPT subscription routing via OAuth — what it is, how it works, plan-tier detection |
| [data-providers.md](data-providers.md) | yfinance (free default) and Alpaca (optional); what data the engine fetches |
| [clawless-connector.md](clawless-connector.md) | What the optional Clawless gateway tap is and when it activates (Phase 6) |
| [reading-the-debate.md](reading-the-debate.md) | Walk through every element of the Analyze page as a debate runs |
| [keyboard-shortcuts.md](keyboard-shortcuts.md) | Full table of menu accelerators and page-level shortcuts |
| [security-and-storage.md](security-and-storage.md) | Where keys, OAuth tokens, and session history live on disk; encryption model |
| [troubleshooting.md](troubleshooting.md) | Common problems and remedies |
| [faq.md](faq.md) | Posture, license, what TradingAgentsLab is not, upstream and Clawless relationships |

---

## Recommended reading order for new users

1. [getting-started.md](getting-started.md) — get the app running
2. [configuring-llm-providers.md](configuring-llm-providers.md) — connect at least one provider so debates run live
3. [reading-the-debate.md](reading-the-debate.md) — understand what you are looking at
4. [how-it-works.md](how-it-works.md) — go deeper on how the agents reach a decision
5. [faq.md](faq.md) — licensing, posture, and the Clawless relationship

If you have a paid ChatGPT account and want to use it instead of an OpenAI API key, jump to [oauth.md](oauth.md) after the getting-started page.

---

## Technical reference

- Engine API contract: [docs/api.md](../api.md)
- Full architecture: [docs/architecture.md](../architecture.md)
