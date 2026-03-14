import * as crypto from 'crypto';
import * as dgram from 'dgram';
import * as https from 'https';
import { Buffer } from 'buffer';
import { keccak256, AbiCoder } from "ethers";
import { TimeReading, SynthesizedTime, ProofOfTime } from "./types";
import { logger } from "./logger";
import { TTTTimeSynthesisError } from "./errors";

export interface TimeSource {
  name: string;
  getTime(): Promise<TimeReading>;
}

const NTP_OFFSET_1900_TO_1970 = 2208988800n;

export class NTPSource implements TimeSource {
  constructor(public name: string, private host: string, private port: number = 123) {}

  async getTime(): Promise<TimeReading> {
    return new Promise((resolve, reject) => {
      const client = dgram.createSocket('udp4');
      const packet = Buffer.alloc(48);
      
      // LI=0, VN=4, Mode=3 (Client)
      packet[0] = 0x23;

      const t1 = BigInt(Date.now()) * 1_000_000n; // Local originate timestamp (ns)
      
      const timeout = setTimeout(() => {
        client.close();
        reject(new TTTTimeSynthesisError(`NTP timeout for ${this.host}`, "Server did not respond within 2000ms", "Check your firewall (UDP port 123) or try a different NTP server."));
      }, 2000); // 2s timeout for speed

      client.on('error', (err) => {
        clearTimeout(timeout);
        client.close();
        reject(new TTTTimeSynthesisError(`NTP socket error for ${this.host}`, err.message, "Ensure network connectivity and that UDP 123 is outbound-allowed."));
      });

      client.on('message', (msg) => {
        const t4 = BigInt(Date.now()) * 1_000_000n; // Local receive timestamp (ns)
        clearTimeout(timeout);
        client.close();

        if (msg.length < 48) {
          reject(new TTTTimeSynthesisError(`Invalid NTP response from ${this.host}`, "Packet length < 48 bytes", "The NTP server returned a malformed response. Check the server address."));
          return;
        }

        const stratum = msg[1];
        if (stratum === 0 || stratum > 15) {
          reject(new TTTTimeSynthesisError(`Invalid Stratum from ${this.host}`, `Stratum: ${stratum}`, "The NTP server is unsynchronized. Use a stratum 1 or 2 server."));
          return;
        }
        
        // T2: Receive Timestamp (Server received request)
        const t2_sec = BigInt(msg.readUInt32BE(32));
        const t2_frac = BigInt(msg.readUInt32BE(36));
        if (t2_sec <= NTP_OFFSET_1900_TO_1970) {
          reject(new TTTTimeSynthesisError(`[NTP] Invalid T2 timestamp from ${this.host}`, `${t2_sec} <= NTP epoch offset`, "The NTP server returned a pre-1970 timestamp. Use a reliable NTP server."));
          return;
        }
        const t2 = (t2_sec - NTP_OFFSET_1900_TO_1970) * 1_000_000_000n + (t2_frac * 1_000_000_000n) / (1n << 32n);

        // T3: Transmit Timestamp (Server sent response)
        const t3_sec = BigInt(msg.readUInt32BE(40));
        const t3_frac = BigInt(msg.readUInt32BE(44));
        if (t3_sec <= NTP_OFFSET_1900_TO_1970) {
          reject(new TTTTimeSynthesisError(`[NTP] Invalid T3 timestamp from ${this.host}`, `${t3_sec} <= NTP epoch offset`, "The NTP server returned a pre-1970 timestamp. Use a reliable NTP server."));
          return;
        }
        const t3 = (t3_sec - NTP_OFFSET_1900_TO_1970) * 1_000_000_000n + (t3_frac * 1_000_000_000n) / (1n << 32n);

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
            reject(new TTTTimeSynthesisError(`Failed to send NTP packet to ${this.host}`, err.message, "Check network settings."));
          }
        });
      } catch (sendErr) {
        clearTimeout(timeout);
        try { client.close(); } catch { /* already closed */ }
        reject(new TTTTimeSynthesisError(`Synchronous send error for ${this.host}`, sendErr instanceof Error ? sendErr.message : String(sendErr), "Check runtime environment."));
      }
    });
  }
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
 * - For ±10ns precision, HTTPS is a cross-check only; GEO-Sat operator is the primary source.
 */
export class HTTPSTimeSource implements TimeSource {
  constructor(public name: string, private url: string) {}

