// Follows a player tuned to `referenceHz` (A4) through `score`. `read` takes one pitch reading
// at a time and returns the position of the note being played (-1 before the first); `seek`
// puts the player on a note by hand, and `wait` says which note they will start from.
// `restarts` are the positions playing may start again from, such as the first note of each
// measure.
//
// It keeps, for every score note and every length of time the player may have spent on it so
// far, how likely that is (an explicit-duration hidden Markov model). Each reading moves the
// odds forward in time, then weighs them by how well the reading fits each note:
//
// - Time: a note is likely to end around its written length at the player's pace, so moving on
//   becomes likely then, and a note held much longer or shorter is unlikely.
// - Pitch: the written pitch fits best, the same pitch an octave off (a common detector error)
//   less, a semitone off less again, anything else hardly at all. Silence fits every note. A
//   short silence is part of the note; a pause stops the clock, so a player who stops is still
//   on the same note.
// - Jumps: a note may be skipped, and after a pause the player may start again at any restart
//   position up to where they were.
//
// The cursor goes to the most likely note. A wrong note does not stop it: time moves the odds
// on, so the cursor reaches the note the player got wrong, which condition 5 needs.
export function follower(score: Note[], referenceHz: number, restarts: number[] = [0]) {
  const pitches = score.flatMap((note) => note.pitches);
  const lowest = Math.min(...pitches) - 13;
  const highest = Math.max(...pitches) + 13;

  // odds[j][d]: on note j, with d steps of sound spent on it. The last slot holds everything
  // longer. waiting: not started yet; the player will start at `start`.
  const odds = score.map((note) =>
    new Float64Array(Math.ceil((note.seconds * slowest * stretch) / step) + 2),
  );
  const totals = new Float64Array(score.length);
  let hazards: Float64Array[] = [];
  let hazardPace = 0;
  let waiting = 1;
  let start = 0;

  let position = -1;
  let pace = 1;
  let last: number | undefined;
  let silence = 0;
  let sounding = 0;

  return { read, seek, wait };

  function read(time: number, hz?: number) {
    if (last === undefined) last = time;

    // Readings come once per screen refresh; the model moves in fixed steps.
    while (time - last >= step) {
      last += step;
      advance(hz);
    }

    return position;
  }

  // The person running the session says the player is on note `to`.
  function seek(to: number) {
    clear();
    odds[to][0] = 1;
    totals[to] = 1;
    position = to;
  }

  // The player has not started, and will start at note `from`.
  function wait(from: number) {
    clear();
    waiting = 1;
    start = from;
    position = from - 1;
  }

  function clear() {
    for (const slots of odds) slots.fill(0);
    totals.fill(0);
    waiting = 0;
    sounding = 0;
  }

  function advance(hz?: number) {
    const midi =
      hz === undefined ? undefined : 69 + 12 * Math.log2(hz / referenceHz);
    const heard =
      midi === undefined || midi < lowest || midi > highest
        ? undefined
        : Math.round(midi);

    // A short silence is part of the note, as between detached notes, so time goes on. A pause
    // stops the clock: a player who stops is still on the same note.
    if (heard === undefined) {
      silence += step;

      if (silence < pause) {
        rate();
        move(false, false);
      }
      return;
    }

    const broken = silence >= 2 * step;
    const resumed = silence >= pause;

    silence = 0;
    rate();
    move(broken, resumed);
    weigh(heard);
    choose();
  }

  // Time passes on every note: odds move one slot later, and some leave for the next note.
  // Sound after a break is likely a new stroke, and after a pause possibly a restart.
  function move(broken: boolean, resumed: boolean) {
    const entering = new Float64Array(score.length + 1);

    for (let j = 0; j < score.length; j++) {
      // Totals are refreshed when a reading is weighed, so during a short silence a note just
      // entered still counts as empty and its odds wait in their first slot until sound returns.
      if (totals[j] < tiny) continue;

      const slots = odds[j];
      const hazard = hazards[j];
      const end = slots.length - 1;
      let leaving = 0;

      for (let d = 0; d <= end; d++) {
        // A new stroke often starts the next note, even a repeated one, once the note has
        // lasted its shortest.
        const leave = broken && hazard[d] > 0 ? Math.max(hazard[d], afterBreak) : hazard[d];

        leaving += slots[d] * leave;
        slots[d] *= 1 - leave;
      }

      slots[end] += slots[end - 1];
      for (let d = end - 1; d > 0; d--) slots[d] = slots[d - 1];
      slots[0] = 0;

      if (j + 1 < score.length) {
        entering[j + 1] += leaving * (1 - skipped);
        entering[Math.min(j + 2, score.length - 1)] += leaving * skipped;
      } else {
        slots[end] += leaving;
      }
    }

    entering[start] += waiting * begin;
    waiting *= 1 - begin;

    // After a pause, the player may go back to a restart position up to where they were, most
    // likely one of the last few. The beginning is as likely as two back.
    if (resumed) {
      const back = restarts.filter((at) => at <= Math.max(position, 0));
      const likely = back.map((at, index) =>
        at === 0 && back.length > 1 ? 0.25 : 2 ** (index - back.length + 1) + 0.05,
      );
      const sum = likely.reduce((total, value) => total + value, 0);
      let moved = 0;

      for (let j = 0; j < score.length; j++) {
        moved += totals[j] * restart;
        odds[j].forEach((value, d) => (odds[j][d] = value * (1 - restart)));
      }

      back.forEach((at, index) => (entering[at] += (moved * likely[index]) / sum));
    }

    for (let j = 0; j < score.length; j++) odds[j][0] += entering[j];
  }

  function weigh(heard: number) {
    let sum = waiting * notStarted;

    waiting *= notStarted;

    for (let j = 0; j < score.length; j++) {
      const slots = odds[j];
      const fit = fits(score[j].pitches, heard);
      let total = 0;

      for (let d = 0; d < slots.length; d++) {
        slots[d] *= fit;
        total += slots[d];
      }

      totals[j] = total;
      sum += total;
    }

    waiting /= sum;

    for (let j = 0; j < score.length; j++) {
      if (totals[j] === 0) continue;

      const slots = odds[j];

      for (let d = 0; d < slots.length; d++) slots[d] /= sum;
      totals[j] /= sum;
    }
  }

  // The cursor goes to the most likely note. Moving on to the next one measures the pace: how
  // much longer than written the player held the note they left.
  function choose() {
    let best = -1;
    let most = waiting;

    for (let j = 0; j < score.length; j++) {
      if (totals[j] > most) {
        most = totals[j];
        best = j;
      }
    }

    sounding += step;

    if (best === position) return;

    // Repeated notes are left out: the model's own timing decides when they change, so they
    // would measure the model instead of the player.
    if (
      best === position + 1 &&
      position >= 0 &&
      !score[best].pitches.some((pitch) => score[position].pitches.includes(pitch))
    ) {
      const measured = sounding / score[position].seconds;

      pace += (Math.min(Math.max(measured, pace / 2), pace * 2) - pace) * 0.3;
      pace = Math.min(Math.max(pace, fastest), slowest);
    }

    position = best;
    sounding = 0;
  }

  // How likely a note held for d steps is to end at the next step: from a log-normal spread of
  // lengths around the written length at the player's pace. Recomputed when the pace changes.
  function rate() {
    if (Math.abs(pace - hazardPace) < hazardPace * 0.03) return;

    hazardPace = pace;
    hazards = score.map((note, j) => {
      const expected = Math.log(note.seconds * pace);
      const lasting = (seconds: number) =>
        seconds <= 0 ? 1 : 0.5 * erfc((Math.log(seconds) - expected) / (spread * Math.SQRT2));

      // No note is over before a share of its length: otherwise the odds could run through
      // several notes in as many steps, toward a later passage with the same pitches.
      const shortest = Math.max(2 * step, note.seconds * pace * briefest);

      return Float64Array.from(odds[j], (_, d) => {
        if (d * step < shortest) return 0;

        const now = lasting(d * step);
        const later = lasting((d + 1) * step);

        return Math.max(now > 0 ? 1 - later / now : 1, least);
      });
    });
  }
}

