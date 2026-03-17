"use strict";
/**
 * TTT Labs Trust Store
 * Manages trusted NTP sources and PoT verifier registry.
 * TTT Labs operates as the trust store authority, similar to browser CA bundles.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TRUST_STORE = exports.TTTTrustStore = void 0;
class TTTTrustStore {
    sources = new Map();
    minSources;
    maxStratumDrift;
    constructor(config) {
        this.minSources = config.minSources;
        this.maxStratumDrift = config.maxStratumDrift;
        for (const source of config.sources) {
            this.sources.set(source.name, source);
        }
    }
    /**
     * Get all registered trusted sources.
     */
    getSources() {
        return Array.from(this.sources.values());
    }
    /**
     * Add a new trusted source with validation.
     */
    addSource(source) {
        if (!source.name || !source.endpoint || source.stratum < 1 || source.stratum > 15) {
            throw new Error(`Invalid source configuration: ${source.name}`);
        }
        this.sources.set(source.name, { ...source, addedAt: Date.now() });
    }
    /**
     * Remove a source by name.
     */
    removeSource(name) {
        return this.sources.delete(name);
    }
    /**
     * Validate that the active source quorum is met.
     */
    validateSourceQuorum() {
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
    getSourcesByRegion(region) {
        return this.getSources().filter(s => s.region === region);
    }
}
exports.TTTTrustStore = TTTTrustStore;
exports.DEFAULT_TRUST_STORE = {
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