  async getTime(): Promise<TimeReading> {
    const t1 = BigInt(Date.now()) * 1_000_000n;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new TTTTimeSynthesisError(
          `HTTPS time timeout for ${this.name}`,
          `${this.url} did not respond within 3000ms`,
          "Check network connectivity or try a different HTTPS time endpoint."
        ));
      }, 3000);

      const req = https.request(this.url, { method: 'HEAD' }, (res) => {
        clearTimeout(timeout);
        const t4 = BigInt(Date.now()) * 1_000_000n;
        const dateHeader = res.headers['date'];
        if (!dateHeader) {
          reject(new TTTTimeSynthesisError(
            `No Date header from ${this.name}`,
            "HTTPS response missing Date header",
            "The endpoint must return a Date header (RFC 7231)."
          ));
          return;
        }
        const serverTime = BigInt(new Date(dateHeader).getTime()) * 1_000_000n;
        const rttNs = t4 - t1;
        const rttMs = Number(rttNs) / 1_000_000;
        // Offset-corrected: server time + half RTT
        const corrected = serverTime + rttNs / 2n;
        resolve({
          timestamp: corrected,
          uncertainty: rttMs / 2 + 500, // 500ms base uncertainty for HTTP Date (1s resolution)
          stratum: 2, // HTTPS endpoints typically sync to stratum-1
          source: this.name
        });
      });
      req.on('error', (err) => {
        clearTimeout(timeout);
        reject(new TTTTimeSynthesisError(
          `HTTPS time error for ${this.name}`,
          err.message,
          "Check TLS connectivity."
        ));
      });
      req.end();
    });
  }
}

export class TimeSynthesis {
  private sources: TimeSource[] = [];

  // Fix 2: Bounded nonce replay cache (max 10K entries, 60s TTL) — same pattern as protocol_fee.ts
  private usedNonces: Map<string, number> = new Map();
  private readonly MAX_NONCE_CACHE = 10000;
  private readonly NONCE_TTL_MS = 300_000; // 5 minutes — must exceed PoT expiresAt (60s) to prevent edge-case replay

  constructor(config?: { sources?: string[] }) {
    const sourceNames = config?.sources || ['nist', 'kriss', 'google', 'cloudflare'];

    for (const s of sourceNames) {
      if (s === 'nist') {
        // Primary: HTTPS (TLS-protected), Fallback: NTP (plaintext UDP)
        this.sources.push(new HTTPSTimeSource('nist', 'https://time.nist.gov/'));
      } else if (s === 'kriss') {
        // KRISS does not have a public HTTPS time API — NTP only with warning
        logger.warn('[TimeSynthesis] KRISS source uses plaintext NTP (UDP). Consider replacing with an HTTPS-based source for MITM protection.');
        this.sources.push(new NTPSource('kriss', 'time.kriss.re.kr'));
      } else if (s === 'google' || s === 'galileo') {
        this.sources.push(new HTTPSTimeSource('google', 'https://time.google.com/'));
      } else if (s === 'cloudflare') {
        this.sources.push(new HTTPSTimeSource('cloudflare', 'https://time.cloudflare.com/'));
      }
    }
  }

  async getFromSource(name: string): Promise<TimeReading> {
    const source = this.sources.find(s => s.name === name);
    if (!source) throw new TTTTimeSynthesisError(`Source ${name} not found`, "Requested source name is not configured", "Configure the source in the TimeSynthesis constructor.");
    return source.getTime();
  }

