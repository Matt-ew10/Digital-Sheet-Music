// Reads the URMP dataset and replays its recordings the way the browser reads audio.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { detector, windowSize, type Reading } from "@/app/audio/pitch";

// The browser reads once per animation frame.
export const frameRate = 60;

// The newest window of samples at every animation frame: reading k ends at k / frameRate seconds.
export function replay(samples: Float32Array, sampleRate: number) {
  const detect = detector(sampleRate);
  const hop = sampleRate / frameRate;
  const readings: (Reading | undefined)[] = [];

  for (let end = 0; end <= samples.length; end += hop) {
    const at = Math.round(end);

    readings.push(
      at < windowSize
        ? undefined
        : detect(samples.subarray(at - windowSize, at)),
    );
  }

  return readings;
}

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

// Whitespace-separated numbers, one row per line. Frames are "<time> <Hz>", with 0 Hz where
// nothing was played; notes are "<onset> <Hz> <duration>", in seconds.
export function parse(text: string) {
  return text
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
}

// Reads mono integer PCM WAV, which is what URMP ships.
export function decode(file: Buffer) {
  let format:
    { channels: number; sampleRate: number; bits: number } | undefined;

  for (let offset = 12; offset + 8 <= file.length;) {
    const id = file.toString("ascii", offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === "fmt ") {
      format = {
        channels: file.readUInt16LE(body + 2),
        sampleRate: file.readUInt32LE(body + 4),
        bits: file.readUInt16LE(body + 14),
      };
    }

    if (id === "data" && format) {
      if (format.channels !== 1) {
        throw new Error(`Expected mono, got ${format.channels} channels`);
      }

      const bytes = format.bits / 8;
      const scale = 2 ** (format.bits - 1);
      const samples = new Float32Array(Math.floor(size / bytes));

      for (let i = 0; i < samples.length; i++) {
        samples[i] = file.readIntLE(body + i * bytes, bytes) / scale;
      }

      return { samples, sampleRate: format.sampleRate };
    }

    offset = body + size + (size % 2);
  }

  throw new Error("Not a WAV file with a fmt and data chunk");
}

const instruments: Record<string, string> = {
  vn: "violin",
  va: "viola",
  vc: "cello",
  db: "double bass",
};
