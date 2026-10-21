// Writes a MusicXML score next to each URMP string part, from the piece's MIDI score, so a
// recording can be followed on the score page. Usage: pnpm urmp:musicxml <URMP Dataset folder>
//
// The MIDI scores were exported from notation software with playback timing: onsets sit on a
// grid, but lengths are shortened and ornaments are played slightly early. Onsets are snapped
// to a grid fine enough for sixteenths and triplets, and each note lasts until the next onset
// unless it clearly stopped earlier.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Midi } from "@tonejs/midi";
import { tracks } from "./evaluate/urmp";

async function main(root?: string) {
  if (!root) throw new Error("Usage: pnpm urmp:musicxml <URMP Dataset folder>");

  for (const track of await tracks(root)) {
    if (!track.score) continue;

    const midi = new Midi(await readFile(track.score));
    const parts = midi.tracks.filter((part) => part.notes.length > 0);
    const instrument = track.name.split("_")[1];
    const piece = track.name.split("_").slice(3).join(" ");
    const file = join(dirname(track.audio), `Sco_${track.name}.musicxml`);

    await writeFile(
      file,
      score(
        midi,
        parts[track.part].notes,
        `${piece} (${track.instrument})`,
        instrument,
      ),
    );
    console.log(file);
  }
}

function score(
  midi: Midi,
  notes: { ticks: number; durationTicks: number; midi: number }[],
  title: string,
  instrument: string,
) {
  const { ppq } = midi.header;
  const grid = ppq / 12;
  const events = chords(notes, grid);
  const end = Math.max(...events.map((event) => event.at + event.length));
  const measures = bars(midi, end);
  const fifths = keyFifths(midi.header.keySignatures[0]);
  const lines: string[] = [];

  for (const [index, measure] of measures.entries()) {
    lines.push(`    <measure number="${index + 1}">`);

    const previous = measures[index - 1];
    const changed =
      previous &&
      (previous.beats !== measure.beats || previous.type !== measure.type);

    if (index === 0 || changed) {
      lines.push(
        "      <attributes>",
        index === 0 ? `        <divisions>${ppq}</divisions>` : "",
        index === 0 ? `        <key><fifths>${fifths}</fifths></key>` : "",
        `        <time><beats>${measure.beats}</beats><beat-type>${measure.type}</beat-type></time>`,
        index === 0 ? `        ${clefs[instrument] ?? clefs.vn}` : "",
        "      </attributes>",
      );
    }

    for (const tempo of midi.header.tempos) {
      if (tempo.ticks >= measure.start && tempo.ticks < measure.end) {
        lines.push(
          `      <direction><direction-type><words/></direction-type><sound tempo="${Math.round(tempo.bpm)}"/></direction>`,
        );
      }
    }

    // Notes and rests in this measure, split at its edges and tied across them.
    let at = measure.start;

    for (const event of events) {
      const start = Math.max(event.at, measure.start);
      const stop = Math.min(event.at + event.length, measure.end);

      if (stop <= start) continue;
      if (start > at) lines.push(...rest(start - at, ppq));

      lines.push(
        ...note(event.pitches, stop - start, ppq, fifths, {
          from: event.at < measure.start,
          to: event.at + event.length > measure.end,
        }),
      );
      at = stop;
    }

    if (at < measure.end) lines.push(...rest(measure.end - at, ppq));
    lines.push("    </measure>");
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    `  <work><work-title>${title}</work-title></work>`,
    "  <identification><rights>URMP dataset, CC0</rights></identification>",
    `  <part-list><score-part id="P1"><part-name>${names[instrument] ?? ""}</part-name></score-part></part-list>`,
    '  <part id="P1">',
    ...lines.filter(Boolean),
    "  </part>",
    "</score-partwise>",
    "",
  ].join("\n");
}

// Notes that start together, snapped to the grid. Where an ornament lands on the same tick as
// a written note, the longer one is kept; double stops of equal length stay together.
function chords(
  notes: { ticks: number; durationTicks: number; midi: number }[],
  grid: number,
) {
  const snap = (ticks: number) => Math.round(ticks / grid) * grid;
  const starts = new Map<number, { pitch: number; length: number }[]>();

  for (const note of notes) {
    const at = snap(note.ticks);
    const length = Math.max(snap(note.ticks + note.durationTicks) - at, grid);

    starts.set(at, [...(starts.get(at) ?? []), { pitch: note.midi, length }]);
  }

  const sorted = [...starts.entries()].toSorted(([a], [b]) => a - b);

  return sorted.map(([at, sounding], index) => {
    const longest = Math.max(...sounding.map((note) => note.length));
    const kept = sounding.filter((note) => note.length >= longest * 0.75);
    const next = sorted[index + 1]?.[0] ?? at + longest;

    return {
      at,
      pitches: [...new Set(kept.map((note) => note.pitch))].toSorted(
        (a, b) => a - b,
      ),
      // A note shorter than three quarters of the gap to the next was released early on
      // purpose; anything longer is played legato and lasts until the next.
      length: longest < (next - at) * 0.75 ? longest : next - at,
    };
  });
}