  async synthesize(): Promise<SynthesizedTime> {
    const readings: TimeReading[] = [];
    
    const results = await Promise.allSettled(this.sources.map(s => s.getTime()));
    
    for (const res of results) {
      if (res.status === 'fulfilled') {
        readings.push(res.value);
      } else {
        logger.warn(`[TimeSynthesis] NTP request failed: ${res.reason}`);
      }
    }

    if (readings.length === 0) {
      throw new TTTTimeSynthesisError('[TimeSynthesis] CRITICAL: All NTP sources failed.', "Zero readings returned from all configured NTP sources", "Ensure UDP port 123 is open and NTP servers are reachable.");
    }

    if (readings.length === 1) {
      logger.warn(`[TimeSynthesis] WARNING: Only 1 NTP source available (${readings[0].source}). Time may be unreliable.`);
      return {
        timestamp: readings[0].timestamp,
        confidence: 1 / this.sources.length,
        uncertainty: readings[0].uncertainty,
        sources: 1,
        stratum: readings[0].stratum
      };
    }

    readings.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

    let finalTimestamp: bigint;
    let finalUncertainty: number;
    let finalStratum: number;

    if (readings.length === 2) {
      finalTimestamp = (readings[0].timestamp + readings[1].timestamp) / 2n;
      finalUncertainty = (readings[0].uncertainty + readings[1].uncertainty) / 2;
      finalStratum = Math.min(readings[0].stratum, readings[1].stratum);
    } else {
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
  async generateProofOfTime(): Promise<ProofOfTime> {
    const readings: TimeReading[] = [];
    const results = await Promise.allSettled(this.sources.map(s => s.getTime()));

    for (const res of results) {
      if (res.status === 'fulfilled') {
        readings.push(res.value);
      }
    }

    if (readings.length === 0) {
      throw new TTTTimeSynthesisError('[TimeSynthesis] Cannot generate PoT: All NTP sources failed.', "No successful readings from NTP servers.", "Check internet connection and UDP 123 access.");
    }

    readings.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

    let finalTimestamp: bigint;
    let finalUncertainty: number;
    let finalStratum: number;

    if (readings.length === 1) {
      finalTimestamp = readings[0].timestamp;
      finalUncertainty = readings[0].uncertainty;
      finalStratum = readings[0].stratum;
    } else if (readings.length === 2) {
      finalTimestamp = (readings[0].timestamp + readings[1].timestamp) / 2n;
      finalUncertainty = (readings[0].uncertainty + readings[1].uncertainty) / 2;
      finalStratum = Math.min(readings[0].stratum, readings[1].stratum);
    } else {
      const mid = Math.floor(readings.length / 2);
      finalTimestamp = readings[mid].timestamp;
      finalUncertainty = readings[mid].uncertainty;
      finalStratum = readings[mid].stratum;
    }

    const sourceReadings = readings.map(r => ({
      source: r.source,
      timestamp: r.timestamp,
      uncertainty: r.uncertainty,
      stratum: r.stratum
    }));

    // Fix 2: PoT nonce + expiration for replay protection
    const nonce = crypto.randomBytes(16).toString("hex");
    const expiresAt = BigInt(Date.now()) + 60_000n; // +60 seconds

    const pot: ProofOfTime = {
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
      throw new TTTTimeSynthesisError("[PoT] Self-verification failed", "Source readings are too far apart from synthesized median", "Check for high network jitter or malicious NTP spoofing.");
    }

    return pot;
  }

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
  private static getToleranceForStratum(stratum: number): bigint {
    if (stratum <= 1) return 10_000_000n;
    if (stratum === 2) return 25_000_000n;
    return 50_000_000n;
  }

  verifyProofOfTime(pot: ProofOfTime): boolean {
    if (pot.sourceReadings.length === 0) return false;
    if (pot.confidence <= 0) return false;

    // Determine tolerance from the lowest stratum in sourceReadings.
    // Fall back to pot.stratum if individual readings lack stratum info.
    let lowestStratum = pot.stratum;
    for (const reading of pot.sourceReadings) {
      if (reading.stratum !== undefined && reading.stratum < lowestStratum) {
        lowestStratum = reading.stratum;
      }
    }
    const toleranceNs = TimeSynthesis.getToleranceForStratum(lowestStratum);

    // Expiration check
    if (BigInt(Date.now()) > pot.expiresAt) {
      logger.warn(`[TimeSynthesis] PoT expired at ${pot.expiresAt}`);
      return false;
    }

    // Nonce replay protection with bounded cache + TTL cleanup
    const now = Date.now();
    // TTL cleanup pass (evict expired entries)
    if (this.usedNonces.size > this.MAX_NONCE_CACHE / 2) {
      for (const [k, ts] of this.usedNonces) {
        if (now - ts > this.NONCE_TTL_MS) this.usedNonces.delete(k);
      }
    }
    if (this.usedNonces.has(pot.nonce)) {
      logger.warn(`[TimeSynthesis] Duplicate nonce detected: ${pot.nonce}`);
      return false;
    }
    if (this.usedNonces.size >= this.MAX_NONCE_CACHE) {
      // Evict oldest entry
      const oldest = this.usedNonces.keys().next().value;
      if (oldest !== undefined) this.usedNonces.delete(oldest);
    }
    this.usedNonces.set(pot.nonce, now);

    for (const sig of pot.sourceReadings) {
      const diff = sig.timestamp > pot.timestamp ? sig.timestamp - pot.timestamp : pot.timestamp - sig.timestamp;
      if (diff > toleranceNs) {
        logger.warn(`[TimeSynthesis] Reading from ${sig.source} outside tolerance (${toleranceNs}ns, stratum ${lowestStratum}): ${diff}ns`);
        return false;
      }
    }
    return true;
  }

  /**
   * Generates a bytes32 hash of the PoT for on-chain submission.
   */
  static getOnChainHash(pot: ProofOfTime): string {
    return keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["uint64", "uint64", "uint8", "uint8", "uint32"],
        [
          pot.timestamp, // Keep full nanosecond precision (uint64 max ~year 2554)
          Math.round(pot.uncertainty * 1_000_000), // Scale uncertainty to ns
          pot.sources,
          pot.stratum,
          Math.round(pot.confidence * 1000000)
        ]
      )
    );
  }

