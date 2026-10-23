# Voice notes into the work record

An idea of 23 October 2026 (Cloudflare features worth using), not grilled yet. It's one of three,
with [email-to-order.md](email-to-order.md) and [service-report-pdf.md](service-report-pdf.md).

## Problem

Engineers write the work record on a phone, often with dirty hands or gloves on. So the notes are
short or missing, and the office calls them to ask what was done. Speaking is quicker than typing.

## Idea

In the engineer portal (`(field)/my`), a microphone button on an order records a voice note. On the
server, **Workers AI** transcribes it (Whisper) and a small model turns the transcript into a draft
of the work record: what was done, the parts used, and any follow-up. The engineer reads the draft,
corrects it and saves it. Nothing is saved that they haven't confirmed.

## Design

### Recording

- `MediaRecorder` in the browser (Opus in WebM, or AAC on iOS Safari), at most about three minutes.
  A large, thumb-sized button. The recording shows as a waveform with play and delete.
- Recording works offline: the audio stays in IndexedDB until it's uploaded. The
  [service worker plan](service-worker-swr.md) would carry the retry.
- Upload through a `forEngineers` command scoped by `await engineerOrder(ref)`. The audio goes to R2
  (`VOICE_NOTES` bucket) under the tenant and order, and is deleted after N days (an R2 lifecycle
  rule).

### Understanding

- **Transcription:** Workers AI's Whisper model, in the language of the engineer's locale (nl or en).
  The transcript is kept with the note, so the original words are never lost.
- **Structuring:** a small instruction model with JSON output gets the transcript, the order's units
  and, with the materials module, the tenant's materials list. It returns:
  - the work done (text)
  - the parts used, matched to materials by name, with quantities
  - a follow-up, if one was mentioned ("needs a new pump next visit")
  - the unit it was about, among the order's units

  Like intake, it never invents ids: anything not among the candidates is dropped or shown as free
  text.

- Slow work runs outside the request: the upload returns at once, and the draft arrives through the
  portal's feed of changes once it's ready. A Workflow does transcription then structuring, with
  retries.

### Confirming

- The draft opens in the work record's form with the suggested fields marked as suggestions. Parts go
  through the materials module's form slot, like parts added by hand.
- Saving goes through the existing work record saves (notes, materials), so the activity log, stock
  movements and the bell work as they do today. The note records that it came from a voice note.
- A follow-up becomes a suggestion to the office: a draft order, or a note on the unit, never a new
  order by itself.

## Open questions

- Keep the audio at all after transcription? It helps when the transcript is wrong, but it's
  personal data. Default: keep it 30 days.
- How good is Whisper on Dutch technical words and brand names in a noisy boiler room? Test it on
  real recordings before building the structuring.
- Is this a module (`voice-notes`) or part of the engineer portal? Probably a module: it costs
  money per minute, so a tenant should be able to switch it off.

## Steps

1. Record and upload, with the audio playable on the order (office and portal). No AI yet. This is
   useful by itself.
2. Transcription, shown as the note's text.
3. Structuring into a draft of the work record.
4. Parts matched to materials (with the materials module).

## Tests

- Server specs with a stubbed model: an engineer can't upload to another engineer's order, nor
  North's engineer to South's; made-up material ids are dropped.
- E2e in the engineer portal: upload a fixture audio file, see the draft (stubbed model), confirm it
  and find the note in the office.
