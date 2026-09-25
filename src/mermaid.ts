/**
 * Print Mermaid diagrams for the top-level graph and each phase subgraph.
 *
 * Usage: `bun run src/mermaid.ts` (or `npm run graph`). Drawing needs no provider
 * credentials — it uses a default context purely to assemble the graph structure.
 */

import { defaultContext, type NodeContext } from "./core/node.js";
import { buildGraph } from "./graph.js";

import * as definePhase from "./phases/define/graph.js";
import * as planPhase from "./phases/plan/graph.js";
import * as buildPhase from "./phases/build/graph.js";
import * as verifyPhase from "./phases/verify/graph.js";
import * as reviewPhase from "./phases/review/graph.js";

type Compiled = { getGraphAsync: (opts?: { xray?: boolean }) => Promise<{ drawMermaid: () => string }> };

async function printGraph(title: string, compiled: Compiled): Promise<void> {
  const drawable = await compiled.getGraphAsync();
  console.log(`\n%% ===== ${title} =====`);
  console.log(drawable.drawMermaid().trim());
}

async function main(): Promise<void> {
  const ctx: NodeContext = defaultContext();
  await printGraph("top-level graph", buildGraph(ctx));
  await printGraph("define subgraph", definePhase.build(ctx));
  await printGraph("plan subgraph", planPhase.build(ctx));
  await printGraph("build subgraph", buildPhase.build(ctx));
  await printGraph("verify subgraph", verifyPhase.build(ctx));
  await printGraph("review subgraph", reviewPhase.build(ctx));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
