import { Buffer } from 'buffer';
import { TimeReading, SynthesizedTime, ProofOfTime } from "./types";
export interface TimeSource {
    name: string;
    getTime(): Promise<TimeReading>;
    close?(): void;
}
export declare class NTPSource implements TimeSource {
    name: string;
    private host;
    private port;
    constructor(name: string, host: string, port?: number);
    getTime(): Promise<TimeReading>;
}
/**
 * HTTPS-based time source (TLS-protected, immune to MITM).
 * Uses HTTP Date header from trusted TLS endpoints.
 * Preferred over plaintext NTP (UDP) which is vulnerable to spoofing.
 *
 * SECURITY MODEL — HTTPS Time Sources:
 * - All HTTPS requests use Node.js `https.request()` with default TLS settings.
 * - Default TLS behavior: certificate verification is ON (rejectUnauthorized=true).
 * - No certificate bypass (rejectUnauthorized: false) is used anywhere in this module.
 * - The TLS handshake itself provides authentication of the time server identity,
 *   preventing MITM attacks that plaintext NTP (UDP port 123) is vulnerable to.
 * - Base uncertainty for HTTPS Date header is 500ms (HTTP Date has 1-second resolution).
 * - For ±10ns precision, HTTPS is a cross-check only; GEO-sat operator is the primary source.
 */
export declare class HTTPSTimeSource implements TimeSource {
    name: string;
    private url;
    private activeRequests;
    constructor(name: string, url: string);
    getTime(): Promise<TimeReading>;
    close(): void;
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
    /**
     * Determine PoT verification tolerance based on the lowest stratum
     * observed across source readings. Lower stratum = more precise source
     * = tighter tolerance allowed.
     *
     *   Stratum 1:  10ms (10_000_000ns) - atomic clock direct
     *   Stratum 2:  25ms (25_000_000ns) - NTP server synced to stratum 1
     *   Stratum 3+: 50ms (50_000_000ns) - downstream NTP
     */
    private static getToleranceForStratum;
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
    /**
     * Closes all sources and clears internal state.
     * Call this in tests (afterEach/afterAll) to prevent open handle warnings.
     */
    close(): void;
    static deserializeFromBinary(buf: Buffer): ProofOfTime;
}
