# Architecture

Why the app is built the way it is. Read this before changing how audio is read or how the site is hosted.

## Hosting

The app is a static export on GitHub Pages. There is no server and no database.

- Recordings of participants, some of whom have disabilities, never leave the device. Keeping it that way removes most privacy concerns, so do not add an upload without the research team agreeing.
- Browsers allow the microphone only over HTTPS, which GitHub Pages provides.
- GitHub Pages serves a project site under `/<repository>/`. The deploy workflow reads that path from GitHub and passes it to `next.config.ts` as `PAGES_BASE_PATH`.
- `trailingSlash` is on. Without it, the export writes `tuner.html` next to a `tuner/` folder, and GitHub Pages answers `/tuner` with a redirect to the folder, which has no page.

> Links made with `next/link` get the base path automatically. A file path written by hand (a `fetch` of a score, an AudioWorklet module) does not, and will break on GitHub Pages only.

## Reading pitch

```
microphone or file → AnalyserNode → 2048 samples every frame → pitchy (McLeod) → Hz and clarity → nearest note and cents
```

- The microphone is opened with echo cancellation, noise suppression, and automatic gain control off. They are designed for speech and distort instrument sound.
- Each reading looks at 2048 samples (about 43 ms at 48 kHz). Detection needs about two periods of the lowest note; this holds nearly three periods of C2, the cello's lowest note. A longer window reaches lower notes but reacts later.
- A reading counts as a note only if it is louder than `minVolumeDb` and clearer than `minClarity` (both in `settings.ts`). Otherwise the display shows a dash.
  - Clarity decides most misses. Low strings often read below 0.9 because their overtones are strong; 0.8 recovers most of them at the cost of more readings between notes. Going lower gains little (see the table below).
  - Loudness cannot tell notes from gaps in URMP: frames annotated as silent are about as loud as played ones, because they are mostly releases and ringing. The volume gate only catches true silence.
- The display does not show single readings, which jump with vibrato, bow noise, and room echo. From the readings of the last `smoothingMs`, it takes the median of the newest five as the note now sounding, drops readings more than 50 cents from it, and averages the rest in cents.
  - A new note shows after three readings (50 ms). An earlier version used the median of the whole window and showed the previous note for about 100 ms after each change.
  - Octave errors lasting one or two readings are outvoted. Longer ones show.
  - With a ±30 cent vibrato at 6 Hz, the needle moves within about ±15 cents.
- Notes are named from `referenceHz`, the A4 the ensemble tunes to. Korean orchestras often tune to 442 Hz; with 440 Hz every note would read slightly sharp.
- The `AudioContext` is created synchronously in the click handler. Safari only lets audio start inside the user's gesture.

### Measured accuracy

