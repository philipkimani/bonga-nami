# Bonga Nami — "talk with me"

An open-source AI health assistant, by voice or text, in English and Swahili, for **young
women aged 18–26 in Kenya**, including **expectant mothers in their prenatal period**. It
answers questions about **family planning, pregnancy and antenatal care, the weeks after
birth, and sexual health and safety** — only from a curated, cited corpus, and honestly when
the answer isn't in it.

**Live:** [open the assistant](https://bonga-nami.onrender.com/ai_agent/) — the page is both
the working assistant (widget, bottom right) and the presentation.
**Admin console:** [open the console](https://bonga-nami.onrender.com/) — where the corpus is
uploaded and conversations are reviewed.

A commercial deployment for **Mwihoko Super Jamii**, a clinic serving young women aged 18–26,
including expectant mothers, open-sourced for organisations working with young women in rural
areas and informal settlements in Kenya on family planning and sexual and reproductive health.

Philip K. Kimani · philipkimanidev@gmail.com

---

## What it does

- **Answers from a closed corpus** written for this audience and cited to WHO and Kenya
  Ministry of Health guidance. When the corpus doesn't cover a question, it says so and points
  to a health worker.
- **Speaks as a young mother from her own *mtaa*** — a friend a few steps ahead on the same
  road, not a clinician or a lecturer.
- **Follows her language**, switching between English, Swahili and Sheng mid-conversation
  without asking.
- **Routes harm before anything else.** Sexual or gender-based violence → the national GBV
  helpline **1195** (and **999 / 112** in immediate danger), with care within 72 hours after
  sexual violence. Thoughts of self-harm → Kenya Red Cross **1199**. Pregnancy danger signs →
  a health facility now.
- **Enforces safety at the platform layer**, not only in the prompt: no diagnoses, no
  medicine doses, safeguarding disclosures must be routed, answers must stay grounded.
- **Gives the clinic an admin console** to update the corpus and read conversations — no
  developer or redeploy needed.

## How it works

The browser widget asks the platform for a signed URL, then holds one live connection to the
ElevenLabs agent for the whole conversation: speech recognition, retrieval over the corpus
(`e5_mistral_7b_instruct`), generation (`gemini-2.5-flash`, temperature 0), four custom
guardrails, and speech. The platform — Express and TypeScript in Docker on Render, with
Postgres — mints the signed URL, stores configuration and serves the admin console. It stays
off the audio path.

## Evaluation

An 85-case golden set — questions that must be answered, questions that must be declined,
myths that must be corrected, and safeguarding disclosures that must be routed — scored by
three independent judges from three model vendors. Method, results and limitations are in the
[Evaluation Analysis](docs/Bonga-Nami-Evaluation-Analysis.md); every question and answer is in
the [Evaluation Transcripts](docs/Bonga-Nami-Evaluation-Transcripts.md).

## Reports

The detail lives in [`docs/`](https://github.com/philipkimani/bonga-nami/tree/main/docs):

| Report | What it covers |
|---|---|
| [Technical Documentation](docs/Bonga-Nami-Technical-Documentation.md) | Use case, audience and corpus; the Q&A flow; architecture; prompt and model decisions; guardrails; evaluation; trade-offs |
| [Agent Configuration](docs/Bonga-Nami-Agent-Configuration.md) | The deployed agent: system prompt, guardrails, retrieval and language settings |
| [Evaluation Analysis](docs/Bonga-Nami-Evaluation-Analysis.md) | What was measured, how, what it found, and what the method does not establish |
| [Evaluation Transcripts](docs/Bonga-Nami-Evaluation-Transcripts.md) | Every question and answer in the golden set, in full |
| [Admin console capability analysis](docs/elevenlabs-console-capability-analysis.md) | What the console covers today and what a clinic would need next |

## Repository

| Path | Contents |
|---|---|
| `agent_configs/` | The ElevenLabs agent definition |
| `knowledge-base/` | The corpus, in parts and as the single indexed file |
| `eval/` | Golden set, evaluation harness, results and transcripts |
| `test_configs/` | Regression tests for language switching and staying on topic |
| `packages/` | The platform: server, admin console, chat widget and extensions |

## Running the platform

```bash
pnpm install
pnpm -r build

# schema must exist before first boot
cd packages/clients/platform-client && npx prisma db push

node dist/server.js
```

Required environment: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `PORT`. Everything else — API
keys, agent ID, branding — is configured in the admin console. [`render.yaml`](render.yaml)
deploys it to Render.
