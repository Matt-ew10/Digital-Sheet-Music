# Architecture

Why the app is built the way it is. Read this before changing how audio is read or how the site is hosted.

## Hosting

The app is a static export on GitHub Pages. There is no server and no database.

- Recordings of participants, some of whom have disabilities, never leave the device. Keeping it that way removes most privacy concerns, so do not add an upload without the research team agreeing.
- Browsers allow the microphone only over HTTPS, which GitHub Pages provides.
- GitHub Pages serves a project site under `/<repository>/`. The deploy workflow reads that path from GitHub and passes it to `next.config.ts` as `PAGES_BASE_PATH`.
- `trailingSlash` is on, so a page at `/<name>` is exported as `<name>/index.html`. Without it, the export writes `<name>.html` next to a `<name>/` folder, and GitHub Pages answers `/<name>` with a redirect to the folder, which has no page. The app has one page now, but scores sit in folders beside it.

> Links made with `next/link` get the base path automatically. A file path written by hand (a `fetch` of a score, an AudioWorklet module) does not, and will break on GitHub Pages only.

## Reading pitch

```
microphone or file → AnalyserNode → 2048 samples every frame → pitchy (McLeod) → Hz and clarity → score follower
```

- The microphone is opened with echo cancellation, noise suppression, and automatic gain control off. They are designed for speech and distort instrument sound.
- Each reading looks at 2048 samples (about 43 ms at 48 kHz). Detection needs about two periods of the lowest note; this holds nearly three periods of C2, the cello's lowest note. A longer window reaches lower notes but reacts later.
- A reading counts as a note only if it is louder than `minVolumeDb` and clearer than `minClarity` (both in `src/settings.ts`). Otherwise there is no reading, which the follower treats as silence.
  - Clarity decides most misses. Low strings often read below 0.9 because their overtones are strong; 0.8 recovers most of them at the cost of more readings between notes. Going lower gains little (see the table below).
  - Loudness cannot tell notes from gaps in URMP: frames annotated as silent are about as loud as played ones, because they are mostly releases and ringing. The volume gate only catches true silence.
- Notes are named from the A4 the player tuned to, picked on the score page from `referenceChoices` and remembered on the device (`src/hooks/use-reference.ts`). Participants tune to 442 Hz before the experiment, but the student's practice recordings were made at 440 Hz. With the wrong choice every note reads 8 cents off, more than half of condition 5's 15-cent tolerance. The follower rounds to semitones, so following is not affected. The URMP evaluation always uses 440 Hz, which URMP is tuned to.
- The `AudioContext` is created synchronously in the click handler. Safari only lets audio start inside the user's gesture.

### Measured accuracy

