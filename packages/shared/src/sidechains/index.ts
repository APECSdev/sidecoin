// packages/shared/src/sidechains/index.ts
//
// Barrel export for sidechain registry and helpers.

export * from "./registry";

// The Thunder module is exported as a VALUE namespace (Metro cannot compile
// `export * as` — it needs @babel/plugin-transform-export-namespace-from —
// so we re-export an import-star namespace instead, which Metro handles
// fine). Import { thunder } and call thunder.selectCoins(…), etc.
import * as thunderNamespace from "./thunder";
export { thunderNamespace as thunder };

// The Thunder TYPES are also re-exported flat (type-only, erased at
// runtime) so consumers can write
// `import type { ThunderPointedOutput } from "@sidecoin/shared"` instead of
// reaching through the namespace (a re-exported namespace binding does not
// carry type members). Curated EXPLICITLY — an `export type * from` here
// leaks value names like selectCoins into the root barrel and collides
// with the L1 coin-selection module. Every Thunder type is Thunder-prefixed
// or uniquely named, so none of these collide with registry/tx exports.
export type {
  ThunderKeySchemeId,
  ThunderPrivateKey,
  ThunderPublicKey,
  ThunderNetworkId,
  ThunderNetworkConfig,
  ThunderOutPoint,
  ThunderContent,
  ThunderOutput,
  ThunderTransaction,
  ThunderPointedOutput,
  ThunderCoinSelection,
  ThunderAuthorizationJson,
  ParsedDepositString,
  PointBytes,
} from "./thunder";
