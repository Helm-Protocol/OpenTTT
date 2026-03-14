import * as raw from 'bs58';

// This is a temporary shim for bs58@6.0.0
//
// This issue is similar to the one described here: https://github.com/bitcoinjs/bs58check/issues/47
//
// bs58 v6.0.0 uses ESM with only a default export, which causes compatibility
// issues with Metro (React Native). When importing the package using
// `import bs58 from 'bs58'`, Metro applies multiple levels of wrapping,
// resulting in a structure like `{ default: { default: { encode, decode, ... } } }`.
//
// This shim unwraps the exports until it reaches the object that contains `.decode`,
// `.encode`, and `.decodeUnsafe`, allowing consistent usage across platforms.
//
// We can remove this shim once bs58 publishes a version that properly re-exports
// named methods from its ESM build.
function unwrap(obj) {
    let cur = obj;
    while (cur &&
        !(cur.encode && cur.decode && cur.decodeUnsafe) &&
        cur.default) {
        cur = cur.default;
    }
    return cur;
}
const bs58 = unwrap(raw);

export { bs58 };
//# sourceMappingURL=bs58.mjs.map
