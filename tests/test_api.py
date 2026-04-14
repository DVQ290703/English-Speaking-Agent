from __future__ import annotations

import json
import os
import subprocess
import sys
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


def contains_sensitive_key(value) -> bool:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in {"prompt", "content", "text", "input", "message", "messages"}:
                return True
            if contains_sensitive_key(item):
                return True
    elif isinstance(value, list):
        return any(contains_sensitive_key(item) for item in value)
    return False


def request_json(base_url: str, method: str, path: str, *, headers=None, json_body=None, form_data=None, files=None):
    request_headers = dict(headers or {})
    body: bytes | None = None

    if json_body is not None:
        body = json.dumps(json_body).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    elif files:
        boundary = f"----pytest-boundary-{uuid.uuid4().hex}"
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


def read_log_lines() -> list[str]:
    log_file = Path.cwd() / ".ai-log" / "session.jsonl"
    if not log_file.exists():
        return []
    return log_file.read_text(encoding="utf-8").splitlines()


def emit_pytest_hook_event(base_url: str) -> dict:
    session_id = f"pytest-session-smoke-{uuid.uuid4().hex[:8]}"
    payload = {
        "hook_event_name": "PytestSmokeRun",
        "session_id": session_id,
        "model": "pytest",
        "payload": {
            "suite": "api-smoke",
            "status": "passed",
        },
    }
    env = os.environ.copy()
    env["AI_TOOL_NAME"] = "pytest"
    env["AI_LOG_DIR"] = str(Path.cwd() / ".ai-log")
    env["AI_LOG_API_URL"] = f"{base_url.rstrip('/')}/hooks/ai-log"
    env.setdefault("AI_LOG_INGEST_KEY", "pytest-ingest-key")

    result = subprocess.run(
        [sys.executable, "scripts/log_hook.py", "--tool", "pytest"],
        input=json.dumps(payload).encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        cwd=str(Path.cwd()),
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(
            "log_hook.py failed:\n"
            f"stdout: {result.stdout.decode('utf-8', errors='replace')}\n"
            f"stderr: {result.stderr.decode('utf-8', errors='replace')}"
        )
    return payload


def test_api_smoke():
    base_url = api_base_url()
    failures: list[str] = []

    def expect_ok(name: str, response):
        status, data, text = response
        if status == 200:
            print_pass(name)
            return data
        failures.append(f"{name}: {status} {text}")
        return None

    try:
        health = expect_ok("GET /health", request_json(base_url, "GET", "/health"))
    except urllib.error.URLError as exc:
        pytest.fail(f"Cannot reach API at {base_url}: {exc}")
    if isinstance(health, dict):
        assert health.get("status") == "ok"

    topics = expect_ok("GET /topics", request_json(base_url, "GET", "/topics"))
    if not isinstance(topics, list) or not topics:
        failures.append("GET /topics: no topics returned")
        topics = []

    username = f"smoke_{uuid.uuid4().hex[:10]}"
    password = "SmokeTest123!"
    display_name = "Smoke Test"

    expect_ok(
        "POST /auth/register",
        request_json(
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
    login = expect_ok(
        "POST /auth/login",
        request_json(
            base_url,
            "POST",
            "/auth/login",
            json_body={"username": username, "password": password},
        ),
    )
    token = login["access_token"] if isinstance(login, dict) and login.get("access_token") else ""
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    expect_ok("GET /auth/me", request_json(base_url, "GET", "/auth/me", headers=headers))
    config = expect_ok("GET /config", request_json(base_url, "GET", "/config", headers=headers))

    model_value = "gpt-4o-mini"
    voice_value = "nova"
    if isinstance(config, dict):
        model_value = config.get("model_name", model_value)
        voice_value = config.get("voice_name", voice_value)

    expect_ok(
        "POST /config/model",
        request_json(base_url, "POST", "/config/model", headers=headers, json_body={"value": model_value}),
    )
    expect_ok(
        "POST /config/voice",
        request_json(base_url, "POST", "/config/voice", headers=headers, json_body={"value": voice_value}),
    )

    if topics:
        topic_id = topics[0]["id"]

        expect_ok(
            "POST /chat/text",
            request_json(
                base_url,
                "POST",
                "/chat/text",
                headers=headers,
                json_body={
                    "topic_id": topic_id,
                    "text": "i usually study english in the evening because it helps me relax",
                    "model_name": model_value,
                    "voice_name": voice_value,
                },
            ),
        )

        audio_dir = Path.cwd() / "data" / "pytest_artifacts"
        audio_dir.mkdir(parents=True, exist_ok=True)
        audio_path = audio_dir / f"smoke_{uuid.uuid4().hex}.wav"
        create_silent_wav(audio_path)
        with audio_path.open("rb") as audio_file:
            expect_ok(
                "POST /chat/audio",
                request_json(
                    base_url,
                    "POST",
                    "/chat/audio",
                    headers=headers,
                    form_data={
                        "topic_id": str(topic_id),
                        "model_name": model_value,
                        "voice_name": voice_value,
                    },
                    files={"audio_file": (audio_path.name, audio_file.read(), "audio/wav")},
                ),
            )

        messages = expect_ok("GET /messages", request_json(base_url, "GET", "/messages", headers=headers))
        history = expect_ok("GET /history", request_json(base_url, "GET", "/history", headers=headers))

        items = messages.get("items", []) if isinstance(messages, dict) else []
        if not items:
            failures.append("GET /messages: no message items returned")
        if isinstance(history, dict) and not history.get("items", []):
            failures.append("GET /history: no history items returned")

        if items:
            message_id = items[0]["id"]
            expect_ok("GET /messages/{id}", request_json(base_url, "GET", f"/messages/{message_id}", headers=headers))
            expect_ok("GET /evaluation/{id}", request_json(base_url, "GET", f"/evaluation/{message_id}", headers=headers))
            expect_ok(
                "GET /audio user",
                request_json(base_url, "GET", f"/audio/{message_id}?kind=user", headers=headers),
            )
            expect_ok(
                "GET /audio agent",
                request_json(base_url, "GET", f"/audio/{message_id}?kind=agent", headers=headers),
            )
        else:
            failures.append("GET /messages/{id}: no message id available")

    ai_log_ingest_key = os.environ.get("AI_LOG_INGEST_KEY", "pytest-ingest-key")
    ai_log_headers = {"X-AI-Log-Key": ai_log_ingest_key}

    codex_event = expect_ok(
        "POST /hooks/ai-log codex",
        request_json(
            base_url,
            "POST",
            "/hooks/ai-log",
            headers=ai_log_headers,
            json_body={
                "tool": "codex",
                "event": "UserPromptSubmit",
                "session_id": "pytest-session-codex",
                "model": "gpt-4o-mini",
                "repo": "A20-App-014",
                "branch": "pytest",
                "commit": "deadbeef",
                "student": "pytest@example.com",
                "payload": {
                    "prompt": "should be redacted",
                    "tool_input": {"content": "also redacted"},
                    "nested": {"text": "hidden"},
                },
            },
        ),
    )
    if isinstance(codex_event, dict) and contains_sensitive_key(codex_event.get("payload", {})):
        failures.append("POST /hooks/ai-log codex: sensitive key leaked into payload")

    pytest_event_entry = emit_pytest_hook_event(base_url)
    matched = False
    for line in read_log_lines():
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("tool") == "pytest" and entry.get("session_id") == pytest_event_entry["session_id"]:
            matched = True
            if entry.get("event") != "PytestSmokeRun":
                failures.append("Pytest hook event found but event name did not match")
            if contains_sensitive_key(entry.get("payload", {})):
                failures.append("Pytest hook event leaked sensitive key into .ai-log/session.jsonl")
            break
    if not matched:
        failures.append("Pytest hook event was not found in .ai-log/session.jsonl")

    if failures:
        pytest.fail("\n".join(failures))
