#!/usr/bin/env node

/**
 * VULK MCP Server
 *
 * Model Context Protocol server that gives AI assistants the power to build,
 * edit, deploy, and manage full-stack web applications through VULK.
 *
 * This is not a wrapper — it triggers real AI generation, streams progress,
 * and returns production-ready code.
 *
 * Tools:
 *   generate  — Build a new web app from a text prompt (real AI generation)
 *   edit      — Modify an existing project with natural language
 *   list      — List your VULK projects
 *   get       — Get project details, status, and deployment URLs
 *   files     — Read the source code of any project
 *   deploy    — Deploy a project to production (Cloudflare Pages)
 *   models    — List available AI models and their capabilities
 *   usage     — Check API usage, credits, and rate limits
 *   subscribe — Get a checkout link to upgrade your VULK plan
 *
 * Usage:
 *   npx vulk-mcp-server
 *
 * Config (Claude Desktop / Cursor / Windsurf / VS Code):
 *   {
 *     "mcpServers": {
 *       "vulk": {
 *         "command": "npx",
 *         "args": ["-y", "vulk-mcp-server"],
 *         "env": { "VULK_API_KEY": "vk_sk_..." }
 *       }
 *     }
 *   }
 *
 * Get your API key: https://vulk.dev/settings/api-keys
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { vulkApi, vulkStream, type ApiResponse } from "./api.js";

// ── Server ────────────────────────────────────────────────────

const server = new McpServer({
  name: "vulk",
  version: "1.0.0",
});

// ── Auth ──────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.VULK_API_KEY;
  if (!key) {
    throw new Error(
      "VULK_API_KEY not set.\n\n" +
        "1. Go to https://vulk.dev/settings/api-keys\n" +
        "2. Create a new API key\n" +
        "3. Set it as VULK_API_KEY in your MCP server config\n\n" +
        "Example (Claude Desktop):\n" +
        '  { "env": { "VULK_API_KEY": "vk_sk_..." } }'
    );
  }
  if (!key.startsWith("vk_sk_")) {
    throw new Error("Invalid VULK_API_KEY. Keys start with vk_sk_");
  }
  return key;
}

// ── Tool: generate ────────────────────────────────────────────
// This is the crown jewel — triggers REAL AI generation via VULK's
// agent pipeline and streams back the generated files.

server.tool(
  "generate",
  "Build a complete web application from a text description. " +
    "VULK's AI generates all files (React components, pages, routing, styling, " +
    "API endpoints, database schemas) and deploys a live preview. " +
    "Generation takes 1-5 minutes depending on complexity. " +
    "Returns the generated files, preview URL, and editor URL.",
  {
    prompt: z
      .string()
      .describe(
        "Detailed description of the app to build. Be specific about features, " +
          "pages, design style, and functionality. More detail = better results. " +
          "Example: 'A modern project management app like Linear with kanban boards, " +
          "sprint planning, team member assignments, dark mode, and real-time updates'"
      ),
    model: z
      .string()
      .optional()
      .describe(
        "AI model to use. Options include: 'claude-sonnet-4-20250514' (default, best quality), " +
          "'gpt-4o' (fast), 'gemini-2.5-pro' (creative), 'deepseek-chat' (budget). " +
          "Leave empty for the best model available on your plan."
      ),
  },
  async ({ prompt, model }) => {
    const apiKey = getApiKey();
    const log = (msg: string) =>
      process.stderr.write(`[vulk] ${msg}\n`);

    // Step 1: Create project record
    log("Creating project...");
    const createRes = await vulkApi<{
      project: { id: string };
    }>("/api/v1/projects", apiKey, {
      method: "POST",
      body: { prompt, model },
    });

    if (!createRes.ok) {
      return err(createRes, "Failed to create project");
    }

    const uiId = createRes.data.project.id;
    log(`Project ${uiId} created. Starting generation...`);

    // Step 2: Trigger real generation via agent stream
    const files: Array<{ path: string; language?: string }> = [];
    let generationError: string | null = null;
    let totalTokens = 0;
    let generationCost = 0;

    try {
      const stream = await vulkStream("/api/agent/stream", apiKey, {
        message: prompt,
        uiId,
        model: model || undefined,
        existingFiles: [],
      });

      for await (const event of stream) {
        switch (event.type) {
          case "file_complete":
            if (event.payload?.filePath) {
              files.push({
                path: event.payload.filePath as string,
                language: event.payload.language as string | undefined,
              });
              log(`  Generated: ${event.payload.filePath}`);
            }
            break;

          case "session_end":
            totalTokens =
              ((event.payload?.tokensUsed as Record<string, number>)
                ?.input || 0) +
              ((event.payload?.tokensUsed as Record<string, number>)
                ?.output || 0);
            generationCost =
              (event.payload?.cost as number) || 0;
            break;

          case "error":
            generationError =
              (event.payload?.message as string) || "Generation failed";
            break;
        }
      }
    } catch (e) {
      generationError =
        e instanceof Error ? e.message : "Stream connection failed";
    }

    if (generationError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Generation failed: ${generationError}\n\n` +
              `You can try again or open the editor manually:\n` +
              `https://vulk.dev/ui/${uiId}`,
          },
        ],
        isError: true as const,
      };
    }

    const editorUrl = `https://vulk.dev/ui/${uiId}`;
    const previewUrl = `https://webapp.vulk.dev/${uiId}`;

    log(
      `Generation complete: ${files.length} files, ${totalTokens} tokens`
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "complete",
              projectId: uiId,
              editorUrl,
              previewUrl,
              filesGenerated: files.length,
              files: files.map((f) => f.path),
              tokens: totalTokens,
              cost: `$${generationCost.toFixed(4)}`,
              nextSteps: [
                `Preview: ${previewUrl}`,
                `Edit in VULK: ${editorUrl}`,
                "Use the 'edit' tool to make changes",
                "Use the 'deploy' tool to publish to production",
                "Use the 'files' tool to read the source code",
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: edit ────────────────────────────────────────────────

server.tool(
  "edit",
  "Modify an existing VULK project using natural language. " +
    "Describe the changes and VULK's AI will update the relevant files. " +
    "Works like a senior developer taking instructions.",
  {
    projectId: z.string().describe("Project ID to edit"),
    instruction: z
      .string()
      .describe(
        "What to change. Be specific. " +
          "Example: 'Add a settings page with tabs for Profile, Billing, and Notifications. " +
          "Include form validation and a save button with loading state.'"
      ),
  },
  async ({ projectId, instruction }) => {
    const apiKey = getApiKey();
    const log = (msg: string) =>
      process.stderr.write(`[vulk] ${msg}\n`);

    // Get existing files for context
    log("Fetching project files...");
    const filesRes = await vulkApi<{
      files: Array<{ path: string; content: string }>;
    }>(`/api/v1/projects/${projectId}/files`, apiKey);

    if (!filesRes.ok) {
      return err(filesRes, "Project not found or no files");
    }

    const existingFiles = filesRes.data.files || [];
    log(
      `Found ${existingFiles.length} files. Starting edit...`
    );

    // Trigger edit via agent stream
    const updatedFiles: string[] = [];
    let editError: string | null = null;

    try {
      const stream = await vulkStream("/api/agent/stream", apiKey, {
        message: instruction,
        uiId: projectId,
        isEdit: true,
        existingFiles: existingFiles.map((f) => ({
          path: f.path,
          content: f.content,
        })),
      });

      for await (const event of stream) {
        if (event.type === "file_complete" && event.payload?.filePath) {
          updatedFiles.push(event.payload.filePath as string);
          log(`  Updated: ${event.payload.filePath}`);
        }
        if (event.type === "error") {
          editError =
            (event.payload?.message as string) || "Edit failed";
        }
      }
    } catch (e) {
      editError = e instanceof Error ? e.message : "Stream failed";
    }

    if (editError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Edit failed: ${editError}\n\nTry in the editor: https://vulk.dev/ui/${projectId}`,
          },
        ],
        isError: true as const,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "complete",
              projectId,
              filesUpdated: updatedFiles.length,
              files: updatedFiles,
              previewUrl: `https://webapp.vulk.dev/${projectId}`,
              editorUrl: `https://vulk.dev/ui/${projectId}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: list ────────────────────────────────────────────────

server.tool(
  "list",
  "List your VULK projects. Returns project IDs, descriptions, " +
    "creation dates, and deployment URLs.",
  {
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of projects (1-100, default 20)"),
    offset: z
      .number()
      .min(0)
      .optional()
      .describe("Skip N projects (for pagination)"),
  },
  async ({ limit, offset }) => {
    const apiKey = getApiKey();
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));

    const res = await vulkApi<{
      projects: Array<{
        id: string;
        prompt: string;
        createdAt: string;
        updatedAt: string;
        deploymentUrl?: string;
      }>;
    }>(`/api/v1/projects?${params}`, apiKey);

    if (!res.ok) return err(res, "Failed to list projects");

    const projects = (res.data.projects || []).map((p) => ({
      ...p,
      editorUrl: `https://vulk.dev/ui/${p.id}`,
      previewUrl: `https://webapp.vulk.dev/${p.id}`,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ projects, total: projects.length }, null, 2),
        },
      ],
    };
  }
);

// ── Tool: get ─────────────────────────────────────────────────

server.tool(
  "get",
  "Get details about a specific project — status, files, deployment URL, " +
    "and metadata.",
  {
    projectId: z.string().describe("Project ID"),
  },
  async ({ projectId }) => {
    const apiKey = getApiKey();
    const res = await vulkApi<{
      project: Record<string, unknown>;
    }>(`/api/v1/projects/${projectId}`, apiKey);

    if (!res.ok) return err(res, "Project not found");

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ...res.data.project,
              editorUrl: `https://vulk.dev/ui/${projectId}`,
              previewUrl: `https://webapp.vulk.dev/${projectId}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: files ───────────────────────────────────────────────

server.tool(
  "files",
  "Read the source code of a VULK project. Returns every file with " +
    "its path, content, language, and size.",
  {
    projectId: z.string().describe("Project ID"),
  },
  async ({ projectId }) => {
    const apiKey = getApiKey();
    const res = await vulkApi<{
      files: Array<{
        path: string;
        content: string;
        language?: string;
        size?: number;
      }>;
      total: number;
    }>(`/api/v1/projects/${projectId}/files`, apiKey);

    if (!res.ok) return err(res, "Project not found");

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              projectId,
              totalFiles: res.data.total,
              files: res.data.files,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: deploy ──────────────────────────────────────────────

server.tool(
  "deploy",
  "Deploy a VULK project to production on Cloudflare Pages. " +
    "Returns the live production URL. Requires an active subscription.",
  {
    projectId: z.string().describe("Project ID to deploy"),
  },
  async ({ projectId }) => {
    const apiKey = getApiKey();

    // Trigger deploy via the worker deploy endpoint
    const res = await vulkApi<{
      success: boolean;
      url?: string;
      error?: string;
    }>("/api/cloudflare/worker/deploy", apiKey, {
      method: "POST",
      body: { projectId },
      timeout: 120_000, // deploys can take up to 2 minutes
    });

    if (!res.ok || !res.data.success) {
      const msg =
        res.data.error ||
        "Deploy failed. Make sure you have an active subscription.";
      return {
        content: [
          {
            type: "text" as const,
            text: `Deploy failed: ${msg}\n\nDeploy manually: https://vulk.dev/ui/${projectId}`,
          },
        ],
        isError: true as const,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "deployed",
              projectId,
              productionUrl: res.data.url,
              editorUrl: `https://vulk.dev/ui/${projectId}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: models ──────────────────────────────────────────────

server.tool(
  "models",
  "List all AI models available on VULK — names, providers, capabilities, " +
    "and which plan tier they require.",
  {},
  async () => {
    const apiKey = getApiKey();
    const res = await vulkApi("/api/v1/models", apiKey);

    if (!res.ok) return err(res, "Failed to list models");

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
      ],
    };
  }
);

// ── Tool: usage ───────────────────────────────────────────────

server.tool(
  "usage",
  "Check your VULK API usage — requests made, credits remaining, " +
    "and rate limit status.",
  {},
  async () => {
    const apiKey = getApiKey();
    const res = await vulkApi("/api/v1/usage", apiKey);

    if (!res.ok) return err(res, "Failed to get usage");

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
      ],
    };
  }
);

// ── Tool: subscribe ───────────────────────────────────────────

server.tool(
  "subscribe",
  "Get a link to upgrade your VULK plan. Credits are token-based — " +
    "simple apps use ~100 credits, complex ones ~500+.",
  {
    plan: z
      .enum(["builder", "pro", "team", "max", "business"])
      .optional()
      .describe("Plan to subscribe to. Opens pricing page if omitted."),
  },
  async ({ plan }) => {
    const url = plan
      ? `https://vulk.dev/pricing?plan=${plan}`
      : "https://vulk.dev/pricing";

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              url,
              plans: {
                builder: {
                  price: "$19.99/mo",
                  credits: "1,000/mo",
                  models: "Basic (Haiku, Flash, Mini)",
                  features: [
                    "Unlimited projects",
                    "Custom domains",
                    "Export to PWA & APK",
                    "Email support",
                  ],
                },
                pro: {
                  price: "$39.99/mo",
                  credits: "2,500/mo",
                  models: "All 16+ models",
                  features: [
                    "Everything in Builder",
                    "All AI models (Claude, GPT-4o, Gemini, etc.)",
                    "Figma import",
                    "GitHub integration",
                    "Team collaboration (3 users)",
                    "API access",
                    "iOS export + Flutter converter",
                  ],
                },
                team: {
                  price: "$79.99/mo",
                  credits: "5,000/mo (shared)",
                  models: "All models",
                  features: [
                    "Everything in Pro",
                    "Unlimited team members",
                    "Included .com domain",
                    "Analytics dashboard",
                    "Role-based permissions",
                  ],
                },
                max: {
                  price: "$199/mo",
                  credits: "10,000/mo",
                  models: "All + BYOM",
                  features: [
                    "Everything in Pro",
                    "White-label solution",
                    "BYOM (Bring Your Own Model)",
                    "Training opt-out (privacy)",
                    "App Store submission support",
                  ],
                },
                business: {
                  price: "$299/mo",
                  credits: "20,000/mo",
                  models: "All + custom",
                  features: [
                    "Everything in Team + Max",
                    "SSO/SAML integration",
                    "SLA guarantee (99.9%)",
                    "Dedicated 24/7 support",
                    "Audit logs",
                  ],
                },
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Helpers ───────────────────────────────────────────────────

function err(res: ApiResponse, fallback: string) {
  const msg =
    (res.data as Record<string, string>)?.error ||
    `${fallback} (HTTP ${res.status})`;
  return {
    content: [{ type: "text" as const, text: msg }],
    isError: true as const,
  };
}

// ── Start ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`[vulk] Fatal: ${e}\n`);
  process.exit(1);
});
