# J2

J2 will be a collection of config files that I use for day-to-day development work (for now).

The purpose of this project is to experiment with automating parts of the SDLC:

```text
Planning/research
Analysis
Design
Implementation
Testing/refactoring
Deployment
Maintenance
```

and design a more token efficient workflow. The end goal is to have as little human-in-the-loop
interaction as possible.

## Installation

The intended installation and configuration method is through `openclaw`, but there will be
installation scripts and documentation located in `scripts` for other platforms like `claude-cli`,
`codex`, and `opencode`.

### Claude Code

```bash
git clone https://github.com/ajamias/j2.git
cd j2
./install.sh
```

One-shot additive install that configures three tools as global capabilities:

- **[agent-skills](https://github.com/addyosmani/agent-skills)** — structured development workflow skills (plan, review, test, ship, etc.)
- **[graphify](https://github.com/Graphify-Labs/graphify)** — knowledge-graph-based codebase exploration, exposed as a common `codebase-context` capability (not coupled to individual skills)
- **[caveman](https://github.com/JuliusBrussee/caveman)** — terse output policy for user-facing communication (reasoning uses normal language)

#### Prerequisites

- [Claude Code](https://claude.ai/code) CLI installed
- [uv](https://docs.astral.sh/uv/) (installed automatically if missing)

#### Architecture

The install is **additive** — it never overwrites or removes existing `~/.claude/` configuration.

```
~/.claude/
├── CLAUDE.md              ← policies appended (codebase-context, caveman output)
├── skills/
│   ├── codebase-context/  ← graphify-first exploration strategy
│   └── graphify/          ← graphify's own skill (installed by graphify CLI)
├── plugins/
│   ├── agent-skills       ← dev workflow skills
│   └── caveman            ← terse output plugin
└── settings.json          ← plugins enabled
```

**Design decisions:**

- **Graphify is a common capability, not per-skill wiring.** A `codebase-context` skill teaches the agent "use the graph before exploring" — individual skills don't need to know about graphify.
- **Caveman is a global output policy.** Terse style applies to user-facing output only. Internal reasoning, code comments, and commit messages use normal language.
- **Install once, use everywhere.** The harness lives in `~/.claude/` and applies to every project.

#### Post-Install

In any project:

```bash
# Build the initial knowledge graph
/graphify .

# Set up auto-rebuild on commits
graphify hook install
```
