import { describe, expect, it } from 'vitest';
import { frequencyAxis } from './frequency-axis';

describe('LOPA frequency plot boundaries', () => {
  it('places a real zero below positive frequencies smaller than 1e-12', () => {
    const axis = frequencyAxis([{ min: 0, value: 1e-15, max: 1e-14 }], 1e-16);
    expect(axis.y(0)).toBeGreaterThan(axis.y(1e-16));
    expect(axis.y(1e-16)).toBeGreaterThan(axis.y(1e-15));
    expect(axis.y(1e-15)).toBeGreaterThan(axis.y(1e-14));
    expect(axis.minExponent).toBe(-17);
    expect(axis.y(0)).toBe(205);
  });

  it('keeps positive values on a logarithmic rather than clipped probability scale', () => {
    const axis = frequencyAxis([{ min: 1e-6, value: 1e-4, max: 0.01 }], 0.001);
    expect(axis.y(1e-4) - axis.y(0.001)).toBeCloseTo(axis.y(0.001) - axis.y(0.01));
    expect(axis.y(1e-6)).toBeGreaterThan(axis.y(1e-4));
    expect(axis.y(0.01)).toBeGreaterThan(25);
  });

  it('avoids numerical underflow in ticks and excessive tick counts for extreme valid inputs', () => {
    const axis = frequencyAxis(
      [{ min: Number.MIN_VALUE, value: 1, max: Number.MAX_VALUE }],
      1e-300,
    );
    expect(axis.ticks.length).toBeLessThanOrEqual(11);
    expect(axis.ticks.map(axis.exponentY).every(Number.isFinite)).toBe(true);
    expect(axis.y(Number.MIN_VALUE)).toBeGreaterThan(axis.y(1e-300));
    expect(axis.y(0)).toBeGreaterThan(axis.y(Number.MIN_VALUE));
  });

  it('rejects invalid frequencies rather than making a plausible graphic', () => {
    expect(() => frequencyAxis([{ min: -1, value: 0.1, max: 1 }], 0.1)).toThrow();
    expect(() => frequencyAxis([{ min: 0, value: 0.1, max: Infinity }], 0.1)).toThrow();
    expect(() => frequencyAxis([{ min: 0, value: 0.1, max: 1 }], 0)).toThrow();
  });
});
