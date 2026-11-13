import type { Note } from "./follow";

// Judges, as the player plays, whether each score note was in tune (condition 5). `read` takes
// a pitch reading together with the follower's position at that moment and returns a verdict
// when it makes one; `marks` holds every note currently judged wrong.
//
// - A verdict needs a held sound: readings, after the bow's attack, that stay within a quarter
//   tone of each other for `options.hold` seconds. Silence or a larger jump starts a new sound.
//   The verdict is the median distance from the written pitch, octaves folded away, so vibrato
//   and a detector octave error are not mistakes.
// - Beyond `options.wrong` cents the note is wrong; within `options.right` it is right. Between
//   the two nothing is judged, since a false mark on a correct note is worse than a missed one.
// - The sound is judged against the follower's note, with one exception: a new stroke on a note
//   that already has its verdict, once most of the note's written length has passed, is taken as
//   the next note. The follower is then behind, or held back because a wrong pitch matches the
//   note before.
// - Within one pass over a note, a wrong held sound keeps the note wrong. When the player comes
//   back to the note later, as in practice, a right verdict clears the mark.
export function judge(score: Note[], referenceHz: number, options: Options) {
  const marks = new Set<number>();
  const wrongInPass = new Map<number, number>();
  let tracked = -1;
  let note = -1;
  let pass = 0;
  let stroked = false;
  let held: number[] = [];
  let sounding = 0;
  let silent = 0;
  let judged = false;
  let last: number | undefined;
  let entered = 0;

  return { read, marks };

  function read(time: number, hz: number | undefined, position: number) {
    const step = last === undefined ? 0 : time - last;

    last = time;

    // The judge's note follows the follower, but does not go back to a note it has already
    // moved past on its own while the follower catches up.
    if (position !== tracked) {
      if (position < tracked || position > note) {
        if (position !== note) {
          note = position;
          pass++;
          stroked = false;
          entered = time;
        }
      }

      tracked = position;
    }

    if (note < 0 || hz === undefined) {
      silent += step;
      reset();
      return undefined;
    }

    let midi = 69 + 12 * Math.log2(hz / referenceHz);

    // A reading an octave off is the detector's error, not a new sound.
    if (held.length > 0) midi -= 12 * Math.round((midi - median(held)) / 12);

    // A jump of more than a quarter tone starts a new sound, with its own attack.
    const jumped = held.length > 0 && Math.abs(midi - median(held)) > 0.5;

    if (jumped) reset();

    if (
      sounding === 0 &&
      stroked &&
      (jumped || silent >= 2 / 60) &&
      time - entered >= options.strokes * score[note].seconds &&
      note + 1 < score.length
    ) {
      note++;
      pass++;
      stroked = false;
      entered = time;
    }

    silent = 0;
    sounding += step;
    if (sounding < options.attack) return undefined;

    held.push(midi);

    if (judged || sounding - options.attack < options.hold) return undefined;

    judged = true;
    stroked = true;

    // The sound belongs to the judge's note once it has been held long enough.
    const off = Math.abs(cents(score[note].pitches, median(held)));

    if (off > options.wrong) {
      wrongInPass.set(note, pass);
      marks.add(note);
      return { note, wrong: true };
    }

    if (off < options.right) {
      if (wrongInPass.get(note) !== pass) marks.delete(note);
      return { note, wrong: false };
    }

    return undefined;
  }

  function reset() {
    held = [];
    sounding = 0;
    judged = false;
  }
}

// Distance in cents from the nearest written pitch, octaves folded into -600 to 600.
function cents(pitches: number[], midi: number) {
  return pitches
    .map((pitch) => ((((midi - pitch) * 100 + 600) % 1200) + 1200) % 1200 - 600)
    .toSorted((a, b) => Math.abs(a) - Math.abs(b))[0];
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
  // The share of a note's written length after which a new stroke is taken as the next note.
  strokes: number;
}
