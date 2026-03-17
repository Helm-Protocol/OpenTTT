/**
 * PoT Certificate Transparency Log Client
 * Tracks all PoT anchoring events and provides query/audit capabilities.
 */
export interface PoTAnchorEntry {
    id: string;
    stratum: string;
    grgHash: string;
    potHash: string;
    timestamp: string;
    blockNumber: string;
    txHash: string;
    builderAddress: string;
}
export declare class PoTCTLog {
    private subgraphUrl;
    constructor(subgraphUrl: string);
    /**
     * Query PoT anchors with filters.
     */
    queryAnchors(filter: {
        startTime?: number;
        endTime?: number;
        stratum?: string;
        limit?: number;
    }): Promise<PoTAnchorEntry[]>;
    /**
     * Get audit trail for a specific transaction.
     */
    getAuditTrail(txHash: string): Promise<PoTAnchorEntry | null>;
    /**
     * Calculate builder performance score.
     */
    getBuilderScore(builderAddress: string): Promise<{
        totalAnchors: number;
        turboRate: number;
        avgLatencyMs: number;
    }>;
    /**
     * Get global network statistics.
     */
    getNetworkStats(): Promise<{
        totalAnchors: number;
        uniqueBuilders: number;
        avgTurboRate: number;
    }>;
}
