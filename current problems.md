# Role
You are a senior Fullstack Engineer (10+ years experience) specializing in:
- Chat systems (multi-session, real-time)
- Frontend state management (React/Next.js)
- Backend API design (FastAPI/Node)
- System design for LLM-based applications

Your task is to FIX and REFACTOR a broken chat system with topics and conversation history.

---

# Chat Topic & History Session Issues / Requirements

## 1. Topic label and description are not displayed correctly

### Current issue
Topic name and description are showing as:

- `topic.undefined.title`
- `topic.undefined.desc`

### Expected behavior
Each topic must display the correct:

- Topic name/title
- Topic description

### Requirement
Decide one consistent source of truth for topic metadata.

Preferred solution:

- Fetch topic `name` and `description` from backend API.
- Avoid hardcoding unless topics are fully static and will never change.
- Frontend should fallback gracefully if metadata is missing.

Example fallback:

```ts
title: topic.title ?? "Untitled Topic"
description: topic.description ?? ""
````

---

## 2. Chat session inside topic is incorrectly creating new history every turn

### Current issue

When the user chats inside a topic, every single turn creates a new general chat history.

Each created history contains only:

* one user message
* one agent feedback

Because of this:

* assessment cannot load correctly
* audio cannot load correctly
* conversation history becomes fragmented
* previous chat session is not properly disconnected when switching history

### Expected behavior

Inside one topic, the user should continue in one active conversation session until they explicitly exit, disconnect, or create a new chat.

### Required behavior

When user enters a topic:

1. Load the latest active or latest history conversation for that topic.
2. Continue appending new user/agent messages into that same conversation.
3. Do not create a new history conversation on every turn.

A new history conversation should only be created when:

* user clicks `New Chat`
* user explicitly starts a new session
* no previous session exists for that topic

When user exits or clicks disconnect:

* mark current session as disconnected/closed
* stop streaming/listening/audio resources
* release any active WebSocket/session connection if used

---

## 3. History conversation naming

### Expected naming format

Each history conversation inside a topic should have a clear name.

Suggested format:

```text
{topic_name} - {created_at}
```

or better:

```text
{topic_name} - Session {session_number} - {created_at}
```

Example:

```text
IELTS Speaking - Session 01 - 2026-05-02 14:30
```

### Required metadata

Each conversation should store:

```ts
{
  conversation_id: string;
  topic_id: string;
  topic_name: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: "active" | "closed";
}
```

---

## 4. Returning to a topic should load latest session

### Current issue

When user comes back to a topic, the previous session is not restored correctly.

### Expected behavior

When user opens a topic:

* fetch latest conversation by `topic_id`
* load all messages
* lazy-load assessments and audio
* continue the same conversation if it is still active

Pseudo flow:

```ts
onOpenTopic(topicId):
  latestConversation = getLatestConversation(topicId)

  if latestConversation exists:
    loadConversation(latestConversation.id)
  else:
    createConversation(topicId)
```

---

## 5. New Chat behavior

### Expected behavior

When user clicks `New Chat` inside a topic:

* create a brand-new conversation under that topic
* navigate user to the new conversation
* all future messages should be appended to this new conversation
* old conversation must remain in history

Important:

```text
New Chat != one new chat per message
```

New chat should happen only when user explicitly requests it.

---

## 6. Clear/delete history conversations

### Requirement

Add history deletion feature.

User should be able to:

* delete selected history conversations
* delete all history conversations in a topic
* optionally confirm before deleting all

Suggested UI actions:

```text
Delete selected
Clear all history
```

Backend should support:

```http
DELETE /topics/{topic_id}/conversations/{conversation_id}
DELETE /topics/{topic_id}/conversations
```

---

## 7. Limit maximum 5 history conversations per topic

### Requirement

Each topic can have maximum 5 history conversations.

When user tries to create a new chat and already has 5 conversations:

* do not create a new conversation
* show a message requiring user to delete old conversations first

Example message:

```text
You can only keep up to 5 conversations per topic. Please delete an old conversation before creating a new one.
```

Backend should enforce this rule, not only frontend.

---

## 8. Client-side caching

### Requirement

Client should cache:

* history messages
* assessment scores
* audio metadata/audio URLs

### Expected behavior

Use caching to avoid refetching everything every time the user switches conversation.

Recommended strategy:

* cache messages by `conversation_id`
* cache assessments by `message_id` or `turn_id`
* lazy-load audio only when needed
* do not load all audio files upfront

Example cache keys:

```ts
messages:{conversation_id}
assessments:{conversation_id}
audio:{message_id}
```

### Lazy loading audio

Audio should only load when:

* user opens a message with audio
* user clicks play
* assessment panel requires audio preview

---
READ @app (backend) @db_schema(database) @frontend (frontend) for full context