// Values the experiment team tunes by playing. Changing them needs no other code change.
const settings = {
  // Frequency of A4 the ensemble tunes to. Many Korean orchestras use 442.
  referenceHz: 440,

  // Readings quieter than this are treated as silence. 0 dB is the loudest possible input.
  minVolumeDb: -50,

  // How clearly a reading must sound like one pitch (0 to 1). Lower values let noise through.
  minClarity: 0.9,

  // The display summarizes readings from this many milliseconds. Longer is steadier
  // but slower to follow a new note. Vibrato needs about 150 to 200.
  smoothingMs: 200,
};

export default settings;
