#!/usr/bin/env bash
set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
CLAUDE_MD="${CLAUDE_DIR}/CLAUDE.md"
SKILLS_DIR="${CLAUDE_DIR}/skills"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info()  { printf '\033[1;34m=>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m=>\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m=>\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. agent-skills (Claude Code plugin)
# ---------------------------------------------------------------------------
info "Installing agent-skills plugin..."
if claude plugin list 2>/dev/null | grep -q "agent-skills@addy-agent-skills"; then
  ok "agent-skills already installed, skipping"
else
  claude plugin marketplace add addyosmani/agent-skills 2>/dev/null || true
  claude plugin install agent-skills@addy-agent-skills
  ok "agent-skills installed"
fi

# ---------------------------------------------------------------------------
# 2. graphify (Python CLI via uv)
# ---------------------------------------------------------------------------
info "Installing graphify..."
if command -v graphify &>/dev/null; then
  ok "graphify CLI already installed, skipping uv install"
else
  if ! command -v uv &>/dev/null; then
    warn "uv not found — installing uv first"
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="${HOME}/.local/bin:${PATH}"
  fi
  uv tool install graphifyy
  ok "graphify CLI installed"
fi

graphify install
ok "graphify skill installed"

# ---------------------------------------------------------------------------
# 3. caveman (Claude Code plugin)
# ---------------------------------------------------------------------------
info "Installing caveman plugin..."
if claude plugin list 2>/dev/null | grep -q "caveman@caveman"; then
  ok "caveman already installed, skipping"
else
  claude plugin marketplace add JuliusBrussee/caveman 2>/dev/null || true
  claude plugin install caveman@caveman
  ok "caveman installed"
fi

# ---------------------------------------------------------------------------
# 4. codebase-context skill
# ---------------------------------------------------------------------------
info "Installing codebase-context skill..."
CODEBASE_SKILL_DIR="${SKILLS_DIR}/codebase-context"
mkdir -p "${CODEBASE_SKILL_DIR}"
cp "${SCRIPT_DIR}/skills/codebase-context/SKILL.md" "${CODEBASE_SKILL_DIR}/SKILL.md"
ok "codebase-context skill installed"

# ---------------------------------------------------------------------------
# 5. Global CLAUDE.md policies (additive)
# ---------------------------------------------------------------------------
info "Configuring global CLAUDE.md policies..."

GRAPHIFY_MARKER="# j2: codebase-context policy"
CAVEMAN_MARKER="# j2: caveman output policy"

if grep -qF "${GRAPHIFY_MARKER}" "${CLAUDE_MD}" 2>/dev/null; then
  ok "codebase-context policy already in CLAUDE.md, skipping"
else
  cat >> "${CLAUDE_MD}" <<'POLICY'

# j2: codebase-context policy
- **codebase-context** (`~/.claude/skills/codebase-context/SKILL.md`) — codebase exploration via Graphify-first strategy. Trigger: any skill or task requiring architectural or codebase exploration.
Before exploring a codebase for any skill that requires understanding repo structure, architecture, or file relationships, use the codebase-context skill.
POLICY
  ok "codebase-context policy added to CLAUDE.md"
fi

if grep -qF "${CAVEMAN_MARKER}" "${CLAUDE_MD}" 2>/dev/null; then
  ok "caveman output policy already in CLAUDE.md, skipping"
else
  cat >> "${CLAUDE_MD}" <<'POLICY'

# j2: caveman output policy
When reporting results, status, or explanations back to the user, use caveman's terse output style to reduce token cost and reading burden. When reasoning, planning, or thinking through problems internally (tool calls, agent prompts, commit messages, code comments), use normal language — clarity for machines, brevity for humans.
POLICY
  ok "caveman output policy added to CLAUDE.md"
fi

# ---------------------------------------------------------------------------
# 6. Enable plugins in settings.json (additive)
# ---------------------------------------------------------------------------
info "Ensuring plugins are enabled in settings.json..."
SETTINGS="${CLAUDE_DIR}/settings.json"
if [ -f "${SETTINGS}" ]; then
  needs_update=false
  for plugin in "agent-skills@addy-agent-skills" "caveman@caveman"; do
    if ! python3 -c "
import json, sys
s = json.load(open('${SETTINGS}'))
sys.exit(0 if s.get('enabledPlugins',{}).get('${plugin}') else 1)
" 2>/dev/null; then
      needs_update=true
      break
    fi
  done

  if [ "${needs_update}" = true ]; then
    python3 -c "
import json
with open('${SETTINGS}') as f:
    s = json.load(f)
ep = s.setdefault('enabledPlugins', {})
ep.setdefault('agent-skills@addy-agent-skills', True)
ep.setdefault('caveman@caveman', True)
with open('${SETTINGS}', 'w') as f:
    json.dump(s, f, indent=2)
    f.write('\n')
"
    ok "plugins enabled in settings.json"
  else
    ok "plugins already enabled in settings.json"
  fi
else
  warn "settings.json not found — plugins may need manual enabling"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
ok "j2 harness installed. Components:"
echo "   - agent-skills plugin (dev workflow skills)"
echo "   - graphify CLI + skill (knowledge graph codebase exploration)"
echo "   - caveman plugin (terse output policy)"
echo "   - codebase-context skill (graphify-first exploration strategy)"
echo ""
info "To use in a project: cd into it and run '/graphify .' to build the initial graph."
info "Then run 'graphify hook install' to auto-rebuild on commits."
