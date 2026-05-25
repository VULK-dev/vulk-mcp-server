#!/usr/bin/env node

/**
 * VULK MCP Server
 *
 * Public agent connector for VULK. The public surface is intentionally
 * product-level: assistants ask VULK to build, inspect, edit, and deploy
 * projects without exposing VULK's internal generation prompts, provider
 * routing, media keys, or customer data outside the authenticated account.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { vulkApi, vulkStream, type ApiResponse } from "./api.js";

// ── Server ────────────────────────────────────────────────────

const server = new McpServer({
  name: "vulk",
  version: "1.1.0",
});

const ENABLE_LEGACY_TOOLS = process.env.VULK_ENABLE_LEGACY_TOOLS !== "false";
const DEFAULT_FILE_CONTENT_LIMIT = 50_000;
const MAX_FILE_CONTENT_LIMIT = 200_000;
const MAX_EDIT_CONTEXT_BYTES = Number(
  process.env.VULK_MCP_MAX_EDIT_CONTEXT_BYTES || 2_000_000
);

// ── Schemas ───────────────────────────────────────────────────

const projectIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Use the VULK project ID only");

const promptSchema = z
  .string()
  .min(10)
  .max(20_000)
  .describe(
    "What VULK should build. Include product goal, audience, visual direction, pages, interactions, and delivery constraints."
  );

const modelSchema = z
  .string()
  .min(1)
  .max(160)
  .optional()
  .describe(
    "Optional VULK model ID. Omit to let VULK pick the best model allowed by the account."
  );

const filePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((path) => !path.startsWith("/") && !path.includes(".."), {
    message: "File paths must be project-relative and cannot contain '..'",
  });

const createProjectInput = {
  prompt: promptSchema,
  model: modelSchema,
};

const immersiveSiteInput = {
  prompt: promptSchema,
  source: z
    .enum([
      "prompt",
      "url",
      "screenshot",
      "figma",
      "product_image",
      "video_reference",
      "moodboard",
    ])
    .optional()
    .describe("Primary input type behind the request."),
  moodboard: z
    .array(z.string().min(1).max(500))
    .max(20)
    .optional()
    .describe(
      "Optional visual references, URLs, brand notes, colors, materials, motion references, or inspiration labels."
    ),
  deliveryTarget: z
    .enum(["website", "landing_page", "web_app", "showcase", "prototype"])
    .optional()
    .describe("Output format VULK should optimize for."),
  model: modelSchema,
};

const editProjectInput = {
  projectId: projectIdSchema.describe("VULK project ID to edit."),
  instruction: z
    .string()
    .min(5)
    .max(12_000)
    .describe("Natural language instruction describing the exact change."),
};

const listProjectsInput = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Number of projects to return. Defaults to 20."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of projects to skip for pagination."),
};

const getProjectInput = {
  projectId: projectIdSchema.describe("VULK project ID."),
};

const getFilesInput = {
  projectId: projectIdSchema.describe("VULK project ID."),
  paths: z
    .array(filePathSchema)
    .max(50)
    .optional()
    .describe("Optional exact project-relative file paths to return."),
  includeContent: z
    .boolean()
    .default(false)
    .describe(
      "When false, returns only the file manifest. When true, returns content with redaction and size limits."
    ),
  maxBytes: z
    .number()
    .int()
    .min(1_000)
    .max(MAX_FILE_CONTENT_LIMIT)
    .default(DEFAULT_FILE_CONTENT_LIMIT)
    .describe("Maximum total file-content bytes returned when includeContent is true."),
};

const subscribeInput = {
  plan: z
    .enum(["builder", "pro", "team", "max", "business"])
    .optional()
    .describe("Plan to open. If omitted, returns the pricing page."),
};

// ── Types ─────────────────────────────────────────────────────

type ProjectFile = {
  path: string;
  content: string;
  language?: string;
  size?: number;
};

type StreamSummary = {
  files: Array<{ path: string; language?: string }>;
  error: string | null;
  totalTokens: number;
  cost: number;
};

// ── Tool Registration ─────────────────────────────────────────

server.registerTool(
  "create_visual_brief",
  {
    title: "Create Visual Brief",
    description:
      "Turn a raw idea into a concise production brief for an immersive VULK project. This does not create a project or call external services.",
    inputSchema: {
      prompt: promptSchema,
      source: immersiveSiteInput.source,
      moodboard: immersiveSiteInput.moodboard,
      deliveryTarget: immersiveSiteInput.deliveryTarget,
    },
    annotations: {
      title: "Create Visual Brief",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ prompt, source, moodboard, deliveryTarget }) =>
    jsonResult(
      buildVisualBrief({
        prompt,
        source,
        moodboard,
        deliveryTarget,
      })
    )
);

server.registerTool(
  "create_project",
  {
    title: "Create VULK Project",
    description:
      "Create a complete VULK project from a prompt and return project, preview, and editor URLs. This may consume account credits.",
    inputSchema: createProjectInput,
    annotations: {
      title: "Create VULK Project",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ prompt, model }) => generateProject({ prompt, model })
);

server.registerTool(
  "generate_immersive_site",
  {
    title: "Generate Immersive Site",
    description:
      "Generate a 3D, motion-rich, cinematic VULK web experience from a prompt, visual reference, URL, Figma, screenshot, video reference, or moodboard. Returns delivery URLs, not raw media assets.",
    inputSchema: immersiveSiteInput,
    annotations: {
      title: "Generate Immersive Site",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ prompt, source, moodboard, deliveryTarget, model }) =>
    generateProject({
      prompt: buildImmersivePrompt({ prompt, source, moodboard, deliveryTarget }),
      model,
      mode: "immersive_site",
    })
);

server.registerTool(
  "edit_project",
  {
    title: "Edit VULK Project",
    description:
      "Apply a natural-language change to an existing VULK project. VULK updates relevant files and returns preview/editor URLs.",
    inputSchema: editProjectInput,
    annotations: {
      title: "Edit VULK Project",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ projectId, instruction }) => editProject({ projectId, instruction })
);

server.registerTool(
  "list_projects",
  {
    title: "List VULK Projects",
    description: "List VULK projects visible to the authenticated account.",
    inputSchema: listProjectsInput,
    annotations: readOnlyCloudAnnotations("List VULK Projects"),
  },
  async ({ limit, offset }) => listProjects({ limit, offset })
);

server.registerTool(
  "get_project",
  {
    title: "Get VULK Project",
    description:
      "Get metadata, preview URL, and editor URL for one VULK project.",
    inputSchema: getProjectInput,
    annotations: readOnlyCloudAnnotations("Get VULK Project"),
  },
  async ({ projectId }) => getProject({ projectId })
);

server.registerTool(
  "get_project_files",
  {
    title: "Get VULK Project Files",
    description:
      "Return a project's file manifest. File content is omitted by default and, when requested, is redacted and size-limited.",
    inputSchema: getFilesInput,
    annotations: readOnlyCloudAnnotations("Get VULK Project Files"),
  },
  async ({ projectId, paths, includeContent, maxBytes }) =>
    getProjectFiles({ projectId, paths, includeContent, maxBytes })
);

server.registerTool(
  "deploy_project",
  {
    title: "Deploy VULK Project",
    description:
      "Deploy a VULK project to production and return the production URL. Requires an eligible VULK plan.",
    inputSchema: getProjectInput,
    annotations: {
      title: "Deploy VULK Project",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ projectId }) => deployProject({ projectId })
);

server.registerTool(
  "list_models",
  {
    title: "List VULK Models",
    description: "List AI models available to the authenticated VULK account.",
    annotations: readOnlyCloudAnnotations("List VULK Models"),
  },
  async () => listModels()
);

server.registerTool(
  "get_usage",
  {
    title: "Get VULK Usage",
    description:
      "Check API usage, credits, and rate-limit status for the authenticated VULK account.",
    annotations: readOnlyCloudAnnotations("Get VULK Usage"),
  },
  async () => getUsage()
);

server.registerTool(
  "subscribe",
  {
    title: "Open VULK Billing",
    description:
      "Return a VULK pricing or checkout URL. This does not change billing by itself.",
    inputSchema: subscribeInput,
    annotations: {
      title: "Open VULK Billing",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ plan }) => subscribe({ plan })
);

if (ENABLE_LEGACY_TOOLS) {
  registerLegacyTools();
}

// ── Handlers ──────────────────────────────────────────────────

async function generateProject({
  prompt,
  model,
  mode = "project",
}: {
  prompt: string;
  model?: string;
  mode?: "project" | "immersive_site";
}) {
  const apiKey = getApiKey();

  log("Creating project...");
  const createRes = await vulkApi<{
    project: { id: string };
  }>("/api/v1/projects", apiKey, {
    method: "POST",
    body: { prompt, model, source: "mcp", mode },
  });

  if (!createRes.ok) {
    return err(createRes, "Failed to create project");
  }

  const uiId = createRes.data.project.id;
  log(`Project ${uiId} created. Starting generation...`);

  const summary = await runGenerationStream({
    apiKey,
    message: prompt,
    uiId,
    model,
  });

  if (summary.error) {
    return errorResult(
      `Generation failed: ${summary.error}\n\nOpen the editor: https://vulk.dev/ui/${uiId}`
    );
  }

  const editorUrl = `https://vulk.dev/ui/${uiId}`;
  const previewUrl = `https://webapp.vulk.dev/${uiId}`;
  log(`Generation complete: ${summary.files.length} files`);

  return jsonResult({
    status: "complete",
    mode,
    projectId: uiId,
    editorUrl,
    previewUrl,
    filesGenerated: summary.files.length,
    files: summary.files.map((file) => file.path),
    tokens: summary.totalTokens,
    cost: `$${summary.cost.toFixed(4)}`,
    nextSteps: [
      `Preview: ${previewUrl}`,
      `Edit in VULK: ${editorUrl}`,
      "Use edit_project to make changes.",
      "Use get_project_files without includeContent first; request specific paths only when needed.",
      "Use deploy_project when ready to publish.",
    ],
  });
}

async function editProject({
  projectId,
  instruction,
}: {
  projectId: string;
  instruction: string;
}) {
  const apiKey = getApiKey();

  log("Fetching safe project context...");
  const filesRes = await fetchProjectFiles(apiKey, projectId);
  if (!filesRes.ok) {
    return err(filesRes, "Project not found or no files");
  }

  const context = buildEditContext(filesRes.data.files || []);
  log(
    `Using ${context.files.length} safe files (${context.bytes} bytes) for edit context.`
  );

  const summary = await runGenerationStream({
    apiKey,
    message: instruction,
    uiId: projectId,
    isEdit: true,
    existingFiles: context.files,
  });

  if (summary.error) {
    return errorResult(
      `Edit failed: ${summary.error}\n\nOpen the editor: https://vulk.dev/ui/${projectId}`
    );
  }

  return jsonResult({
    status: "complete",
    projectId,
    filesUpdated: summary.files.length,
    files: summary.files.map((file) => file.path),
    contextPolicy: {
      filesSent: context.files.length,
      filesSkipped: context.skipped,
      sensitiveFilesRedacted: context.sensitive,
      maxContextBytes: MAX_EDIT_CONTEXT_BYTES,
    },
    previewUrl: `https://webapp.vulk.dev/${projectId}`,
    editorUrl: `https://vulk.dev/ui/${projectId}`,
  });
}

async function listProjects({
  limit,
  offset,
}: {
  limit?: number;
  offset?: number;
}) {
  const apiKey = getApiKey();
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  const qs = params.toString();

  const res = await vulkApi<{
    projects: Array<{
      id: string;
      prompt: string;
      createdAt: string;
      updatedAt: string;
      deploymentUrl?: string;
      deployedUrl?: string;
    }>;
    pagination?: Record<string, unknown>;
  }>(`/api/v1/projects${qs ? `?${qs}` : ""}`, apiKey);

  if (!res.ok) return err(res, "Failed to list projects");

  const projects = (res.data.projects || []).map((project) => ({
    ...project,
    editorUrl: `https://vulk.dev/ui/${project.id}`,
    previewUrl: `https://webapp.vulk.dev/${project.id}`,
  }));

  return jsonResult({
    projects,
    total: projects.length,
    pagination: res.data.pagination,
  });
}

async function getProject({ projectId }: { projectId: string }) {
  const apiKey = getApiKey();
  const res = await vulkApi<{
    project: Record<string, unknown>;
  }>(`/api/v1/projects/${projectId}`, apiKey);

  if (!res.ok) return err(res, "Project not found");

  return jsonResult({
    ...res.data.project,
    editorUrl: `https://vulk.dev/ui/${projectId}`,
    previewUrl: `https://webapp.vulk.dev/${projectId}`,
  });
}

async function getProjectFiles({
  projectId,
  paths,
  includeContent,
  maxBytes,
}: {
  projectId: string;
  paths?: string[];
  includeContent: boolean;
  maxBytes: number;
}) {
  const apiKey = getApiKey();
  const res = await fetchProjectFiles(apiKey, projectId);
  if (!res.ok) return err(res, "Project not found");

  const requested = paths ? new Set(paths) : null;
  const files = (res.data.files || []).filter((file) =>
    requested ? requested.has(file.path) : true
  );

  const payload = includeContent
    ? serializeFilesWithContent(files, maxBytes)
    : {
        files: files.map((file) => ({
          path: file.path,
          language: file.language,
          size: file.size ?? file.content.length,
          sensitive: isSensitivePath(file.path),
        })),
        contentIncluded: false,
      };

  return jsonResult({
    projectId,
    totalFiles: res.data.total ?? res.data.files?.length ?? files.length,
    returnedFiles: files.length,
    filter: paths ? { paths } : undefined,
    ...payload,
  });
}

async function deployProject({ projectId }: { projectId: string }) {
  const apiKey = getApiKey();

  const res = await vulkApi<{
    success: boolean;
    url?: string;
    error?: string;
  }>("/api/cloudflare/worker/deploy", apiKey, {
    method: "POST",
    body: { projectId },
    timeout: 120_000,
  });

  if (!res.ok || !res.data.success) {
    return errorResult(
      `Deploy failed: ${
        res.data.error ||
        "Make sure the account has an active subscription and the project is ready."
      }\n\nDeploy manually: https://vulk.dev/ui/${projectId}`
    );
  }

  return jsonResult({
    status: "deployed",
    projectId,
    productionUrl: res.data.url,
    editorUrl: `https://vulk.dev/ui/${projectId}`,
  });
}

async function listModels() {
  const apiKey = getApiKey();
  const res = await vulkApi("/api/v1/models", apiKey);
  if (!res.ok) return err(res, "Failed to list models");
  return jsonResult(res.data);
}

async function getUsage() {
  const apiKey = getApiKey();
  const res = await vulkApi("/api/v1/usage", apiKey);
  if (!res.ok) return err(res, "Failed to get usage");
  return jsonResult(res.data);
}

async function subscribe({ plan }: { plan?: string }) {
  const url = plan
    ? `https://vulk.dev/pricing?plan=${encodeURIComponent(plan)}`
    : "https://vulk.dev/pricing";

  return jsonResult({
    url,
    note: "Opening this URL does not change billing by itself.",
    plans: ["builder", "pro", "team", "max", "business"],
  });
}

async function runGenerationStream({
  apiKey,
  message,
  uiId,
  model,
  isEdit,
  existingFiles = [],
}: {
  apiKey: string;
  message: string;
  uiId: string;
  model?: string;
  isEdit?: boolean;
  existingFiles?: Array<{ path: string; content: string }>;
}): Promise<StreamSummary> {
  const files: StreamSummary["files"] = [];
  let error: string | null = null;
  let totalTokens = 0;
  let cost = 0;

  try {
    const stream = await vulkStream("/api/agent/stream", apiKey, {
      message,
      uiId,
      model: model || undefined,
      isEdit: Boolean(isEdit),
      existingFiles,
      source: "mcp",
    });

    for await (const event of stream) {
      switch (event.type) {
        case "file_complete":
          if (event.payload?.filePath) {
            const path = String(event.payload.filePath);
            files.push({
              path,
              language:
                typeof event.payload.language === "string"
                  ? event.payload.language
                  : undefined,
            });
            log(`  File complete: ${path}`);
          }
          break;

        case "session_end": {
          const tokens = event.payload?.tokensUsed as
            | Record<string, number>
            | undefined;
          totalTokens = (tokens?.input || 0) + (tokens?.output || 0);
          cost = typeof event.payload?.cost === "number" ? event.payload.cost : 0;
          break;
        }

        case "error":
          error =
            typeof event.payload?.message === "string"
              ? event.payload.message
              : "Generation failed";
          break;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Stream connection failed";
  }

  return { files, error, totalTokens, cost };
}

// ── Public Prompt Helpers ─────────────────────────────────────

function buildVisualBrief({
  prompt,
  source,
  moodboard,
  deliveryTarget,
}: {
  prompt: string;
  source?: string;
  moodboard?: string[];
  deliveryTarget?: string;
}) {
  return {
    kind: "vulk_visual_brief",
    source: source || "prompt",
    deliveryTarget: deliveryTarget || "website",
    userIntent: prompt,
    visualReferences: moodboard || [],
    recommendedVulkTool: "generate_immersive_site",
    creativeDirection: {
      output:
        "A production web experience with a strong first viewport, real interaction states, responsive layout, and deployable source code.",
      immersiveLayer:
        "Use 3D, WebGL, motion, video sections, or visual storytelling only when they support the product narrative.",
      moodboardRole:
        "Treat references as direction for palette, material, motion, pacing, typography, composition, and content hierarchy.",
      delivery:
        "Return a VULK project with preview and editor URLs. Do not expose raw provider prompts or media-generation internals.",
    },
    productionPrompt: buildImmersivePrompt({
      prompt,
      source,
      moodboard,
      deliveryTarget,
    }),
  };
}

function buildImmersivePrompt({
  prompt,
  source,
  moodboard,
  deliveryTarget,
}: {
  prompt: string;
  source?: string;
  moodboard?: string[];
  deliveryTarget?: string;
}): string {
  const references =
    moodboard && moodboard.length > 0
      ? `\n\nVisual/moodboard references:\n${moodboard.map((item) => `- ${item}`).join("\n")}`
      : "";

  return [
    "Build a production-grade immersive web project in VULK.",
    `Delivery target: ${deliveryTarget || "website"}.`,
    `Input source: ${source || "prompt"}.`,
    "",
    "Creative requirements:",
    "- Make the first viewport immediately communicate the product, object, place, or offer.",
    "- Use 3D/WebGL, cinematic motion, scroll-driven scenes, video-rich sections, or spatial storytelling when they materially improve the brief.",
    "- Keep the output usable: real navigation, responsive layout, clear calls to action, accessible text, and complete interaction states.",
    "- Prefer real project structure and production code over mockups, screenshots, or standalone media files.",
    "- Never include credentials, private tokens, customer data, or provider implementation details in generated files.",
    "",
    "User brief:",
    prompt,
    references,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── File Safety ───────────────────────────────────────────────

async function fetchProjectFiles(apiKey: string, projectId: string) {
  return vulkApi<{
    files: ProjectFile[];
    total: number;
  }>(`/api/v1/projects/${projectId}/files`, apiKey);
}

function buildEditContext(files: ProjectFile[]) {
  const safeFiles: Array<{ path: string; content: string }> = [];
  let bytes = 0;
  let skipped = 0;
  let sensitive = 0;

  for (const file of files) {
    if (isSensitivePath(file.path)) {
      sensitive += 1;
      continue;
    }

    const size = Buffer.byteLength(file.content, "utf8");
    if (bytes + size > MAX_EDIT_CONTEXT_BYTES) {
      skipped += 1;
      continue;
    }

    safeFiles.push({ path: file.path, content: file.content });
    bytes += size;
  }

  return { files: safeFiles, bytes, skipped, sensitive };
}

function serializeFilesWithContent(files: ProjectFile[], maxBytes: number) {
  let remaining = Math.min(maxBytes, MAX_FILE_CONTENT_LIMIT);
  let includedContentBytes = 0;

  return {
    contentIncluded: true,
    maxBytes,
    files: files.map((file) => {
      const base = {
        path: file.path,
        language: file.language,
        size: file.size ?? file.content.length,
      };

      if (isSensitivePath(file.path)) {
        return {
          ...base,
          sensitive: true,
          contentRedacted: true,
          redactionReason: "Sensitive-looking path",
        };
      }

      if (remaining <= 0) {
        return {
          ...base,
          content: "",
          contentTruncated: true,
          truncationReason: "maxBytes exhausted",
        };
      }

      const bytes = Buffer.byteLength(file.content, "utf8");
      if (bytes <= remaining) {
        remaining -= bytes;
        includedContentBytes += bytes;
        return { ...base, content: file.content, contentTruncated: false };
      }

      const content = truncateUtf8(file.content, remaining);
      const emittedBytes = Buffer.byteLength(content, "utf8");
      remaining = 0;
      includedContentBytes += emittedBytes;
      return {
        ...base,
        content,
        contentTruncated: true,
        truncationReason: "maxBytes limit",
      };
    }),
    includedContentBytes,
  };
}

function isSensitivePath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    /(^|\/)\.env($|[./_-])/.test(normalized) ||
    /(^|\/)(id_rsa|id_ed25519|known_hosts|authorized_keys)$/.test(normalized) ||
    /(^|\/)(secrets?|credentials?|service-account|firebase-admin)(\.|\/|$)/.test(
      normalized
    ) ||
    /\.(pem|key|p12|pfx|crt|cer)$/i.test(path) ||
    /(^|\/)(\.npmrc|\.pypirc|\.netrc|kubeconfig|config\.json)$/.test(
      normalized
    )
  );
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const buffer = Buffer.from(value, "utf8");
  if (buffer.length <= maxBytes) return value;
  return buffer.subarray(0, maxBytes).toString("utf8").replace(/\uFFFD$/u, "");
}

// ── Legacy Tool Aliases ───────────────────────────────────────

function registerLegacyTools() {
  server.registerTool(
    "generate",
    {
      title: "Generate VULK Project (Legacy)",
      description:
        "Legacy alias for create_project. Prefer create_project or generate_immersive_site in new clients.",
      inputSchema: createProjectInput,
      annotations: {
        title: "Generate VULK Project",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ prompt, model }) => generateProject({ prompt, model })
  );

  server.registerTool(
    "edit",
    {
      title: "Edit VULK Project (Legacy)",
      description: "Legacy alias for edit_project.",
      inputSchema: editProjectInput,
      annotations: {
        title: "Edit VULK Project",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ projectId, instruction }) => editProject({ projectId, instruction })
  );

  server.registerTool(
    "list",
    {
      title: "List VULK Projects (Legacy)",
      description: "Legacy alias for list_projects.",
      inputSchema: listProjectsInput,
      annotations: readOnlyCloudAnnotations("List VULK Projects"),
    },
    async ({ limit, offset }) => listProjects({ limit, offset })
  );

  server.registerTool(
    "get",
    {
      title: "Get VULK Project (Legacy)",
      description: "Legacy alias for get_project.",
      inputSchema: getProjectInput,
      annotations: readOnlyCloudAnnotations("Get VULK Project"),
    },
    async ({ projectId }) => getProject({ projectId })
  );

  server.registerTool(
    "files",
    {
      title: "Get VULK Project Files (Legacy)",
      description:
        "Legacy alias for get_project_files. Content is omitted by default for safety.",
      inputSchema: getFilesInput,
      annotations: readOnlyCloudAnnotations("Get VULK Project Files"),
    },
    async ({ projectId, paths, includeContent, maxBytes }) =>
      getProjectFiles({ projectId, paths, includeContent, maxBytes })
  );

  server.registerTool(
    "deploy",
    {
      title: "Deploy VULK Project (Legacy)",
      description: "Legacy alias for deploy_project.",
      inputSchema: getProjectInput,
      annotations: {
        title: "Deploy VULK Project",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ projectId }) => deployProject({ projectId })
  );

  server.registerTool(
    "models",
    {
      title: "List VULK Models (Legacy)",
      description: "Legacy alias for list_models.",
      annotations: readOnlyCloudAnnotations("List VULK Models"),
    },
    async () => listModels()
  );

  server.registerTool(
    "usage",
    {
      title: "Get VULK Usage (Legacy)",
      description: "Legacy alias for get_usage.",
      annotations: readOnlyCloudAnnotations("Get VULK Usage"),
    },
    async () => getUsage()
  );
}

// ── Helpers ───────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.VULK_API_KEY;
  if (!key) {
    throw new Error(
      "VULK_API_KEY not set.\n\n" +
        "1. Go to https://vulk.dev/settings/api-keys\n" +
        "2. Create a new API key\n" +
        "3. Set it as VULK_API_KEY in your MCP server config\n\n" +
        "Example:\n" +
        '  { "env": { "VULK_API_KEY": "vk_sk_..." } }'
    );
  }
  if (!key.startsWith("vk_sk_")) {
    throw new Error("Invalid VULK_API_KEY. Keys start with vk_sk_");
  }
  return key;
}

function readOnlyCloudAnnotations(title: string) {
  return {
    title,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true as const,
  };
}

function err(res: ApiResponse, fallback: string) {
  const data = res.data as Record<string, unknown>;
  const message =
    typeof data?.error === "string"
      ? data.error
      : `${fallback} (HTTP ${res.status})`;

  return errorResult(message);
}

function log(message: string) {
  process.stderr.write(`[vulk] ${message}\n`);
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
