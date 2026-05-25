# VULK MCP Server

VULK's MCP connector lets AI assistants generate, edit, inspect, and deploy VULK projects from chat.

Positioning: prompt-to-immersive-site. Agents can ask VULK for 3D/WebGL, cinematic, video-rich, moodboard-driven, full-stack web projects and get back preview/editor/deploy URLs.

This package is the local stdio MCP server. Public directory submissions should expose the same tool surface through a remote HTTPS MCP server with OAuth 2.0.

## What VULK Does

- Creates production VULK projects from natural-language briefs.
- Generates immersive web experiences using VULK's internal generation pipeline.
- Edits existing projects from chat instructions.
- Lists and inspects projects owned by the authenticated account.
- Returns file manifests safely by default; content must be explicitly requested.
- Deploys eligible projects to production.

The connector does not expose provider API keys, internal prompts, customer data outside the authenticated account, or standalone raw media-generation tools.

## Quick Setup

Get an API key at https://vulk.dev/settings/api-keys.

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

For public/review environments, disable legacy aliases so reviewers see only the clean tool names:

```json
{
  "env": {
    "VULK_API_KEY": "vk_sk_your_key_here",
    "VULK_ENABLE_LEGACY_TOOLS": "false"
  }
}
```

## Primary Tools

- `create_visual_brief` - turn a raw idea, visual reference, URL, Figma, screenshot, video reference, or moodboard into a VULK-ready production brief. Read-only.
- `generate_immersive_site` - generate a 3D/WebGL, cinematic, video-rich, or moodboard-driven VULK web project. Creates a project and may consume credits.
- `create_project` - generate a general VULK project from a prompt.
- `edit_project` - apply a natural-language change to an existing VULK project.
- `list_projects` - list projects owned by the authenticated account.
- `get_project` - get project metadata plus preview/editor URLs.
- `get_project_files` - get a project file manifest; content is opt-in, redacted, and size-limited.
- `deploy_project` - deploy a project to production.
- `list_models` - list available VULK models for the account.
- `get_usage` - inspect credits, usage, and rate limits.
- `subscribe` - return a VULK pricing URL.

Legacy aliases (`generate`, `edit`, `list`, `get`, `files`, `deploy`, `models`, `usage`) remain enabled by default for existing local users. Set `VULK_ENABLE_LEGACY_TOOLS=false` for the public connector surface.

## Security Defaults

- All tools call VULK first-party APIs only.
- Authentication uses `VULK_API_KEY` for this local package. Public Claude/Codex directory builds should use remote MCP over HTTPS with OAuth 2.0.
- Tool annotations mark read-only, write, and destructive operations for compatible clients.
- `get_project_files` returns only a manifest unless `includeContent=true`.
- Sensitive-looking files such as `.env`, private keys, credentials, service-account files, `.npmrc`, and certificate/key files are redacted.
- File content responses are capped to 50 KB by default and 200 KB maximum.
- Edit context sent back to VULK is capped by `VULK_MCP_MAX_EDIT_CONTEXT_BYTES` and excludes sensitive-looking paths.
- The backend validates project ownership before generation or file mutation.

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VULK_API_KEY` | Yes | - | VULK API key starting with `vk_sk_`. |
| `VULK_API_BASE` | No | `https://vulk.dev` | VULK API base URL. |
| `VULK_ENABLE_LEGACY_TOOLS` | No | `true` | Set to `false` for the public review surface. |
| `VULK_MCP_MAX_EDIT_CONTEXT_BYTES` | No | `2000000` | Max safe file context sent for edits. |

## Distribution Targets

- Local MCP package: `npx -y vulk-mcp-server`
- Official MCP Registry: `server.json`
- Smithery: `smithery.yaml`
- Glama: `glama.json`
- Gemini CLI: `gemini-extension.json`
- Codex plugin bundle: `codex-plugin/`
- Claude Connectors Directory: use the remote OAuth MCP build described in `docs/CLAUDE_CONNECTOR_SUBMISSION.md`
- Codex extensions/plugins: use the plugin and marketplace plan in `docs/UNIVERSAL_AGENT_CONNECTOR.md`

## Development

```bash
npm install
npm run build
VULK_API_KEY=vk_sk_... node dist/index.js
```

## License

MIT
