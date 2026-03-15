"use strict";
// Minimal logger for helm-crypto (standalone, no external dependency)
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logger = {
    info: (msg) => console.log(`[helm-crypto] ${msg}`),
    warn: (msg) => console.warn(`[helm-crypto] ${msg}`),
    error: (msg) => console.error(`[helm-crypto] ${msg}`),
    debug: (msg) => console.debug(`[helm-crypto] ${msg}`),
};
//# sourceMappingURL=logger.js.map