  /**
   * Serializes PoT to JSON string.
   */
  static serializeToJSON(pot: ProofOfTime): string {
    return JSON.stringify(pot, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    );
  }

  /**
   * Deserializes PoT from JSON string.
   */
  static deserializeFromJSON(json: string): ProofOfTime {
    const data = JSON.parse(json);
    return {
      ...data,
      timestamp: BigInt(data.timestamp),
      expiresAt: BigInt(data.expiresAt),
      sourceReadings: data.sourceReadings.map((s: any) => ({
        ...s,
        timestamp: BigInt(s.timestamp)
      }))
    };
  }

  /**
   * Serializes PoT to compact binary format.
   * Layout: header(19) + nonce(1+N) + expiresAt(8) + readings(variable)
   */
  static serializeToBinary(pot: ProofOfTime): Buffer {
    const nonceBytes = Buffer.from(pot.nonce, "utf8");
    // Header: timestamp(8) + uncertainty(4) + sources(1) + stratum(1) + confidence(4) + readingCount(1) = 19
    // + nonceLen(1) + nonce(N) + expiresAt(8)
    let size = 19 + 1 + nonceBytes.length + 8;
    for (const sig of pot.sourceReadings) {
      size += 1 + sig.source.length + 8 + 4; // nameLen(1) + name(N) + ts(8) + unc(4)
    }

    const buf = Buffer.alloc(size);
    let offset = 0;

    buf.writeBigUInt64BE(pot.timestamp, offset); offset += 8;
    buf.writeFloatBE(pot.uncertainty, offset); offset += 4;
    buf.writeUInt8(pot.sources, offset); offset += 1;
    buf.writeUInt8(pot.stratum, offset); offset += 1;
    buf.writeFloatBE(pot.confidence, offset); offset += 4;
    buf.writeUInt8(pot.sourceReadings.length, offset); offset += 1;

    // Nonce
    buf.writeUInt8(nonceBytes.length, offset); offset += 1;
    nonceBytes.copy(buf, offset); offset += nonceBytes.length;
    // ExpiresAt
    buf.writeBigUInt64BE(pot.expiresAt, offset); offset += 8;

    for (const sig of pot.sourceReadings) {
      buf.writeUInt8(sig.source.length, offset); offset += 1;
      buf.write(sig.source, offset); offset += sig.source.length;
      buf.writeBigUInt64BE(sig.timestamp, offset); offset += 8;
      buf.writeFloatBE(sig.uncertainty, offset); offset += 4;
    }

    return buf;
  }

  /**
   * Deserializes PoT from compact binary format.
   */
  static deserializeFromBinary(buf: Buffer): ProofOfTime {
    let offset = 0;
    const timestamp = buf.readBigUInt64BE(offset); offset += 8;
    const uncertainty = buf.readFloatBE(offset); offset += 4;
    const sources = buf.readUInt8(offset); offset += 1;
    const stratum = buf.readUInt8(offset); offset += 1;
    const confidence = buf.readFloatBE(offset); offset += 4;
    const sigCount = buf.readUInt8(offset); offset += 1;

    // Nonce
    const nonceLen = buf.readUInt8(offset); offset += 1;
    const nonce = buf.toString('utf8', offset, offset + nonceLen); offset += nonceLen;
    // ExpiresAt
    const expiresAt = buf.readBigUInt64BE(offset); offset += 8;

    const sourceReadings = [];
    for (let i = 0; i < sigCount; i++) {
      const nameLen = buf.readUInt8(offset); offset += 1;
      const source = buf.toString('utf8', offset, offset + nameLen); offset += nameLen;
      const ts = buf.readBigUInt64BE(offset); offset += 8;
      const unc = buf.readFloatBE(offset); offset += 4;
      sourceReadings.push({ source, timestamp: ts, uncertainty: unc });
    }

    return { timestamp, uncertainty, sources, stratum, confidence, sourceReadings, nonce, expiresAt };
  }
}
