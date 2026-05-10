# Server-side user_id injection via RunnableConfig — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `user_id` from LLM-visible tool parameters and inject it server-side via LangGraph's `RunnableConfig`, eliminating information disclosure and BOLA attack surface.

**Architecture:** `pipeline.run()` passes `config={"configurable": {"user_id": ...}}` to `app.invoke()`. LangGraph forwards this config through every graph node and into each `ToolNode` call. Tools read `user_id` from `config["configurable"]["user_id"]` instead of accepting it as an LLM-supplied argument. LangChain automatically excludes `RunnableConfig`-typed parameters from tool JSON schemas.

**Tech Stack:** LangChain `@tool` + `RunnableConfig`, LangGraph `StateGraph`, pytest + `unittest.mock`

---

### Task 1: Update `flashcard_tools.py` — inject user_id via RunnableConfig

**Files:**
- Modify: `app/agents/tools/flashcard_tools.py`

- [ ] **Step 1: Add RunnableConfig import**

At the top of `app/agents/tools/flashcard_tools.py`, replace:

```python
from langchain_core.tools import tool
```

with:

```python
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
```

- [ ] **Step 2: Update `list_decks`**

Replace the entire `list_decks` function signature and first two lines of its body:

```python
@tool
def list_decks(config: RunnableConfig) -> list[dict]:
    """List all active flashcard decks for the current user.

    Returns each deck's id, name, description, card_count, and due_count.
    ONLY call when the user explicitly asks to see or choose a deck (e.g. "show my decks",
    "which deck should I save to"). Never call proactively at session start.
    """
    user_id: str = config["configurable"]["user_id"]
    logger.debug("list_decks enter user_id=%s", user_id)
```

- [ ] **Step 3: Update `create_deck`**

Replace the `create_deck` signature and first two lines of its body:

```python
@tool
def create_deck(
    name: str,
    description: str | None = None,
    config: RunnableConfig = None,
) -> dict:
    """Create a new flashcard deck for the user.

    Always ask the user what they would like to name the deck before calling
    this tool. If the user says they don't know or don't mind, infer a
    suitable name from the current conversation topic or category
    (e.g. "IELTS Part 2 Vocabulary") and proceed without further prompting.

    Args:
        name: The deck name chosen by the user or inferred from context.
        description: Optional short description of the deck's purpose.

    Returns:
        dict with deck_id, name, and description on success, or error on failure.
    """
    user_id: str = config["configurable"]["user_id"]
    logger.debug("create_deck enter user_id=%s name=%r", user_id, name)
```

- [ ] **Step 4: Update `create_card`**

Replace the `create_card` signature and first two lines of its body:

```python
@tool
def create_card(
    deck_id: str,
    front_text: str,
    back_text: str,
    tags: list[str] | None = None,
    config: RunnableConfig = None,
) -> dict:
    """Create a new flashcard in a deck and initialize its SM-2 review schedule.

    Args:
        deck_id: The UUID of the target deck (must belong to the user).
        front_text: The word or phrase shown on the front of the card.
        back_text: The definition, example, or translation on the back.
        tags: Optional list of string tags (e.g. ["education", "noun"]).

    Returns:
        dict with card_id, deck_name, front_text.
    """
    user_id: str = config["configurable"]["user_id"]
    logger.debug("create_card enter user_id=%s deck_id=%s front=%r", user_id, deck_id, front_text)
```

- [ ] **Step 5: Update `update_card`**

Replace the `update_card` signature and first two lines of its body:

```python
@tool
def update_card(
    card_id: str,
    front_text: str | None = None,
    back_text: str | None = None,
    tags: list[str] | None = None,
    config: RunnableConfig = None,
) -> dict:
    """Update an existing flashcard's content.

    Args:
        card_id: The UUID of the card to update.
        front_text: New front text (optional — omit to keep existing).
        back_text: New back text (optional — omit to keep existing).
        tags: New tags list (optional — omit to keep existing).

    Returns:
        dict with card_id and updated fields, or error.
    """
    user_id: str = config["configurable"]["user_id"]
    logger.debug("update_card enter user_id=%s card_id=%s", user_id, card_id)
```

- [ ] **Step 6: Update `search_cards`**

Replace the `search_cards` signature and first two lines of its body:

```python
@tool
def search_cards(
    query: str | None = None,
    tag: str | None = None,
    deck_id: str | None = None,
    config: RunnableConfig = None,
) -> list[dict]:
    """Search a user's flashcards by keyword or tag.

    Keyword search uses ILIKE on front_text and back_text.
    ONLY call when the user explicitly asks to find or look up a card
    (e.g. "search my cards for X", "do I have a card for Y").

    Args:
        query: Keyword to search in front/back text (optional).
        tag: Exact tag to filter by (optional).
        deck_id: Restrict search to a specific deck (optional).

    Returns:
        List of dicts with card_id, front_text, deck_name, tags.
    """
    user_id: str = config["configurable"]["user_id"]
    conditions = ["c.user_id = %s", "c.is_active = TRUE"]
    params: list = [user_id]
    logger.debug("search_cards enter user_id=%s query=%r tag=%r deck_id=%s", user_id, query, tag, deck_id)
```

