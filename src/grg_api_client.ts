/**
 * GRG API Client — replaces local GRG computation with server-side API call.
 * GRG source code stays in Helm private repo. Only API calls go through npm SDK.
 *
 * Drop-in replacement interface for local GrgForward.encode() and GrgInverse.verify().
 */

export interface GrgEncodeResult {
  /** Hex-encoded serialized shards (joined as JSON array of hex strings) */
  shards: string[];
}

export interface GrgVerifyResult {
  valid: boolean;
}

export class GrgApiClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(
    baseUrl: string = "https://grg.helmprotocol.com/api/v1",
    options?: { timeoutMs?: number }
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = options?.timeoutMs ?? 5000;
  }

  /**
   * Forward pass: encode data through GRG pipeline (server-side).
   * Same interface contract as local GrgForward.encode().
   *
   * @returns Array of Uint8Array shards (same shape as GrgForward.encode())
   */
  async encode(
    data: Uint8Array,
    chainId: number,
    poolAddress: string
  ): Promise<Uint8Array[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(`${this.baseUrl}/encode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: Buffer.from(data).toString("hex"),
          chainId: chainId,
          poolAddress,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`GRG API error: ${resp.status} ${resp.statusText}`);
      }

      const result: GrgEncodeResult = await resp.json();
      return result.shards.map((hex) => Buffer.from(hex, "hex"));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Verify: check GRG integrity (server-side).
   * Same interface contract as local GrgInverse.verify().
   *
   * @returns boolean — true if data matches the original shards
   */
  async verify(
    data: Uint8Array,
    originalShards: Uint8Array[],
    chainId: number,
    poolAddress: string
  ): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(`${this.baseUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: Buffer.from(data).toString("hex"),
          shards: originalShards.map((s) => Buffer.from(s).toString("hex")),
          chainId: chainId,
          poolAddress,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`GRG API error: ${resp.status} ${resp.statusText}`);
      }

      const result: GrgVerifyResult = await resp.json();
      return result.valid;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Health check — ping the GRG API server.
   * Returns true if reachable within timeoutMs.
   */
  async isReachable(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      return resp.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Singleton default client — uses production GRG API endpoint.
 * Can be overridden via setDefaultGrgApiClient() for testing/staging.
 */
let _defaultClient: GrgApiClient | null = null;

export function getDefaultGrgApiClient(): GrgApiClient {
  if (!_defaultClient) {
    _defaultClient = new GrgApiClient();
  }
  return _defaultClient;
}

export function setDefaultGrgApiClient(client: GrgApiClient): void {
  _defaultClient = client;
}
