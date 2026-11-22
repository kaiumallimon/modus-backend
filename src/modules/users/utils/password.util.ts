export function generateHumanReadablePassword(): string {
  const words = [
    'Cedar', 'Frost', 'Haven', 'Noble', 'River',
    'Solar', 'Swift', 'Vigor', 'Amber', 'Breeze',
    'Clover', 'Falcon', 'Glade', 'Harbor', 'Jasper',
    'Nova', 'Opal', 'Ridge', 'Tide', 'Vale',
    'Crown', 'Delta', 'Eagle', 'Flare', 'Grove',
    'Hazel', 'Ivory', 'Kite', 'Lunar', 'Maple',
    'Nexus', 'Orbit', 'Pearl', 'Quark', 'Raven',
    'Spark', 'Terra', 'Ultra', 'Vivid', 'Wave',
  ];
  const symbols = ['@', '#', '$', '!', '%', '*'];
  const digits = ['2', '3', '4', '5', '6', '7', '8', '9'];

  const word = words[Math.floor(Math.random() * words.length)];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  const numDigits = word.length === 4 ? 3 : 3;

  let numStr = '';
  for (let i = 0; i < numDigits; i++) {
    numStr += digits[Math.floor(Math.random() * digits.length)];
  }

  return `${word}${symbol}${numStr}`;
}
