# Digital Sheet Music

A web app that shows sheet music to string players in five conditions, built for a study on how score presentation affects neurodivergent musicians.

## Conditions

| #   | Condition          | What the player sees                                                               |
| --- | ------------------ | ---------------------------------------------------------------------------------- |
| 1   | Standard           | The score as printed                                                               |
| 2   | Position cursor    | A highlight that follows the note being played, driven by the microphone           |
| 3   | Colored background | The same layout on a page tinted a light color, like colored paper                 |
| 4   | Simplified         | Wider spacing between notes, adjustable for each player, and further between lines |
| 5   | Pitch feedback     | Notes played more than 25 cents out of tune turn red, without the position cursor  |

Scores are MusicXML files. The app does not grade performances; the conductor scores them with a rubric.

## Status

The prototype is built in stages, riskiest first:

1. **Pitch** (done): microphone or recording → pitch, measured against annotated recordings.
2. **Score and cursor** (done): the score page renders MusicXML and a cursor follows the player, including when they stop and start again from an earlier measure while practicing. The person running a session can put the cursor back by hand.
3. **Conditions** (done): all five conditions above. Still to confirm with the research team: the pitch tolerance, whose marks have not yet been checked by ear.
4. **Recording and devices** (next): record each performance in the app for the conductor's rubric, and check the app on the experiment's devices, iPad Safari in particular.

The first target is single-line string playing: violin, viola, and cello.

## Structure

- Everything runs in the browser. There is no server: the site is a static export hosted on GitHub Pages, and nothing a participant plays leaves their device.
- `src/settings.ts` holds the values the research team tunes by playing, such as the reference pitch. Change them there; no other code needs to change.
- `src/lib/` is the app's logic, with no user interface:
  - `audio/` reads audio from the microphone or a recorded file and detects pitch with [pitchy](https://github.com/ianprime0509/pitchy) (the McLeod pitch method).
  - `score/` reads a MusicXML score's notes from [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org), follows the player through them, and sets up each condition's drawing.
- `src/app/`, `src/components/`, and `src/hooks/` are the app's only page: the toolbar, the score, and the listening session that connects them. The toolbar's buttons and menus are [shadcn/ui](https://ui.shadcn.com) components on [Base UI](https://base-ui.com), in `src/components/ui/`.
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

The bar at the top sets up what the player sees: the score and the A4 on the left, the condition and its options on the right. The bar at the bottom runs the playing: following, the note to start from, the tempo, and the metronome.

**Follow** starts the cursor from one of two sources, analyzed the same way: **Microphone** listens to the player, and **Recording** plays an audio file through the speakers. A recording of a passage is the easiest way to repeat the same test without an instrument.

The person running a session:

- picks one of the experiment's five conditions. The page colors for condition 3, the spacing for the simplified layout, and the pitch tolerance for pitch feedback are in `src/settings.ts`.
- sets the tempo before following, in the beats the player counts (a half note in cut time). A score starts at its printed tempo. The metronome button next to it clicks at that tempo, with the first beat of each measure louder, until it is pressed again.
- in condition 3, picks the page color, and in the simplified layout widens or narrows the note spacing for the player, with the controls that appear left of the condition. Wider spacing puts fewer measures on a line.
- in pitch feedback, leaves the red marks on the score after stopping, so the player can look them over; following again clears them.
- picks the A4 the player tuned to (440 or 442 Hz; participants use 442). The choice is remembered on the device.
- clicks a note before playing to start from its measure, for practicing part of a passage.
- clicks a note while following, or uses the arrows beside the note number or the arrow keys, to put the cursor back on the player when it goes astray.

## Scores

`public/scores/` holds the passages the student chose for the experiment, for violin and viola: 15 violin and 10 viola excerpts, from beginner to advanced. They are public-domain works, transcribed as pitches and rhythms only; fingerings, bowings, dynamics, and other markings from the printed editions are left out. The three pieces Shinichi Suzuki composed were replaced with Bach's Minuets No. 1 and No. 3 for violin and Gossec's Gavotte and Brahms's Waltz for viola.

The beginner excerpts also carry fingerings, bow directions, and slurs. To keep them independent of the printed editions, they were written by an agent that never saw those editions, from first-position fingering and common bowing practice (down-bow on strong beats, up-bow pickups, slurs that keep the bow even): no public-domain edition could be checked against our excerpts note for note. They are a starting point for the research team to correct. The intermediate and advanced excerpts are pitches and rhythms only.

Repeats are written out once: players may play a passage as many times as they like, so the excerpts leave out the printed repeat signs. The Seitz concertos keep the orchestra's introduction and the Veracini sonata its six opening measures of rest, as printed.

Some measures still need a proofread against the printed parts.

Cello excerpts are not in yet.

## Constraints

- Only one note at a time. Double stops, chords, and piano are out of scope for now.
- Turn off anything on the device that processes sound, such as noise cancellation. The app already asks the browser not to.
- Play in a quiet room with the microphone close to the instrument.
