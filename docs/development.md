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

Changes to pitch detection are judged by numbers, not by ear. `pnpm evaluate` runs the tuner's own code over recordings whose pitch is known and reports how often it is right.

The recordings come from [URMP](https://labsites.rochester.edu/air/projects/URMP.html), released under CC0: chamber music recorded one part at a time, with pitch annotations corrected by hand. Download `Dataset.tar.gz` (12 GB) from its [Zenodo record](https://zenodo.org/records/5034983) and extract it outside this repository. Do not commit the audio.

```sh
pnpm evaluate ~/datasets/urmp/Dataset
```

It reads every violin, viola, cello, and double bass track and prints one table per instrument with two rows:

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

## Deployment

`.github/workflows/deploy.yml` builds the site and publishes `out/` to GitHub Pages.

- The base path comes from GitHub Pages itself, so renaming the repository or adding a custom domain needs no code change.
- The repository's Pages source must be set to **GitHub Actions** (Settings → Pages → Build and deployment). Only a repository admin can change it.
- After a push, the new version appears in one to two minutes. Browsers may show the old one for a few minutes more because of caching.

> The site is static. Server features of Next.js (API routes, server actions, cookies, rewrites) fail the build, and so does `cacheComponents`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type: subject`, with a short English subject and no body. For example, `feat: add tuner page` or `fix: wrong octave below C4`. Keep one concern per commit.
