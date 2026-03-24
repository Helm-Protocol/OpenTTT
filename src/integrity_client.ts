/**
 * Integrity Client — replaces local integrity computation with server-side API call.
 * Core pipeline source code stays in Helm private repo. Only API calls go through npm SDK.
 *
 * Drop-in replacement interface for local encode() and verify() operations.
 */

export interface IntegrityEncodeResult {
  /** Hex-encoded serialized shards (joined as JSON array of hex strings) */
  shards: string[];
}

export interface IntegrityVerifyResult {
  valid: boolean;
}

export class IntegrityClient {
  private baseUrl: string;
  private timeoutMs: number;
  private apiKey: string | undefined;

  constructor(
    baseUrl: string = "https://integrity.helmprotocol.com/api/v1",
    options?: { timeoutMs?: number; apiKey?: string }
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.apiKey = options?.apiKey ?? (typeof process !== "undefined" ? process.env["INTEGRITY_API_KEY"] : undefined);
  }

  /**
   * Forward pass: encode data through integrity pipeline (server-side).
   *
   * @returns Array of Uint8Array shards
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
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "X-Integrity-Key": this.apiKey } : {}),
        },
        body: JSON.stringify({
          data: Buffer.from(data).toString("hex"),
          chainId: chainId,
          poolAddress,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`Integrity API error: ${resp.status} ${resp.statusText}`);
      }

      const result: IntegrityEncodeResult = await resp.json();
      return result.shards.map((hex) => Buffer.from(hex, "hex"));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Verify: check data integrity (server-side).
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
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "X-Integrity-Key": this.apiKey } : {}),
        },
        body: JSON.stringify({
          data: Buffer.from(data).toString("hex"),
          shards: originalShards.map((s) => Buffer.from(s).toString("hex")),
          chainId: chainId,
          poolAddress,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`Integrity API error: ${resp.status} ${resp.statusText}`);
      }

      const result: IntegrityVerifyResult = await resp.json();
      return result.valid;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Health check — ping the integrity API server.
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
 * Singleton default client — uses production integrity API endpoint.
 * Can be overridden via setDefaultIntegrityClient() for testing/staging.
 */
let _defaultClient: IntegrityClient | null = null;

export function getDefaultIntegrityClient(): IntegrityClient {
  if (!_defaultClient) {
    _defaultClient = new IntegrityClient();
  }
  return _defaultClient;
}

export function setDefaultIntegrityClient(client: IntegrityClient): void {
  _defaultClient = client;
}
