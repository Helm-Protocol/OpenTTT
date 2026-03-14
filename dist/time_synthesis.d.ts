import { Buffer } from 'buffer';
import { TimeReading, SynthesizedTime, ProofOfTime } from "./types";
export interface TimeSource {
    name: string;
    getTime(): Promise<TimeReading>;
}
export declare class NTPSource implements TimeSource {
    name: string;
    private host;
    private port;
    constructor(name: string, host: string, port?: number);
    getTime(): Promise<TimeReading>;
}
export declare class TimeSynthesis {
    private sources;
    private usedNonces;
    private readonly MAX_NONCE_CACHE;
    private readonly NONCE_TTL_MS;
    constructor(config?: {
        sources?: string[];
    });
    getFromSource(name: string): Promise<TimeReading>;
    synthesize(): Promise<SynthesizedTime>;
    /**
     * Generates a Proof of Time (PoT) with verification of source readings.
     */
    generateProofOfTime(): Promise<ProofOfTime>;
    /**
     * Verify Proof of Time integrity.
     * Fix 2: Checks expiration and nonce replay.
     * Fix 3: Uses sourceReadings (renamed from signatures).
     */
    verifyProofOfTime(pot: ProofOfTime): boolean;
    /**
     * Generates a bytes32 hash of the PoT for on-chain submission.
     */
    static getOnChainHash(pot: ProofOfTime): string;
    /**
     * Serializes PoT to JSON string.
     */
    static serializeToJSON(pot: ProofOfTime): string;
    /**
     * Deserializes PoT from JSON string.
     */
    static deserializeFromJSON(json: string): ProofOfTime;
    /**
     * Serializes PoT to compact binary format.
     * Layout: header(19) + nonce(1+N) + expiresAt(8) + readings(variable)
     */
    static serializeToBinary(pot: ProofOfTime): Buffer;
    /**
     * Deserializes PoT from compact binary format.
     */
    static deserializeFromBinary(buf: Buffer): ProofOfTime;
}
