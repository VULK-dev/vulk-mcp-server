# VULK MCP connector

VULK builds apps and websites from a written brief. This connector lets an AI assistant work with **your own VULK account** once you have signed in and approved it.

- **Server URL:** `https://app.vulk.dev/mcp` (alias `https://mcp.vulk.dev/mcp`)
- **Transport:** remote, Streamable HTTP
- **Authentication:** OAuth 2.0 authorization code with PKCE (S256), dynamic client registration; no API key
- **Documentation:** https://support.vulk.dev/docs/api/mcp
- **Privacy policy:** https://vulk.dev/privacy-policy

## What an assistant can do

- List your projects, read a project's details and, on a paid plan, its source files.
- Show your plan and renewal date, your credit balance and your usage over the last 30 days.
- Create a new project, or send the next instruction to an existing one. VULK builds it the way it does in its own editor, using the credits your plan already includes. The assistant can then read the progress, any questions VULK asks, and the link that opens the result in the editor.
- Stop a request that is still running.

## What it cannot do

It cannot publish a site, buy credits, change your plan or delete a project: there is no tool for any of those. If your plan has no credits left, VULK refuses the request. There is no standalone image, video or audio generation tool; media is only ever generated as part of building a project, as one of its design assets.

## Connect

- **Claude (claude.ai):** Customize › Connectors › Add custom connector, name `VULK`, URL `https://app.vulk.dev/mcp`.
- **Claude Code:**

  ```bash
  claude mcp add --transport http vulk https://app.vulk.dev/mcp
  ```

- **Codex CLI:**

  ```bash
  codex mcp add vulk --url https://app.vulk.dev/mcp
  codex mcp login vulk
  ```

- **Cursor:** add to `mcp.json`:

  ```json
  { "mcpServers": { "vulk": { "url": "https://app.vulk.dev/mcp" } } }
  ```

- **Any other MCP client** that supports remote servers with OAuth: add the URL above.

The first time, you are sent to app.vulk.dev to sign in and see what the connection can do before you approve it.

## Tools

| Tool | Scope | What it does |
|---|---|---|
| `list_projects` | `projects.read` | Your projects |
| `get_project` | `projects.read` | One project's details and links |
| `get_project_files` | `projects.read` | The file index, or one source file per call (paid plans) |
| `get_usage` | `usage.read` | Plan, renewal date, credit balance, 30-day usage |
| `open_billing` | none | Returns a link to your own billing page; changes nothing |
| `create_project` | `projects.write` | Starts a build of a new project from your brief |
| `continue_project` | `projects.write` | Sends the next instruction or answer to an existing project |
| `get_operation` | `projects.read` | Reads the persisted state of a build you started |
| `stop_operation` | `projects.write` | Asks VULK to stop a build that is still running |

Reading and building are separate permissions: a connection that was not granted `projects.write` never sees the tools that need it, and a call to one anyway returns a tool error that names the missing permission.

## Permissions, data and revocation

- A connection lasts up to 90 days (refresh tokens rotate on every use) and you can remove it at any time in **Settings › Integrations › Connected apps** at app.vulk.dev.
- The connector reads and writes only inside the signed-in account: its projects, plan, credits and usage. The text you ask the assistant to build is sent to VULK as the project brief (up to 8,000 characters).
- Each build request carries a `request_id`; repeating a request with the same id returns the same receipt instead of building twice.

## Legacy local package

The npm packages `vulk-mcp-server` (1.1.0 and earlier) and `@vulk/mcp-server` (1.0.0) are separate local command-line packages (they run on your own machine) from before this connector. They authenticate with an API key (`VULK_API_KEY`) instead of OAuth and expose different tools. This connector does not use them, and their tool names and behaviour are not described here.

## License

MIT. See `LICENSE`.
