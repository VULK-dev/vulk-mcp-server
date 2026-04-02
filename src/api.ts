/**
 * VULK API client for the MCP server.
 * Handles both REST calls and SSE streaming for generation.
 */

const VULK_API_BASE = process.env.VULK_API_BASE || "https://vulk.dev";

// ── REST API ──────────────────────────────────────────────────

export interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
}

export async function vulkApi<T = Record<string, unknown>>(
  path: string,
  apiKey: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    timeout?: number;
  } = {}
): Promise<ApiResponse<T>> {
  const { method = "GET", body, timeout = 30_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${VULK_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-MCP-Client": "vulk-mcp/1.0.0",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        ok: false,
        status: 408,
        data: { error: "Request timeout" } as T,
      };
    }
    return {
      ok: false,
      status: 0,
      data: {
        error: `Network error: ${e instanceof Error ? e.message : String(e)}`,
      } as T,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── SSE Stream ────────────────────────────────────────────────

export interface StreamEvent {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Connect to VULK's agent stream (SSE) and yield parsed events.
 * Used by the generate and edit tools to trigger real AI generation.
 *
 * The stream emits events like:
 *   - session_start: generation begins
 *   - file_start/file_delta/file_complete: file being generated
 *   - tool_start/tool_result: tool execution
 *   - session_end: generation complete with stats
 *   - error: something went wrong
 *   - [DONE]: stream termination
 */
export async function* vulkStream(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeout = 600_000 // 10 minute timeout for generation
): AsyncGenerator<StreamEvent> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${VULK_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-MCP-Client": "vulk-mcp/1.0.0",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errData = await res.text().catch(() => "");
      yield {
        type: "error",
        payload: {
          message: `HTTP ${res.status}: ${errData || res.statusText}`,
        },
      };
      return;
    }

    if (!res.body) {
      yield {
        type: "error",
        payload: { message: "No response body (SSE not supported)" },
      };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        // SSE termination
        if (trimmed === "data: [DONE]") return;

        // Parse SSE data lines
        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.slice(6)) as StreamEvent;
            if (data.type) {
              yield data;
            }
          } catch {
            // Skip unparseable lines (comments, heartbeats)
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      yield {
        type: "error",
        payload: { message: "Generation timed out (10 minutes)" },
      };
    } else {
      yield {
        type: "error",
        payload: {
          message: `Stream error: ${e instanceof Error ? e.message : String(e)}`,
        },
      };
    }
  } finally {
    clearTimeout(timer);
  }
}
