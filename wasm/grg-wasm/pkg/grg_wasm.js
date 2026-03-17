/* @ts-self-types="./grg_wasm.d.ts" */

import * as wasm from "./grg_wasm_bg.wasm";
import { __wbg_set_wasm } from "./grg_wasm_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    grg_decode, grg_encode, grg_verify
} from "./grg_wasm_bg.js";