Measured on 2026-10-21 with `pnpm evaluate:pitch` over the URMP string tracks (violin 34, viola 13, cello 11, double bass 3; some recordings appear in two pieces), with the current settings. See [development.md](development.md#evaluation) for what each column means.

| Instrument  | Heard | Correct | Octave errors | Median error |
| ----------- | ----: | ------: | ------------: | -----------: |
| Violin      | 96.2% |   92.1% |          2.1% |    0.9 cents |
| Viola       | 87.9% |   73.2% |          9.5% |    1.4 cents |
| Cello       | 90.2% |   76.7% |          5.5% |    1.4 cents |
| Double bass | 95.1% |   88.4% |          3.8% |    1.1 cents |

`minClarity` 0.9 → 0.8 raised correct readings from 89.2, 67.8, and 64.1% to 92.1, 73.2, and 76.7% (violin, viola, cello).

When a reading is right, it is very precise. What remains is octave errors, worst on viola (mostly an octave too high) and cello (mostly too low).

Tried and not kept, each measured on the same tracks:

| Option                                                      | Result                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| 4096-sample window                                          | No more correct readings; false alarms about three times higher      |
| pitchy peak ratio (`clarityThreshold`) 0.95 or 0.8          | Each fixes one instrument's octave errors and adds to the other's    |
| A louder volume gate (-45 dB or more)                       | Drops played notes as fast as it drops readings between notes        |
| Spectral octave check (energy between and at the harmonics) | At most 0.5 points better on any instrument                          |

Octave errors need context a single window does not have. The score follower has it: it knows the expected note and counts an octave error as a weaker match, not a different note.

## Following the score

`src/lib/score/follow.ts` turns pitch readings into the position of the note being played. It is developed against URMP with `pnpm evaluate:follow` and the student's recordings with `pnpm evaluate:student`, and the score page shows it on a rendered score.

```
readings → odds over (score note, time spent on it) → most likely note → cursor
```

The follower keeps, for every score note and every length of time the player may have spent on it so far, how likely that is (an explicit-duration hidden Markov model). Pitch, time, and jumps are weighed in one place instead of by separate rules:

- **Time.** Every sixtieth of a second, the odds move one slot later. A note is likely to end around its written length at the player's pace (a log-normal spread), never before 30% of it, so the odds cannot run through several short notes toward a later passage with the same pitches.
- **Pitch.** Each reading weighs the odds by how well it fits each note: the written pitch 1, an octave off 0.3 (mostly detector errors), a semitone off 0.15, anything else 0.03. Readings a sixtieth of a second apart mostly repeat each other, so each counts for a quarter of an observation (the fourth root of those numbers). Without that, a sustained wrong note let a far-off note with the right pitch take over within a second.
- **Silence.** A short silence is part of the note, as between detached notes, so time goes on. Sound after a break is likely a new stroke, so the note may end then (chance 0.2), which counts repeated notes. A pause of half a second or more stops the clock: a player who stops is still on the same note.
- **Jumps.** Moving on skips a note with chance 0.05 (a player's mistake). After a pause, the player may go back to the first note of a measure (chance 0.05), most likely one of the last few measures; the beginning of the piece counts as much as two measures back.
- **Pace.** Moving on to the next note measures how much slower than written the player went. Repeated notes do not count: the model's own timing decides when they change, so they would measure the model.

The cursor goes to the most likely note. A wrong note does not stop it: time moves the odds on, so the cursor keeps up with the player. It does not reliably stay on the wrong note, though (see below), which condition 5 will need.

The odds are kept for each note up to nine times its written length (pace at most three times slower, then three times longer). A score of 150 notes is about 20,000 numbers updated 60 times a second.

### On the page

The score page draws MusicXML with OpenSheetMusicDisplay (OSMD) and moves OSMD's cursor to the follower's position.

- The notes the follower needs are read by walking OSMD's own cursor through the rendered score, not by a separate MusicXML parser. Each note then knows the cursor step where it starts, so the follower's position maps straight onto the cursor. Only the first part is read.
- Rests, grace notes, and tied continuations start no note; their time goes to the note before. A note's length is the time to the next note at the written tempo (OSMD's tempo is in quarter-note beats per minute).
- The first note of every measure is a restart position. A repeat sign also starts a new measure position, so the second time through has its own.
- OSMD's cursor only steps forward, so moving it back starts over from the beginning.
- The sample score is fetched by a relative URL from the page's own folder, so it also works under GitHub Pages' repository path without the base path.
- The follower is given the audio clock's time with each reading, not a reading count, since screens refresh at different rates. It moves in fixed steps of a sixtieth of a second, so a 120 Hz screen gives it the same steps.
- The follower reads once per animation frame, so a hidden page or a backgrounded tab (which browsers throttle or stop) stops it. The page must stay on screen during a session.
- **Corrections.** `wait` says which note playing starts from; `seek` puts the player on a note while they play. Both forget the odds elsewhere.
- **Conditions.** Each condition is a set of switches: whether the cursor shows, high-contrast colors, and simplified spacing (`src/lib/score/conditions.ts`). Switching re-renders the score from OSMD's default engraving rules, so nothing from the previous condition carries over. Simplified spacing widens note spacing, fixes the measures per line, and spreads the lines apart; high contrast only changes colors, so the layout matches the standard score as the research plan requires. Black on white is already the highest possible contrast, so condition 3 defaults to white on black; the research team should confirm what "higher contrast" means.

### Measured accuracy

Measured on 2026-11-06 with `pnpm evaluate:follow` over the URMP string tracks with a MIDI score (the same 61 tracks), with a restart position at every measure as on the score page. In parentheses is the previous follower (edit distance over heard notes) in its last, uncommitted version, with one overdue note at a time; the committed version before it measured 91.0% overall.

| Instrument  | Within one note |         Exact |         Lost | 90% lag |
| ----------- | --------------: | ------------: | -----------: | ------: |
| Violin      |   94.1% (93.4%) | 83.6% (78.3%) |  3.8% (3.9%) |   83 ms |
| Viola       |   96.2% (95.3%) | 81.9% (77.0%) |  1.5% (1.3%) |  133 ms |
| Cello       |   90.2% (81.0%) | 74.6% (61.0%) |  4.3% (12.4%) |  167 ms |
| Double bass |   99.9% (94.0%) | 90.4% (80.6%) |  0.0% (5.6%) |  100 ms |
| All         |   94.1% (91.5%) | 81.8% (74.8%) |  3.2% (5.0%) |  100 ms |

URMP is played straight through, so restarts can only hurt there: without them the follower reaches 95.1% overall and 97.4% on viola. Allowing them costs about one point.

The student's recordings, measured with `pnpm evaluate:student` over the 8 viola takes played correctly, against labels made by `pnpm evaluate:label` (see [development.md](development.md#the-students-recordings)). The labels come from the same detector, so "as recorded" is an upper bound.

| Condition                     | Within one note |         Exact |          Lost | 90% lag |
| ----------------------------- | --------------: | ------------: | ------------: | ------: |
| As recorded                   |   99.8% (98.5%) | 88.8% (80.3%) |   0.0% (0.2%) |   67 ms |
| Mistakes (about 1 note in 8)  |   95.6% (90.8%) | 82.8% (70.6%) |   0.6% (1.3%) |   83 ms |
| Restarts (3 per take)         |   97.6% (56.1%) | 87.9% (45.9%) |  2.0% (40.1%) |   67 ms |
| Noise 20 dB below             |   99.8% (98.4%) | 88.0% (78.9%) |   0.0% (0.4%) |   83 ms |
| Noise 10 dB below             |   85.9% (62.6%) | 51.3% (38.9%) |  3.4% (27.1%) |  617 ms |
| Room                          |   99.6% (97.0%) | 85.7% (74.9%) |   0.1% (0.1%) |  100 ms |
| Another player 10 dB below    |   97.0% (93.7%) | 81.4% (68.6%) |   0.7% (1.1%) |  100 ms |
| Tuned to 442                  |   99.8% (97.5%) | 89.7% (80.0%) |   0.0% (0.6%) |   67 ms |

After a restart the cursor is back within one note of the player within a second 92% of the time (22 of 24); the previous follower never found them again.

Targets set for the experiment, and where they stand: within one note at least 95% (student takes yes; URMP violin 94.1% no), lost at most 1% (student takes yes except restarts, 2.0%; URMP violin 3.8% no), 90% lag at most 150 ms (yes, except URMP cello), back within a second after a restart (22 of 24).

On wrong notes alone, the cursor is not yet good enough for condition 5. With isolated wrong notes in the score (about one in twelve, judged from 150 ms into the note), the cursor sat on the wrong note 62% of the time for a semitone up, and 28 to 30% for a whole tone down or a fourth up. It mostly ran ahead (29 to 55%) to a later note with the pitch it heard, since a wrong note that matches the next written pitch looks the same as playing ahead. Judging a note will need its own timing, not only the cursor.

Cello remains the weakest, mostly **Spring** (67%: long repeated E3s whose readings drop out mid-note) and **Pirates** and **Maria** (75% and 88%: fast repeated low notes the detector cannot read). Cello is out of scope until its excerpts arrive.

How the model got there, each measured on both sets:

| Change                                                       | Result                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| First version: readings counted in full, clock stopped in any silence | Played as recorded 99.4%, but mistakes 63% and another player 65%                   |
| No note over before 30% of its length                        | Mistakes 63 → 82%, another player 65 → 92%                                                 |
| Each reading counts for a quarter                            | Mistakes 82 → 96%                                                                          |
| Restarts weighted toward the last few measures               | Back within a second after a restart 58 → 96%                                              |
| Time runs through short silences; a break is a likely new stroke | URMP without restarts 93.5 → 95.1%: detached repeated notes were counted too slowly    |
| Restarts only after half a second, chance 0.05               | URMP with restarts 89.9 → 94.1%                                                            |

Tried and not kept:

| Option                                                             | Result                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Readings counted in full or at half                                | Higher exact share, but wrong notes pulled the cursor to later passages (mistakes 82–94%)                  |
| Hearing the next written note when the sound repeats at its period | Tried on the previous follower: URMP 91.0 → 80.6%, since other notes' harmonics share periods with it       |
| Restarts after a 1-second pause                                    | Most practice restarts are missed                                                                           |
| A higher restart chance (0.1 to 0.5)                               | Slightly faster recovery, but viola on URMP drops to 84–95% from false restarts at rests                   |

The person running a session can correct the cursor by hand, so the follower does not need to be perfect.

### Ahead for pitch feedback

- **Vibrato**: pitch wobbles five to seven times a second, so judge a note by the median over about 0.15 to 0.2 seconds.
- **Bow attack**: the first tens of milliseconds of a note are noisy and should not be judged.
- **Confidence**: the follower knows how likely its note is. Judge a note only when that is high, so that a correct note is not marked wrong.
- **Which note was wrong**: the cursor often runs ahead on a wrong note (above), so the judge should place a held pitch by the time it was played, not by where the cursor is a moment later.

## Designs not adopted

| Option                                            | Reason                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A server or Cloudflare in front of Pages          | Nothing needs one. Revisit only for multithreaded WebAssembly, which needs COOP/COEP headers |
| A language or classification model for judgement  | Models cannot take audio, and whether a pitch is in tune is arithmetic on cents              |
| Advancing the cursor only on the expected pitch   | A wrong note would freeze the cursor, so condition 5 could never show it                     |
| Rules stacked on an edit-distance alignment       | Each fix for one case broke another; replaced by one model that weighs pitch, time, and jumps |
| Chroma features with online DTW for tracking      | Needed for piano and chords; deferred until single-line strings work                         |
| Automatic grading                                 | The conductor scores performances with a rubric                                              |
| Next.js `cacheComponents` and partial prefetching | Both rely on a server and fail a static export                                               |
