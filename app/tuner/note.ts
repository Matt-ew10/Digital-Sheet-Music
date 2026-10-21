// The equal-tempered note closest to `hz`, and how far `hz` is from it in cents (-50 to 50).
export function nearest(hz: number, referenceHz: number) {
  const midi = 69 + 12 * Math.log2(hz / referenceHz);
  const number = Math.round(midi);

  return {
    name: names[((number % 12) + 12) % 12],
    octave: Math.floor(number / 12) - 1,
    cents: Math.round((midi - number) * 100),
  };
}

const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
