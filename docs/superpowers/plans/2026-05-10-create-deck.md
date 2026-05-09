# create_deck Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `create_deck` LangGraph tool so the agent can create a flashcard deck for a user during conversation.

**Architecture:** Single `@tool` function added to the existing `flashcard_tools.py` alongside the other flashcard tools. It validates the user UUID, inserts a row into `flashcard_decks`, and returns the new deck's id and name. The LLM behaviour (ask for name, infer if unknown) is expressed in the docstring.

**Tech Stack:** Python, psycopg2, langchain-core `@tool`, pytest, `unittest.mock`

---

## File Map

| Action | Path |
|---|---|
| Modify | `app/agents/tools/flashcard_tools.py` |
| Create | `tests/test_agents/__init__.py` |
| Create | `tests/test_agents/test_flashcard_tools.py` |

---

### Task 1: Write failing tests for `create_deck`

**Files:**
- Create: `tests/test_agents/__init__.py`
- Create: `tests/test_agents/test_flashcard_tools.py`

- [ ] **Step 1: Create the test package init**

```bash
# Create empty init file
echo "" > tests/test_agents/__init__.py
```

- [ ] **Step 2: Write the failing tests**

Create `tests/test_agents/test_flashcard_tools.py`:

```python
import uuid
from unittest.mock import patch

import pytest

from tests.helpers.db_mocks import make_mock_connection


USER_ID = str(uuid.uuid4())
DECK_ID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# create_deck — happy path
# ---------------------------------------------------------------------------

def test_create_deck_returns_deck_id_and_name():
    conn, _ = make_mock_connection(
        fetchone_by_sql={
            "insert into flashcard_decks": (DECK_ID, "IELTS Vocab", None),
        }
    )
    with patch("app.agents.tools.flashcard_tools.get_connection", return_value=conn):
        from app.agents.tools.flashcard_tools import create_deck
        result = create_deck.invoke({"user_id": USER_ID, "name": "IELTS Vocab"})

    assert result["deck_id"] == DECK_ID
    assert result["name"] == "IELTS Vocab"
    assert result["description"] is None


def test_create_deck_stores_description():
    conn, _ = make_mock_connection(
        fetchone_by_sql={
            "insert into flashcard_decks": (DECK_ID, "IELTS Vocab", "Words from Part 2"),
        }
    )
    with patch("app.agents.tools.flashcard_tools.get_connection", return_value=conn):
        from app.agents.tools.flashcard_tools import create_deck
        result = create_deck.invoke({
            "user_id": USER_ID,
            "name": "IELTS Vocab",
            "description": "Words from Part 2",
        })

    assert result["description"] == "Words from Part 2"


# ---------------------------------------------------------------------------
# create_deck — invalid user_id guard
# ---------------------------------------------------------------------------

def test_create_deck_invalid_user_id_returns_error():
    from app.agents.tools.flashcard_tools import create_deck
    result = create_deck.invoke({"user_id": "not-a-uuid", "name": "My Deck"})

    assert "error" in result
    assert "not a valid UUID" in result["error"]


def test_create_deck_invalid_user_id_never_hits_db():
    conn, cursor = make_mock_connection()
    with patch("app.agents.tools.flashcard_tools.get_connection", return_value=conn):
        from app.agents.tools.flashcard_tools import create_deck
        create_deck.invoke({"user_id": "bad-id", "name": "My Deck"})

    cursor.execute.assert_not_called()
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pytest tests/test_agents/test_flashcard_tools.py -v
```

Expected: `ImportError` or `AttributeError` — `create_deck` does not exist yet.

---

### Task 2: Implement `create_deck` tool

**Files:**
- Modify: `app/agents/tools/flashcard_tools.py`

- [ ] **Step 1: Add `create_deck` function after `list_decks`**

Open `app/agents/tools/flashcard_tools.py`. After the closing line of `list_decks` (line 56, `return result`) and before the `@tool` decorator of `create_card`, insert:

```python
@tool
def create_deck(
    user_id: str,
    name: str,
    description: str | None = None,
) -> dict:
    """Create a new flashcard deck for the user.

    Always ask the user what they would like to name the deck before calling
    this tool. If the user says they don't know or don't mind, infer a
    suitable name from the current conversation topic or category
    (e.g. "IELTS Part 2 Vocabulary") and proceed without further prompting.

    Args:
        user_id: The UUID of the authenticated user.
        name: The deck name chosen by the user or inferred from context.
        description: Optional short description of the deck's purpose.

    Returns:
        dict with deck_id, name, and description on success, or error on failure.
    """
    logger.debug("create_deck enter user_id=%s name=%r", user_id, name)
    if not _is_valid_uuid(user_id):
        logger.warning("create_deck invalid user_id=%r — not a UUID", user_id)
        return {"error": f"user_id '{user_id}' is not a valid UUID."}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO flashcard_decks (user_id, name, description)
                VALUES (%s, %s, %s)
                RETURNING id::text, name, description
                """,
                (user_id, name, description),
            )
            row = cur.fetchone()
    deck_id, deck_name, deck_desc = row
    logger.info("create_deck return deck_id=%s name=%r", deck_id, deck_name)
    logger.log_event(
        "flashcard.deck_created",
        {"user_id": user_id, "deck_id": deck_id, "name": deck_name},
    )
    return {"deck_id": deck_id, "name": deck_name, "description": deck_desc}
```

- [ ] **Step 2: Register in `FLASHCARD_TOOLS`**

Find the `FLASHCARD_TOOLS` list at the bottom of the file and insert `create_deck` after `list_decks`:

```python
FLASHCARD_TOOLS = [
    list_decks,
    create_deck,
    create_card,
    update_card,
    search_cards,
    get_due_cards,
    submit_card_review,
    get_deck_stats,
]
```

- [ ] **Step 3: Run the tests**

```bash
pytest tests/test_agents/test_flashcard_tools.py -v
```

Expected output:
```
test_create_deck_returns_deck_id_and_name        PASSED
test_create_deck_stores_description              PASSED
test_create_deck_invalid_user_id_returns_error   PASSED
test_create_deck_invalid_user_id_never_hits_db   PASSED
```

- [ ] **Step 4: Run the full test suite to check for regressions**

```bash
pytest --tb=short -q
```

Expected: all previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add app/agents/tools/flashcard_tools.py tests/test_agents/__init__.py tests/test_agents/test_flashcard_tools.py
git commit -m "feat(tools): add create_deck flashcard tool"
```
