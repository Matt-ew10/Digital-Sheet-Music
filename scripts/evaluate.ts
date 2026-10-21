// Measures the tuner against the string tracks of the URMP dataset, whose pitch
// annotations were corrected by hand. Usage: pnpm evaluate <URMP Dataset folder>
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { detector, steady, windowSize, type Reading } from "@/app/tuner/pitch";
import settings from "@/settings";

// The browser reads once per animation frame.
const frameRate = 60;

const instruments: Record<string, string> = {
  vn: "violin",
  va: "viola",
  vc: "cello",
  db: "double bass",
};

async function main(root?: string) {
  if (!root) throw new Error("Usage: pnpm evaluate <URMP Dataset folder>");

  const totals = new Map<string, { raw: Score; display: Score }>();

  for (const track of await tracks(root)) {
    const { samples, sampleRate } = decode(await readFile(track.audio));
    const frames = parse(await readFile(track.frames, "utf8"));
    const notes = parse(await readFile(track.notes, "utf8"));
    const result = evaluate(samples, sampleRate, frames, notes);
    const total = totals.get(track.instrument) ?? {
      raw: new Score(),
      display: new Score(),
    };

    total.raw.add(result.raw);
    total.display.add(result.display);
    totals.set(track.instrument, total);
    console.log(
      `${track.name}: ${percent(result.display.correct, result.display.voiced)} correct`,
    );
  }

  console.table(
    [...totals].flatMap(([instrument, total]) => [
      { track: `${instrument} raw`, ...total.raw.summary() },
      { track: `${instrument} display`, ...total.display.summary() },
    ]),
  );
}

// The browser reads the newest window once per animation frame and shows a summary of the
// readings from the last `smoothingMs`. Both are scored at every annotated frame.
// - Raw readings measure the detector: the reading whose window is centered on the frame,
//   compared with the frame's pitch.
// - The display measures what the player sees: what is on screen at that moment, compared with
//   the pitch of the note being played, so its delay counts as error. It shows the center of
//   vibrato on purpose, so the note's pitch is the target, not the frame's.
function evaluate(
  samples: Float32Array,
  sampleRate: number,
  frames: number[][],
  notes: number[][],
) {
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

  const span = Math.round((settings.smoothingMs / 1000) * frameRate);
  const half = windowSize / 2 / sampleRate;
  const last = readings.length - 1;
  const raw = new Score();
  const display = new Score();

  for (const [time, hz] of frames) {
    const centered = Math.min(Math.round((time + half) * frameRate), last);
    const frame = Math.min(Math.floor(time * frameRate), last);
    const recent = readings
      .slice(Math.max(0, frame - span + 1), frame + 1)
      .filter((reading) => reading !== undefined);
    const note = notes.find(
      ([onset, , duration]) => time >= onset && time < onset + duration,
    );

    raw.count(hz, readings[centered]?.hz);
    display.count(
      note?.[1] ?? 0,
      recent.length ? steady(recent.map((reading) => reading.hz)) : undefined,
    );
  }

  return { raw, display };
}

class Score {
  voiced = 0;
  unvoiced = 0;
  reported = 0;
  falseAlarms = 0;
  correct = 0;
  octaves = 0;
  errors: number[] = [];

  // `hz` is 0 where nothing was played; `estimate` is undefined where nothing was read.
  count(hz: number, estimate?: number) {
    if (hz === 0) {
      this.unvoiced++;
      if (estimate !== undefined) this.falseAlarms++;
      return;
    }

    this.voiced++;
    if (estimate === undefined) return;

    const cents = 1200 * Math.log2(estimate / hz);
    const octave = Math.round(cents / 1200);

    this.reported++;

    if (Math.abs(cents) < 50) {
      this.correct++;
      this.errors.push(Math.abs(cents));
    } else if (octave !== 0 && Math.abs(cents - octave * 1200) < 50) {
      this.octaves++;
    }
  }

  add(other: Score) {
    this.voiced += other.voiced;
    this.unvoiced += other.unvoiced;
    this.reported += other.reported;
    this.falseAlarms += other.falseAlarms;
    this.correct += other.correct;
    this.octaves += other.octaves;
    this.errors.push(...other.errors);
  }

  summary() {
    const errors = this.errors.toSorted((a, b) => a - b);

    return {
      "heard (%)": percent(this.reported, this.voiced),
      "false alarm (%)": percent(this.falseAlarms, this.unvoiced),
      "correct (%)": percent(this.correct, this.voiced),
      "octave (%)": percent(this.octaves, this.voiced),
      "median error (cents)": errors[Math.floor(errors.length / 2)]?.toFixed(1),
      "90% error (cents)": errors[Math.floor(errors.length * 0.9)]?.toFixed(1),
    };
  }
}

// Each URMP piece folder holds AuSep_<n>_<instrument>_<piece>.wav with F0s_ and Notes_ annotations.
async function tracks(root: string) {
  const found = [];

  for (const piece of (await readdir(root)).toSorted()) {
    const files = await readdir(join(root, piece)).catch(() => []);

    for (const file of files) {
      const match = file.match(/^AuSep_(\d+)_([a-z]+)_(.+)\.wav$/);
      const instrument = match && instruments[match[2]];

      if (!match || !instrument) continue;

      const name = `${match[1]}_${match[2]}_${match[3]}`;

      found.push({
        name,
        instrument,
        audio: join(root, piece, file),
        frames: join(root, piece, `F0s_${name}.txt`),
        notes: join(root, piece, `Notes_${name}.txt`),
      });
    }
  }

  if (found.length === 0) throw new Error(`No URMP string tracks in ${root}`);
  return found;
}

// Whitespace-separated numbers, one row per line. Frames are "<time> <Hz>", with 0 Hz where
// nothing was played; notes are "<onset> <Hz> <duration>", in seconds.
function parse(text: string) {
  return text
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
}

// Reads mono integer PCM WAV, which is what URMP ships.
function decode(file: Buffer) {
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
      if (format.channels !== 1)
        throw new Error(`Expected mono, got ${format.channels} channels`);

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

function percent(part: number, whole: number) {
  return whole ? ((part / whole) * 100).toFixed(1) : "-";
}

void main(process.argv[2]);
