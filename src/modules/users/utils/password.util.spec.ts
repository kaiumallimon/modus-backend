import { generateHumanReadablePassword } from './password.util';

describe('generateHumanReadablePassword', () => {
  it('should generate a password of 8 to 10 characters', () => {
    for (let i = 0; i < 50; i++) {
      const pwd = generateHumanReadablePassword();
      expect(pwd.length).toBeGreaterThanOrEqual(8);
      expect(pwd.length).toBeLessThanOrEqual(10);
    }
  });

  it('should contain uppercase, lowercase, special character, and digits', () => {
    const symbols = ['@', '#', '$', '!', '%', '*'];
    for (let i = 0; i < 50; i++) {
      const pwd = generateHumanReadablePassword();
      // Has uppercase
      expect(/[A-Z]/.test(pwd)).toBe(true);
      // Has lowercase
      expect(/[a-z]/.test(pwd)).toBe(true);
      // Has at least one symbol
      expect(symbols.some((s) => pwd.includes(s))).toBe(true);
      // Has digits
      expect(/\d{2,}/.test(pwd)).toBe(true);
    }
  });
});
