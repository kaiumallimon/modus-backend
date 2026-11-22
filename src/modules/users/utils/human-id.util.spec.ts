import { generateHumanId } from './human-id.util';

describe('generateHumanId', () => {
  it('should generate an ID starting with PB- followed by 5 digits', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateHumanId();
      expect(id).toMatch(/^PB-\d{5}$/);
    }
  });

  it('should generate numbers in the range 10000 to 99999', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateHumanId();
      const num = parseInt(id.replace('PB-', ''), 10);
      expect(num).toBeGreaterThanOrEqual(10000);
      expect(num).toBeLessThanOrEqual(99999);
    }
  });
});
