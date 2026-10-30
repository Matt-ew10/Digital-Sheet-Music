// Values the experiment team tunes by playing. Changing them needs no other code change.
const settings = {
  // Frequency of A4 the ensemble tunes to. Many Korean orchestras use 442.
  referenceHz: 440,

  // Readings quieter than this RMS level are treated as silence. 0 dB is the loudest possible
  // input. Played notes in the URMP recordings sit around -35 to -50.
  minVolumeDb: -60,

  // How clearly a reading must sound like one pitch (0 to 1). Lower values let noise through;
  // higher values miss low notes. On URMP, 0.8 read 5 to 13 points more viola and cello notes
  // correctly than 0.9.
  minClarity: 0.8,

  // The display summarizes readings from this many milliseconds. Longer is steadier
  // but slower to follow a new note. Vibrato needs about 150 to 200.
  smoothingMs: 200,

  // Condition 3, high contrast: colors of the notation and the page. The research plan asks for
  // more contrast with the same layout and size; how much more is the research team's call.
  contrast: { notation: "#ffffff", page: "#000000" },

  // Condition 4, simplified layout: how many times wider notes are spaced, how many measures go
  // on a line, and how many times further apart the lines are.
  spacing: { notes: 1.8, measuresPerLine: 2, lines: 2 },
};

export default settings;
