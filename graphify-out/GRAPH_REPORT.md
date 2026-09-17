# Graph Report - /home/ajamias/work/j2  (2026-08-19)

## Corpus Check
- 3 files · ~2,096 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 41 nodes · 49 edges · 8 communities (6 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Jira MCP Server
- Codebase Context Skills
- Install Script
- Project Core
- SDLC Automation Goals
- Graphify Integration
- Caveman Output Policy
- Platform Prerequisites

## God Nodes (most connected - your core abstractions)
1. `Codebase Context` - 9 edges
2. `J2 Project` - 9 edges
3. `get_ticket()` - 7 edges
4. `search_tickets()` - 5 edges
5. `install.sh script` - 4 edges
6. `_check_config()` - 3 edges
7. `_auth_header()` - 3 edges
8. `SDLC Automation Goal` - 3 edges
9. `Caveman Plugin` - 3 edges
10. `info()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Token Efficient Workflow` --conceptually_related_to--> `Caveman Plugin`  [INFERRED]
  README.md → README.md  _Bridges community 4 → community 6_
- `J2 Project` --references--> `Agent Skills Plugin`  [EXTRACTED]
  README.md → README.md  _Bridges community 3 → community 4_
- `J2 Project` --references--> `Caveman Plugin`  [EXTRACTED]
  README.md → README.md  _Bridges community 3 → community 6_
- `J2 Project` --references--> `Claude Code`  [EXTRACTED]
  README.md → README.md  _Bridges community 3 → community 7_
- `J2 Project` --references--> `Graphify`  [EXTRACTED]
  README.md → README.md  _Bridges community 3 → community 5_

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **J2 Tool Ecosystem** — readme_agent_skills, readme_graphify, readme_caveman, readme_jira_mcp [EXTRACTED 1.00]
- **J2 Design Principles** — readme_additive_install, readme_graphify_common_capability, readme_caveman_global_policy [EXTRACTED 1.00]
- **Skills that use codebase-context** — skills_codebase_context_skill_plan, skills_codebase_context_skill_spec, skills_codebase_context_skill_review, skills_codebase_context_skill_code_review, skills_codebase_context_skill_test, skills_codebase_context_skill_ship, skills_codebase_context_skill_debugging_and_error_recovery, skills_codebase_context_skill_deprecation_and_migration [EXTRACTED 1.00]

## Communities (8 total, 2 thin omitted)

### Community 0 - "Jira MCP Server"
Cohesion: 0.36
Nodes (9): _auth_header(), _check_config(), _format_comments(), _format_ticket(), get_ticket(), Search Jira tickets using JQL. Args: jql: JQL query string (e.g. 'project =…, Fetch a Jira ticket with description, acceptance criteria, and comments. Args:…, search_tickets() (+1 more)

### Community 1 - "Codebase Context Skills"
Cohesion: 0.20
Nodes (10): code-review, Codebase Context, debugging-and-error-recovery, deprecation-and-migration, Graphify-first strategy, plan, review, ship (+2 more)

### Community 2 - "Install Script"
Cohesion: 0.70
Nodes (4): info(), ok(), install.sh script, warn()

### Community 3 - "Project Core"
Cohesion: 0.40
Nodes (5): Additive Install Design, install.sh, J2 Project, Jira MCP Server, OpenClaw

### Community 4 - "SDLC Automation Goals"
Cohesion: 0.50
Nodes (4): Agent Skills Plugin, Minimal Human-in-the-Loop, SDLC Automation Goal, Token Efficient Workflow

### Community 5 - "Graphify Integration"
Cohesion: 0.67
Nodes (3): Codebase Context Skill, Graphify, Graphify as Common Capability Design

## Knowledge Gaps
- **13 isolated node(s):** `Graphify-first strategy`, `plan`, `spec`, `review`, `code-review` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `J2 Project` connect `Project Core` to `SDLC Automation Goals`, `Graphify Integration`, `Caveman Output Policy`, `Platform Prerequisites`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `Graphify` connect `Graphify Integration` to `Project Core`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `Graphify-first strategy`, `plan`, `spec` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._