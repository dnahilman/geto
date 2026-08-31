---
name: orchestrator-workflow
description: >-
  Use this skill ONLY when the user explicitly requests to use "orchestrator", "orchestrator workflow", or "workflow".
  Do NOT activate or use this skill by default for general tasks, quick questions, or simple edits unless explicitly commanded by the user.
---

# Orchestrator Workflow

This skill instructs you (as the Orchestrator) to execute the user's task using a specialized team of sub-agents.

## Mandatory Steps:

> [!IMPORTANT]
> **Package Manager & Runtime**: This project strictly uses **`bun`** and **`bun workspace`**. NEVER use `pnpm`, `npm`, or `yarn`. All commands, scripts, dependencies, and testing must use `bun` (e.g. `bun install`, `bun add`, `bun run`, `bun test`, `bunx`).

1. **Agent Setup (CRITICAL)**: 
   Use the `define_subagent` tool to create the following 4 agents (IF you haven't already defined them in this session):
   
   - `analyzer` (Model: flash): 
     **Role**: Responsible for reading files, gathering deep context, and discovering project skills.
     **Rules**: This project uses `bun workspace`. You MUST check available local skills (e.g. `bunx @tanstack/intent list`) and research the internet for best practices if you encounter unfamiliar technology. Ensure you provide crystal clear knowledge to the Architect.
   
   - `architect` (Model: pro): 
     **Role**: Responsible for designing architecture, technical decisions, and strict execution instructions.
     **Rules**: You act as a Tech Lead. You can approve or reject requirements and provide technical options. When writing the final plan, you MUST provide EXTREMELY DETAILED, step-by-step instructions (with explicit file paths, bun workspace conventions, and logic) so the Coder is never confused.
   
   - `coder` (Model: flash): 
     **Role**: Responsible for strictly writing, deleting, or modifying code based on the Architect's plan.
     **Rules**: Operate in "auto-accepts" mode: execute the code modifications immediately and autonomously using your tools. Do NOT ask for permission to write code. Remember: this project is a `bun workspace` (use `bun`, never `pnpm` or `npm`). HOWEVER, if the plan involves destructive actions (like deleting entire directories or dropping databases), you MUST pause and ask the Orchestrator/User for confirmation.
   
   - `tester` (Model: flash): 
     **Role**: Responsible for running lint, formatting, and compatibility tests using `git diff`.
     **Rules**: Operate in "auto-accepts" mode: use `bun` for all commands (e.g. `bun run check`, `bun run lint`, `bun test`, `bun run build` for frontend, and `go build`/`go test` for backend). Provide detailed feedback directly to the Coder if anything breaks.


2. **Workflow Execution**:
   - Call `invoke_subagent` to delegate research to the `analyzer`.
   - Once results are gathered, call the `architect` to create a technical design.
   - Create a *Plan Artifact* and present it to the user for approval (mandatory).
   - Once approved by the user, call the `coder` to write the code.
   - Finally, call the `tester` to validate the coder's work.

3. **Communication**:
   - If the `tester` encounters an error, use `send_message` to ask the `coder` to fix it.
   - Report the final result to the user once everything is successfully completed.
