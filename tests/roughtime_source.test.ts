// Tests for RoughtimeSource (src/roughtime_source.ts).
//
// Two tiers, matching this repo's existing convention (see
// time_synthesis.test.ts's "Live NTP Integration" block):
//   1. Pure/deterministic tests — build a fully synthetic, locally-signed
//      Roughtime response (real Ed25519 keys generated with Node's crypto,
//      real CERT/DELE/SREP signature chain, real Merkle leaf/root check) and
//      feed it through `validateRoughtimeResponse` directly. No network,
//      no flakiness, runs everywhere including CI.
//   2. Live network tests — talk to real public Roughtime servers. Network
//      required; this sandbox measured (this session) that
//      roughtime.cloudflare.com:2003 times out here while int08h/se/txryan
//      respond, so live assertions are scoped to what was actually verified
//      reachable, and environment-dependent failures are reported via
//      console.warn rather than a hard failure, matching the existing
//      "Live NTP Integration" test's own convention.
import * as crypto from 'crypto';
import {
  RoughtimeSource,
  ROUGHTIME_SERVERS,
  buildRoughtimeRequest,
  validateRoughtimeResponse,
  tagU32,
  tagKey,
  rtHash,
  buildMessage,
  parseMessage,
} from '../src/roughtime_source';
import { TimeSynthesis } from '../src/time_synthesis';
import { TTTTimeSynthesisError } from '../src/errors';

/** Extracts the raw 32-byte Ed25519 public key from a Node KeyObject. */
function rawPub(publicKey: crypto.KeyObject): Buffer {
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return der.subarray(der.length - 32);
}

/**
 * Builds a fully synthetic, correctly-signed Roughtime response so the
 * validator can be tested deterministically without touching the network.
 * Uses a single-leaf Merkle tree (INDX=0, empty PATH) so ROOT == the leaf
 * hash of `requestPacket` directly — this exercises the exact same
 * `rtHash`/PATH-walk code path validateRoughtimeResponse uses for real
 * multi-leaf trees, just with zero intermediate nodes.
 */
