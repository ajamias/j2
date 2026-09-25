/** Node plugin framework: shared types, the provider interface, and parsing helpers. */

export { type NodeContext, type NodeFn, defaultContext } from "./node.js";
export {
  type Provider,
  type ProviderName,
  type RunOpts,
  type RunResult,
  type JsonOpts,
  resolveProvider,
  defaultProvider,
  stripFences,
} from "./provider.js";
export { lastTagged, findTagged, extractSummary } from "./parse.js";
export { log, traced } from "./logging.js";
