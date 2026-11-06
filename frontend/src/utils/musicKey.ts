// Essentia はキーを「C#」「F#」のような♯表記と「Eb」「Ab」「Bb」のような♭表記を混ぜて返すため、表示は♭に統一する
const SHARP_TO_FLAT: { [sharp: string]: string } = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb',
};

// 例: "C# MINOR" → "Db MINOR"、"Ab MAJOR" → "Ab MAJOR"（そのまま）
export const toFlatKey = (key: string): string =>
  key.replace(/^([A-G]#)(?=\s|$)/, sharp => SHARP_TO_FLAT[sharp] ?? sharp);
