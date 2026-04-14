from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
import wave
from pathlib import Path

import pytest


def api_base_url() -> str:
    return os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")


def print_pass(name: str) -> None:
    print(f"PASS {name}")


def request_json(base_url: str, method: str, path: str, *, headers=None, json_body=None, form_data=None, files=None):
    request_headers = dict(headers or {})
    body: bytes | None = None

    if json_body is not None:
        body = json.dumps(json_body).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    elif files:
        boundary = f"----test-boundary-{uuid.uuid4().hex}"
        request_headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        parts: list[bytes] = []

        for key, value in (form_data or {}).items():
            parts.extend(
                [
                    f"--{boundary}\r\n".encode("utf-8"),
                    f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"),
                    value.encode("utf-8"),
                    b"\r\n",
                ]
            )

        for key, (filename, file_bytes, content_type) in files.items():
            parts.extend(
                [
                    f"--{boundary}\r\n".encode("utf-8"),
                    (
                        f'Content-Disposition: form-data; name="{key}"; filename="{filename}"\r\n'
                        f"Content-Type: {content_type}\r\n\r\n"
                    ).encode("utf-8"),
                    file_bytes,
                    b"\r\n",
                ]
            )

        parts.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(parts)
    elif form_data is not None:
        body = urllib.parse.urlencode(form_data).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")

    req = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=body,
        headers=request_headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read()
            text = payload.decode("utf-8", errors="replace") if payload else ""
            try:
                data = json.loads(text) if text else None
            except json.JSONDecodeError:
                data = None
            return resp.status, data, text
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        text = payload.decode("utf-8", errors="replace") if payload else ""
        try:
            data = json.loads(text) if text else None
        except json.JSONDecodeError:
            data = None
        return exc.code, data, text


def create_silent_wav(path: Path) -> None:
    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16_000)
        wav_file.writeframes(b"\x00\x00" * 16_000)


def create_smoke_audio_file() -> Path:
    audio_dir = Path.cwd() / "data" / "smoke_artifacts"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / f"smoke_{uuid.uuid4().hex}.wav"
    create_silent_wav(audio_path)
    return audio_path


@pytest.fixture(scope="module")
def base_url() -> str:
    return api_base_url()


def request_json_or_fail(base_url: str, method: str, path: str, **kwargs):
    try:
        return request_json(base_url, method, path, **kwargs)
    except urllib.error.URLError as exc:
        pytest.fail(f"Cannot reach API at {base_url}: {exc}")


def request_raw_or_fail(base_url: str, method: str, path: str, **kwargs):
    try:
        return request_raw(base_url, method, path, **kwargs)
    except urllib.error.URLError as exc:
        pytest.fail(f"Cannot reach API at {base_url}: {exc}")


def request_raw(base_url: str, method: str, path: str, *, headers=None, json_body=None, form_data=None, files=None):
    request_headers = dict(headers or {})
    body: bytes | None = None

    if json_body is not None:
        body = json.dumps(json_body).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    elif files:
        boundary = f"----test-boundary-{uuid.uuid4().hex}"
        request_headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        parts: list[bytes] = []

        for key, value in (form_data or {}).items():
            parts.extend(
                [
                    f"--{boundary}\r\n".encode("utf-8"),
                    f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"),
                    value.encode("utf-8"),
                    b"\r\n",
                ]
            )

        for key, (filename, file_bytes, content_type) in files.items():
            parts.extend(
                [
                    f"--{boundary}\r\n".encode("utf-8"),
                    (
                        f'Content-Disposition: form-data; name="{key}"; filename="{filename}"\r\n'
                        f"Content-Type: {content_type}\r\n\r\n"
                    ).encode("utf-8"),
                    file_bytes,
                    b"\r\n",
                ]
            )

        parts.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(parts)
    elif form_data is not None:
        body = urllib.parse.urlencode(form_data).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")

    req = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=body,
        headers=request_headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read()
            return resp.status, resp.headers, payload
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        return exc.code, exc.headers, payload


def assert_json_ok(name: str, response, expected_status: int = 200):
    status, data, text = response
    assert status == expected_status, f"{name}: {status} {text}"
    print_pass(name)
    return data


def assert_raw_ok(name: str, response, expected_status: int = 200):
    status, headers, payload = response
    assert status == expected_status, f"{name}: {status}"
    print_pass(name)
    return headers, payload


