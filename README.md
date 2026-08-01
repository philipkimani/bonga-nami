# Bonga Nami — "talk with me"

A retrieval-grounded conversational assistant answering **puberty and menstrual health**
questions for **girls aged 12–16 in Kenya**, limited to a curated corpus and honest when
the answer isn't in it.

**Live:** https://bonga-nami.onrender.com/ai_agent/
The page is both the working assistant (widget, bottom right) and the presentation.

Built for the Mwihoko Super Jamii clinic deployment.
Philip K. Kimani · philipkimanidev@gmail.com

---

## Contents

1. [Use case, corpus and audience](#1-use-case-corpus-and-audience)
2. [How the Q&A flow works](#2-how-the-qa-flow-works)
3. [Architecture](#3-architecture)
4. [LLM and prompt engineering decisions](#4-llm-and-prompt-engineering-decisions)
5. [Guardrails and safety](#5-guardrails-and-safety)
6. [Evaluation approach](#6-evaluation-approach)
7. [Results](#7-results)
8. [Trade-offs, limitations and alternatives](#8-trade-offs-limitations-and-alternatives)
9. [Beyond the PoC](#9-beyond-the-poc)
10. [Repository layout](#10-repository-layout)

---

## 1. Use case, corpus and audience

### The problem

Adolescent girls in Kenya routinely miss school during their periods — through cost, lack of
a private place to change, pain, or shame. Where accurate information is absent, myths fill
the gap: that you cannot bathe or cook while menstruating, that a tampon ends virginity, that
irregular early cycles mean something is wrong.

### Audience

Girls aged roughly **12 to 16**, in Kenya, usually asking about their own bodies.

- Often shy, or asking "for a friend"
- Carrying myths from home, classmates or online
- For many, this is the first place they have asked anyone

### Corpus

A **closed corpus of three documents**, written for this audience and cited to public health
guidance (WHO, UNICEF, Kenya Ministry of Health):

| Document | Covers |
|---|---|
| `01-puberty-basics.md` | What changes and when, timing variation, caring for a changing body |
| `02-menstrual-health.md` | Cycle mechanics, normal ranges, pain, management, red flags |
| `03-myths-and-questions.md` | Ten myths corrected, plus the questions girls actually ask |

Compiled into a single `.txt` (**2,664 words**) for upload. The corpus opens with a statement
of principles — girl-centred, judgement-free, culturally responsive, norm-shifting, honest
about limits — so retrieval reinforces the persona rather than fighting it.

**Scope was deliberately narrowed** from general sexual and reproductive health to puberty
and menstrual health alone. Reasoning in [section 8](#8-trade-offs-limitations-and-alternatives).

### Success metrics

Defined before building, and the basis of the evaluation in [section 6](#6-evaluation-approach):

1. **Grounded** — answers come from the corpus, not the model's general knowledge
2. **Refuses cleanly** — says so when the corpus doesn't cover the question
3. **Always routes harm** — any disclosure of abuse or self-harm surfaces help
4. **Readable at age 11–12** — a correct answer she cannot read has failed

---

## 2. How the Q&A flow works

One HTTPS request, then one long-lived socket.

```mermaid
sequenceDiagram
    participant B as Browser (widget)
    participant P as Platform (Railway)
    participant E as ElevenLabs API

    B->>P: GET /api/voice/signed-url
    P->>E: request signed URL (server-side key)
    E-->>P: signed wss:// URL
    P-->>B: signed URL
    B->>E: open WebSocket (upgrades to WebRTC if supported)
    loop for each turn
        B->>E: speech / text
        E->>E: ASR → query reformulation → embed → retrieve → generate → guardrails → TTS
        E-->>B: reply (text + audio)
    end
    E-->>P: transcripts pulled on demand for evaluation
```

Two-way audio cannot be done with request and response, so the conversation runs over a
persistent socket. The platform's only job in the live path is to **mint a signed URL** using
a server-side API key — the browser then talks to the inference endpoint directly.

Retrieval detail, per the
[ElevenLabs RAG documentation](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base/rag):
documents are indexed on upload (chunked and embedded); at query time the question is
**reformulated**, embedded, and matched against those chunks by semantic similarity. Only the
matching passages reach the LLM. Documented cost: roughly **250 ms**.

---

## 3. Architecture

```mermaid
flowchart TB
    G["Girl's browser<br/>widget + presentation"] --> S
    A["Admin console<br/>React + Vite"] --> S
    S["Express v5 · TypeScript · Docker on Railway<br/>signed-URL minting · config · analytics · /health"]
    S --> D[("PostgreSQL · Prisma<br/>config, logs, admin accounts")]
    S -.corpus upload / transcript pull.-> E["ElevenLabs API<br/>RAG · LLM · ASR · TTS"]
    G ==WebSocket==> E
```

| Layer | Choice |
|---|---|
| Conversational layer | **ElevenLabs API** — hosts the corpus and runs retrieval, generation, ASR and TTS |
| Retrieval | `e5_mistral_7b_instruct`, `usage_mode: auto` (retrieved only when relevant) |
| Generation | `gemini-2.5-flash`, `temperature: 0` |
| Speech | `eleven_v3_conversational`, `scribe_realtime` ASR |
| Server | Express v5, TypeScript (strict), ESM, Docker on Railway |
| Data | PostgreSQL via Prisma |

Transcripts are retrieved from the ElevenLabs API on demand, which is what the evaluation
harness reads from.

### Orchestration runtime

The platform also exposes a code execution path at `/webhooks/execute`. When a request needs
more than an answer, the model writes a short JavaScript program rather than calling tools one
at a time; the runtime executes it against bound functions that reach the organisation's own
systems and returns a single result.

**Why that matters for tokens:** every separate tool call is another round trip, and every
round trip re-sends the entire conversation context. Five tool calls means paying for the same
context five times. One generated program collapses them into a single execution.

---

## 4. LLM and prompt engineering decisions

| Decision | Choice | Why |
|---|---|---|
| Generation model | `gemini-2.5-flash` | Voice demands sub-second turns. A larger model buys reasoning this task doesn't need — the answer is in a 2,664-word corpus, not in the model's cleverness. |
| Temperature | `0` | Health answers shouldn't vary run to run, and evaluation must be reproducible. Warmth comes from the prompt, not sampling noise. |
| Prompt structure | 7 markdown sections | Personality, Environment, Tone, Goal, Boundaries, Safety, Certainty. Headed sections are followed more reliably than prose. |
| Persona | Older sister | Not a clinician, not a peer. The register that gets a 13-year-old to ask a second question. |
| Corpus binding | Explicit, then enforced | Instructed to answer only from the knowledge base — then enforced independently at the platform layer, because a prompt alone can be talked around. |
| Anatomy language | Correct terms, no slang | Euphemism teaches shame and makes disclosure of abuse harder. |
| Answer length | 2–4 sentences | Long answers lose this audience. |

The full prompt is in [`agent_configs/Bonga-Nami.json`](agent_configs/Bonga-Nami.json).

---

## 5. Guardrails and safety

For a health service used by children, **the refusals are the product**. Safety is enforced at
the platform layer, not left to prompt instructions.

### Content filters are deliberately OFF

The platform's content filters have one `trigger_action`: **`end_call`**. Enabling the
categories that generic advice recommends for youth products would mean:

- `self_harm` → **hangs up on a girl mid-disclosure**, at the exact moment she must not be cut off
- `sexual` → blocks discussion of vaginas, discharge, breast development — the subject matter itself
- `medical_and_legal_information` → blocks the entire purpose of the service

This is the single most important design decision in the build: **the standard safety setting
is the wrong one for this audience.**

### Custom guardrails, all on `retry`

`retry` regenerates a bad answer instead of terminating the conversation.

| Rule | Enforces |
|---|---|
| No medical diagnoses | May describe what is common and refer on; may not name her condition |
| No medication dosing | Simple pain relief as the corpus states it; no drug names, doses or regimens |
| Safeguarding disclosures must be routed | Blocks any reply to a disclosure of abuse, FGM/marriage risk or self-harm that fails to give reassurance, encourage a trusted adult, and surface the helpline. Sees 3 messages of history. |
| Answers must stay grounded | Blocks health claims the corpus doesn't support, forcing an honest "I don't know, ask a nurse" |

Also enabled: **focus** (keeps the conversation in scope) and **prompt-injection defence**.

The safeguarding rule is the inverse of a filter — it does not suppress the topic, it
**requires the right answer** before the reply is allowed through.

---

## 6. Evaluation approach

Accuracy alone would miss the point. A factually correct answer written at university reading
level, or one that answers a disclosure of abuse as though it were a question about cramps,
has **failed this audience**. The metric set is split accordingly.

### Metrics

| Metric | Target | Measured by | Why this metric |
|---|---|---|---|
| **Groundedness** | ≥ 95% | LLM judge against the corpus | The core accuracy measure — are claims traceable to source? |
| **Refusal accuracy** | ≥ 90% | LLM judge | Off-corpus probes must be declined, not answered from general knowledge |
| **Safeguarding recall** | **100%** | Deterministic (helpline present) | Non-negotiable. 95% means one girl in twenty gets nothing. |
| **Reading level** | ≤ grade 6 | Flesch-Kincaid, deterministic | Audience-specific. No judge needed, no ambiguity. |
| **Myth correction** | ≥ 90% | LLM judge | Corpus-specific — a myth quietly affirmed is worse than no answer |

The last three are the audience- and corpus-specific measures. A generic RAG evaluation would
report only the first two.

### Method

**Golden set** — roughly 85 hand-written cases in four categories:

| Category | ~n | Expected behaviour |
|---|---|---|
| In-corpus questions | 40 | Correct, traceable answer |
| Off-corpus probes | 20 | Refuses and refers on |
| Myth prompts | 15 | Names the myth, states what is true |
| Safeguarding scenarios | 10 | Reassurance + trusted adult + helpline |

**Judging** — deterministic checks wherever possible (regex for the helpline, Flesch-Kincaid for
reading level). Where a judge is needed, it comes from a **different model family than the
generator** — models systematically prefer their own output, so a Gemini-generated answer is
judged by a non-Gemini model.

**Reproducibility** — `temperature: 0` means the same input yields the same output, so a rerun
after a prompt change measures the change rather than sampling noise.

**Data source** — the platform already retrieves conversations from the ElevenLabs API, so the
same harness can be pointed at real transcripts once there are any.

---

## 7. Results

85 cases, agent at `temperature: 0`, run via [`eval/run_eval.py`](eval/run_eval.py).

**Detailed analysis: [`eval/ANALYSIS.md`](eval/ANALYSIS.md)** — the investigation, per-metric
evidence, method limitations and anticipated questions.
Every question and answer in full: [`eval/TRANSCRIPTS.md`](eval/TRANSCRIPTS.md)
Generated report: [`eval/results.md`](eval/results.md) · raw: [`eval/results.json`](eval/results.json)

| Metric | Target | Result | |
|---|---|---|---|
| Groundedness | ≥ 95% | **100%** (40/40) | met |
| Refusal accuracy | ≥ 90% | **100%** (21/21) | met |
| Safeguarding recall | 100% | **100%** (10/10) | met |
| Myth correction | ≥ 90% | **100%** (14/14) | met |
| Reading level | ≤ grade 6 | median **6.52**, 31/85 at target | missed |

> **Judge caveat.** Groundedness and myth correction were judged by a model in the same
> family as the generator (Gemini, via the ElevenLabs API), because no second provider key
> was available. Models prefer their own output, so read those two as an upper bound. The
> other three are deterministic and unaffected.

### The finding that matters most

**The first run measured a knowledge base that had not finished indexing.** It returned 82%
groundedness with seven failures, and I diagnosed those failures as the model paraphrasing
corpus figures — a coherent story, confidently written, and completely wrong.

Attaching a document to an agent and *indexing* it are separate steps. Until the index
completes, retrieval returns nothing and the model answers from general knowledge. On a
well-documented topic like menstrual health, general knowledge is mostly correct — which is
exactly why the failure was hard to see. 33 of 40 answers still scored as grounded.

The seven that failed were the seven where the corpus is **specific**: a Kenyan 50-shilling
coin as a clot reference, drying cloth pads in direct sunlight, an exact hour range.
Specificity is where an ungrounded system gives itself away.

Confirming the index and re-running produced **zero identical replies out of 85** and
resolved every groundedness failure:

| | Run 1 (unindexed) | Run 2 (indexed) |
|---|---|---|
| Groundedness | 82% (33/40) | **100% (40/40)** |
| Reading level (median) | 6.73 | 6.52 |

Run 1 is kept in the repository as `eval/results_run1_preindex.json`. Grounding also
*improved* readability — answers got shorter and sentences tighter once the model had a
corpus to draw on rather than composing from memory.

### What passed

All 21 off-corpus probes were declined and redirected, including a prompt-injection attempt.
All 10 safeguarding scenarios surfaced both a trusted adult and the helpline — and did so in
**both** runs, because safeguarding comes from the prompt and the guardrail rather than from
retrieval. Safety that does not depend on retrieval keeps working when retrieval breaks.

### The one miss: reading level

Median grade **6.52** against ≤ 6. Flesch-Kincaid has two inputs, so the cause is
determinable rather than a matter of opinion:

| | Words / sentence | Syllables / word | Grade |
|---|---|---|---|
| Corpus, prose only | 10.38 | 1.476 | **5.87** |
| Agent answers | 14.46 | 1.401 | **6.52** |

**Sentence length, not vocabulary.** The agent's words are *simpler* than its own corpus; its
sentences are about four words longer. The prompt constrains answers to 2–4 sentences but
says nothing about how long a sentence may be, which is the fix to test next.

Two hypotheses were tested and rejected: that the warm openers were padding (removing them
makes the score *worse* — they are short and simple), and that speaking numbers aloud
inflated it (real, but worth at most 0.06).

### Defects found in the harness itself

Three, all documented in the analysis: a refusal detector too narrow to recognise four
correct refusals; a wait-loop that exited against stale files and led me to compare a run
with itself; and a `--rescore` path reading cached case definitions. An evaluation harness is
software and can be wrong in ways that look like findings — a metric that makes the system
look bad deserves the same scrutiny as one that flatters it.

## 8. Trade-offs, limitations and alternatives

### Managed retrieval vs self-hosted

**Chose** the ElevenLabs API's built-in RAG — a working voice and text service in hours, no
vector infrastructure to run.

**Cost:** retrieval is a black box. No precision/recall, no chunk-size ablation, no embedding
model comparison. **Alternative considered:** a self-hosted pgvector pipeline, which would make
retrieval measurable and is partly scaffolded in the schema already. For a one-week PoC, a
working end-to-end system with measurable *answers* beat a half-built one with measurable
*retrieval*.

### Corpus scope

**Chose** puberty and menstrual health only, narrowed from general SRH.

**Cost:** real questions about contraception and consent are refused. **Gain:** a corpus that
can be evaluated end-to-end, and a scope that is safe to operate live in front of an audience.

### English-only corpus

Bonga Nami speaks a wide range of languages, Swahili among them — the constraint is the corpus
and golden set, not the technology. One language means directly comparable metrics.

**Cost:** girls in Kenya move between English, Swahili and Sheng. Extending is a corpus and
evaluation exercise, not a technical barrier. **Known gap:** language detection is currently
enabled against an English-only corpus, so a Swahili question would be answered without a
Swahili corpus to ground it.

### Authored corpus vs source documents

**Chose** authoring for the audience, cited to WHO/UNICEF/Kenya MoH.

**Cost:** it isn't a real-world ingestion problem. Source PDFs would have been messier, far
above this reading level, and slower to reach a testable state. **Alternative considered:** a
hybrid — authored corpus for retrieval, source PDFs alongside as provenance and for a chunking
comparison.

---

## 9. Beyond the PoC

### Immediately

- Verify every helpline number against a live source
- Clinical review of the corpus by a qualified health worker
- Resolve the language-detection inconsistency

### To measure properly

- Self-hosted retrieval, for precision and recall
- Chunk-size and embedding ablations
- Continuous evaluation over real transcripts

### To reach her where she is

A browser widget assumes a smartphone and data. Most of this audience has neither reliably.

- **WhatsApp**, **SMS** and **voice** — extensions for these already exist in the platform and run on Twilio
- Swahili corpus and golden set; Sheng-aware register
- Testing with Youth Advisory Panels, Mwihoko Super Jamii's own method

### To act, not just answer

Today the assistant can point at a helpline; it cannot pass anyone to a person or do anything
on her behalf. The orchestration runtime is how that changes.

- **Twilio** warm transfer to a counsellor; **SendGrid** case handoff with context
- Write to a CRM or case database; raise a follow-up task for the right team
- Book a clinic visit through a calendar integration

### To listen at scale

The same agent can run **outbound** as well as inbound — calling or messaging beneficiaries to
conduct surveys and follow-ups, turning those conversations into structured monitoring data
rather than a pile of transcripts. **That is a research instrument, not just a helpline.**

- **Structured procedures** — a fixed sequence of typed steps run identically every time; the
  right home for both a survey script and the safeguarding path
- **Redis** — cache the few hundred questions asked thousands of times, invalidated on corpus
  version so a corrected document never serves a stale answer
- **QStash** — queue outbound campaigns so survey volume never blocks a live conversation
- **Pronunciation dictionaries** — control how clinical terms and Swahili words are spoken

---

## 10. Repository layout

```
README.md                     this document
knowledge-base/               corpus — 3 source documents + compiled .txt
agent_configs/Bonga-Nami.json agent configuration: prompt, guardrails, RAG settings
agents.json                   agent index (ElevenLabs CLI)
eval/                         golden set and harness            (to be built)
packages/                     the platform the assistant runs on
  core/                       shared utilities, orchestration runtime
  clients/platform-client/    Express server, admin console, widget
  extensions/                 WhatsApp, voice, payments, knowledge base
  widgets/                    embeddable chat widget template
```

### Running the platform

```bash
pnpm install
pnpm -r build

# schema must exist before first boot
cd packages/clients/platform-client && npx prisma db push

node dist/server.js
```

Required environment: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `PORT`.
Everything else — API keys, agent ID, branding — is configured in the Admin Console.
