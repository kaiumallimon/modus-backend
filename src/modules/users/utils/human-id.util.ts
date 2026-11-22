export function generateHumanId(): string {
  // Generates short, memorable human-readable ID: PB-XXXXX (e.g. PB-10492)
  const min = 10000;
  const max = 99999;
  const num = Math.floor(min + Math.random() * (max - min + 1));
  return `PB-${num}`;
}
