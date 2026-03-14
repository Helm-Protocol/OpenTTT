"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeSynthesis = exports.NTPSource = void 0;
const crypto = __importStar(require("crypto"));
const dgram = __importStar(require("dgram"));
const buffer_1 = require("buffer");
const ethers_1 = require("ethers");
const logger_1 = require("./logger");
const errors_1 = require("./errors");
const NTP_OFFSET_1900_TO_1970 = 2208988800n;
class NTPSource {
    name;
    host;
    port;
    constructor(name, host, port = 123) {
        this.name = name;
        this.host = host;
        this.port = port;
    }
    async getTime() {
        return new Promise((resolve, reject) => {
            const client = dgram.createSocket('udp4');
            const packet = buffer_1.Buffer.alloc(48);
            // LI=0, VN=4, Mode=3 (Client)
            packet[0] = 0x23;
            const t1 = BigInt(Date.now()) * 1000000n; // Local originate timestamp (ns)
            const timeout = setTimeout(() => {
                client.close();
                reject(new errors_1.TTTTimeSynthesisError(`NTP timeout for ${this.host}`, "Server did not respond within 2000ms", "Check your firewall (UDP port 123) or try a different NTP server."));
            }, 2000); // 2s timeout for speed
            client.on('error', (err) => {
                clearTimeout(timeout);
                client.close();
                reject(new errors_1.TTTTimeSynthesisError(`NTP socket error for ${this.host}`, err.message, "Ensure network connectivity and that UDP 123 is outbound-allowed."));
            });
            client.on('message', (msg) => {
                const t4 = BigInt(Date.now()) * 1000000n; // Local receive timestamp (ns)
                clearTimeout(timeout);
                client.close();
                if (msg.length < 48) {
                    reject(new errors_1.TTTTimeSynthesisError(`Invalid NTP response from ${this.host}`, "Packet length < 48 bytes", "The NTP server returned a malformed response. Check the server address."));
                    return;
                }
                const stratum = msg[1];
                if (stratum === 0 || stratum > 15) {
                    reject(new errors_1.TTTTimeSynthesisError(`Invalid Stratum from ${this.host}`, `Stratum: ${stratum}`, "The NTP server is unsynchronized. Use a stratum 1 or 2 server."));
                    return;
                }
                // T2: Receive Timestamp (Server received request)
                const t2_sec = BigInt(msg.readUInt32BE(32));
                const t2_frac = BigInt(msg.readUInt32BE(36));
                if (t2_sec <= NTP_OFFSET_1900_TO_1970) {
                    reject(new errors_1.TTTTimeSynthesisError(`[NTP] Invalid T2 timestamp from ${this.host}`, `${t2_sec} <= NTP epoch offset`, "The NTP server returned a pre-1970 timestamp. Use a reliable NTP server."));
                    return;
                }
                const t2 = (t2_sec - NTP_OFFSET_1900_TO_1970) * 1000000000n + (t2_frac * 1000000000n) / (1n << 32n);
                // T3: Transmit Timestamp (Server sent response)
                const t3_sec = BigInt(msg.readUInt32BE(40));
                const t3_frac = BigInt(msg.readUInt32BE(44));
                if (t3_sec <= NTP_OFFSET_1900_TO_1970) {
                    reject(new errors_1.TTTTimeSynthesisError(`[NTP] Invalid T3 timestamp from ${this.host}`, `${t3_sec} <= NTP epoch offset`, "The NTP server returned a pre-1970 timestamp. Use a reliable NTP server."));
                    return;
                }
                const t3 = (t3_sec - NTP_OFFSET_1900_TO_1970) * 1000000000n + (t3_frac * 1000000000n) / (1n << 32n);
                // offset = ((T2-T1) + (T3-T4)) / 2
                const offset = ((t2 - t1) + (t3 - t4)) / 2n;
                const delay = (t4 - t1) - (t3 - t2);
                // Root dispersion at offset 8 (4 bytes, fixed point 16.16)
                const rootDispersionRaw = msg.readUInt32BE(8);
                const rootDispersion = Number(rootDispersionRaw) / (1 << 16) * 1000; // ms
                const rtt = Number(delay) / 1_000_000; // ms
                const uncertainty = rootDispersion + rtt / 2;
                resolve({
                    timestamp: t4 + offset,
                    uncertainty,
                    stratum,
                    source: this.name
                });
            });
            try {
                client.send(packet, 0, packet.length, this.port, this.host, (err) => {
                    if (err) {
                        clearTimeout(timeout);
                        client.close();
                        reject(new errors_1.TTTTimeSynthesisError(`Failed to send NTP packet to ${this.host}`, err.message, "Check network settings."));
                    }
                });
            }
            catch (sendErr) {
                clearTimeout(timeout);
                try {
                    client.close();
                }
                catch { /* already closed */ }
                reject(new errors_1.TTTTimeSynthesisError(`Synchronous send error for ${this.host}`, sendErr instanceof Error ? sendErr.message : String(sendErr), "Check runtime environment."));
            }
        });
    }
}
exports.NTPSource = NTPSource;
class TimeSynthesis {
    sources = [];
    // Fix 2: Bounded nonce replay cache (max 10K entries, 60s TTL) — same pattern as protocol_fee.ts
    usedNonces = new Map();
    MAX_NONCE_CACHE = 10000;
    NONCE_TTL_MS = 60000; // 60 seconds
    constructor(config) {
        const sourceNames = config?.sources || ['nist', 'kriss', 'google'];
        for (const s of sourceNames) {
            if (s === 'nist') {
                this.sources.push(new NTPSource('nist', 'time.nist.gov'));
            }
            else if (s === 'kriss') {
                this.sources.push(new NTPSource('kriss', 'time.kriss.re.kr'));
            }
            else if (s === 'google' || s === 'galileo') {
                this.sources.push(new NTPSource('google', 'time.google.com'));
            }
        }
    }
    async getFromSource(name) {
        const source = this.sources.find(s => s.name === name);
        if (!source)
            throw new errors_1.TTTTimeSynthesisError(`Source ${name} not found`, "Requested source name is not configured", "Configure the source in the TimeSynthesis constructor.");
        return source.getTime();
    }
    async synthesize() {
        const readings = [];
        const results = await Promise.allSettled(this.sources.map(s => s.getTime()));
        for (const res of results) {
            if (res.status === 'fulfilled') {
                readings.push(res.value);
            }
            else {
                logger_1.logger.warn(`[TimeSynthesis] NTP request failed: ${res.reason}`);
            }
        }
        if (readings.length === 0) {
            throw new errors_1.TTTTimeSynthesisError('[TimeSynthesis] CRITICAL: All NTP sources failed.', "Zero readings returned from all configured NTP sources", "Ensure UDP port 123 is open and NTP servers are reachable.");
        }
        if (readings.length === 1) {
            logger_1.logger.warn(`[TimeSynthesis] WARNING: Only 1 NTP source available (${readings[0].source}). Time may be unreliable.`);
            return {
                timestamp: readings[0].timestamp,
                confidence: 1 / this.sources.length,
                uncertainty: readings[0].uncertainty,
                sources: 1,
                stratum: readings[0].stratum
            };
        }
        readings.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
        let finalTimestamp;
        let finalUncertainty;
        let finalStratum;
        if (readings.length === 2) {
            finalTimestamp = (readings[0].timestamp + readings[1].timestamp) / 2n;
            finalUncertainty = (readings[0].uncertainty + readings[1].uncertainty) / 2;
            finalStratum = Math.min(readings[0].stratum, readings[1].stratum);
        }
        else {
            const mid = Math.floor(readings.length / 2);
            finalTimestamp = readings[mid].timestamp;
            finalUncertainty = readings[mid].uncertainty;
            finalStratum = readings[mid].stratum;
        }
        return {
            timestamp: finalTimestamp,
            confidence: readings.length / this.sources.length,
            uncertainty: finalUncertainty,
            sources: readings.length,
            stratum: finalStratum
        };
    }
    /**
     * Generates a Proof of Time (PoT) with verification of source readings.
     */
    async generateProofOfTime() {
        const readings = [];
        const results = await Promise.allSettled(this.sources.map(s => s.getTime()));
        for (const res of results) {
            if (res.status === 'fulfilled') {
                readings.push(res.value);
            }
        }
        if (readings.length === 0) {
            throw new errors_1.TTTTimeSynthesisError('[TimeSynthesis] Cannot generate PoT: All NTP sources failed.', "No successful readings from NTP servers.", "Check internet connection and UDP 123 access.");
        }
        readings.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
        let finalTimestamp;
        let finalUncertainty;
        let finalStratum;
        if (readings.length === 1) {
            finalTimestamp = readings[0].timestamp;
            finalUncertainty = readings[0].uncertainty;
            finalStratum = readings[0].stratum;
        }
        else if (readings.length === 2) {
            finalTimestamp = (readings[0].timestamp + readings[1].timestamp) / 2n;
            finalUncertainty = (readings[0].uncertainty + readings[1].uncertainty) / 2;
            finalStratum = Math.min(readings[0].stratum, readings[1].stratum);
        }
        else {
            const mid = Math.floor(readings.length / 2);
            finalTimestamp = readings[mid].timestamp;
            finalUncertainty = readings[mid].uncertainty;
            finalStratum = readings[mid].stratum;
        }
        const sourceReadings = readings.map(r => ({
            source: r.source,
            timestamp: r.timestamp,
            uncertainty: r.uncertainty
        }));
        // Fix 2: PoT nonce + expiration for replay protection
        const nonce = crypto.randomBytes(16).toString("hex");
        const expiresAt = BigInt(Date.now()) + 60000n; // +60 seconds
        const pot = {
            timestamp: finalTimestamp,
            uncertainty: finalUncertainty,
            sources: readings.length,
            stratum: finalStratum,
            confidence: readings.length / this.sources.length,
            sourceReadings,
            nonce,
            expiresAt,
        };
        // Verification Logic: Ensure all source timestamps are within tolerance of synthesized median
        if (!this.verifyProofOfTime(pot)) {
            throw new errors_1.TTTTimeSynthesisError("[PoT] Self-verification failed", "Source readings are too far apart from synthesized median", "Check for high network jitter or malicious NTP spoofing.");
        }
        return pot;
    }
    /**
     * Verify Proof of Time integrity.
     * Fix 2: Checks expiration and nonce replay.
     * Fix 3: Uses sourceReadings (renamed from signatures).
     */
    verifyProofOfTime(pot) {
        const TOLERANCE_NS = 100000000n; // 100ms
        if (pot.sourceReadings.length === 0)
            return false;
        if (pot.confidence <= 0)
            return false;
        // Fix 2: Expiration check
        if (BigInt(Date.now()) > pot.expiresAt) {
            logger_1.logger.warn(`[TimeSynthesis] PoT expired at ${pot.expiresAt}`);
            return false;
        }
        // Fix 2: Nonce replay protection with bounded cache + TTL cleanup
        const now = Date.now();
        // TTL cleanup pass (evict expired entries)
        if (this.usedNonces.size > this.MAX_NONCE_CACHE / 2) {
            for (const [k, ts] of this.usedNonces) {
                if (now - ts > this.NONCE_TTL_MS)
                    this.usedNonces.delete(k);
            }
        }
        if (this.usedNonces.has(pot.nonce)) {
            logger_1.logger.warn(`[TimeSynthesis] Duplicate nonce detected: ${pot.nonce}`);
            return false;
        }
        if (this.usedNonces.size >= this.MAX_NONCE_CACHE) {
            // Evict oldest entry
            const oldest = this.usedNonces.keys().next().value;
            if (oldest !== undefined)
                this.usedNonces.delete(oldest);
        }
        this.usedNonces.set(pot.nonce, now);
        for (const sig of pot.sourceReadings) {
            const diff = sig.timestamp > pot.timestamp ? sig.timestamp - pot.timestamp : pot.timestamp - sig.timestamp;
            if (diff > TOLERANCE_NS) {
                logger_1.logger.warn(`[TimeSynthesis] Reading from ${sig.source} outside tolerance: ${diff}ns`);
                return false;
            }
        }
        return true;
    }
    /**
     * Generates a bytes32 hash of the PoT for on-chain submission.
     */
    static getOnChainHash(pot) {
        return (0, ethers_1.keccak256)(ethers_1.AbiCoder.defaultAbiCoder().encode(["uint64", "uint32", "uint8", "uint8", "uint32"], [
            pot.timestamp / 1000000n, // Convert to ms for storage efficiency
            Math.round(pot.uncertainty * 1000), // Scale uncertainty
            pot.sources,
            pot.stratum,
            Math.round(pot.confidence * 1000000)
        ]));
    }
    /**
     * Serializes PoT to JSON string.
     */
    static serializeToJSON(pot) {
        return JSON.stringify(pot, (key, value) => typeof value === 'bigint' ? value.toString() : value);
    }
    /**
     * Deserializes PoT from JSON string.
     */
    static deserializeFromJSON(json) {
        const data = JSON.parse(json);
        return {
            ...data,
            timestamp: BigInt(data.timestamp),
            expiresAt: BigInt(data.expiresAt),
            sourceReadings: data.sourceReadings.map((s) => ({
                ...s,
                timestamp: BigInt(s.timestamp)
            }))
        };
    }
    /**
     * Serializes PoT to compact binary format.
     * Layout: header(19) + nonce(1+N) + expiresAt(8) + readings(variable)
     */
    static serializeToBinary(pot) {
        const nonceBytes = buffer_1.Buffer.from(pot.nonce, "utf8");
        // Header: timestamp(8) + uncertainty(4) + sources(1) + stratum(1) + confidence(4) + readingCount(1) = 19
        // + nonceLen(1) + nonce(N) + expiresAt(8)
        let size = 19 + 1 + nonceBytes.length + 8;
        for (const sig of pot.sourceReadings) {
            size += 1 + sig.source.length + 8 + 4; // nameLen(1) + name(N) + ts(8) + unc(4)
        }
        const buf = buffer_1.Buffer.alloc(size);
        let offset = 0;
        buf.writeBigUInt64BE(pot.timestamp, offset);
        offset += 8;
        buf.writeFloatBE(pot.uncertainty, offset);
        offset += 4;
        buf.writeUInt8(pot.sources, offset);
        offset += 1;
        buf.writeUInt8(pot.stratum, offset);
        offset += 1;
        buf.writeFloatBE(pot.confidence, offset);
        offset += 4;
        buf.writeUInt8(pot.sourceReadings.length, offset);
        offset += 1;
        // Nonce
        buf.writeUInt8(nonceBytes.length, offset);
        offset += 1;
        nonceBytes.copy(buf, offset);
        offset += nonceBytes.length;
        // ExpiresAt
        buf.writeBigUInt64BE(pot.expiresAt, offset);
        offset += 8;
        for (const sig of pot.sourceReadings) {
            buf.writeUInt8(sig.source.length, offset);
            offset += 1;
            buf.write(sig.source, offset);
            offset += sig.source.length;
            buf.writeBigUInt64BE(sig.timestamp, offset);
            offset += 8;
            buf.writeFloatBE(sig.uncertainty, offset);
            offset += 4;
        }
        return buf;
    }
    /**
     * Deserializes PoT from compact binary format.
     */
    static deserializeFromBinary(buf) {
        let offset = 0;
        const timestamp = buf.readBigUInt64BE(offset);
        offset += 8;
        const uncertainty = buf.readFloatBE(offset);
        offset += 4;
        const sources = buf.readUInt8(offset);
        offset += 1;
        const stratum = buf.readUInt8(offset);
        offset += 1;
        const confidence = buf.readFloatBE(offset);
        offset += 4;
        const sigCount = buf.readUInt8(offset);
        offset += 1;
        // Nonce
        const nonceLen = buf.readUInt8(offset);
        offset += 1;
        const nonce = buf.toString('utf8', offset, offset + nonceLen);
        offset += nonceLen;
        // ExpiresAt
        const expiresAt = buf.readBigUInt64BE(offset);
        offset += 8;
        const sourceReadings = [];
        for (let i = 0; i < sigCount; i++) {
            const nameLen = buf.readUInt8(offset);
            offset += 1;
            const source = buf.toString('utf8', offset, offset + nameLen);
            offset += nameLen;
            const ts = buf.readBigUInt64BE(offset);
            offset += 8;
            const unc = buf.readFloatBE(offset);
            offset += 4;
            sourceReadings.push({ source, timestamp: ts, uncertainty: unc });
        }
        return { timestamp, uncertainty, sources, stratum, confidence, sourceReadings, nonce, expiresAt };
    }
}
exports.TimeSynthesis = TimeSynthesis;
