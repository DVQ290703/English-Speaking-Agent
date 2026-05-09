import uuid
from unittest.mock import patch

import pytest

from tests.helpers.db_mocks import make_mock_connection
from app.agents.tools.flashcard_tools import create_deck


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
        result = create_deck.invoke({
            "user_id": USER_ID,
            "name": "IELTS Vocab",
            "description": "Words from Part 2",
        })

    assert result["deck_id"] == DECK_ID
    assert result["name"] == "IELTS Vocab"
    assert result["description"] == "Words from Part 2"


# ---------------------------------------------------------------------------
# create_deck — invalid user_id guard
# ---------------------------------------------------------------------------

def test_create_deck_invalid_user_id_returns_error():
    result = create_deck.invoke({"user_id": "not-a-uuid", "name": "My Deck"})

    assert "error" in result
    assert "not a valid UUID" in result["error"]


def test_create_deck_invalid_user_id_never_hits_db():
    conn, cursor = make_mock_connection()
    with patch("app.agents.tools.flashcard_tools.get_connection", return_value=conn):
        create_deck.invoke({"user_id": "bad-id", "name": "My Deck"})

    cursor.execute.assert_not_called()


def test_create_deck_db_returns_no_row():
    conn, _ = make_mock_connection(
        fetchone_by_sql={
            "insert into flashcard_decks": None,
        }
    )
    with patch("app.agents.tools.flashcard_tools.get_connection", return_value=conn):
        result = create_deck.invoke({"user_id": USER_ID, "name": "My Deck"})

    assert "error" in result
    assert "no row returned" in result["error"]