Note: remove the duplicate `logger.debug` line that currently appears later in `search_cards` (line 254 in the original).

- [ ] **Step 7: Update `get_due_cards`**

Replace the `get_due_cards` signature and first two lines of its body:

```python
@tool
def get_due_cards(
    deck_id: str | None = None,
    limit: int = 20,
    config: RunnableConfig = None,
) -> list[dict]:
    """Retrieve cards due for review today for a user.

    Args:
        deck_id: Restrict to a specific deck (optional).
        limit: Maximum number of cards to return (default 20).

    Returns:
        List of dicts with card_id, front_text, back_text, deck_name, due_date.
    """
    user_id: str = config["configurable"]["user_id"]
    conditions = ["r.user_id = %s", "r.due_date <= CURRENT_DATE", "c.is_active = TRUE"]
    params: list = [user_id]
    logger.debug("get_due_cards enter user_id=%s deck_id=%s limit=%d", user_id, deck_id, limit)
```

- [ ] **Step 8: Update `submit_card_review`**

Replace the `submit_card_review` signature and first two lines of its body:

```python
@tool
def submit_card_review(
    card_id: str,
    rating: Literal["again", "hard", "good", "easy"],
    config: RunnableConfig = None,
) -> dict:
    """Submit a review rating for a flashcard and update its SM-2 schedule.

    Idempotent: re-submitting on the same day overwrites the previous rating.

    Args:
        card_id: The UUID of the card being reviewed.
        rating: Recall difficulty — 'again' (failed), 'hard', 'good', or 'easy'.

    Returns:
        dict with card_id, new due_date, interval_days, ease_factor, repetitions.
    """
    user_id: str = config["configurable"]["user_id"]
    logger.debug("submit_card_review enter user_id=%s card_id=%s rating=%s", user_id, card_id, rating)
```

- [ ] **Step 9: Update `get_deck_stats`**

Replace the `get_deck_stats` signature and first two lines of its body:

```python
@tool
def get_deck_stats(deck_id: str, config: RunnableConfig = None) -> dict:
    """Get statistics for a flashcard deck.

    Args:
        deck_id: The UUID of the deck.

    Returns:
        dict with total_cards, due_today, learned, retention_rate (0.0-1.0).
    """
    user_id: str = config["configurable"]["user_id"]
    logger.debug("get_deck_stats enter user_id=%s deck_id=%s", user_id, deck_id)
```

- [ ] **Step 10: Commit**

```bash
git add app/agents/tools/flashcard_tools.py
git commit -m "refactor(tools): inject user_id via RunnableConfig, remove from LLM schema"
```

---

### Task 2: Update `test_flashcard_tools.py` — use config injection

**Files:**
- Modify: `tests/test_agents/test_flashcard_tools.py`

All existing tests pass `user_id` as a tool argument. They must now pass it via `config`.

- [ ] **Step 1: Write a failing test for the new config-based invocation**

Add this test to `tests/test_agents/test_flashcard_tools.py`:

```python
def test_create_deck_reads_user_id_from_config():
    conn, _ = make_mock_connection(
        fetchone_by_sql={
            "insert into flashcard_decks": (DECK_ID, "IELTS Vocab", None),
        }
    )
    with patch("app.agents.tools.flashcard_tools.get_connection", return_value=conn):
        result = create_deck.invoke(
            {"name": "IELTS Vocab"},
            config={"configurable": {"user_id": USER_ID}},
        )

    assert result["deck_id"] == DECK_ID
    assert result["name"] == "IELTS Vocab"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_agents/test_flashcard_tools.py::test_create_deck_reads_user_id_from_config -v
```

Expected: FAIL — `user_id` still in tool signature, `config` not yet read.

- [ ] **Step 3: Verify Task 1 changes make this test pass**

```bash
pytest tests/test_agents/test_flashcard_tools.py::test_create_deck_reads_user_id_from_config -v
```

Expected: PASS (Task 1 must be complete first).

- [ ] **Step 4: Update `test_create_deck_returns_deck_id_and_name`**

Replace:
```python
result = create_deck.invoke({"user_id": USER_ID, "name": "IELTS Vocab"})
```
with:
```python
result = create_deck.invoke(
    {"name": "IELTS Vocab"},
    config={"configurable": {"user_id": USER_ID}},
)
```

- [ ] **Step 5: Update `test_create_deck_stores_description`**

