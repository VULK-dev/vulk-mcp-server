<p align="center">
  <img src="https://vulk.dev/images/vulk-icon.svg" alt="VULK" width="60" height="60" />
</p>

<h1 align="center">VULK MCP Server</h1>

<p align="center">
  <strong>Build, deploy, and export full-stack applications from any AI assistant.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vulk-mcp-server"><img src="https://img.shields.io/npm/v/vulk-mcp-server?color=0D9373" alt="npm" /></a>
  <a href="https://vulk.dev"><img src="https://img.shields.io/badge/vulk.dev-live-0D9373" alt="VULK" /></a>
  <a href="https://github.com/vulkdev/vulk-mcp-server/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" /></a>
</p>

<p align="center">
  Give Claude, Cursor, Windsurf, VS Code Copilot, or Gemini CLI the ability to generate, edit, deploy, and export production-ready applications — powered by <a href="https://vulk.dev">VULK</a>.
</p>

---

## What This Does

This MCP server connects AI coding assistants to VULK's full application platform. Say _"build me a project management dashboard"_ and it triggers real AI generation — not templates, not scaffolding, but a complete application.

**Generation**
- **16+ LLM models** — Claude Opus 4.6, GPT-5.4, Gemini 3.1 Pro, DeepSeek V3, Grok 4, and more
- **Full-stack output** — React + Tailwind + routing + API endpoints + database schemas
- **Real-time streaming** — watch files being generated in your terminal
- **Auto-fix pipeline** — linting, browser verification, self-debugging loop

**Export & Deploy**
- **Web** — Deploy to Cloudflare Pages with custom domains + SSL
- **PWA** — Progressive Web App with offline support
- **APK** — Android app builds (server-side compilation)
- **iOS** — iOS app builds via Flutter
- **Flutter** — Web-to-Flutter AI converter for native mobile
- **Custom domains** — Automatic SSL, DNS configuration included

**Platform**
- **Bring Your Own Model (BYOM)** — use your own API keys for any provider
- **Figma import** — convert Figma designs to code
- **GitHub integration** — push generated code directly
- **Team collaboration** — shared workspaces, role-based permissions
- **8 languages** — EN, PT, FR, DE, ES, IT, JA, HI

## Quick Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vulk": {
      "command": "npx",
      "args": ["-y", "vulk-mcp-server"],
      "env": {
        "VULK_API_KEY": "vk_sk_your_key_here"
      }
    }
  }
}
```

### Cursor

Settings → MCP Servers → Add:

```json
{
  "vulk": {
    "command": "npx",
    "args": ["-y", "vulk-mcp-server"],
    "env": {
      "VULK_API_KEY": "vk_sk_your_key_here"
    }
  }
}
```

### VS Code (GitHub Copilot)

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "vulk": {
      "command": "npx",
      "args": ["-y", "vulk-mcp-server"],
      "env": {
        "VULK_API_KEY": "vk_sk_your_key_here"
      }
    }
  }
}
```

### Windsurf

Add to MCP settings:

```json
{
  "vulk": {
    "command": "npx",
    "args": ["-y", "vulk-mcp-server"],
    "env": {
      "VULK_API_KEY": "vk_sk_your_key_here"
    }
  }
}
```

### Gemini CLI

Install the extension directly from GitHub:

```bash
gemini extensions install VULK-dev/vulk-mcp-server
```

Then set your API key:

```bash
export VULK_API_KEY="vk_sk_your_key_here"
```

Or configure it in the extension settings when prompted. The extension uses the same MCP server under the hood, giving you access to all VULK tools (generate, edit, deploy, etc.) directly from Gemini CLI.

## Get Your API Key

1. Go to [vulk.dev/settings/api-keys](https://vulk.dev/settings/api-keys)
2. Click **Create API Key**
3. Copy the key (starts with `vk_sk_`)

Free accounts get 3 generations/month. [Upgrade](https://vulk.dev/pricing) for more.

## Tools

### `generate` — Build a new app

> "Build a modern SaaS dashboard with user auth, analytics charts, team management, and dark mode"

Creates a project, triggers AI generation, and returns all generated files with a live preview URL. Generation runs through VULK's full pipeline — intent analysis, multi-file code generation, auto-fixing, browser verification, and quality scoring.

### `edit` — Modify an existing project

> "Add a settings page with tabs for Profile, Billing, and Notifications"

Sends your instruction to VULK's AI with full context of all existing project files. The AI decides which files to create or modify.

### `list` — See your projects

Returns all your VULK projects with IDs, prompts, dates, and deployment URLs.

### `get` — Project details

Get status, metadata, and URLs for a specific project.

### `files` — Read source code

Download every file from a project — paths, content, language detection.

### `deploy` — Ship to production

Deploy to Cloudflare Pages and get a live production URL with custom domain support.

### `models` — Available LLM models

List all available models on your plan — Claude Opus 4.6, Sonnet 4.6, GPT-5.4, Gemini 3.1 Pro, DeepSeek V3, Grok 4, and more.

### `usage` — Check your limits

View API request counts, credits remaining, and rate limit status.

### `subscribe` — Upgrade your plan

Get a checkout link to upgrade. Plans from $19.99/mo to $299/mo.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VULK_API_KEY` | Yes | — | Your VULK API key (`vk_sk_...`) |
| `VULK_API_BASE` | No | `https://vulk.dev` | API base URL |

## How It Works

```
You → "Build me a task manager"
       ↓
MCP Server → POST /api/v1/projects (create record)
       ↓
MCP Server → POST /api/agent/stream (trigger AI generation)
       ↓
VULK Agent → Intent analysis → Code generation → Auto-fix → Browser verify
       ↓
MCP Server ← SSE stream (file_start, file_delta, file_complete events)
       ↓
You ← { files: [...], previewUrl, editorUrl }
```

The generation pipeline includes:
- **Intent analysis** — understands what kind of app you want
- **ReAct agent loop** — plans and generates files with tool use
- **Auto-fixer** — deterministic code fixes (imports, routing, styling)
- **Browser verification** — renders the app, catches errors, self-heals
- **Quality scoring** — ensures the output meets production standards

## Pricing

| Plan | Price | Credits/month | LLM Models | Best For |
|------|-------|---------------|------------|----------|
| Free | $0 | 3 generations | Basic | Trying it out |
| Builder | $19.99/mo | 1,000 | Basic (Haiku, Flash, Mini) | Getting started |
| Pro | $39.99/mo | 2,500 | All 16+ models | Power users |
| Team | $79.99/mo | 5,000 | All + team collaboration | Small teams |
| Max | $199/mo | 10,000 | All + BYOM + white-label | Agencies |
| Business | $299/mo | 20,000 | Everything + SSO + SLA | Organizations |

Credits are token-based — simple apps use ~100 credits, complex ones ~500+. [Full pricing details](https://vulk.dev/pricing).

## Development

```bash
git clone https://github.com/vulkdev/vulk-mcp-server.git
cd vulk-mcp-server
npm install
npm run build
VULK_API_KEY=vk_sk_... node dist/index.js
```

## Links

- [VULK](https://vulk.dev) — AI-powered application builder
- [API Keys](https://vulk.dev/settings/api-keys) — Get your key
- [Pricing](https://vulk.dev/pricing) — Plans and pricing
- [Documentation](https://support.vulk.dev) — Full docs
- [Compare](https://vulk.dev/compare) — VULK vs Bolt vs Lovable vs v0

## License

MIT
