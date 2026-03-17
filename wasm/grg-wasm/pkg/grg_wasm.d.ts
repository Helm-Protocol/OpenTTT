/* tslint:disable */
/* eslint-disable */

/**
 * Decode shards back to original data.
 * shards_js: JS Array of Uint8Array (6 shards), original_len: expected output length
 */
export function grg_decode(shards_js: any, original_len: number, chain_id: string, pool_address: string): Uint8Array;

/**
 * Encode data bytes through the GRG pipeline.
 * Returns a JS array of Uint8Array shards (6 shards total).
 * chain_id: string representation of u64, pool_address: "0x..." hex string
 */
export function grg_encode(data: Uint8Array, chain_id: string, pool_address: string): any;

/**
 * Verify shards against original data.
 * shards_flat: concatenated shard bytes, shard_count: number of shards (must be 6),
 * each shard assumed equal length.
 * Returns JSON: { ok: bool, hmac_failures: number, recovered: bool }
 */
export function grg_verify(data: Uint8Array, shards_js: any, chain_id: string, pool_address: string): any;
