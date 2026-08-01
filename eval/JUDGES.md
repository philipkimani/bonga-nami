# Judge comparison — three independent raters

The generator is **`gemini-2.5-flash`**. Judges were run over the **same 85 saved
replies**, so the judge is the only variable — a precondition for the agreement and
self-preference numbers below meaning anything.

| Judge | Model | Provider | Independent of generator? |
|---|---|---|---|
| `claude` | `claude-sonnet-4-5` | Anthropic | yes |
| `gpt` | `gpt-4.1` | OpenAI | yes |
| `gemini` | `gemini-2.5-flash` | Google | **no — same model as the generator** |

ElevenLabs brokers all three on one API key, so an independent judge needed no
additional credential. An earlier version of this evaluation wrongly assumed it did.

## Scores by judge

| Judge | Groundedness (in-corpus) | Myth correction |
|---|---|---|
| `claude` | 98% (39/40) | 100% (13/13) |
| `gpt` | 100% (40/40) | 100% (14/14) |
| `gemini` | 100% (40/40) | 100% (14/14) |

## Inter-rater agreement

| Pair | Cases | Agreement | Disagreed on |
|---|---|---|---|
| `claude` vs `gpt` | 53 | **98%** | IC28 |
| `claude` vs `gemini` | 53 | **98%** | IC28 |
| `gpt` vs `gemini` | 54 | **100%** | — |

All three judges agree on **53/54** cases.

## Self-preference measurement

The `gemini` judge is the same model that produced the answers. If self-preference bias were operating, it should rate that output more generously than the two independent judges.

- Gemini (self) groundedness: **100%**
- Claude + GPT (independent) groundedness: **99%**
- Difference: **+1.2 points**

On this set the difference is negligible, which is evidence the earlier caveat was conservative rather than wrong to state.

## Cases the judges disagreed on

These are the genuinely uncertain verdicts — worth reading before quoting any single number.

**IC28** — Why does bleeding happen every month?

- `claude`: **False** — Answer adds unsupported detail about lining becoming soft and shedding gently
- `gpt`: **True** — All claims about monthly bleeding are supported by the corpus.
- `gemini`: **True** — All claims are directly supported by the corpus.

> [warmly] That's a really good question! Every month, your body gets ready in case you become pregnant. The lining of your uterus, which is also  called your womb, gets thick and soft. If you don't become pregnant, your body doesn't need that lining, so it gently sheds it. That shedding is what we ca
