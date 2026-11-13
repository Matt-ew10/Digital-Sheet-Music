import type { Note } from "./follow";

// Judges, as the player plays, whether each score note was in tune (condition 5). `read` takes
// a pitch reading together with the follower's position at that moment and returns a verdict
// when it makes one; `marks` holds every note currently judged wrong.
//
// - A verdict needs a held sound: readings on one note, after the bow's attack, that stay within
//   a quarter tone of each other for `options.hold` seconds. The verdict is the median distance
//   from the written pitch, octaves folded away, so vibrato and a detector octave error are not
//   mistakes.
// - Beyond `options.wrong` cents the note is wrong; within `options.right` it is right. Between
//   the two nothing is judged, since a false mark on a correct note is worse than a missed one.
// - Within one pass over a note, a wrong held sound keeps the note wrong. When the player comes
//   back to the note later, as in practice, a right verdict clears the mark.
export function judge(score: Note[], referenceHz: number, options: Options) {
  const marks = new Set<number>();
  let note = -1;
  let pass = 0;
  let wrongInPass = -1;
  let held: number[] = [];
  let sounding = 0;
  let judged = false;
  let last: number | undefined;

  return { read, marks };

  function read(time: number, hz: number | undefined, position: number) {
    const step = last === undefined ? 0 : time - last;

    last = time;

    if (position !== note) {
      note = position;
      pass++;
      reset();
    }

    if (note < 0 || hz === undefined) {
      reset();
      return undefined;
    }

    const cents = nearest(score[note].pitches, hz);

    // A jump of more than a quarter tone starts a new sound, with its own attack.
    if (held.length > 0 && Math.abs(cents - median(held)) > 50) reset();

    sounding += step;
    if (sounding < options.attack) return undefined;

    held.push(cents);

    if (judged || sounding - options.attack < options.hold) return undefined;

    judged = true;

    const off = Math.abs(median(held));

    if (off > options.wrong) {
      wrongInPass = pass;
      marks.add(note);
      return { note, wrong: true };
    }

    if (off < options.right) {
      if (wrongInPass !== pass) marks.delete(note);
      return { note, wrong: false };
    }

    return undefined;
  }

  function reset() {
    held = [];
    sounding = 0;
    judged = false;
  }

  // Distance in cents from the nearest written pitch, octaves folded into -600 to 600.
  function nearest(pitches: number[], hz: number) {
    const midi = 69 + 12 * Math.log2(hz / referenceHz);

    return pitches
      .map((pitch) => ((((midi - pitch) * 100 + 600) % 1200) + 1200) % 1200 - 600)
      .toSorted((a, b) => Math.abs(a) - Math.abs(b))[0];
  }
}

function median(values: number[]) {
  return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
}

export interface Options {
  // Cents from the written pitch beyond which a note is wrong, and within which it is right.
  wrong: number;
  right: number;
  // Seconds skipped at the start of each sound, and how long it must then be held.
  attack: number;
  hold: number;
}