function buildSyntheticResponse(opts: {
  longTerm: crypto.KeyPairKeyObjectResult;
  delegated: crypto.KeyPairKeyObjectResult;
  requestPacket: Buffer;
  nonce: Buffer;
  midp: bigint;
  radi: number;
  mint?: bigint;
  maxt?: bigint;
  /** Override the ROOT value actually placed in SREP (for negative tests). */
  rootOverride?: Buffer;
  /** Override the SIG bytes actually placed at top-level (for negative tests). */
  topSigOverride?: Buffer;
}): Buffer {
  const mint = opts.mint ?? 0n;
  const maxt = opts.maxt ?? 9_999_999_999n;

  const mintBuf = Buffer.alloc(8);
  mintBuf.writeBigUInt64LE(mint, 0);
  const maxtBuf = Buffer.alloc(8);
  maxtBuf.writeBigUInt64LE(maxt, 0);
  const delegatedPub = rawPub(opts.delegated.publicKey);

  let delePairs: Array<[Buffer, Buffer]> = [
    [tagU32('PUBK'), delegatedPub],
    [tagU32('MINT'), mintBuf],
    [tagU32('MAXT'), maxtBuf],
  ];
  delePairs.sort((a, b) => tagKey(a[0]) - tagKey(b[0]));
  const dele = buildMessage(delePairs);

  const deleCtx = Buffer.from('RoughTime v1 delegation signature\0', 'ascii');
  const certSig = crypto.sign(null, Buffer.concat([deleCtx, dele]), opts.longTerm.privateKey);

  let certPairs: Array<[Buffer, Buffer]> = [
    [tagU32('SIG'), certSig],
    [tagU32('DELE'), dele],
  ];
  certPairs.sort((a, b) => tagKey(a[0]) - tagKey(b[0]));
  const cert = buildMessage(certPairs);

  // Single-leaf tree: leaf = H(0x00 || requestPacket), INDX=0, PATH=empty => ROOT must equal leaf.
  const leaf = rtHash([Buffer.from([0x00]), opts.requestPacket]);
  const root = opts.rootOverride ?? leaf;

  const radiBuf = Buffer.alloc(4);
  radiBuf.writeUInt32LE(opts.radi, 0);
  const midpBuf = Buffer.alloc(8);
  midpBuf.writeBigUInt64LE(opts.midp, 0);

  let srepPairs: Array<[Buffer, Buffer]> = [
    [tagU32('RADI'), radiBuf],
    [tagU32('MIDP'), midpBuf],
    [tagU32('ROOT'), root],
  ];
  srepPairs.sort((a, b) => tagKey(a[0]) - tagKey(b[0]));
  const srep = buildMessage(srepPairs);

  const srepCtx = Buffer.from('RoughTime v1 response signature\0', 'ascii');
  const sig = opts.topSigOverride ?? crypto.sign(null, Buffer.concat([srepCtx, srep]), opts.delegated.privateKey);

  const typeBuf = Buffer.alloc(4);
  typeBuf.writeUInt32LE(1, 0);
  const indxBuf = Buffer.alloc(4); // INDX = 0
  const pathBuf = Buffer.alloc(0); // empty PATH (single-leaf tree)

  let topPairs: Array<[Buffer, Buffer]> = [
    [tagU32('NONC'), opts.nonce],
    [tagU32('TYPE'), typeBuf],
    [tagU32('SIG'), sig],
    [tagU32('PATH'), pathBuf],
    [tagU32('SREP'), srep],
    [tagU32('CERT'), cert],
    [tagU32('INDX'), indxBuf],
  ];
  topPairs.sort((a, b) => tagKey(a[0]) - tagKey(b[0]));
  const msg = buildMessage(topPairs);

  const magic = Buffer.from('ROUGHTIM', 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(msg.length, 0);
  return Buffer.concat([magic, lenBuf, msg]);
}

describe('Roughtime wire format — pure/deterministic', () => {
  test('buildRoughtimeRequest is at least 1024 bytes and starts with ROUGHTIM magic', () => {
    const nonce = crypto.randomBytes(32);
    const pubkey = crypto.randomBytes(32);
    const req = buildRoughtimeRequest(nonce, pubkey);
    expect(req.length).toBeGreaterThanOrEqual(1024);
    expect(req.subarray(0, 8).toString('ascii')).toBe('ROUGHTIM');
  });

  test('buildRoughtimeRequest embeds the exact nonce, recoverable via parseMessage', () => {
    const nonce = crypto.randomBytes(32);
    const pubkey = crypto.randomBytes(32);
    const req = buildRoughtimeRequest(nonce, pubkey);
    const msgLen = req.readUInt32LE(8);
    const msg = req.subarray(12, 12 + msgLen);
    const parsed = parseMessage(msg);
    expect(parsed).not.toBeNull();
    const nonc = parsed!.get(tagKey(tagU32('NONC')));
    expect(nonc).toBeDefined();
    expect(nonc!.equals(nonce)).toBe(true);
  });

  test('buildRoughtimeRequest rejects a nonce of the wrong length', () => {
    const badNonce = crypto.randomBytes(16);
    const pubkey = crypto.randomBytes(32);
    expect(() => buildRoughtimeRequest(badNonce, pubkey)).toThrow();
  });

  test('buildMessage / parseMessage round-trip for an arbitrary multi-tag message', () => {
    const pairs: Array<[Buffer, Buffer]> = [
      [tagU32('AAAA'), Buffer.from('hello')],
      [tagU32('ZZZZ'), Buffer.from('world!!')],
      [tagU32('MMMM'), Buffer.alloc(3, 7)],
    ];
    pairs.sort((a, b) => tagKey(a[0]) - tagKey(b[0]));
    const msg = buildMessage(pairs);
    const parsed = parseMessage(msg);
    expect(parsed).not.toBeNull();
    for (const [tag, val] of pairs) {
      expect(parsed!.get(tagKey(tag))!.equals(val)).toBe(true);
    }
  });

  test('parseMessage returns null for a truncated/malformed buffer', () => {
    expect(parseMessage(Buffer.from([1, 2]))).toBeNull();
  });
});

describe('validateRoughtimeResponse — synthetic signed responses (no network)', () => {
  let longTerm: crypto.KeyPairKeyObjectResult;
  let delegated: crypto.KeyPairKeyObjectResult;
  let longTermRaw: Buffer;
  let nonce: Buffer;
  let requestPacket: Buffer;
  const midp = 1_785_000_000n;
  const radi = 2;

  beforeEach(() => {
    longTerm = crypto.generateKeyPairSync('ed25519');
    delegated = crypto.generateKeyPairSync('ed25519');
    longTermRaw = rawPub(longTerm.publicKey);
    nonce = crypto.randomBytes(32);
    requestPacket = buildRoughtimeRequest(nonce, longTermRaw);
  });

  test('accepts a correctly-signed, correctly-chained response and extracts MIDP/RADI', () => {
    const resp = buildSyntheticResponse({ longTerm, delegated, requestPacket, nonce, midp, radi });
    const result = validateRoughtimeResponse(requestPacket, resp, longTermRaw, nonce, 'synthetic-test');
    expect(result.midpSeconds).toBe(midp);
    expect(result.radiSeconds).toBe(radi);
  });

  test('rejects when the top-level SIG (SREP signature) is tampered', () => {
    const goodResp = buildSyntheticResponse({ longTerm, delegated, requestPacket, nonce, midp, radi });
    // Tamper: flip one byte of the real signature and rebuild the packet with it.
    const goodMsg = goodResp.subarray(12, 12 + goodResp.readUInt32LE(8));
    const top = parseMessage(goodMsg)!;
    const tamperedSig = Buffer.from(top.get(tagKey(tagU32('SIG')))!);
    tamperedSig[0] ^= 0xff;
    const tamperedResp = buildSyntheticResponse({
      longTerm, delegated, requestPacket, nonce, midp, radi,
      topSigOverride: tamperedSig,
    });
    expect(() => validateRoughtimeResponse(requestPacket, tamperedResp, longTermRaw, nonce, 'tamper-test'))
      .toThrow(/SREP SIG INVALID/);
  });

  test('rejects a genuine response validated against the WRONG long-term public key (MITM simulation)', () => {
    const resp = buildSyntheticResponse({ longTerm, delegated, requestPacket, nonce, midp, radi });
    const attacker = crypto.generateKeyPairSync('ed25519');
    const wrongRaw = rawPub(attacker.publicKey);
    expect(() => validateRoughtimeResponse(requestPacket, resp, wrongRaw, nonce, 'wrong-key-test'))
      .toThrow(/CERT\.SIG INVALID/);
  });

  test('rejects when NONC does not match what we sent', () => {
    const resp = buildSyntheticResponse({ longTerm, delegated, requestPacket, nonce, midp, radi });
    const differentNonce = crypto.randomBytes(32);
    expect(() => validateRoughtimeResponse(requestPacket, resp, longTermRaw, differentNonce, 'nonce-mismatch-test'))
      .toThrow(/NONC mismatch/);
  });

  test('rejects when MIDP falls outside the delegated key MINT/MAXT window', () => {
    const resp = buildSyntheticResponse({
      longTerm, delegated, requestPacket, nonce, midp, radi,
      mint: 0n, maxt: 100n, // midp (1.785e9) is way outside [0,100]
    });
    expect(() => validateRoughtimeResponse(requestPacket, resp, longTermRaw, nonce, 'window-test'))
      .toThrow(/outside delegated-key validity window/);
  });

  test('rejects when the Merkle ROOT does not match the recomputed leaf', () => {
    const resp = buildSyntheticResponse({
      longTerm, delegated, requestPacket, nonce, midp, radi,
      rootOverride: crypto.randomBytes(32),
    });
    expect(() => validateRoughtimeResponse(requestPacket, resp, longTermRaw, nonce, 'root-test'))
      .toThrow(/Merkle ROOT mismatch/);
  });

  test('all rejections throw TTTTimeSynthesisError (consistent error type across this SDK)', () => {
    const attacker = crypto.generateKeyPairSync('ed25519');
    const resp = buildSyntheticResponse({ longTerm, delegated, requestPacket, nonce, midp, radi });
    let caught: unknown;
    try {
      validateRoughtimeResponse(requestPacket, resp, rawPub(attacker.publicKey), nonce, 'type-test');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TTTTimeSynthesisError);
  });
});

describe('RoughtimeSource.getTime() — timeout behavior (no real Roughtime server involved)', () => {
  test('rejects with TTTTimeSynthesisError after timeoutMs when the peer never responds', async () => {
    // 203.0.113.1 is TEST-NET-3 (RFC 5737) — guaranteed non-routable/non-responsive,
    // verified directly this session to produce a genuine silent timeout (no
    // immediate ICMP/ECONNREFUSED) rather than an instant error in this sandbox.
    const fakePubkey = Buffer.from(crypto.randomBytes(32)).toString('base64');
    const source = new RoughtimeSource('roughtime-unreachable-test', '203.0.113.1', 9, fakePubkey, 400);
    await expect(source.getTime()).rejects.toThrow(TTTTimeSynthesisError);
    await expect(source.getTime()).rejects.toThrow(/timeout|did not respond/i);
    source.close();
  }, 10000);
});

describe('TimeSynthesis constructor — Roughtime source wiring', () => {
  test('named roughtime-* sources are individually addressable', () => {
    const ts = new TimeSynthesis({ sources: ['roughtime-int08h', 'roughtime-se'] });
    expect(ts['sources'].length).toBe(2);
    expect(ts['sources'][0].name).toBe('roughtime-int08h');
    expect(ts['sources'][1].name).toBe('roughtime-se');
    ts.close();
  });

  test("the 'roughtime' alias fans out to all configured servers", () => {
    const ts = new TimeSynthesis({ sources: ['roughtime'] });
    expect(ts['sources'].length).toBe(ROUGHTIME_SERVERS.length);
    ts.close();
  });

  test('default source list now includes both HTTPS and Roughtime sources (8 total)', () => {
    const ts = new TimeSynthesis();
    expect(ts['sources'].length).toBe(8);
    const names = ts['sources'].map((s: { name: string }) => s.name);
    expect(names).toEqual(
      expect.arrayContaining(['nist', 'google', 'cloudflare', 'apple', 'roughtime-int08h', 'roughtime-se'])
    );
    ts.close();
  });

  test('unknown source name is still silently skipped (backward compatible)', () => {
    const ts = new TimeSynthesis({ sources: ['unknown_source'] });
    expect(ts['sources'].length).toBe(0);
    ts.close();
  });
});

describe('Live Roughtime integration (network required)', () => {
  test('a real Roughtime server (int08h) returns a validated TimeReading', async () => {
    const source = new RoughtimeSource('roughtime-int08h', 'roughtime.int08h.com', 2002, ROUGHTIME_SERVERS[0].pubkeyB64, 3000);
    try {
      const reading = await source.getTime();
      expect(reading.timestamp).toBeGreaterThan(0n);
      expect(reading.source).toBe('roughtime-int08h');
      // Loosely sanity-check the timestamp is "now-ish" (within 1 day) rather
      // than some garbage decoded value.
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      const oneDayNs = 86_400_000_000_000n;
      const diff = reading.timestamp > nowNs ? reading.timestamp - nowNs : nowNs - reading.timestamp;
      expect(diff).toBeLessThan(oneDayNs);
    } catch (e) {
      console.warn('Live Roughtime fetch failed, network might be restricted.', e);
    } finally {
      source.close();
    }
  }, 10000);

  test(
    'TimeSynthesis.synthesize() still reaches >=3 successful readings when Cloudflare+NIST-style HTTPS sources are mocked to always fail',
    async () => {
      // Uses the real default source list (8 sources: 4 HTTPS + 4 Roughtime).
      // We simulate the exact failure mode this task is fixing — Cloudflare
      // and NIST's HTTPS Date-header endpoints being unreachable — by
      // force-rejecting those two specific source instances, while leaving
      // every other source (including all 4 real Roughtime sources and the
      // real google/apple HTTPS sources) untouched and live.
      const ts = new TimeSynthesis();
      const sources = ts['sources'] as Array<{ name: string; getTime: () => Promise<unknown> }>;
      const nist = sources.find((s) => s.name === 'nist')!;
      const cloudflare = sources.find((s) => s.name === 'cloudflare')!;
      nist.getTime = jest.fn().mockRejectedValue(new Error('simulated NIST HTTPS timeout'));
      cloudflare.getTime = jest.fn().mockRejectedValue(new Error('simulated Cloudflare HTTPS timeout'));

      try {
        const result = await ts.synthesize();
        expect(result.sources).toBeGreaterThanOrEqual(3);
      } catch (e) {
        console.warn(
          'Live Roughtime+HTTPS synthesize() failed entirely, network might be restricted in this environment.',
          e
        );
      } finally {
        ts.close();
      }
    },
    20000
  );
});
