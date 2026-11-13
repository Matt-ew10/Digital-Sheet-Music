# Development

How to set up, check, and deploy the app. How it works is in [architecture.md](architecture.md).

## Workflow

Work happens on `main`. Every push to `main` deploys to GitHub Pages, so check your change before pushing.

## Setup

You need Node.js 24 and pnpm. With Node installed, `corepack enable` provides the pnpm version pinned in `package.json`.

```sh
pnpm install
pnpm dev
```

## Checks

The deploy workflow runs the same commands and stops if either fails.

```sh
pnpm lint
pnpm build
```

`pnpm build` writes the site to `out/`. To check it under the same path GitHub Pages uses, build with the base path set:

```sh
PAGES_BASE_PATH=/Digital-Sheet-Music pnpm build
```

For audio changes, also run the evaluation below. Static checks cannot tell whether a pitch is read correctly.

## Evaluation

Pitch detection and score following are judged by numbers, not by ear. Two scripts run the app's own code over recordings whose notes are known and report how often it is right.

The recordings come from [URMP](https://labsites.rochester.edu/air/projects/URMP.html), released under CC0: chamber music recorded one part at a time, with pitch and note annotations corrected by hand and a MIDI score for each piece. Download `Dataset.tar.gz` (12 GB) from its [Zenodo record](https://zenodo.org/records/5034983) and extract it outside this repository. Do not commit the audio.

Both scripts read every violin, viola, cello, and double bass track and print one row per instrument. Each takes about four minutes or less.

### Pitch

```sh
pnpm evaluate:pitch ~/datasets/urmp/Dataset
```

Each reading is compared with the annotated pitch at the center of its window.

| Column       | Meaning                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| heard        | Of the moments a note was playing, how often any pitch was read              |
| false alarm  | Of the silent moments, how often a pitch was read anyway                     |
| correct      | Of the moments a note was playing, how often the reading was within 50 cents |
| octave       | How often the reading was off by whole octaves                               |
| median error | For correct readings, the typical distance from the true pitch, in cents     |
| 90% error    | For correct readings, the distance 90% of them stay within, in cents         |

Run it before and after a change to `src/settings.ts` or `src/lib/audio/pitch.ts`, and keep the change only if the numbers improve.

### Score following

```sh
pnpm evaluate:follow ~/datasets/urmp/Dataset
```

The true position at each moment is the score note being played, found by matching the annotated notes to the MIDI score. The follower's cursor is compared with it 60 times a second, from the first note to the end of the last.

| Column          | Meaning                                                                   |
| --------------- | ------------------------------------------------------------------------- |
| within one note | How often the cursor was on the right note or one away. The target is 90% |
| exact           | How often the cursor was on the right note                                |
| lost            | How often the cursor was more than three notes away                       |
| median lag      | After a note starts, how long until the cursor reaches it                 |
| 90% lag         | The lag 90% of notes stay within                                          |

Run it before and after a change to `src/lib/score/follow.ts`. It also prints each track's result, which shows where a change helps or hurts.

### The student's recordings

The student recorded each viola excerpt played correctly and with mistakes. These are not public and stay outside the repository, in a folder with the WAV files, a `scores/` folder of MusicXML, and `takes.json`, which names each take's score and whether it was played correctly.

The recordings come without note annotations, so they are made first:

```sh
pnpm evaluate:label ~/datasets/student/viola
```

For each correct take, it aligns the whole recording against the score at once and writes `labels/<take>.txt` (onset, pitch, and length of every note) and `labels/<take> clicks.wav`, the recording with a click at every labeled onset. Listen to the clicks before trusting the numbers: the labels come from the same pitch detector the follower uses, so the follower's accuracy against them is an upper bound.

```sh
pnpm evaluate:student ~/datasets/student/viola
```

It runs the follower on each correct take as recorded and under changed conditions, and prints the same columns as the URMP evaluation per condition, plus, for restarts, how often the cursor is back within one note of the player within a second:

| Condition      | What changes                                                                         |
| -------------- | ------------------------------------------------------------------------------------ |
| mistakes       | The score differs from what was played about once in eight notes: skipped, added, or wrong |
| noise          | White noise 20 or 10 dB below the playing                                            |
| room           | Reverberation lasting 0.8 seconds                                                    |
| quiet          | The recording 24 dB quieter                                                          |
| another player | A different take mixed in 10 dB below                                                |
| tuned to 442   | The recording raised by 8 cents and followed at A4 = 442 Hz                          |
| restarts       | Stopped three times partway through a note, a second of silence, then again from a measure one or two back, as in practice |

Scores are read with a small reader in `scripts/evaluate/musicxml.ts`, not with OSMD as on the score page. It handles what the excerpts use (one tempo, chords, ties, grace notes, repeats without endings); check that a new score's note count matches the score page before relying on it.

## Deployment

`.github/workflows/deploy.yml` builds the site and publishes `out/` to GitHub Pages.

- The base path comes from GitHub Pages itself, so renaming the repository or adding a custom domain needs no code change.
- The repository's Pages source must be set to **GitHub Actions** (Settings → Pages → Build and deployment). Only a repository admin can change it.
- After a push, the new version appears in one to two minutes. Browsers may show the old one for a few minutes more because of caching.

> The site is static. Server features of Next.js (API routes, server actions, cookies, rewrites) fail the build, and so does `cacheComponents`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type: subject`, with a short English subject and no body. For example, `feat: add score picker` or `fix: wrong octave below C4`. Keep one concern per commit.
