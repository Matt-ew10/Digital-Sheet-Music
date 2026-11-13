// Finds the string tracks of the URMP dataset.
import { readdir } from "node:fs/promises";
import { join } from "node:path";

// Each URMP piece folder holds AuSep_<part>_<instrument>_<piece>.wav with F0s_ and Notes_
// annotations, and one Sco_ MIDI score whose tracks follow the part order.
export async function tracks(root: string) {
  const found = [];

  for (const piece of (await readdir(root)).toSorted()) {
    const files: string[] = await readdir(join(root, piece)).catch(() => []);
    const score = files.find((file) => file.endsWith(".mid"));

    for (const file of files) {
      const match = file.match(/^AuSep_(\d+)_([a-z]+)_(.+)\.wav$/);
      const instrument = match && instruments[match[2]];

      if (!match || !instrument) continue;

      const name = `${match[1]}_${match[2]}_${match[3]}`;

      found.push({
        name,
        instrument,
        part: Number(match[1]) - 1,
        audio: join(root, piece, file),
        frames: join(root, piece, `F0s_${name}.txt`),
        notes: join(root, piece, `Notes_${name}.txt`),
        score: score && join(root, piece, score),
      });
    }
  }

  if (found.length === 0) throw new Error(`No URMP string tracks in ${root}`);
  return found;
}

const instruments: Record<string, string> = {
  vn: "violin",
  va: "viola",
  vc: "cello",
  db: "double bass",
};
