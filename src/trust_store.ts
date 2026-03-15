/**
 * TTT Labs Trust Store
 * Manages trusted NTP sources and PoT verifier registry.
 * TTT Labs operates as the trust store authority, similar to browser CA bundles.
 */

export interface TrustedSource {
  name: string;
  endpoint: string;
  stratum: number;
  region: string;
  active: boolean;
  addedAt: number;
}

export interface TrustStoreConfig {
  sources: TrustedSource[];
  minSources: number;
  maxStratumDrift: number;
}

export class TTTTrustStore {
  private sources: Map<string, TrustedSource> = new Map();
  private minSources: number;
  private maxStratumDrift: number;

  constructor(config: TrustStoreConfig) {
    this.minSources = config.minSources;
    this.maxStratumDrift = config.maxStratumDrift;
    for (const source of config.sources) {
      this.sources.set(source.name, source);
    }
  }

  /**
   * Get all registered trusted sources.
   */
  getSources(): TrustedSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * Add a new trusted source with validation.
   */
  addSource(source: TrustedSource): void {
    if (!source.name || !source.endpoint || source.stratum < 1 || source.stratum > 15) {
      throw new Error(`Invalid source configuration: ${source.name}`);
    }
    this.sources.set(source.name, { ...source, addedAt: Date.now() });
  }

  /**
   * Remove a source by name.
   */
  removeSource(name: string): boolean {
    return this.sources.delete(name);
  }

  /**
   * Validate that the active source quorum is met.
   */
  validateSourceQuorum(): { valid: boolean; activeSources: number; required: number } {
    const activeSources = this.getSources().filter(s => s.active).length;
    return {
      valid: activeSources >= this.minSources,
      activeSources,
      required: this.minSources
    };
  }

  /**
   * Filter sources by region.
   */
  getSourcesByRegion(region: string): TrustedSource[] {
    return this.getSources().filter(s => s.region === region);
  }
}

export const DEFAULT_TRUST_STORE: TrustStoreConfig = {
  sources: [
    {
      name: "NIST",
      endpoint: "time.nist.gov",
      stratum: 1,
      region: "US",
      active: true,
      addedAt: 1710412800000 // March 14, 2024
    },
    {
      name: "Apple",
      endpoint: "time.apple.com",
      stratum: 1,
      region: "US",
      active: true,
      addedAt: 1710412800000
    },
    {
      name: "Google",
      endpoint: "time.google.com",
      stratum: 1,
      region: "Global",
      active: true,
      addedAt: 1710412800000
    }
  ],
  minSources: 2,
  maxStratumDrift: 1
};
