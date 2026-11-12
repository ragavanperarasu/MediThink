# Layer 4 · Ask (the Assistant)

**Job:** answer questions about the profile's reports, from those reports
only, with every figure linked back to where it came from.

**Model:** one call per question.
**Code:** [`server/src/lib/ask.js`](../server/src/lib/ask.js) (scopes, what is
sent), [`server/src/routes/ask.js`](../server/src/routes/ask.js) (`/api/ask`),
`QA_PROMPT` and `MULTI_QA_PROMPT` in [`prompts.js`](../server/src/lib/prompts.js).

## What a question can be about

The Assistant page has one picker. Each choice keeps its own thread.

| Scope | Chosen by | Answers from |
|---|---|---|
| `all` | "All reports" (the default) | Every report of the profile that has been read |
| `type:<kind>` | A kind, e.g. "Blood test", "ECG" — only kinds the profile has | Every report of that kind |
| `doc:<uploadId>:<n>` | The **Assistant** button on a report's page | That one report only |

## Answer language

A button at the top right of the Assistant picks the language answers come
back in: English or one of the ten most spoken languages of India — Hindi,
Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu, Kannada, Odia, Malayalam
([`languages.js`](../server/src/lib/languages.js)). The question can be asked
in any language. The choice is remembered per profile in the browser.

The model is told, just before the question: write the whole answer in that
language and script; keep test names as printed (the local word may follow in
brackets), numbers, units, ranges and citation tags exactly; translate table
headings; write a Status cell as one word from a fixed list for that language
(e.g. Tamil குறைவு / அதிகம் / இயல்பு / அசாதாரணம்), which the page colours like
Low / High / Normal / Abnormal; and translate the food-ideas note.

Report summaries are still written in English.

## Voice conversation

With the message box empty, its right-hand button opens a voice conversation
([`VoiceMode.jsx`](../client/src/components/VoiceMode.jsx)); once something is
typed, the button is Send. In voice mode:

1. The browser listens (SpeechRecognition) in the chosen answer language.
2. When the person stops talking, the question is sent like a typed one, with
   `mode: "voice"`: the model is asked for two to four short spoken sentences —
   no tables or lists — and to say when the full answer is in the chat.
3. The answer is read aloud (speechSynthesis) line by line as it streams in,
   with a voice for its script.
4. Then it listens again. Tapping the circle interrupts: while it speaks, it
   stops and listens; while it listens, it sends what it has heard.

Both turns are stored in the thread like any other, so they show in the chat
afterwards. In Chrome, listening is done by the browser's own speech service.

## Listening (speech to text)

The mic in the message box and voice mode listen with OpenAI's
`gpt-transcribe` through `POST /api/stt` (multipart: `audio`,
`language`) ([`stt.js`](../server/src/routes/stt.js),
[`listen.js`](../client/src/lib/listen.js)):

1. The question is recorded on the device (MediaRecorder: webm/opus, or mp4
   on Safari).
2. The end of speech is found from the mic level: after a noise floor is
   measured, recording stops 1.2 s after the speaker goes quiet, after 8 s if
   nothing is said, or at 30 s. Tapping again stops it at once.
3. The recording is sent and comes back as text. The answer language is given
   as a hint (except English and Odia, which are left to detection), with a
   list of common report terms so they are spelled right.

Unlike the browser's own listening, the words appear only after the speaker
stops. Measured: about 1–1.6 s to turn a 2–4 s question into text. Cost is
about $0.0045 per minute of audio. `STT_MODEL=off` in `server/.env` switches back
to the browser's own speech recognition, which is also the fallback when the
server has no key.

## The read-aloud voice

Speak (under each answer) and voice mode read with OpenAI's
`gpt-4o-mini-tts` through `POST /api/tts { text, language }`
([`tts.js`](../server/src/routes/tts.js)), so the voice is the same on every
phone. To start quickly:

- The answer is read **sentence by sentence**; in voice mode each sentence is
  sent as soon as the model has written it. The first piece is cut short
  (about 90 characters).
- The audio comes back as **raw PCM** (16-bit, mono, 24 kHz) and is played
  **as it streams in** (Web Audio), not after a whole file has downloaded.
- Up to three sentences are fetched ahead of the one playing, so they play
  back to back.
- Each sentence's audio is kept in a memory cache (about 40 MB), so replaying
  costs nothing.

Measured: about 1 second from text to first sound; in voice mode, about 1.3 s
from the end of an English question to the first word.

The voice is told the answer language and to speak calmly and clearly. If the
voice is not set up or fails, the device's own voice (speechSynthesis) reads
instead. Settings in `server/.env`: `TTS_MODEL` (default `gpt-4o-mini-tts`;
`tts-1` also works; `off` uses only the device voice) and `TTS_VOICE`
(default `nova`). The answer text goes to OpenAI to be voiced, as the question
already does.

## What is sent with each question

**One report** (`doc:`):

| # | Message | Content |
|---|---|---|
| 1 | System: rules | `QA_PROMPT`: answer only from the document; say "That is not in this report" rather than guess; copy figures exactly; cite every figure as `[C12]`; explain, never diagnose or recommend treatment or medicine; when asked what to eat, food ideas under the same rules as the summary (Layer 2), never medicine; a Markdown table for three or more values or one value over time |
| 2 | System: the report | What kind of report it is, then only this report's own blocks (its pages), each tagged `[C12 · page 2 · table]` |
| 3 | The thread | The last 12 messages, i.e. 6 questions with their answers |
| 4 | System: language | The answer-language instruction above |
| 5 | The question | |

**Several reports** (`all`, `type:`):

| # | Message | Content |
|---|---|---|
| 1 | System: rules | `MULTI_QA_PROMPT`: the same rules, "That is not in these reports", list a figure over time by date rather than calculating changes, cite each figure's report as `[D3]` |
| 2 | System: the reports | Newest first, each under `=== D3: Complete Blood Count · Blood test · 12 Oct 2026 ===`: its summary (block citations removed) and its results — name, value, unit, the report's range, and whether it was flagged. At most 150,000 characters; older reports past that are left out, with a note saying so |
| 3 | The thread | The last 12 messages |
| 4 | System: language | The answer-language instruction |
| 5 | The question | |

Not sent: the PDF or images.

## Memory

- **One thread per profile and scope**, in MongoDB collection
  `conversations` (`{ account, profile, scope, messages[] }`). It survives
  reloads and restarts.
- **The model sees the last 6 exchanges.** Older ones are still stored and
  shown, but not sent.
- **Clearing** deletes that scope's thread (`DELETE /api/ask?scope=…`).
- Deleting a report deletes its own `doc:` threads; deleting a profile
  deletes all of its threads.
- New turns are added with `$push`, so two questions sent close together
  cannot overwrite each other.

## API

| Call | Does |
|---|---|
| `GET /api/ask?scope=…` | The thread, plus what its citations point at (`chunks` for one report, `sources` D1… for several) |
| `POST /api/ask` `{ scope, question, language }` | Answers one question, **streamed** as it is written (one JSON event per line: `delta` with the next piece, then `done` with the stored turns, or `error`). The chat shows the answer typing out. Closing the page mid-answer stops the model and stores nothing |
| `DELETE /api/ask?scope=…` | Clears the thread |

## Citations

- **One report:** `[C83]` becomes a **p.6** pin. Clicking it opens the report
  with block C83 highlighted on its PDF.
- **Several reports:** `[D3]` becomes a pin showing the report's date (its
  full name on hover).
  Clicking it opens that report.
