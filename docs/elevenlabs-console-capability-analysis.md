# ElevenLabs → Admin Console: Capability Gap Analysis

**Date:** 2026-08-04
**Purpose:** Identify what the ElevenLabs platform exposes that the Bonga Nami console does not yet surface, ranked by what makes this read as an enterprise product rather than a demo.

---

## 1. Where we stand

The platform currently calls **six** ElevenLabs endpoints:

| Endpoint | Used for |
|---|---|
| `GET/PATCH /v1/convai/agents/:id` | Agent config, RAG status, attached KB docs |
| `GET /v1/convai/conversations` | Conversation list |
| `GET /v1/convai/conversations/:id` | Transcript, metadata, analysis |
| `GET /v1/convai/conversation/get_signed_url` | Widget session auth |
| `POST /v1/convai/batch-calling/calls` | Outbound campaigns |
| `POST /v1/convai/conversations/create-phone-call` | Single outbound call |

That is a working integration covering **conversation delivery and playback**. What it does not cover is everything a buyer asks about *after* they believe the thing talks: safety, evidence, quality control, and cost.

The console's own framing gives this away. It presents ElevenLabs data as **conversations** — a log. An enterprise product presents the same data as **outcomes** — what happened, was it safe, did it work, what did it cost.

---

## 2. The single biggest gap: structured data extraction

**Status: verified. This is the recommendation I would act on first.**

ElevenLabs runs LLM analysis over every completed conversation and can extract **typed, structured fields** you define — not just a summary. Configured per agent under the Analysis tab / `platform_settings`, with two distinct mechanisms:

**Data collection** — you declare fields with an identifier, a type (`string` / `boolean` / `integer` / `number`), and a description telling the model how to extract them. Limit 25 per agent on standard plans, 40 on Trial/Enterprise. Results attach to each conversation.

**Evaluation criteria** — you declare goals in natural language; every transcript is scored `success` / `failure` / `unknown` **with a written rationale**.

### Why this changes the product

Right now the console can tell Mwihoko Super Jamii: *"32 conversations, 27 completed, average 1m 19s."* That is telemetry. It says nothing about whether the programme worked.

With data collection configured, the same console can report:

- Which health topic was discussed (contraception, menstruation, HIV, GBV, pregnancy)
- Whether a **referral to a clinic was made** — boolean
- Whether the girl was **signposted to a human** — boolean
- Self-reported age band and county
- Whether the agent **failed to answer** and why
- Sentiment across the conversation

That is M&E data — the currency Mwihoko Super Jamii actually runs on. It converts the console from an ops tool into a **programme measurement instrument**, which is a different and much more valuable product.

### The one-line pitch

> "The console doesn't just log conversations, it measures programme outcomes. Every conversation is scored against criteria you define, and the fields you care about — referral made, topic, age band — are extracted automatically and roll up into the dashboard. Your M&E team gets a CSV instead of a transcript pile."

### What it takes

Backend already fetches `analysis` per conversation but reads only `transcriptSummary` and `callSuccessful`. It **discards** `evaluation_criteria_results` and `data_collection_results`. Surfacing them is: configure the fields on the agent, stop throwing away two response objects, add a column/tile group. Genuinely small relative to impact.

---

## 3. Safety and guardrails

**Status: verified in the agents skill. Configured under `platform_settings.guardrails`.**

Completely absent from the console. For a product aimed at **adolescent girls discussing sexual and reproductive health**, this is not a nice-to-have — it is the first thing a serious buyer, donor, or ethics reviewer will probe.

Four layers, all enforced independently of the LLM:

| Layer | What it does |
|---|---|
| `focus` | Keeps the agent on topic |
| `prompt_injection` | Defends against manipulation |
| `content` | Category filters with 0.0–1.0 thresholds |
| `custom` | LLM-evaluated domain rules, `blocking` mode with retry |

Content categories include `self_harm`, `sexual`, `violence`, `harassment`, `profanity`, and `medical_and_legal_information` — the exact risk surface of this programme. The documented guidance for healthcare is to enable `medical_and_legal_information`; for youth, `sexual` / `violence` / `self_harm`.

**What the console should show:** a Safety panel listing which guardrails are active, their thresholds, custom rules in plain language ("Never gives a medical diagnosis"), and — most powerfully — **a log of when a guardrail fired**. "Blocked 3 attempts to elicit medical diagnosis this fortnight" is a slide, not a metric.

**The one-line pitch:**

> "Safety isn't in the prompt where a model can be talked out of it. It runs as an independent layer, it's configurable by non-technical staff, and every intervention is logged and auditable."

---

## 4. Automated agent testing

**Status: verified. `POST /v1/convai/agent-testing/create`, `POST /v1/convai/agents/:id/run-tests`.**

Three test types: `llm` (does it respond correctly to a message), `tool` (does it call the right tool with the right parameters), and `simulation` (multi-turn against a simulated user persona). Evaluation strategies: `exact`, `regex`, `llm`. Tests attach to the agent and can be run repeatedly (`repeat_count` 1–20).

This answers the question every technical buyer asks and almost no AI demo can answer:

> **"How do you know a prompt change didn't break something?"**

**What the console should show:** a Tests section — the suite, last run, pass/fail per case, and a "Run tests" button. Then, on the Settings page, run the suite automatically after any prompt or model change and refuse to save silently if a test regresses.

