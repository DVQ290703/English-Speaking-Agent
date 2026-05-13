# Design: Move Grammar Instruction to File

**Date:** 2026-05-13
**Status:** Approved

## Problem

`GRAMMAR_INSTRUCTION` is a hardcoded multi-line string in `app/prompts/prompt_builder.py`. This means updating the grammar format requires a code change and image rebuild. All other prompt content (`system_prompt.md`, topic prompts) is file-based and can be updated via ConfigMap without a rebuild.

## Goal

Move `GRAMMAR_INSTRUCTION` into `app/prompts/grammar_instruction.md` so it can be managed the same way as other prompts — updated via ConfigMap in production without rebuilding the container image.

The `include_grammar=True/False` conditional behavior is preserved. The grammar block is still only appended when the caller explicitly requests it (i.e., not during tool/function-calling turns).

## Architecture

No structural changes. The existing layered prompt composition in `build_system_prompt()` remains identical:

```
base (system_prompt.md)
  + category layer (optional)
  + topic layer (optional)
  + grammar layer (grammar_instruction.md, only when include_grammar=True)
```

## Components

### `app/prompts/grammar_instruction.md` (new)

Contains the exact grammar instruction text currently in `GRAMMAR_INSTRUCTION` (lines 21–45 of `prompt_builder.py`). Plain markdown/text — no special syntax.

### `app/prompts/prompt_builder.py` (modified)

- Remove the `GRAMMAR_INSTRUCTION` constant.
- Add `_GRAMMAR_INSTRUCTION_PATH = Path(__file__).with_name("grammar_instruction.md")`.
- Add `_load_grammar_instruction() -> str` using the same mtime-cache pattern as `_load_base_prompt()`: check `_CACHE["grammar_mtime"]` / `_CACHE["grammar"]`, read from disk on miss, fall back to an inline string if the file is missing.
- In `build_system_prompt()`, replace `prompt_parts.append(GRAMMAR_INSTRUCTION)` with `prompt_parts.append(_load_grammar_instruction())`.
- Add `"grammar_mtime": None, "grammar": None` to `_CACHE`.

### `deployments/backend/prompts-configmap.yaml` (modified)

Add `grammar_instruction.md` as a new key in the existing `agent-prompts` ConfigMap, containing the grammar instruction text.

### `deployments/backend/deploy.yaml` (modified)

Add a second `volumeMount` entry:

```yaml
- name: agent-prompts
  mountPath: /app/app/prompts/grammar_instruction.md
  subPath: grammar_instruction.md
```

## Data Flow

```
kubectl apply prompts-configmap.yaml
  → K8s updates ConfigMap
  → volume file /app/app/prompts/grammar_instruction.md refreshed
  → next build_system_prompt(include_grammar=True) call sees new mtime
  → _load_grammar_instruction() re-reads file, updates cache
  → new grammar instruction used from that point forward
```

## Error Handling

If `grammar_instruction.md` is missing (e.g., ConfigMap not applied), `_load_grammar_instruction()` logs a warning and falls back to the same inline string that exists today. No runtime crash.

## Testing

- Existing tests that mock `GRAMMAR_INSTRUCTION` will need to be updated to either mock `_load_grammar_instruction()` or ensure the file is present during test runs.
- No new test cases required beyond updating existing ones.
