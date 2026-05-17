# Agent & CÃ¡c Dá»‹ch Vá»¥

Huáº¥n luyá»‡n viÃªn nÃ³i tiáº¿ng Anh AI (AI LinguAI) Ä‘Æ°á»£c váº­n hÃ nh bá»Ÿi má»™t **state machine LangGraph**, giÃºp Ä‘iá»u phá»‘i bá»‘n dá»‹ch vá»¥ bÃªn ngoÃ i. ThÆ° má»¥c nÃ y tÃ i liá»‡u hÃ³a pipeline vÃ  viá»‡c tÃ­ch há»£p cá»§a tá»«ng dá»‹ch vá»¥.

---

## Ná»™i dung

| Tá»‡p | MÃ´ táº£ |
|------|-------------|
| [groq-llm.md](./groq-llm.md) | Groq LLM â€” táº¡o há»™i thoáº¡i (llama-3.3-70b) |
| [groq-stt.md](./groq-stt.md) | Groq Whisper â€” chuyá»ƒn giá»ng nÃ³i thÃ nh vÄƒn báº£n (STT) |
| [elevenlabs-tts.md](./elevenlabs-tts.md) | ElevenLabs â€” chuyá»ƒn vÄƒn báº£n thÃ nh giá»ng nÃ³i (TTS) |
| [azure-assessment.md](./azure-assessment.md) | Azure Cognitive Services â€” Ä‘Ã¡nh giÃ¡ phÃ¡t Ã¢m |

---

## Pipeline LangGraph

Má»—i lÆ°á»£t gá»i tá»›i `POST /api/chat/respond` Ä‘á»u cháº¡y qua state machine nÃ y:

```
user_input (Ä‘áº§u vÃ o ngÆ°á»i dÃ¹ng)
    â”‚
    â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     bá»‹ cháº·n (blocked)
â”‚  preflight  â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º Káº¾T THÃšC (END)
â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜
       â”‚ an toÃ n (safe)
       â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   gá»i tool + chÆ°a Ä‘áº¡t giá»›i háº¡n
â”‚   respond   â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º â”Œâ”€â”€â”€â”€â”€â”€â”€â”
â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜                             â”‚ tools â”‚
       â”‚                                    â””â”€â”€â”€â”¬â”€â”€â”€â”˜
       â”‚ khÃ´ng gá»i tool                          â”‚ (láº·p láº¡i vá» respond)
       â–¼                                        â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
â”‚     tts     â”‚  (bá» qua náº¿u cÃ³ cuá»™c gá»i tool â†’ Káº¾T THÃšC)
â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜
       â”‚
       â–¼
    Káº¾T THÃšC (END)
```

**Sá»‘ láº§n láº·p tool tá»‘i Ä‘a:** 5 (`_TOOL_CALL_CAP`). Sau khi Ä‘áº¡t giá»›i háº¡n, node `respond` sáº½ bá»‹ Ã©p sang cháº¿ Ä‘á»™ plain (thÃ´ng thÆ°á»ng) vÃ  khÃ´ng thá»±c hiá»‡n thÃªm cuá»™c gá»i tool nÃ o ná»¯a.

---

## CÃ¡c Node

### 1. `preflight`
Má»™t lÆ°á»£t gá»i LLM (Groq) duy nháº¥t vÃ  gá»n nháº¹ giÃºp Ä‘á»“ng thá»i:
- **Kiá»ƒm tra an toÃ n (Safety-check)** Ä‘áº§u vÃ o â€” phÃ¡t hiá»‡n ná»™i dung Ä‘á»™c háº¡i, láº¡c Ä‘á», hoáº·c prompt injection. Fails **open** (coi lÃ  AN TOÃ€N náº¿u gáº·p lá»—i há»‡ thá»‘ng).
- **PhÃ¡t hiá»‡n Ã½ Ä‘á»‹nh sá»­ dá»¥ng tool (Detect tool intent)** â€” phÃ¢n loáº¡i xem ngÆ°á»i dÃ¹ng cÃ³ Ä‘ang yÃªu cáº§u hÃ nh Ä‘á»™ng liÃªn quan Ä‘áº¿n flashcard hay khÃ´ng. Fails **closed** (khÃ´ng sá»­ dá»¥ng tool náº¿u gáº·p lá»—i).

Thiáº¿t láº­p `guardrail_blocked: bool` vÃ  `tool_intent: bool` vÃ o trong state.

### 2. `respond`
LÆ°á»£t gá»i LLM chÃ­nh (Groq). Hoáº¡t Ä‘á»™ng á»Ÿ má»™t trong ba cháº¿ Ä‘á»™ tÃ¹y thuá»™c vÃ o ngá»¯ cáº£nh:

| Äiá»u kiá»‡n | Cháº¿ Ä‘á»™ | Äáº§u ra |
|-----------|------|--------|
| `tool_intent=True`, `user_id` Ä‘Æ°á»£c Ä‘áº·t, sá»‘ láº§n láº·p < giá»›i háº¡n | **Tool client** | `response_text` + `tool_calls` tÃ¹y chá»n |
| Tool bá»‹ táº¯t | **Structured client** | `response_text`, `grammar_raw`, `suggestions` qua Pydantic |
| Dá»± phÃ²ng (Fallback) | **Plain client** | `response_text` dáº¡ng vÄƒn báº£n thuáº§n |

Pháº£n há»“i ngá»¯ phÃ¡p Ä‘Æ°á»£c tÃ¡ch ra tá»« tháº» XML `<grammar>` náº±m bÃªn trong cÃ¢u tráº£ lá»i cá»§a LLM vÃ  Ä‘Æ°á»£c lÆ°u trá»¯ dÆ°á»›i dáº¡ng chuá»—i JSON trong `grammar_raw`.