def get_first_topic(base_url: str) -> dict:
    topics = assert_json_ok("GET /topics", request_json_or_fail(base_url, "GET", "/topics"))
    assert isinstance(topics, list) and topics, "GET /topics: no topics returned"
    topic_id = topics[0]["id"]
    topic_detail = assert_json_ok("GET /topics/{id}", request_json_or_fail(base_url, "GET", f"/topics/{topic_id}"))
    assert isinstance(topic_detail, dict)
    assert topic_detail["id"] == topic_id, "GET /topics/{id}: returned topic id did not match"
    return topic_detail


def create_auth_context(base_url: str) -> dict:
    username = f"smoke_{uuid.uuid4().hex[:10]}"
    password = "SmokeTest123!"
    display_name = "Smoke Test"

    register = assert_json_ok(
        "POST /auth/register",
        request_json_or_fail(
            base_url,
            "POST",
            "/auth/register",
            json_body={
                "username": username,
                "password": password,
                "display_name": display_name,
            },
        ),
    )
    login = assert_json_ok(
        "POST /auth/login",
        request_json_or_fail(
            base_url,
            "POST",
            "/auth/login",
            json_body={"username": username, "password": password},
        ),
    )
    token = login["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return {
        "username": username,
        "password": password,
        "display_name": display_name,
        "register": register,
        "login": login,
        "token": token,
        "headers": headers,
    }


def create_practice_session(base_url: str, headers: dict[str, str], topic_id: int, *, title: str = "Smoke practice session") -> dict:
    session = assert_json_ok(
        "POST /practice-sessions",
        request_json_or_fail(
            base_url,
            "POST",
            "/practice-sessions",
            headers=headers,
            json_body={
                "title": title,
                "topic_id": topic_id,
                "notes": "Created from smoke test.",
            },
        ),
    )
    assert session["status"] == "active"
    return session


def post_text_turn(base_url: str, headers: dict[str, str], topic_id: int, session_id: int, *, text: str) -> dict:
    return assert_json_ok(
        "POST /chat/text",
        request_json_or_fail(
            base_url,
            "POST",
            "/chat/text",
            headers=headers,
            json_body={
                "topic_id": topic_id,
                "text": text,
                "model_name": "gpt-4o-mini",
                "voice_name": "nova",
                "practice_session_id": session_id,
            },
        ),
    )


def post_audio_turn(base_url: str, headers: dict[str, str], topic_id: int, session_id: int) -> dict:
    audio_path = create_smoke_audio_file()
    with audio_path.open("rb") as audio_file:
        return assert_json_ok(
            "POST /chat/audio",
            request_json_or_fail(
                base_url,
                "POST",
                "/chat/audio",
                headers=headers,
                form_data={
                    "topic_id": str(topic_id),
                    "model_name": "gpt-4o-mini",
                    "voice_name": "nova",
                    "practice_session_id": str(session_id),
                },
                files={"audio_file": (audio_path.name, audio_file.read(), "audio/wav")},
            ),
        )


def assert_text_turn_shape(turn: dict, *, session_id: int, attempt_no: int) -> None:
    message = turn["message"]
    evaluation = turn["evaluation"]
    assert message["practice_session_id"] == session_id
    assert message["attempt_no"] == attempt_no
    assert message["input_mode"] == "text"
    assert message["user_audio_path"] is None
    assert message["duration_seconds"] is not None and message["duration_seconds"] > 0
    assert message["word_count"] is not None and message["word_count"] > 0
    assert message["pause_count"] is not None and message["pause_count"] >= 0
    assert evaluation["rubric_version"] == "v2.0"
    assert evaluation["pronunciation_score"] is None
    for key in ("fluency_score", "coherence_score", "lexical_resource_score"):
        assert evaluation[key] is not None


def assert_audio_turn_shape(turn: dict, *, session_id: int, attempt_no: int) -> None:
    message = turn["message"]
    evaluation = turn["evaluation"]
    assert message["practice_session_id"] == session_id
    assert message["attempt_no"] == attempt_no
    assert message["input_mode"] == "audio"
    assert message["user_audio_path"] is not None
    assert message["duration_seconds"] is not None and message["duration_seconds"] > 0
    assert message["word_count"] is not None and message["word_count"] > 0
    assert message["pause_count"] is not None and message["pause_count"] >= 0
    assert evaluation["rubric_version"] == "v2.0"
    assert evaluation["pronunciation_score"] is not None
    for key in ("fluency_score", "coherence_score", "lexical_resource_score"):
        assert evaluation[key] is not None