// Measures from the time signatures, until `end`.
function bars(midi: Midi, end: number) {
  const { ppq, timeSignatures } = midi.header;
  const measures: {
    start: number;
    end: number;
    beats: number;
    type: number;
  }[] = [];
  let start = 0;

  while (start < end) {
    const signature = timeSignatures.findLast(
      (change) => change.ticks <= start,
    );
    const [beats, type] = signature?.timeSignature ?? [4, 4];
    const length = (ppq * 4 * beats) / type;

    measures.push({ start, end: start + length, beats, type });
    start += length;
  }

  return measures;
}

function note(
  pitches: number[],
  length: number,
  ppq: number,
  fifths: number,
  tie: { from: boolean; to: boolean },
) {
  const pieces = values(length, ppq);

  return pieces.flatMap((value, index) =>
    pitches.map((pitch, chord) => {
      const from = index > 0 || tie.from;
      const to = index < pieces.length - 1 || tie.to;
      const ties = [from && '<tie type="stop"/>', to && '<tie type="start"/>']
        .filter(Boolean)
        .join("");
      const tied = [from && '<tied type="stop"/>', to && '<tied type="start"/>']
        .filter(Boolean)
        .join("");

      return `      <note>${chord > 0 ? "<chord/>" : ""}${spell(pitch, fifths)}<duration>${value.ticks}</duration>${ties}${notation(value)}${tied ? `<notations>${tied}</notations>` : ""}</note>`;
    }),
  );
}

function rest(length: number, ppq: number) {
  return values(length, ppq).map(
    (value) =>
      `      <note><rest/><duration>${value.ticks}</duration>${notation(value)}</note>`,
  );
}

function notation(value: Value) {
  return [
    `<type>${value.type}</type>`,
    "<dot/>".repeat(value.dots),
    value.triplet
      ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>"
      : "",
  ].join("");
}

// Splits a length into written values, largest first: plain and dotted values, then triplets.
function values(length: number, ppq: number): Value[] {
  const table: Value[] = [];

  for (const [type, quarters] of plain) {
    const ticks = ppq * quarters;

    table.push(
      { type, ticks, dots: 0, triplet: false },
      { type, ticks: ticks * 1.5, dots: 1, triplet: false },
      { type, ticks: (ticks * 2) / 3, dots: 0, triplet: true },
    );
  }

  const usable = table
    .filter((value) => Number.isInteger(value.ticks))
    .toSorted(
      (a, b) => b.ticks - a.ticks || Number(a.triplet) - Number(b.triplet),
    );
  const found: Value[] = [];
  let left = length;

  while (left > 0) {
    const value = usable.find((candidate) => candidate.ticks <= left);

    if (!value)
      throw new Error(
        `Cannot write a length of ${left} ticks at ${ppq} per quarter`,
      );
    found.push(value);
    left -= value.ticks;
  }

  return found;
}

function spell(midi: number, fifths: number) {
  const names = fifths < 0 ? flats : sharps;
  const [step, alter] = names[midi % 12];
  const octave = Math.floor(midi / 12) - 1;

  return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`;
}

function keyFifths(key?: { key: string; scale: string }) {
  if (!key) return 0;

  const order = key.scale === "minor" ? minors : majors;
  const fifths = order.indexOf(key.key) - 7;

  if (fifths < -7) throw new Error(`Unknown key ${key.key} ${key.scale}`);
  return fifths;
}

interface Value {
  type: string;
  ticks: number;
  dots: number;
  triplet: boolean;
}

const plain: [string, number][] = [
  ["whole", 4],
  ["half", 2],
  ["quarter", 1],
  ["eighth", 1 / 2],
  ["16th", 1 / 4],
  ["32nd", 1 / 8],
];

// Keys from seven flats to seven sharps.
const majors = [
  "Cb",
  "Gb",
  "Db",
  "Ab",
  "Eb",
  "Bb",
  "F",
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
];
const minors = [
  "Ab",
  "Eb",
  "Bb",
  "F",
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
  "G#",
  "D#",
  "A#",
];

const sharps: [string, number][] = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0],
];
const flats: [string, number][] = [
  ["C", 0],
  ["D", -1],
  ["D", 0],
  ["E", -1],
  ["E", 0],
  ["F", 0],
  ["G", -1],
  ["G", 0],
  ["A", -1],
  ["A", 0],
  ["B", -1],
  ["B", 0],
];

const clefs: Record<string, string> = {
  vn: "<clef><sign>G</sign><line>2</line></clef>",
  va: "<clef><sign>C</sign><line>3</line></clef>",
  vc: "<clef><sign>F</sign><line>4</line></clef>",
  db: "<clef><sign>F</sign><line>4</line></clef>",
};

const names: Record<string, string> = {
  vn: "Violin",
  va: "Viola",
  vc: "Violoncello",
  db: "Contrabass",
};

void main(process.argv[2]);