This is the strongest *technical* credibility signal on this list. Almost nobody building on ElevenLabs does it, and it demonstrates you think about AI as software under change control rather than a magic box.

---

## 5. Knowledge base — real numbers exist

**Status: verified. `GET /v1/convai/knowledge-base/rag-index` returns `total_used_bytes`, `total_max_bytes`, and per-model `used_bytes`.**

This directly resolves the phantom "Text Chunks: 0" tile. ElevenLabs does **not** expose chunk counts or query statistics — those tiles can never work. It **does** expose index storage and the embedding model in use (`e5_mistral_7b_instruct` or `multilingual_e5_large_instruct`).

Replace the three dead tiles with:

| Tile | Source |
|---|---|
| Documents | agent's attached KB array (already have) |
| Index used / capacity | `total_used_bytes` / `total_max_bytes` |
| Embedding model | `models[].model` |
| RAG status | agent config (already fetched, only shown as a banner) |

"Index at 12 MB of 100 MB" is a real capacity signal a platform operator needs. "Text Chunks: 0" is a bug pretending to be a metric.

---

## 6. Model governance

**Status: verified. `GET /v1/convai/llm/list`.**

Returns the current model catalog including **deprecation state**, token and context limits, and capability flags. The console currently shows the model nowhere at all — a client cannot discover what is answering their users.

**What to show:** current model, its context limit, and a warning when it enters deprecation. For a platform sold to institutions, "we will tell you before your model is retired" is a maturity signal. It also sets up an honest cost conversation, since model choice is the main lever on per-conversation cost.

---

## 7. Tools and integrations

**Status: verified in the agents skill.**

Note: this repo already contains `ToolsSection.tsx` — a tools generator — that is **not imported anywhere and unreachable in the UI**. There is existing intent here that was never wired up.

ElevenLabs supports webhook tools, client tools, built-in system tools, and managed integration connectors (`zendesk`, `salesforce`, `hubspot`, `calcom`).

Relevant built-in tools not surfaced:

| Tool | Why it matters here |
|---|---|
| `language_detection` | Multilingual is core to the Kenya context |
| `transfer_to_number` | The human-handover path, partially built |
| `voicemail_detection` | Outbound campaign quality |
| `skip_turn` | Coaching/tutoring patterns |

`calcom` is the obvious one for this programme: **booking a clinic appointment inside the conversation** turns information provision into service delivery. That is a roadmap slide, not a build-this-week item.

---

## 8. Workflows

**Status: verified. Top-level `workflow` field on the agent.**

Node-based conversation routing — `start`, `override_agent`, `dispatch_tool`, `agent_transfer`, `transfer_to_number`, `end` — with unconditional, LLM-condition, and deterministic-expression edges. Tools can be scoped per node so the wrong tool cannot fire at the wrong step.

For this programme, a triage workflow is the natural fit: classify intent → route to information / referral / human escalation, with a guaranteed path to a human for anything flagged as a safeguarding concern.

Worth **showing as a diagram** in the console rather than making editable. Reading "here is how a conversation is routed, and here is the guaranteed escalation path" is reassuring to a buyer; a node editor is not, at this stage.

---

## 9. Priority

Ordered by credibility gained per unit of effort:

| # | Capability | Effort | Why |
|---|---|---|---|
| 1 | **Surface `data_collection_results` + `evaluation_criteria_results`** | Small — data already fetched and discarded | Turns telemetry into programme outcomes. The whole pitch. |
| 2 | **Safety / guardrails panel** | Small–medium | The first question anyone asks about AI for teenage girls |
| 3 | **Fix KB tiles with RAG index** | Small | Removes a visible bug that reads as "not working" |
| 4 | **Model + deprecation display** | Small | Cheap maturity signal |
| 5 | **Test suite runner** | Medium | Strongest technical differentiator |
| 6 | Workflow diagram | Medium | Shows escalation is designed, not incidental |
| 7 | Tools / cal.com referral booking | Large | Roadmap, not build |

**Items 1–4 are realistically achievable in the next release.** Item 5 is the one worth prioritising even if only partially built.

---

## 10. Honest caveats

- **Data collection and evaluation criteria must be configured on the agent first.** The console can display them, but if nobody has defined "referral_made" on the ElevenLabs side, there is nothing to show. Configuration comes before the UI.
- **Guardrail trigger logging** — I verified guardrails are configurable and that custom rules use `trigger_action`. I have **not** verified that historical trigger events are queryable via API. If they are not, the panel shows configuration only, which is still worth having, but the "blocked 3 attempts" line would not be available.
- **Workspace usage/quota** — I could not locate a working docs page for a workspace usage endpoint. Cost governance may only be available as per-conversation cost, which the console already receives and currently hides under Technical Details.
- Everything marked *verified* above was checked against current ElevenLabs documentation on 2026-08-04 or is documented in the installed `agents` skill. Anything unverified is flagged as such.

---

## Sources

- [Conversation analysis](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis)
- [Data collection](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis/data-collection)
- [Run conversation analysis](https://elevenlabs.io/docs/api-reference/conversations/analysis/run-analysis)
- [RAG index overview](https://elevenlabs.io/docs/api-reference/knowledge-base/rag-index-overview)
- [Get knowledge base document](https://elevenlabs.io/docs/api-reference/knowledge-base/get-document)
- [Testing conversational AI agents](https://elevenlabs.io/blog/testing-conversational-ai-agents)
- [ElevenAgents overview](https://elevenlabs.io/docs/eleven-agents/overview)
