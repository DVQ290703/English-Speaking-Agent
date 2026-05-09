# Spec: `create_deck` Flashcard Tool

**Date:** 2026-05-10
**Status:** Approved

---

## Problem

The agent can list, populate, and review flashcard decks, but cannot create one. When a user has no decks, the agent is stuck — it cannot add cards and must abandon the flashcard flow entirely.

## Goal

Add a `create_deck` LangGraph tool so the agent can create a new deck on behalf of the user during a conversation.

## Scope

Single new `@tool` function added to `app/agents/tools/flashcard_tools.py` and registered in `FLASHCARD_TOOLS`.

No changes to the database schema, API routes, or frontend.

---

## Tool Design

### Signature

```python
@tool
def create_deck(
    user_id: str,
    name: str,
    description: str | None = None,
) -> dict:
```

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `user_id` | `str` | yes | UUID of the authenticated user |
| `name` | `str` | yes | Human-readable deck name |
| `description` | `str \| None` | no | Optional longer description |

### Return value

Success:
```json
{"deck_id": "<uuid>", "name": "<name>", "description": "<desc or null>"}
```

Failure (invalid UUID):
```json
{"error": "user_id '...' is not a valid UUID."}
```

### SQL

```sql
INSERT INTO flashcard_decks (user_id, name, description)
VALUES (%s, %s, %s)
RETURNING id::text, name, description
```

No upsert — duplicate names are permitted (user may legitimately want two distinct decks with the same name).

### Logging

- `DEBUG  create_deck enter user_id=... name=...`
- `INFO   create_deck return deck_id=... name=...`
- `log_event("flashcard.deck_created", {user_id, deck_id, name})`

---

## LLM Behaviour

Handled entirely through the tool docstring — no system prompt changes required.

The docstring instructs the LLM to:
1. Ask the user for a deck name before calling the tool.
2. If the user says they don't know or don't care, infer a name from the current topic/category (e.g. `"IELTS Part 2 Vocabulary"`) and proceed without further interruption.

---

## Placement in `FLASHCARD_TOOLS`

`create_deck` is inserted after `list_decks` so the tool list reads in natural workflow order: list → create deck → create card → …

---

## Out of Scope

- `delete_deck` / `archive_deck` — not requested
- Duplicate-name prevention — schema allows it; UX concern for a later iteration
- REST API endpoint for deck creation — already exists separately; this spec covers only the agent tool
