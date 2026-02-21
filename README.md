# UnitRouter

Smart LLM router proxy for Unit Network. Routes requests to the cheapest capable model based on complexity analysis.

## Features

- **OpenAI-compatible API** — drop-in replacement
- **Smart routing** — classifies requests and picks the optimal model
- **4 profiles** — `free`, `eco`, `auto`, `premium`
- **Multi-provider** — Anthropic, OpenAI, Google, DeepSeek
- **Response caching** — deduplicates identical requests
- **Zero dependencies** — pure Node.js

## Quick Start

```bash
export ANTHROPIC_API_KEY=sk-...
node src/index.js
```

## API

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completion (OpenAI format) |
| `/stats` | GET | Usage statistics |

### Routing Profiles

Set via `model` field or `X-UnitRouter-Profile` header:

- **free** — cheapest models only
- **eco** — budget-conscious, upgrades for complex tasks
- **auto** — balanced (default)
- **premium** — best models always

## Environment Variables

| Variable | Required | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — |
| `OPENAI_API_KEY` | No | — |
| `GOOGLE_API_KEY` | No | — |
| `DEEPSEEK_API_KEY` | No | — |
| `UNITROUTER_PORT` | No | 8402 |
| `UNITROUTER_DEFAULT_PROFILE` | No | auto |

## License

MIT — Unit Network