### 3. `tools` (ToolNode)
Thá»±c thi toÃ n bá»™ `tool_calls` tá»« káº¿t quáº£ cá»§a node `respond` trÆ°á»›c Ä‘Ã³ báº±ng cÃ¡c **flashcard tools**:
- Táº¡o / danh sÃ¡ch / cáº­p nháº­t / xÃ³a bá»™ tháº» (decks)
- ThÃªm / cáº­p nháº­t / xÃ³a tháº» (cards)
- Láº¥y cÃ¡c tháº» cáº§n há»c, gá»­i Ä‘Ã¡nh giÃ¡ SM-2

CÃ¡c káº¿t quáº£ cá»§a tool Ä‘Æ°á»£c chuáº©n hÃ³a (cÃ¡c ná»™i dung trá»‘ng Ä‘Æ°á»£c thay tháº¿ Ä‘á»ƒ Ä‘Ã¡p á»©ng API cá»§a Groq) vÃ  thÃªm vÃ o bá»™ tÃ­ch lÅ©y `messages`. Quyá»n Ä‘iá»u khiá»ƒn quay láº¡i node `respond`.

### 4. `tts`
Chuyá»ƒn Ä‘á»•i `response_text` thÃ nh giá»ng nÃ³i thÃ´ng qua **ElevenLabs**. Bá» qua khi cÃ³ lÆ°á»£t gá»i tool â€” pháº£n há»“i cá»§a tool chá»‰ á»Ÿ dáº¡ng vÄƒn báº£n thuáº§n.  
Äáº§u ra: `audio_bytes` (MP3 gá»‘c).

---

## State (Tráº¡ng thÃ¡i)

```python
class AgentState(TypedDict):
    # Inputs (Äáº§u vÃ o)
    user_input: str
    history: list[str]          # CÃ¡c dÃ²ng há»™i thoáº¡i trÆ°á»›c Ä‘Ã³ (cÅ© nháº¥t Ä‘á»©ng trÆ°á»›c)
    voice_gender: str | None    # "male" hoáº·c "female"
    voice_accent: str | None    # "british" hoáº·c "american"
    category: str | None        # vÃ­ dá»¥: "daily_life"
    topic: str | None           # vÃ­ dá»¥: "hometown"
    user_id: str | None         # UUID; báº¯t buá»™c Ä‘á»ƒ báº­t cÃ¡c tool

    # ÄÆ°á»£c thiáº¿t láº­p bá»Ÿi preflight
    guardrail_blocked: bool
    tool_intent: bool

    # ÄÆ°á»£c thiáº¿t láº­p bá»Ÿi respond
    response_text: str
    grammar_raw: str | None     # Chuá»—i JSON chá»©a lá»—i ngá»¯ phÃ¡p
    suggestions: list[str]      # 0â€“3 gá»£i Ã½ cÃ¢u nÃ³i tiáº¿p theo

    # ÄÆ°á»£c thiáº¿t láº­p bá»Ÿi vÃ²ng láº·p tools â†’ respond
    messages: list              # Bá»™ tÃ­ch lÅ©y cho AIMessage + ToolMessages
    _tool_call_iterations: int  # Bá»™ Ä‘áº¿m vÃ²ng láº·p (tá»‘i Ä‘a 5)

    # ÄÆ°á»£c thiáº¿t láº­p bá»Ÿi tts
    audio_bytes: bytes          # MP3 gá»‘c, rá»—ng b"" náº¿u cÃ¡c tool Ä‘Æ°á»£c sá»­ dá»¥ng
```

---

## Khá»Ÿi Táº¡o Dá»‹ch Vá»¥

Táº¥t cáº£ cÃ¡c dá»‹ch vá»¥ Ä‘á»u lÃ  cÃ¡c **singleton** Ä‘Æ°á»£c táº¡o má»™t láº§n duy nháº¥t lÃºc khá»Ÿi Ä‘á»™ng thÃ´ng qua `@lru_cache(maxsize=1)`:

```python
# app/core/ai_services.py
pipeline = get_voice_agent_pipeline()   # LLM + TTS
stt      = get_stt_service()            # Whisper STT
assess   = get_assessment_service()     # Azure Speech
```

---

## CÃ¡c Tá»‡p Nguá»“n

| Tá»‡p | Má»¥c Ä‘Ã­ch |
|------|---------|
| `app/agents/pipeline.py` | `VoiceAgentPipeline` â€” cÃ¡c node, Ä‘á»“ thá»‹ (graph), Ä‘á»‹nh tuyáº¿n |
| `app/agents/state.py` | `AgentState` TypedDict |
| `app/agents/output_models.py` | `AgentOutput` Pydantic model (cháº¿ Ä‘á»™ structured) |
| `app/agents/tools/flashcard_tools.py` | LangChain tools cung cáº¥p cho LLM |
| `app/agents/tool_steps.py` | Tiá»‡n Ã­ch trÃ­ch xuáº¥t káº¿t quáº£ cÃ¡c bÆ°á»›c gá»i tool |
| `app/core/ai_services.py` | Factory dá»‹ch vá»¥ + wrapper `run_langraph_agent()` |
| `app/services/groq_llm.py` | Groq LLM wrapper |
| `app/services/groq_stt.py` | Groq Whisper STT wrapper |
| `app/services/elevenlabs_tts.py` | ElevenLabs TTS wrapper |
| `app/services/azure_assessment.py` | Azure Speech pronunciation wrapper |

