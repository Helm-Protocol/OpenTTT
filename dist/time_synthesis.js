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
const dgram = __importStar(require("dgram"));
const buffer_1 = require("buffer");
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
                // R2-P1-2: Guard against pre-1970 timestamps from buggy/malicious NTP servers
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
                // R2-P0-1: Ensure socket is closed even if send() throws synchronously
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
                // time.galileo.eu doesn't exist, using time.google.com as a reliable global standard
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
    /**
     * 3개 소스의 중앙값(median) 알고리즘을 사용한 타임 합성.
     * 1개 실패 시: 나머지 2개의 평균
     * 2개 실패 시: 마지막 1개 사용 + 경고
     * 3개 전부 실패 시: throw Error
     */
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
                confidence: 1 / this.sources.length, // R2-P2-6: Dynamic instead of hard-coded 0.33
                uncertainty: readings[0].uncertainty,
                sources: 1,
                stratum: readings[0].stratum
            };
        }
        // Sort by timestamp
        readings.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
        let finalTimestamp;
        let finalUncertainty;
        let finalStratum;
        if (readings.length === 2) {
            // Average of 2
            finalTimestamp = (readings[0].timestamp + readings[1].timestamp) / 2n;
            finalUncertainty = (readings[0].uncertainty + readings[1].uncertainty) / 2;
            finalStratum = Math.min(readings[0].stratum, readings[1].stratum);
        }
        else {
            // Median of 3 (or more)
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
     * 합의된 시간과 서명(이론적 증명 데이터)을 포함한 PoT 생성
     */
    async generateProofOfTime() {
        // P1-1 FIX: Single NTP fetch — reuse synthesize() result instead of double-fetching
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
        // Reuse readings directly — no redundant synthesize() call
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
        // In a real network, signatures would be ECDSA over the timestamp.
        // For SDK simulation, we encapsulate the raw data.
        const signatures = readings.map(r => ({
            source: r.source,
            timestamp: r.timestamp,
            uncertainty: r.uncertainty
        }));
        return {
            timestamp: finalTimestamp,
            uncertainty: finalUncertainty,
            sources: readings.length,
            stratum: finalStratum,
            confidence: readings.length / this.sources.length,
            signatures
        };
    }
    /**
     * Verify Proof of Time integrity.
     */
    verifyProofOfTime(pot) {
        const TOLERANCE_NS = 100000000n; // 100ms
        if (pot.signatures.length < 2)
            return false;
        if (pot.confidence <= 0)
            return false;
        for (const sig of pot.signatures) {
            const diff = sig.timestamp > pot.timestamp ? sig.timestamp - pot.timestamp : pot.timestamp - sig.timestamp;
            if (diff > TOLERANCE_NS)
                return false;
        }
        return true;
    }
}
exports.TimeSynthesis = TimeSynthesis;
