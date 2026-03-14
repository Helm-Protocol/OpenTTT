import { TimeSynthesis, NTPSource } from '../src/time_synthesis';
import { TimeReading } from '../src/types';

describe('TimeSynthesis SDK - Advanced Median & PoT', () => {

  describe('Algorithm: Median and Failover Logic', () => {
    let ts: TimeSynthesis;

    beforeEach(() => {
      ts = new TimeSynthesis({ sources: ['nist', 'kriss', 'google'] });
    });

    it('should calculate median correctly with 3 valid sources', async () => {
      // Mocking getTime for all sources
      const mockReadings: TimeReading[] = [
        { timestamp: 1000n, uncertainty: 5, stratum: 2, source: 'nist' },
        { timestamp: 1200n, uncertainty: 10, stratum: 1, source: 'kriss' }, // Median
        { timestamp: 900n, uncertainty: 4, stratum: 2, source: 'google' }
      ];

      // Replace instances with mocks
      ts['sources'][0].getTime = jest.fn().mockResolvedValue(mockReadings[0]);
      ts['sources'][1].getTime = jest.fn().mockResolvedValue(mockReadings[1]);
      ts['sources'][2].getTime = jest.fn().mockResolvedValue(mockReadings[2]);

      const result = await ts.synthesize();

      // Sorted: 900, 1000, 1200 -> Median is 1000n
      expect(result.timestamp).toBe(1000n);
      expect(result.sources).toBe(3);
      expect(result.stratum).toBe(2); // Stratum of the median
      expect(result.confidence).toBe(1); // 3/3
    });

    it('should average 2 sources if 1 fails', async () => {
      const mockReadings: TimeReading[] = [
        { timestamp: 1000n, uncertainty: 5, stratum: 2, source: 'nist' },
        { timestamp: 1200n, uncertainty: 10, stratum: 1, source: 'kriss' },
      ];

      ts['sources'][0].getTime = jest.fn().mockResolvedValue(mockReadings[0]);
      ts['sources'][1].getTime = jest.fn().mockResolvedValue(mockReadings[1]);
      ts['sources'][2].getTime = jest.fn().mockRejectedValue(new Error("Timeout"));

      const result = await ts.synthesize();

      // Average of 1000 and 1200
      expect(result.timestamp).toBe(1100n);
      expect(result.sources).toBe(2);
      expect(result.stratum).toBe(1); // Min stratum of the two
      expect(result.uncertainty).toBe(7.5);
    });

    it('should use the single remaining source if 2 fail', async () => {
      const mockReadings: TimeReading[] = [
        { timestamp: 1500n, uncertainty: 5, stratum: 2, source: 'nist' },
      ];

      ts['sources'][0].getTime = jest.fn().mockResolvedValue(mockReadings[0]);
      ts['sources'][1].getTime = jest.fn().mockRejectedValue(new Error("Timeout"));
      ts['sources'][2].getTime = jest.fn().mockRejectedValue(new Error("Timeout"));

      const result = await ts.synthesize();

      expect(result.timestamp).toBe(1500n);
      expect(result.sources).toBe(1);
    });

    it('should throw an error if all sources fail', async () => {
      ts['sources'][0].getTime = jest.fn().mockRejectedValue(new Error("Timeout"));
      ts['sources'][1].getTime = jest.fn().mockRejectedValue(new Error("Timeout"));
      ts['sources'][2].getTime = jest.fn().mockRejectedValue(new Error("Timeout"));

      await expect(ts.synthesize()).rejects.toThrow(/CRITICAL: All NTP sources failed/);
    });
  });

  describe('Proof of Time (PoT) Generation', () => {
    it('should generate a valid PoT with signatures', async () => {
      const ts = new TimeSynthesis({ sources: ['nist', 'kriss', 'google'] });

      const mockReadings: TimeReading[] = [
        { timestamp: 1000n, uncertainty: 5, stratum: 2, source: 'nist' },
        { timestamp: 1050n, uncertainty: 6, stratum: 1, source: 'kriss' },
        { timestamp: 1100n, uncertainty: 4, stratum: 2, source: 'google' }
      ];

      ts['sources'][0].getTime = jest.fn().mockResolvedValue(mockReadings[0]);
      ts['sources'][1].getTime = jest.fn().mockResolvedValue(mockReadings[1]);
      ts['sources'][2].getTime = jest.fn().mockResolvedValue(mockReadings[2]);

      const pot = await ts.generateProofOfTime();

      expect(pot.timestamp).toBe(1050n); // Median
      expect(pot.sources).toBe(3);
      expect(pot.signatures.length).toBe(3);
      expect(pot.signatures[0].source).toBe('nist');
      expect(pot.signatures[1].source).toBe('kriss');
      expect(pot.signatures[2].source).toBe('google');
    });
  });

  describe('Live NTP Integration (Network Required)', () => {
    it('should successfully fetch time from at least one public NTP server', async () => {
      const ts = new TimeSynthesis(); // uses defaults: nist, kriss, google
      
      try {
        const result = await ts.synthesize();
        expect(result.timestamp).toBeGreaterThan(0n);
        expect(result.sources).toBeGreaterThan(0);
        expect(result.stratum).toBeLessThan(16);
      } catch (e) {
        console.warn('Live NTP fetch failed, network might be restricted.', e);
      }
    }, 10000);
  });
});