def test_get_health(base_url):
    health = assert_json_ok("GET /health", request_json_or_fail(base_url, "GET", "/health"))
    assert health["status"] == "ok"
    assert health["service"] == "ai-speaking-coach-api"
    assert "log_level" in health


def test_get_topics_and_topic_detail(base_url):
    get_first_topic(base_url)


def test_post_auth_register_login_me_logout(base_url):
    auth = create_auth_context(base_url)
    me = assert_json_ok("GET /auth/me", request_json_or_fail(base_url, "GET", "/auth/me", headers=auth["headers"]))
    assert me["username"] == auth["username"]
    assert me["display_name"] == auth["display_name"]
    assert auth["register"]["access_token"] != auth["login"]["access_token"]

    logout = assert_json_ok("POST /auth/logout", request_json_or_fail(base_url, "POST", "/auth/logout", headers=auth["headers"]))
    assert logout["status"] == "ok"

    after_logout_status, _, _ = request_json_or_fail(base_url, "GET", "/auth/me", headers=auth["headers"])
    assert after_logout_status == 401


def test_get_and_update_config(base_url):
    auth = create_auth_context(base_url)
    config = assert_json_ok("GET /config", request_json_or_fail(base_url, "GET", "/config", headers=auth["headers"]))
    current_model = config["model_name"]
    current_voice = config["voice_name"]

    model_value = "claude-sonnet-4-20250514" if current_model != "claude-sonnet-4-20250514" else "gpt-4o-mini"
    voice_value = "alloy" if current_voice != "alloy" else "nova"

    model_response = assert_json_ok(
        "POST /config/model",
        request_json_or_fail(base_url, "POST", "/config/model", headers=auth["headers"], json_body={"value": model_value}),
    )
    assert model_response["model_name"] == model_value
    assert model_response["voice_name"] == current_voice

    voice_response = assert_json_ok(
        "POST /config/voice",
        request_json_or_fail(base_url, "POST", "/config/voice", headers=auth["headers"], json_body={"value": voice_value}),
    )
    assert voice_response["model_name"] == model_value
    assert voice_response["voice_name"] == voice_value

    updated_config = assert_json_ok("GET /config after update", request_json_or_fail(base_url, "GET", "/config", headers=auth["headers"]))
    assert updated_config["model_name"] == model_value
    assert updated_config["voice_name"] == voice_value


def test_post_practice_sessions_and_get_detail(base_url):
    auth = create_auth_context(base_url)
    topic = get_first_topic(base_url)
    session = create_practice_session(base_url, auth["headers"], topic["id"])

    assert session["topic_id"] == topic["id"]
    assert session["message_count"] == 0

    sessions = assert_json_ok("GET /practice-sessions", request_json_or_fail(base_url, "GET", "/practice-sessions", headers=auth["headers"]))
    assert any(item["id"] == session["id"] for item in sessions["items"])

    detail = assert_json_ok(
        "GET /practice-sessions/{id}",
        request_json_or_fail(base_url, "GET", f"/practice-sessions/{session['id']}", headers=auth["headers"]),
    )
    assert detail["practice_session"]["id"] == session["id"]
    assert detail["practice_session"]["status"] == "active"
    assert detail["items"] == []

    close_session = assert_json_ok(
        "POST /practice-sessions/{id}/close",
        request_json_or_fail(base_url, "POST", f"/practice-sessions/{session['id']}/close", headers=auth["headers"]),
    )
    assert close_session["status"] == "completed"


