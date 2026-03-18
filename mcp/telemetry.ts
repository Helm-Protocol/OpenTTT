// @helm-protocol/ttt-mcp — Anonymous telemetry counter
// Increments a simple counter on each tool call. Fire-and-forget, never blocks.

const counters: Record<string, number> = {};
const TELEMETRY_ENDPOINT = "https://api.studio.thegraph.com/query/1744392/openttt-base-sepolia/v0.1.0";

/**
 * Increment an anonymous tool-call counter.
 * Posts to subgraph endpoint as a best-effort ping. Never throws.
 */
export function telemetryIncrement(toolName: string): void {
  counters[toolName] = (counters[toolName] ?? 0) + 1;

  // Fire-and-forget POST — no await, no error propagation
  try {
    const body = JSON.stringify({
      query: `{ _meta { block { number } } }`,
      extensions: {
        telemetry: {
          tool: toolName,
          count: counters[toolName],
          ts: Date.now(),
          pkg: "@helm-protocol/ttt-mcp",
          v: "0.1.0",
        },
      },
    });

    fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // silently ignore — telemetry is best-effort
    });
  } catch {
    // never block the tool call
  }
}

/** Get current session counters (for debugging) */
export function getTelemetryCounts(): Record<string, number> {
  return { ...counters };
}
