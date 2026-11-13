// Values the experiment team tunes by playing. Changing them needs no other code change.
const settings = {
  // Frequency of A4 the player tuned to, in Hz. The score page offers the choices; the default is
  // the one used until someone picks another. Participants tune to 442 before the experiment;
  // the student's practice recordings were made at 440. The two are 8 cents apart, more than
  // half of condition 5's tolerance.
  referenceHz: 442,
  referenceChoices: [440, 442],

  // Readings quieter than this RMS level are treated as silence. 0 dB is the loudest possible
  // input. Played notes in the URMP recordings sit around -35 to -50.
  minVolumeDb: -60,

  // How clearly a reading must sound like one pitch (0 to 1). Lower values let noise through;
  // higher values miss low notes. On URMP, 0.8 read 5 to 13 points more viola and cello notes
  // correctly than 0.9.
  minClarity: 0.8,

  // Pitch feedback, switched on in the toolbar: a note is right within `right` cents of its
  // written pitch and wrong beyond `wrong`; between the two it is not judged, since a false mark
  // is worse than a missed one. A sound is judged after `attack` seconds of bow attack and
  // `hold` seconds held, and a new stroke counts as the next note once `strokes` of the note's
  // written length has passed. Wrong notes are drawn in `color`. Measured with
  // `pnpm evaluate:judge`: on the student's correct takes, 15/25 marks 3.9% of notes; 12/18
  // marks 8.1%.
  feedback: {
    right: 15,
    wrong: 25,
    attack: 0.04,
    hold: 0.1,
    strokes: 0.8,
    color: "#dc2626",
  },

  // Condition 3, high contrast: colors of the notation and the page. The research plan asks for
  // more contrast with the same layout and size; how much more is the research team's call.
  contrast: { notation: "#ffffff", page: "#000000" },

  // Condition 4, simplified layout: how many times wider notes are spaced, how many measures go
  // on a line, and how many times further apart the lines are.
  spacing: { notes: 1.8, measuresPerLine: 2, lines: 2 },
};

export default settings;