function fits(written: number[], heard: number) {
  if (written.includes(heard)) return 1;
  if (written.some((pitch) => (heard - pitch) % 12 === 0)) return octave;
  if (written.some((pitch) => Math.abs(heard - pitch) === 1)) return semitone;
  return other;
}

// The complementary error function, to within 1.2e-7 (Numerical Recipes' erfcc).
function erfc(x: number) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );

  return x >= 0 ? r : 2 - r;
}

// The model moves in steps of this many seconds.
const step = 1 / 60;
// How well a reading fits a written note. Readings a sixtieth of a second apart mostly repeat
// each other, so each counts for a quarter of a whole observation (the fourth root).
const weight = 0.25;
const octave = 0.3 ** weight;
const semitone = 0.15 ** weight;
const other = 0.03 ** weight;
// How well a reading fits not having started, as a whole value: worse than any note, so that
// once playing has started, a wrong note never sends the cursor back before the first note.
const notStarted = 0.01;
// The spread of a note's played length around its written length (log scale), and the
// smallest chance at any step that the note ends, so a clear next note can always win.
const spread = 0.4;
const least = 0.01;
// The shortest a note is held, as a share of its written length at the player's pace.
const briefest = 0.3;
// Pace bounds, as multiples of the written length, and how far past its written length a note
// is tracked before its time slots run out.
const fastest = 0.5;
const slowest = 3;
const stretch = 3;
// Chances, at a step: that a note was skipped when the player moves on; that the player starts
// playing when waiting; that a note ends when sound resumes after a break; that the player went
// back to a restart position after a pause.
const skipped = 0.05;
const begin = 0.2;
const afterBreak = 0.2;
const restart = 0.05;
// Silence this long is a pause.
const pause = 0.5;
// Odds this small are not worth updating.
const tiny = 1e-12;

// A score position: the MIDI pitches written there (more than one for a double stop), and the
// time until the next position at the written tempo.
export interface Note {
  pitches: number[];
  seconds: number;
}
