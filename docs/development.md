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

Each instrument has two rows:

- **raw**: single readings, compared with the annotated pitch at the center of each reading. This measures the detector.
- **display**: what the tuner shows at each moment, compared with the pitch of the note being played. This includes the delay of `smoothingMs`.

| Column       | Meaning                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| heard        | Of the moments a note was playing, how often any pitch was read              |
| false alarm  | Of the silent moments, how often a pitch was read anyway                     |
| correct      | Of the moments a note was playing, how often the reading was within 50 cents |
| octave       | How often the reading was off by whole octaves                               |
| median error | For correct readings, the typical distance from the true pitch, in cents     |
| 90% error    | For correct readings, the distance 90% of them stay within, in cents         |

Run it before and after a change to `settings.ts` or `app/tuner/pitch.ts`, and keep the change only if the numbers improve.

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

Run it before and after a change to `app/score/follow.ts`. It also prints each track's result, which shows where a change helps or hurts.

## Deployment

`.github/workflows/deploy.yml` builds the site and publishes `out/` to GitHub Pages.

- The base path comes from GitHub Pages itself, so renaming the repository or adding a custom domain needs no code change.
- The repository's Pages source must be set to **GitHub Actions** (Settings → Pages → Build and deployment). Only a repository admin can change it.
- After a push, the new version appears in one to two minutes. Browsers may show the old one for a few minutes more because of caching.

> The site is static. Server features of Next.js (API routes, server actions, cookies, rewrites) fail the build, and so does `cacheComponents`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type: subject`, with a short English subject and no body. For example, `feat: add tuner page` or `fix: wrong octave below C4`. Keep one concern per commit.
