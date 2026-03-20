// sdk/src/grg_pipeline.ts
import { GrgForward } from "./grg_forward";
import { GrgInverse } from "./grg_inverse";
import { logger } from "./logger";

export class GrgPipeline {
  static readonly MAX_INPUT_SIZE = 100 * 1024 * 1024; // 100 MB

  static processForward(data: Uint8Array, chainId: number, poolAddress: string): Uint8Array[] {
    if (data.length > this.MAX_INPUT_SIZE) {
      throw new Error(`[GRG] Input size ${data.length} exceeds MAX_INPUT_SIZE ${this.MAX_INPUT_SIZE}`);
    }
    logger.info("Starting GRG forward pipeline...");
    try {
      const shards = GrgForward.encode(data, chainId, poolAddress);
      logger.info(`GRG forward pipeline complete. Generated ${shards.length} shards.`);
      return shards;
    } catch (error) {
      logger.error(`GRG forward pipeline failed: ${error}`);
      throw error;
    }
  }

  static processInverse(shards: (Uint8Array | null)[], originalLength: number, chainId: number, poolAddress: string): Uint8Array {
    logger.info("Starting GRG inverse pipeline...");
    try {
      const hmacKey = GrgForward.deriveHmacKey(chainId, poolAddress);
      const decodedShards = shards.map(s => {
        try { return s ? GrgInverse.golayDecodeWrapper(s, hmacKey) : null; }
        catch (e) { logger.warn(`Golay decode failed for a shard: ${e}`); return null; }
      });
      const withLen = GrgInverse.redstuffDecode(decodedShards);
      const decodedLength = (withLen[0] << 24) | (withLen[1] << 16) | (withLen[2] << 8) | withLen[3];
      const compressed = withLen.subarray(4);
      const decompressed = GrgInverse.golombDecode(compressed);
      const final = decompressed.subarray(0, decodedLength);
      if (final.length !== originalLength) {
        throw new Error(`[GRG] Length mismatch in inverse: expected ${originalLength}, got ${final.length}`);
      }
      logger.info("GRG inverse pipeline complete.");
      return final;
    } catch (error) {
      logger.error(`GRG inverse pipeline failed: ${error}`);
      throw error;
    }
  }
}
