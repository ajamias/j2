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

<!-- The workflow is a work in progress. It will be more flushed out when I actually start this project -->
## Example Workflow

### Onboarding

You, the user, just got assigned a new role with a new codebase. To set up J2, run the `/j2-onboard`
skill, which will spin up a subagent dedicated to exploring the codebase and creating an initial map
of interacting components. Rerun the skill whenever new repos get added.

### Planning/research

Now you are ready to take on your first contributions. Run the `/j2-sdlc` skill with some context
on what you would like to be built. For example:

```text
/js-sdlc a customer wants a feature to keep track of their api usage
/js-sdlc build the feature specified in a PRD located in ~/feature.pdf
/js-sdlc resolve the most recent github issue assigned to me for this project
```

### Design

**Skills used:** [superpowers](https://github.com/obra/superpowers)

The agent will walk you through a step-by-step design process, and will require approval before it
spins up the implementation subagents.

### Implementation

**Skills used:** [superpowers](https://github.com/obra/superpowers), [ponytail](https://github.com/DietrichGebert/ponytail).

A team of subagents will spin up to first create test cases that align with the design, and then
fulfill the functionality from the design specification.

### Testing/refactoring

**Skills used:** [ponytail](https://github.com/DietrichGebert/ponytail).

A dedicated code auditor subagent will fix any compile/test errors, audit security, and simplify
code.

### Deployment

You can either approve or reject the changes and tell the agent what other changes need to be made.

### Maintenance

A subagent is created with the task of maintaining the documentation and agent specific files that
potentially needs updates due to the code changes. This includes custom skills and agent contexts.
