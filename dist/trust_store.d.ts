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
export declare class TTTTrustStore {
    private sources;
    private minSources;
    private maxStratumDrift;
    constructor(config: TrustStoreConfig);
    /**
     * Get all registered trusted sources.
     */
    getSources(): TrustedSource[];
    /**
     * Add a new trusted source with validation.
     */
    addSource(source: TrustedSource): void;
    /**
     * Remove a source by name.
     */
    removeSource(name: string): boolean;
    /**
     * Validate that the active source quorum is met.
     */
    validateSourceQuorum(): {
        valid: boolean;
        activeSources: number;
        required: number;
    };
    /**
     * Filter sources by region.
     */
    getSourcesByRegion(region: string): TrustedSource[];
}
export declare const DEFAULT_TRUST_STORE: TrustStoreConfig;
