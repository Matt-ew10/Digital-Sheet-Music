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
- The display does not show single readings, which jump with vibrato, bow noise, and room echo. It takes the readings from the last `smoothingMs`, drops those more than 50 cents from their median (octave errors), and averages the rest in cents. With a ±30 cent vibrato at 6 Hz and 200 ms, the needle moves within ±15 cents and the note name holds; a window of whole vibrato periods (about 330 ms) steadies it further but follows note changes later.
- Notes are named from `referenceHz`, the A4 the ensemble tunes to. Korean orchestras often tune to 442 Hz; with 440 Hz every note would read slightly sharp.
- The `AudioContext` is created synchronously in the click handler. Safari only lets audio start inside the user's gesture.

### Measured accuracy

Measured on 2026-10-21 with `pnpm evaluate` over the URMP string tracks (violin 34, viola 13, cello 11, double bass 3; some recordings appear in two pieces), with the settings above. See [development.md](development.md#evaluation) for what each column means.

| Instrument  | Heard | Correct | Octave errors | Median error | Display correct | Display false alarm |
| ----------- | ----: | ------: | ------------: | -----------: | --------------: | ------------------: |
| Violin      | 91.7% |   89.2% |          1.4% |    0.9 cents |           75.2% |               60.0% |
| Viola       | 77.5% |   67.8% |          6.9% |    1.3 cents |           67.9% |               70.7% |
| Cello       | 71.8% |   64.1% |          3.1% |    1.3 cents |           66.9% |               62.7% |
| Double bass | 85.9% |   81.1% |          3.0% |    1.0 cents |           80.8% |               60.2% |

- When a reading is right, it is very precise. The losses are notes not heard at all and octave errors, both worst on viola and cello.
- The display's false alarms come from holding the last note for `smoothingMs` after it ends, including short gaps between detached notes.

## Known difficulties ahead

These shape stages 2 and 3 and are why recordings of real playing matter more than code.

- **Legato**: a note change without a bow change has almost no change in loudness, so note boundaries must come from pitch changes, not volume.
- **Repeated notes**: the same pitch played twice with only a bow change is the hardest boundary to find.
- **Vibrato**: pitch wobbles five to seven times a second, so judge a note by the median over about 0.15 to 0.2 seconds.
- **Bow attack**: the first tens of milliseconds of a note are noisy and should not be judged.
- **Octave errors**: low cello notes can have stronger overtones than fundamentals. Knowing the expected note from the score lets the search stay near it.
- **Wrong notes must still advance the cursor**: condition 5 needs to show a wrong note, so tracking cannot wait for the right pitch.

The person running a session can correct the cursor by hand. The tracker does not need to be perfect.

## Designs not adopted

| Option                                            | Reason                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A server or Cloudflare in front of Pages          | Nothing needs one. Revisit only for multithreaded WebAssembly, which needs COOP/COEP headers |
| A language or classification model for judgement  | Models cannot take audio, and whether a pitch is in tune is arithmetic on cents              |
| Advancing the cursor only on the expected pitch   | A wrong note would freeze the cursor, so condition 5 could never show it                     |
| Chroma features with online DTW for tracking      | Needed for piano and chords; deferred until single-line strings work                         |
| Automatic grading                                 | The conductor scores performances with a rubric                                              |
| Next.js `cacheComponents` and partial prefetching | Both rely on a server and fail a static export                                               |
