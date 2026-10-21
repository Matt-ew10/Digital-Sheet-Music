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

1. **Tuner** (done): microphone → pitch → note name and cents.
2. **Score and cursor** (in progress): the score page renders MusicXML and a cursor follows the player (condition 2). A hand correction for the person running a session comes next.
3. **Pitch feedback**: color each note right or wrong (condition 5).
4. **The rest**: high contrast, simplified layout, and recording (conditions 3 and 4).

The first target is single-line string playing: violin, viola, and cello.

## Structure

- Everything runs in the browser. There is no server: the site is a static export hosted on GitHub Pages, and nothing a participant plays leaves their device.
- `settings.ts` holds the values the research team tunes by playing, such as the reference pitch. Change them there; no other code needs to change.
- `app/audio/` reads audio from the microphone or a recorded file and detects pitch with [pitchy](https://github.com/ianprime0509/pitchy) (the McLeod pitch method).
- `app/tuner/` shows those readings as note names and cents.
- `app/score/` draws a MusicXML score with [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org) and moves its cursor to follow the player.
- `scripts/evaluate/` measures pitch detection and score following against recordings whose notes are known.

How the pieces work and why is in [docs/architecture.md](docs/architecture.md). How to run, check, and deploy is in [docs/development.md](docs/development.md).

## Running locally

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. Browsers allow the microphone only on `localhost` or HTTPS.

To try either page without an instrument, choose **Play a recording** and pick an audio file. It is analyzed exactly like the microphone, so a recording of a passage is the easiest way to repeat the same test. The score page opens with a short sample (`public/score/sample.musicxml`); **Open MusicXML** loads any other `.musicxml` or `.mxl` file, whose first part is followed.

## Constraints

- Only one note at a time. Double stops, chords, and piano are out of scope for now.
- Turn off anything on the device that processes sound, such as noise cancellation. The app already asks the browser not to.
- Play in a quiet room with the microphone close to the instrument.
