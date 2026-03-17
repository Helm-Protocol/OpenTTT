//! Reed-Solomon GF(2^8) — primitive polynomial 0x11D
//! Port from OpenTTT reed_solomon.ts with Vandermonde caching.

use std::sync::OnceLock;
use std::collections::HashMap;
use std::sync::Mutex;

const POLY: u16 = 0x11D; // x^8 + x^4 + x^3 + x^2 + 1

struct GfTables {
    exp: [u8; 256],
    log: [u8; 256],
}

static GF: OnceLock<GfTables> = OnceLock::new();

fn gf() -> &'static GfTables {
    GF.get_or_init(|| {
        let mut exp = [0u8; 256];
        let mut log = [0u8; 256];
        let mut x: u16 = 1;
        for i in 0..255usize {
            exp[i] = x as u8;
            log[x as usize] = i as u8;
            x <<= 1;
            if x & 0x100 != 0 { x ^= POLY; }
        }
        exp[255] = exp[0];
        log[0] = 0;
        GfTables { exp, log }
    })
}

#[inline]
pub fn gf_mul(a: u8, b: u8) -> u8 {
    if a == 0 || b == 0 { return 0; }
    let t = gf();
    t.exp[((t.log[a as usize] as u16 + t.log[b as usize] as u16) % 255) as usize]
}

#[inline]
pub fn gf_div(a: u8, b: u8) -> u8 {
    assert_ne!(b, 0, "GF division by zero");
    if a == 0 { return 0; }
    let t = gf();
    t.exp[((t.log[a as usize] as i16 - t.log[b as usize] as i16 + 255) % 255) as usize]
}

fn gf_invert_matrix(mat: &[Vec<u8>]) -> Vec<Vec<u8>> {
    let n = mat.len();
    let mut aug: Vec<Vec<u8>> = mat.iter().map(|row| {
        let mut r = row.clone();
        r.resize(2 * n, 0);
        r
    }).collect();
    for i in 0..n { aug[i][n + i] = 1; }

    for i in 0..n {
        let mut pivot = i;
        while pivot < n && aug[pivot][i] == 0 { pivot += 1; }
        if pivot == n { panic!("Singular matrix in RS"); }
        aug.swap(i, pivot);

        let pv = aug[i][i];
        if pv != 1 {
            for j in i..2*n { aug[i][j] = gf_div(aug[i][j], pv); }
        }
        for j in 0..n {
            if i != j && aug[j][i] != 0 {
                let factor = aug[j][i];
                for k in i..2*n { aug[j][k] ^= gf_mul(factor, aug[i][k]); }
            }
        }
    }
    aug.iter().map(|row| row[n..].to_vec()).collect()
}

// Vandermonde cache keyed by (total_shards, data_shards)
static VANDERMONDE_CACHE: OnceLock<Mutex<HashMap<(usize, usize), Vec<Vec<u8>>>>> = OnceLock::new();

fn get_or_build_vandermonde(rows: usize, cols: usize) -> Vec<Vec<u8>> {
    let cache = VANDERMONDE_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut lock = cache.lock().unwrap();
    if let Some(m) = lock.get(&(rows, cols)) {
        return m.clone();
    }
    let v = build_vandermonde(rows, cols);
    lock.insert((rows, cols), v.clone());
    v
}

fn build_vandermonde(rows: usize, cols: usize) -> Vec<Vec<u8>> {
    let mut v = vec![vec![0u8; cols]; rows];
    for r in 0..rows {
        let x = (r + 1) as u8;
        v[r][0] = 1;
        for c in 1..cols { v[r][c] = gf_mul(v[r][c-1], x); }
    }
    let v_top: Vec<Vec<u8>> = v[..cols].to_vec();
    let v_top_inv = gf_invert_matrix(&v_top);
    let mut g = vec![vec![0u8; cols]; rows];
    for r in 0..rows {
        for c in 0..cols {
            let mut val = 0u8;
            for k in 0..cols { val ^= gf_mul(v[r][k], v_top_inv[k][c]); }
            g[r][c] = val;
        }
    }
    g
}

/// Encode data into (data_shards + parity_shards) shards
pub fn rs_encode(data: &[u8], data_shards: usize, parity_shards: usize) -> Vec<Vec<u8>> {
    let total = data_shards + parity_shards;
    let raw_shard_size = (data.len() + data_shards - 1) / data_shards;
    let shard_size = ((raw_shard_size + 2) / 3) * 3;

    let matrix = get_or_build_vandermonde(total, data_shards);
    let mut shards = vec![vec![0u8; shard_size]; total];

    for i in 0..data_shards {
        let start = i * shard_size;
        let end = (start + shard_size).min(data.len());
        if start < data.len() {
            shards[i][..end - start].copy_from_slice(&data[start..end]);
        }
    }
    for c in 0..shard_size {
        for r in data_shards..total {
            let mut val = 0u8;
            for j in 0..data_shards { val ^= gf_mul(matrix[r][j], shards[j][c]); }
            shards[r][c] = val;
        }
    }
    shards
}

/// Decode shards (Some = present, None = erased)
pub fn rs_decode(
    shards: &[Option<Vec<u8>>],
    data_shards: usize,
    parity_shards: usize,
) -> Result<Vec<u8>, &'static str> {
    let total = data_shards + parity_shards;
    if shards.len() != total {
        return Err("[RS] Wrong shard count");
    }
    let present: Vec<(usize, &Vec<u8>)> = shards.iter().enumerate()
        .filter_map(|(i, s)| s.as_ref().map(|v| (i, v)))
        .take(data_shards)
        .collect();

    if present.len() < data_shards {
        return Err("[RS] Not enough shards");
    }
    let shard_size = present[0].1.len();
    let orig_matrix = get_or_build_vandermonde(total, data_shards);
    let sub: Vec<Vec<u8>> = present.iter().map(|(i, _)| orig_matrix[*i].clone()).collect();
    let inv = gf_invert_matrix(&sub);

    let mut result = vec![0u8; shard_size * data_shards];
    for c in 0..shard_size {
        for r in 0..data_shards {
            let mut val = 0u8;
            for j in 0..data_shards { val ^= gf_mul(inv[r][j], present[j].1[c]); }
            result[r * shard_size + c] = val;
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_encode_decode() {
        let data = b"Hello GF(2^8) Reed-Solomon TTT!";
        let shards = rs_encode(data, 4, 2);
        assert_eq!(shards.len(), 6);
        let mut opt: Vec<Option<Vec<u8>>> = shards.iter().map(|s| Some(s.clone())).collect();
        opt[1] = None; opt[3] = None; // erase 2 data shards (keep 0,2 + parity 4,5)
        let decoded = rs_decode(&opt, 4, 2).unwrap();
        // reconstructed data shards[0] should match original encode[0]
        let shard_size = shards[0].len();
        assert_eq!(&decoded[..shard_size], shards[0].as_slice());
    }
}
