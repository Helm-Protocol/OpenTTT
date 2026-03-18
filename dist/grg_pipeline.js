"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrgPipeline = void 0;
// sdk/src/grg_pipeline.ts
const grg_forward_1 = require("./grg_forward");
const grg_inverse_1 = require("./grg_inverse");
const logger_1 = require("./logger");
class GrgPipeline {
    static MAX_INPUT_SIZE = 100 * 1024 * 1024; // 100 MB
    static processForward(data, chainId, poolAddress) {
        if (data.length > this.MAX_INPUT_SIZE) {
            throw new Error(`[GRG] Input size ${data.length} exceeds MAX_INPUT_SIZE ${this.MAX_INPUT_SIZE}`);
        }
        logger_1.logger.info("Starting GRG forward pipeline...");
        try {
            const shards = grg_forward_1.GrgForward.encode(data, chainId, poolAddress);
            logger_1.logger.info(`GRG forward pipeline complete. Generated ${shards.length} shards.`);
            return shards;
        }
        catch (error) {
            logger_1.logger.error(`GRG forward pipeline failed: ${error}`);
            throw error;
        }
    }
    static processInverse(shards, originalLength, chainId, poolAddress) {
        logger_1.logger.info("Starting GRG inverse pipeline...");
        try {
            const hmacKey = grg_forward_1.GrgForward.deriveHmacKey(chainId, poolAddress);
            const decodedShards = shards.map(s => {
                try {
                    return s ? grg_inverse_1.GrgInverse.golayDecodeWrapper(s, hmacKey) : null;
                }
                catch (e) {
                    logger_1.logger.warn(`Golay decode failed for a shard: ${e}`);
                    return null;
                }
            });
            const withLen = grg_inverse_1.GrgInverse.redstuffDecode(decodedShards);
            const decodedLength = (withLen[0] << 24) | (withLen[1] << 16) | (withLen[2] << 8) | withLen[3];
            const compressed = withLen.subarray(4);
            const decompressed = grg_inverse_1.GrgInverse.golombDecode(compressed);
            const final = decompressed.subarray(0, decodedLength);
            if (final.length !== originalLength) {
                throw new Error(`[GRG] Length mismatch in inverse: expected ${originalLength}, got ${final.length}`);
            }
            logger_1.logger.info("GRG inverse pipeline complete.");
            return final;
        }
        catch (error) {
            logger_1.logger.error(`GRG inverse pipeline failed: ${error}`);
            throw error;
        }
    }
}
exports.GrgPipeline = GrgPipeline;
