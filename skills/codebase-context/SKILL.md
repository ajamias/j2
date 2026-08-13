---
name: codebase-context
description: "Graphify-first codebase exploration strategy. Use before any skill or task that requires understanding repo architecture, file relationships, or component structure."
---

# Codebase Context

A common capability for architectural and codebase exploration. This is not a standalone skill you invoke directly — it's a policy that other skills and tasks consume when they need to understand a repo.

## When This Applies

Any time you need to answer questions like:
- What does this repo do?
- Where is feature X implemented?
- How do these components relate?
- What would this change affect?

This includes (but isn't limited to) skills like: `plan`, `spec`, `review`, `code-review`, `test`, `ship`, `debugging-and-error-recovery`, `deprecation-and-migration`.

## The Strategy

### Step 1: Check for an existing graph

Look for a `graphify-out/` directory in the project root.

- **If it exists**: the graph is already built. Use `/graphify query "<your question>"` to traverse it. The graph gives you architectural context, community structure, and cross-file relationships without reading every file.
- **If it does not exist**: run `/graphify .` to build the graph first. This is a one-time cost that pays for itself across every subsequent exploration.

### Step 2: Drill into source

Once Graphify identifies relevant components, modules, or files:

1. Read the actual source files Graphify pointed you to — the graph tells you *where* to look, not *what the code says*
2. Use targeted `grep` for specific symbols, function names, or patterns when you need to trace usage or find callsites
3. Do not read files speculatively — let the graph narrow your search space first

### Step 3: For ongoing projects

If the project uses Graphify's git hook (`graphify hook install`), the graph stays current after each commit (AST-only rebuild, no API cost). If not, and the graph looks stale, run `/graphify . --update` to refresh incrementally.

## What This Is Not

- This is not a replacement for reading code. The graph is a map, not the territory.
- This does not modify code, create files, or produce artifacts. It only informs exploration.
- This does not apply to trivial operations (rename a variable, fix a typo) where you already know exactly which file to touch.
