# Digital Sheet Music

A web app that shows sheet music to string players in five conditions, built for a study on how score presentation affects neurodivergent musicians.

## Conditions

| #   | Condition       | What the player sees                                                        |
| --- | --------------- | --------------------------------------------------------------------------- |
| 1   | Standard        | The score as printed                                                        |
| 2   | Position cursor | A highlight that follows the note being played, driven by the microphone    |
| 3   | High contrast   | The same layout with stronger colors                                        |
| 4   | Simplified      | Wider spacing between measures and notes                                    |
| 5   | Pitch feedback  | Condition 2, with each played note colored by whether its pitch was in tune |

Scores are MusicXML files. The app does not grade performances; the conductor scores them with a rubric.

## Status

The prototype is built in stages, riskiest first:

1. **Pitch** (done): microphone or recording → pitch, measured against annotated recordings.
2. **Score and cursor** (in progress): the score page renders MusicXML and a cursor follows the player (condition 2), including when they stop and start again from an earlier measure while practicing.
3. **Pitch feedback**: color each note right or wrong (condition 5).
4. **The rest**: high contrast, simplified layout, and recording (conditions 3 and 4).

The first target is single-line string playing: violin, viola, and cello.

## Structure

- Everything runs in the browser. There is no server: the site is a static export hosted on GitHub Pages, and nothing a participant plays leaves their device.
- `src/settings.ts` holds the values the research team tunes by playing, such as the reference pitch. Change them there; no other code needs to change.
- `src/lib/` is the app's logic, with no user interface:
  - `audio/` reads audio from the microphone or a recorded file and detects pitch with [pitchy](https://github.com/ianprime0509/pitchy) (the McLeod pitch method).
  - `score/` reads a MusicXML score's notes from [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org), follows the player through them, and sets up each condition's drawing.
- `src/app/`, `src/components/`, and `src/hooks/` are the app's only page: the toolbar, the score, and the listening session that connects them.
- `public/scores/` holds the experiment's excerpts for violin and viola, and `src/lib/score/list.ts` lists them for the score picker.
- `scripts/` holds development tools: `evaluate/` measures pitch detection and score following against recordings whose notes are known, and `urmp/` reads the URMP dataset.

How the pieces work and why is in [docs/architecture.md](docs/architecture.md). How to run, check, and deploy is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Running locally

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. Browsers allow the microphone only on `localhost` or HTTPS.

The page opens with a short sample. The picker at the top left lists the experiment's excerpts by instrument and level; the folder button next to it opens any other `.musicxml` or `.mxl` file, whose first part is followed.

**Follow** starts the cursor from one of two sources, analyzed the same way: **Microphone** listens to the player, and **Recording** plays an audio file through the speakers. A recording of a passage is the easiest way to repeat the same test without an instrument.

The person running a session:

- picks one of the experiment's conditions (1 to 4; pitch feedback is not built yet). Colors for high contrast and spacing for the simplified layout are in `src/settings.ts`.
- picks the A4 the player tuned to (440 or 442 Hz; participants use 442). The choice is remembered on the device.
- clicks a note before playing to start from its measure, for practicing part of a passage.
- clicks a note while following, or uses the arrows beside the note number or the arrow keys, to put the cursor back on the player when it goes astray.

## Scores

`public/scores/` holds the passages the student chose for the experiment, for violin and viola: 13 violin and 8 viola excerpts, from beginner to advanced. They are public-domain works, transcribed as pitches and rhythms only; fingerings, bowings, dynamics, and other markings from the printed editions are left out. The three pieces Shinichi Suzuki composed are not included.

Still open with the research team:

- The Seitz concertos start with the orchestra's introduction, and the Veracini sonata with six measures of rest.
- The viola Bach Bourrée and Bach Gavotte end inside a repeated section, so the score page plays that section twice (210 and 142 notes) where the player plays it once.
- Some measures still need a proofread against the printed parts.

Cello excerpts are not in yet.

## Constraints

- Only one note at a time. Double stops, chords, and piano are out of scope for now.
- Turn off anything on the device that processes sound, such as noise cancellation. The app already asks the browser not to.
- Play in a quiet room with the microphone close to the instrument.
