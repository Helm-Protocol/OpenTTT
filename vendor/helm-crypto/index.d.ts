export { golayEncode, golayDecode } from "./golay";
export { ReedSolomon } from "./reed_solomon";
export { GrgForward } from "./grg_forward";
export { GrgInverse } from "./grg_inverse";
export { GrgPipeline } from "./grg_pipeline";

// Abstracted aliases (use these in public-facing code)
export { GrgForward as IntegrityEncoder } from "./grg_forward";
export { GrgInverse as IntegrityDecoder } from "./grg_inverse";
export { GrgPipeline as IntegrityPipeline } from "./grg_pipeline";