Measured on 2026-10-21 with `pnpm evaluate` over the URMP string tracks (violin 34, viola 13, cello 11, double bass 3; some recordings appear in two pieces), with the current settings. See [development.md](development.md#evaluation) for what each column means.

| Instrument  | Heard | Correct | Octave errors | Median error | Display correct | Display false alarm |
| ----------- | ----: | ------: | ------------: | -----------: | --------------: | ------------------: |
| Violin      | 96.2% |   92.1% |          2.1% |    0.9 cents |           83.1% |               62.7% |
| Viola       | 87.9% |   73.2% |          9.5% |    1.4 cents |           70.9% |               80.5% |
| Cello       | 90.2% |   76.7% |          5.5% |    1.4 cents |           72.3% |               73.4% |
| Double bass | 95.1% |   88.4% |          3.8% |    1.1 cents |           84.8% |               61.5% |

How each change moved the numbers (correct readings, then display correct):

| Change                              | Violin      | Viola       | Cello       |
| ----------------------------------- | ----------- | ----------- | ----------- |
| Start: clarity 0.9, window median   | 89.2 / 75.2 | 67.8 / 67.9 | 64.1 / 66.9 |
| `minClarity` 0.9 → 0.8              | 92.1 / 74.9 | 73.2 / 67.8 | 76.7 / 69.1 |
| Display anchored on newest readings | 92.1 / 83.1 | 73.2 / 70.9 | 76.7 / 72.3 |

- When a reading is right, it is very precise. What remains is octave errors, worst on viola (mostly an octave too high) and cello (mostly too low).
- The display's false alarms come from holding the last note for `smoothingMs` after it ends, including short gaps between detached notes.

Tried and not kept, each measured on the same tracks:

| Option                                                      | Result                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| 4096-sample window                                          | No more correct readings; false alarms about three times higher      |
| pitchy peak ratio (`clarityThreshold`) 0.95 or 0.8          | Each fixes one instrument's octave errors and adds to the other's    |
| A louder volume gate (-45 dB or more)                       | Drops played notes as fast as it drops readings between notes        |
| Spectral octave check (energy between and at the harmonics) | At most 0.5 points better on any instrument                          |
| Anchoring on the newest three readings                      | 1 to 2.5 points better display, but three-reading octave errors show |

Octave errors need context a single window does not have. In stage 2 the expected note is known from the score, which is the planned fix.

## Following the score

`app/score/follow.ts` turns pitch readings into the position of the note being played. It is developed against URMP with `pnpm evaluate:follow`, and the score page shows it on a rendered score.

```
readings → heard notes → edit-distance alignment against the score → cursor
```

- **Heard notes.** A pitch held for 30 ms (two readings after the first) is a heard note. Note boundaries come from pitch changes, not loudness, because legato changes notes without changing loudness.
- **Alignment.** Each heard note extends an online edit-distance alignment of everything heard so far against the score. A matching note costs 0, a note a whole octave off costs 0.5 (most octave errors are the detector's), a skipped score note costs 1, and an extra heard note costs 1. The cursor goes where the cheapest alignment ends, the nearest such place on ties.
  - Wrong, missed, and extra notes only add cost, so the cursor keeps going and finds the player again once the following notes agree. Condition 5 depends on this: a wrong note must not stop the cursor.
  - The cursor can move back when later notes show it went too far.
- **Repeated notes.** The same pitch again, or an octave error on it, is a new note only after a break in the readings, or once the note has lasted 0.9 of its written length at the player's pace when the score repeats it.
- **Pace.** The follower measures how much slower than written the player goes, from moves of up to three notes on heard notes. Moves it assumed, and long jumps (recoveries), would measure the follower instead of the player and send it running ahead, so they do not count.
- **Overdue notes.** Fast or low passages can leave the detector with nothing usable. While sound continues, a note that has lasted 1.5 times its written length at the player's pace gives way to the next, as if its written pitch had been heard. Written rests are covered too, since a score note's length runs to the next note.

### On the page

The score page draws MusicXML with OpenSheetMusicDisplay (OSMD) and moves OSMD's cursor to the follower's position.

- The notes the follower needs are read by walking OSMD's own cursor through the rendered score, not by a separate MusicXML parser. Each note then knows the cursor step where it starts, so the follower's position maps straight onto the cursor. Only the first part is read.
- Rests, grace notes, and tied continuations start no note; their time goes to the note before. A note's length is the time to the next note at the written tempo (OSMD's tempo is in quarter-note beats per minute).
- OSMD's cursor only steps forward, so moving it back starts over from the beginning.
- The sample score is fetched by a relative URL from the page's own folder, so it also works under GitHub Pages' repository path without the base path.
- The follower is given the audio clock's time with each reading, not a reading count, since screens refresh at different rates.

A synthetic performance of the sample (played at ♩ = 85 against the written 100, with vibrato, a legato repeat, and one wrong note) stayed within one note the whole time and on the exact note 91% of the time. The cursor waits on the note before a wrong one and moves on at the next correct note. Pitch feedback (condition 5) will need it to land on the wrong note instead.

### Measured accuracy

Measured on 2026-10-21 with `pnpm evaluate:follow` over the URMP string tracks with a MIDI score (the same 61 tracks).

| Instrument  | Within one note | Exact |  Lost | Median lag | 90% lag |
| ----------- | --------------: | ----: | ----: | ---------: | ------: |
| Violin      |           93.3% | 78.5% |  4.2% |      50 ms |  100 ms |
| Viola       |           95.6% | 77.2% |  1.0% |      67 ms |  250 ms |
| Cello       |           78.4% | 59.7% | 15.5% |      67 ms |  350 ms |
| Double bass |           94.0% | 80.6% |  5.6% |      67 ms |  133 ms |
| All         |           91.0% | 74.7% |  5.7% |      67 ms |  167 ms |

How each step moved the share of time within one note:

| Version                                                 | Violin | Viola | Cello |  All |
| ------------------------------------------------------- | -----: | ----: | ----: | ---: |
| Look three notes ahead, move on three matching readings |   59.5 |  65.4 |  44.8 | 58.8 |
| Online edit distance over heard notes                   |   80.8 |  86.1 |  79.0 | 82.4 |
| Repeats by written length, pace from heard notes        |   92.5 |  91.9 |  80.3 | 90.2 |
| Overdue notes, pace only from heard moves               |   93.3 |  95.6 |  78.4 | 91.0 |

Cello is below the target. Three tracks account for most of it:

- **Spring** (4%): long repeated E3s whose readings drop out in the middle of each note. Every dropout looks like a bow change, so the cursor counts too many repeats and runs ahead.
- **Pirates** (62%) and **Maria** (95%, but 27–62% in other versions): fast repeated low notes the detector cannot read at all, followed by timing alone.

Tried and not kept, each measured on the same tracks:

| Option                                                          | Result                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Matching the next three notes directly, without an alignment    | Once the player is more than three notes ahead, nothing matches and the cursor never recovers |
| Matching any octave for every note ahead                        | An octave error on one note matched a note several places later and skipped there             |
| Requiring half the written length before a repeat after a break | Spring 4 → 49%, but Pirates 62 → 27%, Maria 95 → 62%, viola 96 → 88%                          |
| Measuring pace only when the pitch changes                      | Same trade: repeats carry most of the pace information in fast repeated passages              |

The person running a session can correct the cursor by hand, so the follower does not need to be perfect.

### Ahead for pitch feedback

- **Vibrato**: pitch wobbles five to seven times a second, so judge a note by the median over about 0.15 to 0.2 seconds.
- **Bow attack**: the first tens of milliseconds of a note are noisy and should not be judged.

## Designs not adopted

| Option                                            | Reason                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A server or Cloudflare in front of Pages          | Nothing needs one. Revisit only for multithreaded WebAssembly, which needs COOP/COEP headers |
| A language or classification model for judgement  | Models cannot take audio, and whether a pitch is in tune is arithmetic on cents              |
| Advancing the cursor only on the expected pitch   | A wrong note would freeze the cursor, so condition 5 could never show it                     |
| Chroma features with online DTW for tracking      | Needed for piano and chords; deferred until single-line strings work                         |
| Automatic grading                                 | The conductor scores performances with a rubric                                              |
| Next.js `cacheComponents` and partial prefetching | Both rely on a server and fail a static export                                               |
