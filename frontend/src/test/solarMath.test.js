import { describe, expect, it } from 'vitest';
import { hourDecimalToSinCos, timeStringToHourDecimal } from '../utils/solarMath';

describe('solarMath', () => {
  it('satisfies the backend unit-circle constraint abs(sin^2 + cos^2 - 1) <= 0.02', () => {
    for (const h of [0, 6, 12, 14.5, 18.25, 23.75]) {
      const { hour_sin, hour_cos } = hourDecimalToSinCos(h);
      const norm = hour_sin ** 2 + hour_cos ** 2;
      expect(Math.abs(norm - 1)).toBeLessThanOrEqual(0.0001);
    }
  });

  it('converts HH:mm strings to decimal hours', () => {
    expect(timeStringToHourDecimal('12:30')).toBe(12.5);
  });
});
