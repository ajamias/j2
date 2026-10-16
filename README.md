# j2

Compile a directory of agent skills into a runnable LangGraph workflow.

Point `j2` at a directory of `SKILL.md` files. It reads them, works out what kind of
collection they are and what order they should run in, designs a context schema for
each one, and writes a standalone TypeScript file that executes the whole chain.

```bash
j2 generate --dir ./skills      # compile skills into a workflow
j2 list                         # see what has been generated
j2 run <workflow> --goal "..."  # execute one
```

## Install

```bash
bun install
bun run build       # emits dist/, including the runtime generated files import
```

Set the key for whichever provider you use — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`OPENROUTER_API_KEY` — or run `ollama serve` locally. See `.env.example`.

## The three commands

### `generate`

```
j2 generate [--dir <directory>] [--provider <name>] [--name <slug>]
            [--force] [--check] [--allow-shell] [--deny-tool <name>] [--dry-run]
```

`--dir` defaults to the current directory and must contain at least one
*subdirectory* holding a `SKILL.md`. A `SKILL.md` sitting directly in `--dir` is not
a skill set, and `j2` says so rather than finding nothing.

The pipeline:

| Stage | What happens | Model |
|---|---|---|
| Discover | find `<dir>/<skill>/SKILL.md` | none |
| Split | frontmatter and body, list bundled files | none |
| Extract | pull `whenToUse`, `produces`, arguments, tools, references out of the prose | small |
| Classify | decide what kind of set this is and order it | medium |
| Design | per skill: output schema, upstream reads, tools, prompt guidance | medium |
| Assemble | validate, resolve tool policy, derive channel names | none |
| Emit | render TypeScript, transpile, write the manifest | none |

The result is `~/.config/j2/generated/<slug>/`:

- `workflow.ts` — the workflow: node definitions, Zod context schemas, prompts, order
- `workflow.mjs` — the same file with types stripped, which `run` imports
- `manifest.json` — what `list` reads

### `list`

Prints every generated workflow with its description. Reads manifests only: it never
imports generated code, so it works with no API key and with a broken workflow on
disk. A workflow whose `workflow.ts` has been hand-edited since generation is marked
`(stale)`.

### `run`

```
j2 run <workflow|path> --goal "<task>" [--workdir <dir>] [--recursion-limit 150] [--yes]
```

Loads the compiled module with a dynamic `import()` and executes the chain. When a
node needs the user it pauses, the CLI asks, and the run resumes on the same thread.
Scripted answers work too:

```bash
printf 'answer one\nanswer two\nyes\n' | j2 run my-workflow --goal "..."
```

## Model sizes

Stages ask for a logical size, never a model id, so swapping providers never touches
a call site.

- **small** — mechanical, schema-constrained extraction. One call per skill.
- **medium** — the design-time reasoning of `generate`: classifying, ordering, and
  designing each node's context schema.
- **large** — the run-time agent loops of `run`, where the real work happens.

`generate` never uses large by default; `run` never uses small.

| size | anthropic | openai | openrouter | ollama |
|---|---|---|---|---|
| large | `claude-opus-5-5` | `gpt-5.5` | `anthropic/claude-opus-5.5` | `qwen3.5:32b` |
| medium | `claude-sonnet-5-5` | `gpt-5.4-mini` | `anthropic/claude-sonnet-5.5` | `qwen3.5:14b` |
| small | `claude-haiku-5-5` | `gpt-5.4-nano` | `anthropic/claude-haiku-5.5` | `qwen3.5:4b` |

Override precedence, highest first: `--small-model`/`--medium-model`/`--large-model`,
then `--model` (pins all three), then `J2_<PROVIDER>_<SIZE>_MODEL`, then the defaults
above.

## What a node is

Each node runs one skill in an agent loop with tools, then emits a structured result.
Its context object has five parts, which map onto LangGraph channels:

- **structured input** — `whenToUse`, `produces`, arguments, bundled files; fixed at
  generate time from the SKILL.md
- **implicit input** — the outputs of the earlier nodes it reads
- **working context** — a node-local, append-only journal (`<node>__working`)
- **output context** — the model-designed result schema (`<node>__output`)
- **references** — sibling skills this one points at

The context is flattened into namespaced channels rather than stored as one nested
object: LangGraph reducers are per-channel, so a nested object would get last-value
semantics and clobber the append-only journal on every write.

## Tools

Every node gets a subset of `read_file`, `write_file`, `list_dir`, `glob`, `grep`,
`run_command`, `ask_human`. The subset is resolved at generate time and frozen into
the generated file, so a run is reproducible and CLI flags can only narrow it:

```
what the designer asked for
  ∩ the skill's allowed-tools      (Claude Code names like Bash/Read are mapped)
  − the skill's disallowed-tools
  − --deny-tool
  − run_command, unless --allow-shell
```

Every filesystem tool resolves its path, follows symlinks, and refuses anything
outside the workspace root. `run_command` is off unless `--allow-shell`, approved
per call at run time unless `--yes`, runs with `shell: false`, and gets an
environment with every API key and token removed.

## Development

```bash
bun run typecheck
bun run build

# Exercise the whole generate pipeline with no API calls:
J2_FAKE_MODEL=tests/fixtures/interview-me.json bun run src/index.ts generate --dir ./skills --check
```

`J2_FAKE_MODEL` points at a JSON file keyed by stage label (`ingest:<slug>`,
`classify`, `design:<slug>`); each stage reads its result from there instead of
calling a provider.

## Known limits

- Workflows are a straight chain. No conditional edges or loops back to an earlier
  node yet; `order` is a list so adding them is additive.
- Checkpointing is in-process (`MemorySaver`), so Ctrl-C loses a run. Cross-process
  resume means swapping `createCheckpointer()` for a SQLite saver.
- Generated files import the j2 runtime by absolute path. Moving or reinstalling j2
  breaks previously generated workflows; `run` detects this and tells you to
  regenerate.
