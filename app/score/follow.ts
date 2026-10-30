import settings from "@/settings";

// Follows a player through `score`. `read` takes one pitch reading at a time and returns the
// position of the note being played (-1 before the first); `seek` puts the player somewhere by
// hand.
//
// Readings become heard notes: a pitch held for `confirmSeconds`. Each heard note extends an
// edit-distance alignment of everything heard so far against the score, and the cursor goes to
// where the cheapest alignment ends. Wrong, missed, and extra notes only add cost, so the
// cursor finds the player again once the notes that follow agree.
export function follower(score: Note[]) {
  const pitches = score.flatMap((note) => note.pitches);
  const lowest = Math.min(...pitches) - 13;
  const highest = Math.max(...pitches) + 13;

  // cost[k]: the cheapest alignment of the heard notes so far that ends at score position k - 1.
  let cost = score.map((_, k) => k * skip).concat(score.length * skip);
  let position = -1;
  let held: number | undefined;
  let since = 0;
  let last: number | undefined;
  let broken = false;

  // When a note was last heard or assumed (none yet, or since a seek), where and when the cursor
  // last moved on a heard note, and how much slower than written the player is going.
  let heard: number | undefined;
  let anchor = { position: -1, time: 0 };
  let pace = 1;

  return { read, seek };

  function read(time: number, hz?: number) {
    if (hz === undefined) {
      held = undefined;
      broken = true;
      return position;
    }

    // Fast or low passages can leave the detector with nothing usable while the player keeps
    // going. While there is sound, a note held far past its written length gives way to the
    // next, as if its written pitch had been heard.
    const current = score[position];
    const next = score[position + 1];

    if (
      current &&
      next &&
      heard !== undefined &&
      time - heard > current.seconds * pace * overdue
    ) {
      hear(next.pitches[0], time, false);
    }

    const midi = 69 + 12 * Math.log2(hz / settings.referenceHz);
    const pitch = Math.round(midi);

    // Far outside the score's range: noise, not a note or a break.
    if (midi < lowest || midi > highest) return position;

    if (pitch !== held) {
      held = pitch;
      since = time;
    }

    if (time - since < confirmSeconds) return position;

    // The same note again, or an octave error on it, is only a new note after a break, or once
    // it has outlasted its written length when the score repeats it.
    const again = last !== undefined && (pitch - last) % 12 === 0;

    if (again && !broken && !outlasted(time)) return position;

    // A repeat inferred from timing must not measure the pace it was inferred from.
    const timed = again && !broken;

    last = pitch;
    broken = false;
    hear(pitch, time, !timed);

    return position;
  }

  // The person running the session says the player is at `to`, and the alignment starts over
  // from there: notes further away cost one skip each, so the next heard notes match near `to`.
  function seek(to: number) {
    cost = cost.map((_, k) => Math.abs(k - 1 - to) * skip);
    position = to;
    held = undefined;
    last = undefined;
    broken = true;
    heard = undefined;
    anchor = { position: -1, time: 0 };
  }

  // Whether the current note has been held past its written length, at the player's pace,
  // while the next note repeats it.
  function outlasted(time: number) {
    const current = score[position];
    const next = score[position + 1];

    if (!current || !next || !same(current.pitches, next.pitches)) return false;
    if (heard === undefined) return false;
    return time - heard > current.seconds * pace * repeatAfter;
  }

  function hear(pitch: number, time: number, measure: boolean) {
    const next = [cost[0] + extra];

    heard = time;

    for (let k = 1; k <= score.length; k++) {
      next[k] = Math.min(
        cost[k - 1] + mismatch(score[k - 1].pitches, pitch),
        cost[k] + extra,
        next[k - 1] + skip,
      );
    }

    cost = next;

    let best = 0;

    for (let k = 1; k <= score.length; k++) {
      const closer = Math.abs(k - 1 - position) < Math.abs(best - 1 - position);

      if (cost[k] < cost[best] || (cost[k] === cost[best] && closer)) best = k;
    }

    move(best - 1, time, measure);
  }

  // The pace is measured only between moves on heard notes, a few notes apart; assumed notes
  // and longer jumps (recoveries) would measure the follower instead of the player.
  function move(to: number, time: number, measure: boolean) {
    if (to === position) return;

    position = to;
    if (!measure) return;

    const steps = to - anchor.position;

    if (anchor.position >= 0 && steps > 0 && steps <= 3) {
      const written = score
        .slice(anchor.position, to)
        .reduce((sum, note) => sum + note.seconds, 0);
      const measured = (time - anchor.time) / written;

      if (written > 0) {
        pace += (Math.min(Math.max(measured, pace / 2), pace * 2) - pace) * 0.3;
      }
    }

    anchor = { position: to, time };
  }
}

// A score position: the MIDI pitches written there (more than one for a double stop), and the
// time until the next position at the written tempo.
export interface Note {
  pitches: number[];
  seconds: number;
}

function mismatch(pitches: number[], pitch: number) {
  if (pitches.includes(pitch)) return 0;
  if (pitches.some((written) => (pitch - written) % 12 === 0)) return octave;
  return 1;
}

function same(a: number[], b: number[]) {
  return a.length === b.length && a.every((pitch, i) => pitch === b[i]);
}

// A heard note that is a whole octave off the written one is most likely a detector error.
const octave = 0.5;
const skip = 1;
const extra = 1;
const confirmSeconds = 0.03;
// How far past its written length a note must be held before a repeat of it counts as heard.
const repeatAfter = 0.9;
// How far past its written length the cursor waits for evidence before moving on anyway.
const overdue = 1.5;
