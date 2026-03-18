"use strict";
// sdk/src/reed_solomon.ts
// Reed-Solomon GF(2^8) erasure coding
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReedSolomon = void 0;
class ReedSolomon {
    static expTable = new Uint8Array(256);
    static logTable = new Uint8Array(256);
    static initialized = false;
    static vandermondeCache = new Map();
    static init() {
        if (this.initialized)
            return;
        let x = 1;
        for (let i = 0; i < 255; i++) {
            this.expTable[i] = x;
            this.logTable[x] = i;
            x <<= 1;
            if (x & 0x100) {
                x ^= 0x11D; // x^8 + x^4 + x^3 + x^2 + 1
            }
        }
        this.expTable[255] = this.expTable[0];
        this.logTable[0] = 0;
        this.initialized = true;
    }
    static mul(a, b) {
        if (a === 0 || b === 0)
            return 0;
        return this.expTable[(this.logTable[a] + this.logTable[b]) % 255];
    }
    static div(a, b) {
        if (b === 0)
            throw new Error("Division by zero");
        if (a === 0)
            return 0;
        return this.expTable[(this.logTable[a] - this.logTable[b] + 255) % 255];
    }
    static invertMatrix(matrix) {
        const n = matrix.length;
        const aug = [];
        for (let i = 0; i < n; i++) {
            aug[i] = [];
            for (let j = 0; j < n; j++)
                aug[i][j] = matrix[i][j];
            for (let j = 0; j < n; j++)
                aug[i][j + n] = (i === j) ? 1 : 0;
        }
        for (let i = 0; i < n; i++) {
            let pivot = i;
            while (pivot < n && aug[pivot][i] === 0)
                pivot++;
            if (pivot === n)
                throw new Error("Singular matrix");
            if (pivot !== i) {
                const temp = aug[i];
                aug[i] = aug[pivot];
                aug[pivot] = temp;
            }
            const pivotVal = aug[i][i];
            if (pivotVal !== 1) {
                for (let j = i; j < 2 * n; j++)
                    aug[i][j] = this.div(aug[i][j], pivotVal);
            }
            for (let j = 0; j < n; j++) {
                if (i !== j && aug[j][i] !== 0) {
                    const factor = aug[j][i];
                    for (let k = i; k < 2 * n; k++)
                        aug[j][k] ^= this.mul(factor, aug[i][k]);
                }
            }
        }
        const inv = [];
        for (let i = 0; i < n; i++) {
            inv[i] = [];
            for (let j = 0; j < n; j++)
                inv[i][j] = aug[i][j + n];
        }
        return inv;
    }
    static buildVandermonde(rows, cols) {
        const cacheKey = `${rows}-${cols}`;
        const cached = this.vandermondeCache.get(cacheKey);
        if (cached)
            return cached;
        const V = [];
        for (let r = 0; r < rows; r++) {
            V[r] = [];
            const x = r + 1;
            for (let c = 0; c < cols; c++) {
                V[r][c] = c === 0 ? 1 : this.mul(V[r][c - 1], x);
            }
        }
        const V_top = [];
        for (let i = 0; i < cols; i++)
            V_top.push([...V[i]]);
        const V_top_inv = this.invertMatrix(V_top);
        const G = [];
        for (let r = 0; r < rows; r++) {
            G[r] = [];
            for (let c = 0; c < cols; c++) {
                let val = 0;
                for (let k = 0; k < cols; k++)
                    val ^= this.mul(V[r][k], V_top_inv[k][c]);
                G[r][c] = val;
            }
        }
        this.vandermondeCache.set(cacheKey, G);
        return G;
    }
    static encode(data, dataShards = 4, parityShards = 2) {
        this.init();
        const totalShards = dataShards + parityShards;
        const rawShardSize = Math.ceil(data.length / dataShards);
        const shardSize = Math.ceil(rawShardSize / 3) * 3;
        const matrix = this.buildVandermonde(totalShards, dataShards);
        const shards = [];
        for (let i = 0; i < totalShards; i++)
            shards.push(new Uint8Array(shardSize));
        for (let i = 0; i < dataShards; i++) {
            shards[i].set(data.subarray(i * shardSize, Math.min((i + 1) * shardSize, data.length)));
        }
        for (let c = 0; c < shardSize; c++) {
            for (let r = dataShards; r < totalShards; r++) {
                let val = 0;
                for (let j = 0; j < dataShards; j++)
                    val ^= this.mul(matrix[r][j], shards[j][c]);
                shards[r][c] = val;
            }
        }
        return shards;
    }
    static decode(shards, dataShards = 4, parityShards = 2) {
        this.init();
        const totalShards = dataShards + parityShards;
        if (shards.length !== totalShards) {
            throw new Error(`[RS] Expected ${totalShards} shards, got ${shards.length}`);
        }
        const presentIndices = [];
        const presentShards = [];
        for (let i = 0; i < totalShards; i++) {
            if (shards[i] !== null && shards[i] !== undefined) {
                presentIndices.push(i);
                presentShards.push(shards[i]);
                if (presentIndices.length === dataShards)
                    break;
            }
        }
        if (presentIndices.length < dataShards) {
            throw new Error(`[RS] Not enough shards for recovery: need ${dataShards}, got ${presentIndices.length}`);
        }
        const shardSize = presentShards[0].length;
        const origMatrix = this.buildVandermonde(totalShards, dataShards);
        const subMatrix = [];
        for (let i = 0; i < dataShards; i++)
            subMatrix.push([...origMatrix[presentIndices[i]]]);
        const invMatrix = this.invertMatrix(subMatrix);
        const result = new Uint8Array(shardSize * dataShards);
        for (let c = 0; c < shardSize; c++) {
            for (let r = 0; r < dataShards; r++) {
                let val = 0;
                for (let j = 0; j < dataShards; j++)
                    val ^= this.mul(invMatrix[r][j], presentShards[j][c]);
                result[r * shardSize + c] = val;
            }
        }
        return result;
    }
}
exports.ReedSolomon = ReedSolomon;
