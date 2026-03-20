/**
 * OSNMA Source Integration Tests
 *
 * Tests verifyOsnmaKeyMaterial() and OsnmaTimeSource against real GSC Europa key data.
 * PKID=2, downloaded 2026-03-18 from gsc-europa.eu (authenticated session uid=13173).
 */

import {
  verifyOsnmaKeyMaterial,
  OsnmaTimeSource,
  DEFAULT_OSNMA_KEY,
  OsnmaKeyMaterial,
} from '../src/osnma_source';
import { TimeSynthesis } from '../src/time_synthesis';

// Real key data from GSC Europa OSNMA/PKI (2025-12-10T10:00:00Z)
const REAL_PUBLIC_KEY = '02219204B5CA6C46B623EEED6CDD2CDDB1F7D6A7532767E5B8DA0DE1EBD695FC99';
const REAL_MERKLE_ROOT = '7B944FA20915C7931D48DD016D94F9C6381FD37DC6C125D97015272FDDE41393';

describe('OSNMA Key Material Verification', () => {
  it('verifies real GSC Europa PKID=2 key material', () => {
    const result = verifyOsnmaKeyMaterial(DEFAULT_OSNMA_KEY);

    expect(result.valid).toBe(true);
    expect(result.pkid).toBe(2);
    expect(result.merkleRootHex).toBe(REAL_MERKLE_ROOT);
    expect(result.keyFingerprint).toHaveLength(64); // SHA-256 hex
    expect(result.checkedAt).toBeGreaterThan(0);
  });

  it('public key is valid compressed ECDSA P-256 point (33 bytes, prefix 02)', () => {
    const bytes = Buffer.from(REAL_PUBLIC_KEY, 'hex');
    expect(bytes.length).toBe(33);
    expect(bytes[0]).toBe(0x02); // compressed point, even Y
  });

  it('merkle root is valid SHA-256 (32 bytes)', () => {
    const bytes = Buffer.from(REAL_MERKLE_ROOT, 'hex');
    expect(bytes.length).toBe(32);
  });

  it('rejects public key with wrong length', () => {
    const bad: OsnmaKeyMaterial = {
      ...DEFAULT_OSNMA_KEY,
      publicKeyHex: '0102', // 2 bytes, not 33
    };
    expect(() => verifyOsnmaKeyMaterial(bad)).toThrow('33 bytes');
  });

  it('rejects public key with invalid prefix (04 = uncompressed)', () => {
    // 33 bytes but prefix 04 (uncompressed uses 65 bytes — 04 prefix here is malformed compressed)
    const uncompressed = '04' + 'AA'.repeat(32);
    const bad: OsnmaKeyMaterial = {
      ...DEFAULT_OSNMA_KEY,
      publicKeyHex: uncompressed,
    };
    expect(() => verifyOsnmaKeyMaterial(bad)).toThrow('02 or 03');
  });

  it('rejects merkle root with wrong length', () => {
    const bad: OsnmaKeyMaterial = {
      ...DEFAULT_OSNMA_KEY,
      merkleRootHex: 'DEADBEEF', // 4 bytes, not 32
    };
    expect(() => verifyOsnmaKeyMaterial(bad)).toThrow('32 bytes');
  });

  it('rejects key not yet applicable (future date)', () => {
    const bad: OsnmaKeyMaterial = {
      ...DEFAULT_OSNMA_KEY,
      applicabilityMs: Date.now() + 86400_000, // tomorrow
    };
    expect(() => verifyOsnmaKeyMaterial(bad)).toThrow('not applicable until');
  });
});

describe('OsnmaTimeSource — TimeSource interface', () => {
  let source: OsnmaTimeSource;

  beforeEach(() => {
    source = new OsnmaTimeSource();
  });

  it('name is "osnma"', () => {
    expect(source.name).toBe('osnma');
  });

  it('getTime() returns valid TimeReading with stratum=1', async () => {
    const reading = await source.getTime();

    expect(reading.source).toBe('osnma');
    expect(reading.stratum).toBe(1);
    expect(reading.uncertainty).toBe(50);
    expect(typeof reading.timestamp).toBe('bigint');
    expect(reading.timestamp).toBeGreaterThan(0n);
  });

  it('getTime() timestamp is close to Date.now() in ns', async () => {
    const before = BigInt(Date.now()) * 1_000_000n;
    const reading = await source.getTime();
    const after = BigInt(Date.now()) * 1_000_000n;

    expect(reading.timestamp).toBeGreaterThanOrEqual(before);
    expect(reading.timestamp).toBeLessThanOrEqual(after);
  });

  it('verificationResult is populated after first getTime()', async () => {
    expect(source.getVerificationResult()).toBeNull();
    await source.getTime();
    const result = source.getVerificationResult();
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
    expect(result!.pkid).toBe(2);
  });

  it('getKeyMaterial() returns read-only copy of key data', () => {
    const km = source.getKeyMaterial();
    expect(km.publicKeyHex).toBe(REAL_PUBLIC_KEY);
    expect(km.merkleRootHex).toBe(REAL_MERKLE_ROOT);
    expect(km.pkid).toBe(2);
  });

  it('accepts custom key material override', async () => {
    // 03 prefix = compressed point, odd Y
    const customKey = '03' + 'BB'.repeat(32);
    const customMerkle = 'CC'.repeat(32);
    const customSource = new OsnmaTimeSource({
      publicKeyHex: customKey,
      merkleRootHex: customMerkle,
      applicabilityMs: Date.now() - 1000,
    });
    const reading = await customSource.getTime();
    expect(reading.stratum).toBe(1);
    const result = customSource.getVerificationResult();
    expect(result!.pkid).toBe(2); // default pkid preserved
  });
});

describe('OsnmaTimeSource — TimeSynthesis integration', () => {
  it('OsnmaTimeSource works as a drop-in TimeSource in TimeSynthesis', async () => {
    const ts = new TimeSynthesis({ sources: ['nist'] });
    const osnmaSource = new OsnmaTimeSource();

    // Inject OSNMA as additional source
    ts['sources'].push(osnmaSource);

    // Mock nist to avoid real network call
    ts['sources'][0].getTime = jest.fn().mockResolvedValue({
      timestamp: BigInt(Date.now()) * 1_000_000n,
      uncertainty: 10,
      stratum: 1,
      source: 'nist',
    });

    const result = await ts.synthesize();

    expect(result.sources).toBe(2);
    expect(result.stratum).toBe(1);
    expect(typeof result.timestamp).toBe('bigint');

    ts.close();
  });

  it('TimeSynthesis PoT includes OSNMA reading in sourceReadings', async () => {
    const ts = new TimeSynthesis({ sources: ['nist'] });
    const osnmaSource = new OsnmaTimeSource();
    ts['sources'].push(osnmaSource);

    const mockTs = BigInt(Date.now()) * 1_000_000n;
    ts['sources'][0].getTime = jest.fn().mockResolvedValue({
      timestamp: mockTs,
      uncertainty: 10,
      stratum: 1,
      source: 'nist',
    });

    const pot = await ts.generateProofOfTime();

    const osnmaReading = pot.sourceReadings.find(r => r.source === 'osnma');
    expect(osnmaReading).toBeDefined();
    expect(osnmaReading!.stratum).toBe(1);

    ts.close();
  });
});
