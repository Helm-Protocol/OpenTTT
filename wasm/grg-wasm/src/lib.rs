// GRG WASM bindings — Golomb-Rice → Reed-Solomon → Golay(24,12) + HMAC-SHA256
// IP PROTECTED: compiled binary only, source not distributed

use wasm_bindgen::prelude::*;

mod golay;
mod reed_solomon;
mod hmac_key;
mod grg;

use grg::GrgPipeline;

/// Encode data bytes through the GRG pipeline.
/// Returns a JS array of Uint8Array shards (6 shards total).
/// chain_id: string representation of u64, pool_address: "0x..." hex string
#[wasm_bindgen]
pub fn grg_encode(data: &[u8], chain_id: &str, pool_address: &str) -> Result<JsValue, JsValue> {
    let cid: u64 = chain_id
        .parse()
        .map_err(|_| JsValue::from_str("[GRG] Invalid chain_id"))?;

    let shards = GrgPipeline::encode(data, cid, pool_address)
        .map_err(|e| JsValue::from_str(e))?;

    // Serialize shards as Array of Uint8Array
    let arr = js_sys::Array::new();
    for shard in &shards {
        let ua = js_sys::Uint8Array::from(shard.as_slice());
        arr.push(&ua);
    }
    Ok(arr.into())
}

/// Verify shards against original data.
/// shards_flat: concatenated shard bytes, shard_count: number of shards (must be 6),
/// each shard assumed equal length.
/// Returns JSON: { ok: bool, hmac_failures: number, recovered: bool }
#[wasm_bindgen]
pub fn grg_verify(
    data: &[u8],
    shards_js: JsValue,
    chain_id: &str,
    pool_address: &str,
) -> Result<JsValue, JsValue> {
    let cid: u64 = chain_id
        .parse()
        .map_err(|_| JsValue::from_str("[GRG] Invalid chain_id"))?;

    let shards = js_shards_to_vec(shards_js)?;

    let result = GrgPipeline::verify(data, &shards, cid, pool_address);

    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &JsValue::from_str("ok"), &JsValue::from_bool(result.ok))?;
    js_sys::Reflect::set(
        &obj,
        &JsValue::from_str("hmac_failures"),
        &JsValue::from_f64(result.hmac_failures as f64),
    )?;
    js_sys::Reflect::set(
        &obj,
        &JsValue::from_str("recovered"),
        &JsValue::from_bool(result.recovered),
    )?;
    Ok(obj.into())
}

/// Decode shards back to original data.
/// shards_js: JS Array of Uint8Array (6 shards), original_len: expected output length
#[wasm_bindgen]
pub fn grg_decode(
    shards_js: JsValue,
    original_len: usize,
    chain_id: &str,
    pool_address: &str,
) -> Result<Vec<u8>, JsValue> {
    let cid: u64 = chain_id
        .parse()
        .map_err(|_| JsValue::from_str("[GRG] Invalid chain_id"))?;

    let shards = js_shards_to_vec(shards_js)?;

    GrgPipeline::decode(&shards, original_len, cid, pool_address)
        .map_err(|e| JsValue::from_str(e))
}

// Helper: convert JS Array of Uint8Array → Vec<Vec<u8>>
fn js_shards_to_vec(shards_js: JsValue) -> Result<Vec<Vec<u8>>, JsValue> {
    let arr: js_sys::Array = shards_js
        .dyn_into()
        .map_err(|_| JsValue::from_str("[GRG] shards must be an Array"))?;

    let mut shards: Vec<Vec<u8>> = Vec::with_capacity(arr.length() as usize);
    for i in 0..arr.length() {
        let item = arr.get(i);
        let ua: js_sys::Uint8Array = item
            .dyn_into()
            .map_err(|_| JsValue::from_str("[GRG] Each shard must be Uint8Array"))?;
        shards.push(ua.to_vec());
    }
    Ok(shards)
}