Replace:
```python
result = create_deck.invoke({
    "user_id": USER_ID,
    "name": "IELTS Vocab",
    "description": "Words from Part 2",
})
```
with:
```python
result = create_deck.invoke(
    {"name": "IELTS Vocab", "description": "Words from Part 2"},
    config={"configurable": {"user_id": USER_ID}},
)
```

- [ ] **Step 6: Update `test_create_deck_invalid_user_id_returns_error`**

Replace:
```python
result = create_deck.invoke({"user_id": "not-a-uuid", "name": "My Deck"})
```
with:
```python
result = create_deck.invoke(
    {"name": "My Deck"},
    config={"configurable": {"user_id": "not-a-uuid"}},
)
```

- [ ] **Step 7: Update `test_create_deck_invalid_user_id_never_hits_db`**

Replace:
```python
create_deck.invoke({"user_id": "bad-id", "name": "My Deck"})
```
with:
```python
create_deck.invoke(
    {"name": "My Deck"},
    config={"configurable": {"user_id": "bad-id"}},
)
```

- [ ] **Step 8: Update `test_create_deck_db_returns_no_row`**

Replace:
```python
result = create_deck.invoke({"user_id": USER_ID, "name": "My Deck"})
```
with:
```python
result = create_deck.invoke(
    {"name": "My Deck"},
    config={"configurable": {"user_id": USER_ID}},
)
```

- [ ] **Step 9: Run all flashcard tool tests**

```bash
pytest tests/test_agents/test_flashcard_tools.py -v
```

Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add tests/test_agents/test_flashcard_tools.py
git commit -m "test(tools): update flashcard tool tests to use RunnableConfig injection"
```

---

### Task 3: Update `pipeline.py` — remove user_id from prompt, add config to invoke

**Files:**
- Modify: `app/agents/pipeline.py`

- [ ] **Step 1: Remove user_id from the system prompt injection**

In `_respond_node`, replace lines 84–91:

```python
        if user_id:
            base_prompt = (
                f"{base_prompt}\n\n---\n\n"
                "TOOL USE POLICY: Only call flashcard tools when the user explicitly requests "
                "flashcard management (e.g. 'save this word', 'show my decks', 'add a card'). "
                "Never call tools based on topic context or conversation subject alone. "
                f"If a tool is needed, use this user_id: {user_id}."
            )
```

with:

```python
        if user_id:
            base_prompt = (
                f"{base_prompt}\n\n---\n\n"
                "TOOL USE POLICY: Only call flashcard tools when the user explicitly requests "
                "flashcard management (e.g. 'save this word', 'show my decks', 'add a card'). "
                "Never call tools based on topic context or conversation subject alone."
            )
```

- [ ] **Step 2: Pass config to `app.invoke()` in `run()`**

In `run()`, replace:

```python
        return self.app.invoke(initial_state)
```

with:

```python
        invoke_config: dict = {"configurable": {"user_id": user_id}}
        if user_id:
            invoke_config["metadata"] = {"user_id": user_id}
        return self.app.invoke(initial_state, config=invoke_config)
```

- [ ] **Step 3: Run pipeline tests**

```bash
pytest tests/test_agents/test_pipeline_tool_use_failed.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 4: Run full test suite**

```bash
pytest -v
```

Expected: all tests PASS. No regressions.

- [ ] **Step 5: Commit**

```bash
git add app/agents/pipeline.py
git commit -m "feat(pipeline): pass user_id via RunnableConfig, remove from system prompt"
```

---

### Task 4: Verify LLM schema no longer includes user_id

**Files:**
- None (verification only)

- [ ] **Step 1: Confirm tool schemas are clean**

Run this one-liner to print the JSON schema for each tool and confirm `user_id` is absent:

```bash
python -c "
from app.agents.tools.flashcard_tools import FLASHCARD_TOOLS
for t in FLASHCARD_TOOLS:
    schema = t.tool_call_schema.schema() if hasattr(t, 'tool_call_schema') else t.args_schema.schema()
    props = schema.get('properties', {})
    assert 'user_id' not in props, f'{t.name} still exposes user_id in schema'
    print(f'OK {t.name}: {list(props.keys())}')
"
```

Expected output (no `user_id` in any tool):
```
OK list_decks: []
OK create_deck: ['name', 'description']
OK create_card: ['deck_id', 'front_text', 'back_text', 'tags']
OK update_card: ['card_id', 'front_text', 'back_text', 'tags']
OK search_cards: ['query', 'tag', 'deck_id']
OK get_due_cards: ['deck_id', 'limit']
OK submit_card_review: ['card_id', 'rating']
OK get_deck_stats: ['deck_id']
```

If any tool still shows `user_id`, re-check that the parameter was removed from the `@tool` function signature in Task 1.