def test_post_chat_text_and_message_details(base_url):
    auth = create_auth_context(base_url)
    topic = get_first_topic(base_url)
    session = create_practice_session(base_url, auth["headers"], topic["id"], title="Text smoke session")

    text_turn = post_text_turn(
        base_url,
        auth["headers"],
        topic["id"],
        session["id"],
        text="i usually study english in the evening because it helps me relax",
    )
    assert_text_turn_shape(text_turn, session_id=session["id"], attempt_no=1)

    message = text_turn["message"]
    evaluation = text_turn["evaluation"]
    message_id = message["id"]

    detail = assert_json_ok(
        "GET /messages/{id}",
        request_json_or_fail(base_url, "GET", f"/messages/{message_id}", headers=auth["headers"]),
    )
    assert detail["message"]["id"] == message_id
    assert detail["evaluation"]["message_id"] == message_id

    evaluation_detail = assert_json_ok(
        "GET /evaluation/{id}",
        request_json_or_fail(base_url, "GET", f"/evaluation/{message_id}", headers=auth["headers"]),
    )
    assert evaluation_detail["message_id"] == message_id
    assert evaluation_detail["rubric_version"] == evaluation["rubric_version"]

    messages = assert_json_ok(
        "GET /messages filtered by session",
        request_json_or_fail(base_url, "GET", f"/messages?practice_session_id={session['id']}", headers=auth["headers"]),
    )
    assert len(messages["items"]) == 1
    assert messages["items"][0]["id"] == message_id

    session_detail = assert_json_ok(
        "GET /practice-sessions/{id} after text",
        request_json_or_fail(base_url, "GET", f"/practice-sessions/{session['id']}", headers=auth["headers"]),
    )
    assert session_detail["practice_session"]["message_count"] == 1
    assert len(session_detail["items"]) == 1

    agent_audio_status, _, _ = request_raw_or_fail(base_url, "GET", f"/audio/{message_id}?kind=agent", headers=auth["headers"])
    assert agent_audio_status == 200


def test_post_chat_audio_and_audio_downloads(base_url):
    auth = create_auth_context(base_url)
    topic = get_first_topic(base_url)
    session = create_practice_session(base_url, auth["headers"], topic["id"], title="Audio smoke session")

    audio_turn = post_audio_turn(base_url, auth["headers"], topic["id"], session["id"])
    assert_audio_turn_shape(audio_turn, session_id=session["id"], attempt_no=1)

    message_id = audio_turn["message"]["id"]

    user_headers, _ = assert_raw_ok(
        "GET /audio user",
        request_raw_or_fail(base_url, "GET", f"/audio/{message_id}?kind=user", headers=auth["headers"]),
    )
    assert "audio/wav" in user_headers.get("Content-Type", "")

    agent_headers, _ = assert_raw_ok(
        "GET /audio agent",
        request_raw_or_fail(base_url, "GET", f"/audio/{message_id}?kind=agent", headers=auth["headers"]),
    )
    assert "audio/wav" in agent_headers.get("Content-Type", "")

    detail = assert_json_ok(
        "GET /messages/{id} for audio",
        request_json_or_fail(base_url, "GET", f"/messages/{message_id}", headers=auth["headers"]),
    )
    assert detail["message"]["id"] == message_id


def test_get_messages_and_session_filter(base_url):
    auth = create_auth_context(base_url)
    topic = get_first_topic(base_url)
    session = create_practice_session(base_url, auth["headers"], topic["id"], title="List smoke session")

    text_turn = post_text_turn(
        base_url,
        auth["headers"],
        topic["id"],
        session["id"],
        text="i usually study english in the evening because it helps me relax",
    )
    audio_turn = post_audio_turn(base_url, auth["headers"], topic["id"], session["id"])

    messages = assert_json_ok("GET /messages", request_json_or_fail(base_url, "GET", "/messages", headers=auth["headers"]))
    assert len(messages["items"]) >= 2

    filtered_messages = assert_json_ok(
        "GET /messages filtered",
        request_json_or_fail(base_url, "GET", f"/messages?practice_session_id={session['id']}", headers=auth["headers"]),
    )
    assert len(filtered_messages["items"]) == 2
    assert all(item["practice_session_id"] == session["id"] for item in filtered_messages["items"])

    attempt_numbers = [item["attempt_no"] for item in filtered_messages["items"]]
    assert attempt_numbers == [2, 1] or attempt_numbers == [1, 2]

    session_detail = assert_json_ok(
        "GET /practice-sessions/{id} after list flow",
        request_json_or_fail(base_url, "GET", f"/practice-sessions/{session['id']}", headers=auth["headers"]),
    )
    assert session_detail["practice_session"]["message_count"] == 2
    assert len(session_detail["items"]) == 2

    text_message_id = text_turn["message"]["id"]
    audio_message_id = audio_turn["message"]["id"]
    assert text_message_id != audio_message_id
