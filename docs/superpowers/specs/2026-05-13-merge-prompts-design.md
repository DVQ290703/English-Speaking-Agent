# Design: Merge Prompt Files into Single system_prompt.md

**Date:** 2026-05-13
**Status:** Approved

## Problem

The prompts directory has 4 separate `.md` files (`system_prompt.md`, `grammar_instruction.md`, `preflight_prompt.md`, `blocked_response.md`), each requiring its own:
- ConfigMap key in `prompts-configmap.yaml`
- `subPath` volumeMount in `deploy.yaml`
- Path constant, mtime cache entry, and loader function in `prompt_builder.py`

This creates friction when editing prompts: 4 files to navigate, 4 mounts to keep in sync.

## Solution

Consolidate all 4 files into one `system_prompt.md` using `<!-- BEGIN/END: section -->` HTML comment markers to delimit named sections.

## File Structure

### `app/prompts/system_prompt.md`

```markdown
<!-- BEGIN: system_prompt -->
(coaching persona content)
<!-- END: system_prompt -->

<!-- BEGIN: grammar_instruction -->
(XML format + grammar annotation rules)
<!-- END: grammar_instruction -->

<!-- BEGIN: preflight_prompt -->
(safety + tool classifier prompt)
<!-- END: preflight_prompt -->

<!-- BEGIN: blocked_response -->
(static blocked response string)
<!-- END: blocked_response -->
```

**Deleted files:** `grammar_instruction.md`, `preflight_prompt.md`, `blocked_response.md`

### Section marker format

```
<!-- BEGIN: <name> -->
<!-- END: <name> -->
```

- HTML comments: invisible when rendered in GitHub or editors
- Unambiguous: `---` separators are already used inside `grammar_instruction` content
- Case-sensitive section names match existing variable naming

## `app/prompts/prompt_builder.py` Changes

### Removed
- `_GRAMMAR_INSTRUCTION_PATH`, `_PREFLIGHT_PROMPT_PATH`, `_BLOCKED_RESPONSE_PATH` path constants
- Separate mtime cache keys for each prompt (`grammar_mtime`, `preflight_mtime`, `blocked_response_mtime`)
- `_load_grammar_instruction()` — internal function replaced by `_load_sections()`

### Added
- `_load_sections() -> dict[str, str]` — single internal function that:
  1. Reads `system_prompt.md`
  2. Parses all `<!-- BEGIN: name --> ... <!-- END: name -->` blocks
  3. Caches by file mtime; returns `{section_name: content}` dict
- Cache simplified to: `{"mtime": None, "sections": None}`

### Public API — unchanged

| Function | Before | After |
|---|---|---|
| `build_system_prompt(category, topic, include_grammar)` | calls `_load_base_prompt()` + `_load_grammar_instruction()` | calls `_load_sections()["system_prompt"]` + `_load_sections()["grammar_instruction"]` |
| `load_preflight_prompt()` | reads `preflight_prompt.md` | returns `_load_sections()["preflight_prompt"]` |
| `load_blocked_response()` | reads `blocked_response.md` | returns `_load_sections()["blocked_response"]` |

No changes required in `agents/`, `guardrails/`, `api/`, or any other caller.

### Fallbacks

All existing inline fallback strings are preserved. If the file is missing or a section is absent, the fallback is returned and logged.

## Kubernetes Changes

### `deployments/backend/prompts-configmap.yaml`

4 keys → 1 key:

```yaml
data:
  system_prompt.md: |
    <!-- BEGIN: system_prompt -->
    ...
    <!-- END: system_prompt -->
    ...all sections...
```

### `deployments/backend/deploy.yaml`

4 volumeMounts → 1:

```yaml
volumeMounts:
  - name: agent-prompts
    mountPath: /app/app/prompts/system_prompt.md
    subPath: system_prompt.md
```

## Trade-offs

| Concern | Assessment |
|---|---|
| Atomic reload | All sections reload together on one mtime change — safer than partial reloads |
| Edit isolation | A single file means edits to preflight could accidentally touch system_prompt — mitigated by clear BEGIN/END markers |
| Rollback | One `kubectl apply` reverts all prompts — same as before but simpler |
| Missing section | Parser logs a warning and returns fallback — same resilience as before |

## Out of Scope

- `topic_prompts.md` and `topic_prompts/` directory — separate concern, not touched
- Changes to `_expand_includes` / `!include` infrastructure — not used by the merged file
- Any HTTP endpoint or external exposure of prompt content
