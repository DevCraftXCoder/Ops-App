// Ambient declarations for the Ops App. Pure script file (no import/export) so
// the wildcard module + global types register globally.
//
// - `declare module "*.css"` satisfies noUncheckedSideEffectImports (TS2882) for
//   side-effect CSS imports such as `import "./globals.css"`.
// - R2 types are aliased from @cloudflare/workers-types via type-only `import(...)`
//   so the workers-types global lib augmentation does not collide with the DOM lib.

declare module "*.css";

type R2Bucket = import("@cloudflare/workers-types").R2Bucket;
type R2Object = import("@cloudflare/workers-types").R2Object;
