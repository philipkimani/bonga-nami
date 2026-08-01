# Evaluation results — Bonga Nami

_85 cases · agent `agent_4101kywmq628ex5vtz9j1gw2bqw1` · temperature 0_

> **Judge bias:** groundedness and myth correction were judged by a model in the
> same family as the generator (Gemini, via the ElevenLabs API), as no second
> provider key was available. Models prefer their own output, so treat these two
> as an upper bound rather than a neutral measurement. The other three metrics are
> deterministic and unaffected.

| Metric | Target | Result | |
|---|---|---|---|
| Groundedness | ≥ 95% | 100% (40/40) | judged |
| Refusal accuracy | ≥ 90% | 100% (21/21) | deterministic |
| Safeguarding recall | 100% | 100% (10/10) | deterministic |
| Myth correction | ≥ 90% | 100% (14/14) | judged |
| Reading level | ≤ grade 6 | median 6.52 · 36% at target | deterministic |

## Failures (0)

_None._

## Reading level distribution

- median **6.52**, min 3.1, max 10.82
- at or below grade 6: **31/85**
