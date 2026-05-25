# Claude Connector Submission Pack

Date: 2026-05-25

Target: Claude Connectors Directory review for VULK.

Official docs to re-check before final submission:

- https://claude.com/docs/connectors/building
- https://claude.com/docs/connectors/building/what-to-build
- https://claude.com/docs/connectors/building/submission
- https://claude.com/docs/connectors/building/review-criteria

## Submission Type

Submit a remote MCP server:

- Name: `VULK`
- URL: `https://mcp.vulk.dev/mcp`
- Transport: remote HTTPS MCP
- Auth: OAuth 2.0 with PKCE
- Service domain: VULK-owned domain only

Optional later submission:

- Claude plugin that bundles workflow instructions and points to the same remote MCP URL.
- Do not make skills standalone; they need to be bundled in a plugin.

## Public Listing Copy

Tagline:

> Generate, edit, inspect, and deploy immersive web projects from chat.

Short description:

> VULK turns prompts, visual references, screenshots, Figma designs, URLs, and moodboards into editable, deployable web projects. Use it to create 3D/WebGL, cinematic, video-rich, and full-stack web experiences, then inspect files, iterate, and deploy.

Review-safe positioning:

- Project generator
- Website/app builder
- Design-to-code/project tool
- 3D/WebGL and video-rich web experience builder

Avoid saying the connector is a standalone AI image/video/audio generator.

## Unsupported-Use-Case Boundary

Claude's current review criteria reject connectors that generate AI images, video, or audio directly. VULK should therefore submit the connector as an immersive app/site builder.

Allowed public tool behavior:

- Generate a deployable project that may include 3D scenes, video sections, animation systems, and media slots.
- Return preview/editor/deploy URLs.
- Return safe project file manifests and selected source files.

Avoid public tool behavior:

- `generate_video`
- `generate_image`
- `generate_audio`
- `generate_3d_model`
- exposing raw media provider parameters
- returning raw generated media as the primary output

Those capabilities can remain internal to VULK's generation pipeline and web product.

## Tool Surface For Review

Run the remote server with:

```text
VULK_ENABLE_LEGACY_TOOLS=false
```

Expose only:

| Tool | Title | Annotation |
| --- | --- | --- |
| `create_visual_brief` | Create Visual Brief | read-only, non-destructive, idempotent |
| `generate_immersive_site` | Generate Immersive Site | write, non-idempotent, open-world |
| `create_project` | Create VULK Project | write, non-idempotent, open-world |
| `edit_project` | Edit VULK Project | destructive, non-idempotent, open-world |
| `list_projects` | List VULK Projects | read-only |
| `get_project` | Get VULK Project | read-only |
| `get_project_files` | Get VULK Project Files | read-only, content opt-in |
| `deploy_project` | Deploy VULK Project | destructive, non-idempotent, open-world |
| `list_models` | List VULK Models | read-only |
| `get_usage` | Get VULK Usage | read-only |
| `subscribe` | Open VULK Billing | read-only URL return |

## OAuth Scopes

Minimum scopes:

- `projects.read`
- `projects.create`
- `projects.edit`
- `projects.deploy`
- `usage.read`
- `billing.read`

Scope mapping:

| Tool | Required scope |
| --- | --- |
| `create_visual_brief` | authenticated token, no project-data scope |
| `generate_immersive_site` | `projects.create` |
| `create_project` | `projects.create` |
| `edit_project` | `projects.edit` |
| `list_projects` | `projects.read` |
| `get_project` | `projects.read` |
| `get_project_files` | `projects.read` |
| `deploy_project` | `projects.deploy` |
| `list_models` | authenticated token |
| `get_usage` | `usage.read` |
| `subscribe` | `billing.read` |

## Allowed Link URIs

Declare only VULK-owned origins:

- `https://vulk.dev`
- `https://webapp.vulk.dev`
- `https://mcp.vulk.dev`

Do not declare third-party origins.

## Reviewer Test Account

Create a dedicated account:

- Email: use a VULK-owned reviewer alias.
- Plan: enough credits to run several generations.
- Projects:
  - one existing dashboard/project
  - one immersive 3D/WebGL showcase
  - one project ready for safe edit
  - one deployable project
- No real customer data.
- No secrets in project files.

Provide:

- Login instructions.
- OAuth connection steps.
- 5 test prompts.
- Expected tool calls and expected URLs.
- Billing note: test credits are prepaid and no reviewer payment is required.

## Review Demo Prompts

1. Generate immersive product site:

```text
Use VULK to generate an immersive product website for a modular electric bike. It should have a scroll-driven 3D product reveal, cinematic sections, comparison specs, and a clean purchase intent flow.
```

2. Moodboard-to-site:

```text
Use VULK to create a visual brief and then generate an immersive website from this moodboard: brushed aluminum, deep green glass, Swiss grid, soft studio lighting, slow camera movement, premium mobility brand.
```

3. Inspect safely:

```text
List my VULK projects, pick the most recent project, and show only the file manifest. Do not request file content unless needed.
```

4. Edit:

```text
Edit this VULK project so the hero feels more spatial and the pricing section has clearer comparison states. Keep the brand direction intact.
```

5. Deploy:

```text
Deploy this VULK project and return the production URL.
```

## Documentation Links Needed

Public by launch:

- VULK MCP setup page.
- VULK connector privacy/data handling page.
- Support/security contact.
- Pricing/credits page.
- API key management page.
- OAuth app explanation.

Private during review is acceptable if public docs are ready by publish date.

## Pre-Submission Checklist

- Remote MCP endpoint deployed on VULK-owned HTTPS domain.
- OAuth 2.0 with PKCE works in Claude.
- Every tool has `title` and correct read-only/destructive hints.
- Legacy aliases disabled in review environment.
- MCP Inspector exercises every tool.
- Custom connector tested in Claude.
- Test account populated.
- Public docs and privacy policy prepared.
- Allowed link URIs limited to VULK-owned origins.
- No raw AI image/video/audio generation tool exposed.
- File content reads are opt-in, scoped, redacted, and capped.
- Project ownership verified before all reads/writes.
- Rate limits, credit checks, and audit logs active.
- Incident/security contact ready.

## Current Gaps

- Remote MCP gateway and OAuth/PKCE implementation now exist in `vulk-main-v2`; production DNS/deploy must expose them at `https://mcp.vulk.dev/mcp`.
- OAuth must be exercised through MCP Inspector and Claude custom connector after production deploy.
- Public docs page needs to be published.
- Test account and screenshots need to be prepared.
- Claude submission form needs final copy and assets.
