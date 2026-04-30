# AI Speaking Coach - Product and Technical Specification

## 1. Project Overview

**Project name:** AI Speaking Coach  
**Goal:** help learners practise spoken English through text/audio chat, AI replies, and pronunciation assessment.

## 2. Product Goal

The product is built around a short feedback loop:

1. user sends text or audio
2. backend generates an assistant response
3. assistant audio is returned when available
4. users can later review conversations and replay audio
5. optional pronunciation assessment gives detailed word-level feedback

## 3. Current User Flow

1. Register or log in
2. Start a new conversation or continue an existing one
3. Send either:
   - text input
   - audio input
4. Receive:
   - normalized user input
   - assistant text
   - optional assistant audio
   - conversation id
5. Optionally upload WAV/PCM audio to `/api/assess` for pronunciation scoring
6. Review prior conversations and messages

## 4. Current Backend Architecture

### Runtime stack

- FastAPI app in `app/main.py`
- routes in `app/api/routes.py`
- PostgreSQL for relational data
- MinIO for audio objects
- Groq for STT and LLM
- ElevenLabs for TTS
- Azure Speech for pronunciation assessment

### Main backend flow

`route -> validation -> DB ownership checks -> AI services -> MinIO upload -> DB persistence -> response`

## 5. Current API Surface

### Public endpoints

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`

### Authenticated endpoints

- `GET /api/auth/me`
- `POST /api/chat/respond`
- `POST /api/assess`
- `GET /api/conversations`
- `GET /api/conversations/{conversation_id}/messages`

This is the current API. Older endpoints such as `/chat/text`, `/chat/audio`, `/config/model`, `/config/voice`, `/topics`, and `/evaluation/{id}` are not part of the active FastAPI routes.

## 6. Core Request Modes

### Chat mode

`POST /api/chat/respond`

Accepts:

- text
- optional history
- optional topic
- optional sub-option/scenario
- optional audio file
- optional conversation id

Returns:

- `user_input`
- `response_text`
- `audio_base64` when inline audio is small enough
- `user_audio_url`
- `assistant_audio_url`
- `conversation_id`

### Pronunciation mode

`POST /api/assess`

Accepts:

- WAV/PCM audio
- optional `reference_text`
- optional `language` (`en-US` or `en-GB`)

Returns:

- overall pronunciation metrics
- recognized text
- per-word detail
- syllable and phoneme detail

## 7. Dynamic System Prompt Architecture

The assistant prompt is now layered:

`base_prompt -> topic_prompt -> sub_option.system_prompt`

- `base_prompt`: global speaking-coach behavior for every conversation.
- `topic_prompt`: broad context, goal, vocabulary scope, and difficulty control.
- `sub_option.system_prompt`: the concrete role-play scenario. This is the most important layer because it defines user role, AI role, objective, and real-life constraints.

Implementation files:

- `app/prompts/prompt_architecture.json`
- `app/prompts/prompt_builder.py`
- `app/services/groq_llm.py`

Current JSON structure:

```json
{
  "base_prompt": "Global speaking coach behavior...",
  "topics": {
    "daily_conversation": {
      "aliases": ["daily", "daily conversation"],
      "topic_prompt": "Topic context, goal, vocabulary, difficulty...",
      "options": {
        "ordering_food": {
          "aliases": ["food & restaurant", "restaurant"],
          "system_prompt": "Role-play scenario, user role, AI role, objective, constraints..."
        }
      }
    }
  }
}
```

Current topic groups include:

- `daily_conversation`: ordering food, weekend plans, shopping return, doctor visit
- `job_interview`: tell me about yourself, strengths and weaknesses, salary negotiation, project update meeting
- `travel`: airport check-in, hotel booking, asking directions, travel problem, ordering food
- `ielts_speaking`: Part 1 personal questions, Part 2 cue card, Part 3 discussion, study-abroad interview

Backend integration:

- `/api/chat/respond` accepts `topic` and optional `sub_option`.
- `normalize_history()` adds `Topic:` and `Sub-option:` metadata lines.
- `GroqLLMService.generate_response()` extracts those lines and calls `build_system_prompt(topic, sub_option)`.
- Unknown topics or sub-options fall back to a safe generic topic/scenario prompt instead of failing.

Frontend integration:

- `frontend/src/api/chat.js` supports a `subOption` parameter and sends it as multipart field `sub_option`.
- Existing topic-only flows remain compatible.
- Future UI should model each topic as a list of scenario options and pass both fields:

```js
chatRespond({
  token,
  text,
  history,
  topic: 'travel',
  subOption: 'airport_check_in',
});
```

## 8. Database Model

Current relational model is conversation-based.

### Main tables

- `users`
- `auth_sessions`
- `topics`
- `user_topic_preferences`
- `conversations`
- `turns`
- `messages`
- `audio_assets`
- `pronunciation_assessments`
- `pronunciation_word_details`
- `agent_feedback`
- `daily_progress`

### Important modeling note

The active backend does **not** use the older `practice_sessions` / `message_evaluations` structure described in some legacy documents. The current code works with:

- conversations
- turns
- messages
- audio assets
- pronunciation assessments

## 9. Storage Model

Audio is stored in object storage, not local disk.

Current behavior:

- user audio uploaded to MinIO
- assistant TTS audio uploaded to MinIO
- API returns presigned URLs for replay
- depending on MinIO endpoint/network configuration, those URLs may not always be directly reachable from the browser

## 10. Security and Validation

Current backend hardening includes:

- JWT required claims: `sub`, `email`, `iat`, `nbf`, `exp`
- stronger registration password policy
- audio content-type validation
- audio file signature validation
- text/history/topic/reference length limits
- ownership checks for conversations
- security headers on HTTP responses
- reduced logging of raw transcript/response content

## 11. Testing Strategy

### Current approach

- unit and route tests first
- mock external services by default
- isolate DB and storage dependencies in tests

### Test modules currently present

| Module | Count |
| --- | ---: |
| `tests/test_security/test_security.py` | 23 |
| `tests/test_ai_services/test_ai_services.py` | 25 |
| `tests/test_api/test_schemas.py` | 30 |
| `tests/test_api/test_routes.py` | 51 |
| `tests/test_api/test_user_data_flow.py` | 18 |
| `tests/test_services/test_azure_assessment.py` | 18 |
| Total defined test functions | 165 |

### Verified local result

In the current environment, the following verified subset passes:

- security
- routes
- schemas
- AI services
- user data flow

Azure service tests require the Azure Speech SDK dependency to be installed before they can be collected and executed.

## 12. Current Frontend/Backend Contract Notes

- frontend still uses `/api/chat/respond` and `/api/assess`
- frontend can pass optional `sub_option` to select a scenario-specific prompt
- `audio_base64` must be treated as optional
- `assistant_audio_url` is deployment-dependent and should not be assumed browser-reachable in every environment
- register flow now has stricter password requirements than legacy docs suggested

## 13. Risks and Constraints

### Known operational constraints

- pronunciation assessment depends on Azure configuration
- object URL reachability depends on MinIO/network deployment setup
- frontend latency may increase if chat and pronunciation assessment are run sequentially on the same user turn
- current frontend still performs chat first and pronunciation assessment afterward on audio turns, so user-perceived latency can be higher than necessary

## 14. Source of Truth

For implementation truth, prefer:

- `app/main.py`
- `app/api/routes.py`
- `app/api/schemas.py`
- `app/prompts/prompt_architecture.json`
- `app/prompts/prompt_builder.py`
- `db_schema/schema.sql`
- `API.md`

This document is a product/technical summary, not the canonical API contract.
