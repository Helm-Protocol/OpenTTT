'use strict';

var raw = require('bs58');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var raw__namespace = /*#__PURE__*/_interopNamespaceDefault(raw);

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
const bs58 = unwrap(raw__namespace);

exports.bs58 = bs58;
//# sourceMappingURL=bs58.js.map
