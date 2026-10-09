import type { Estimate } from '../domain/types';

/** A log axis cannot represent zero. Zero gets an explicitly marked open lower tail. */
export function frequencyAxis(estimates: Estimate[], criterion: number) {
  const values = [...estimates.flatMap((e) => [e.min, e.value, e.max]), criterion];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || criterion <= 0)
    throw new RangeError(
      'Frequentie-as vereist eindige niet-negatieve frequenties en een positief criterium.',
    );
  const positive = values.filter((value) => value > 0);
  const logs = positive.map((value) => Math.log10(value));
  const minExponent = Math.floor(Math.min(...logs)) - 1;
  const maxExponent = Math.ceil(Math.max(...logs)) + 1;
  const step = Math.max(1, Math.ceil((maxExponent - minExponent) / 9));
  const ticks = Array.from(
    { length: Math.floor((maxExponent - minExponent) / step) + 1 },
    (_, i) => maxExponent - i * step,
  );
  if (ticks[ticks.length - 1] !== minExponent) ticks.push(minExponent);
  const exponentY = (exponent: number) =>
    25 + ((maxExponent - exponent) / (maxExponent - minExponent)) * 180;
  const y = (value: number) => {
    if (!Number.isFinite(value) || value < 0)
      throw new RangeError('Frequentie moet eindig en niet-negatief zijn.');
    return value === 0 ? exponentY(minExponent) : exponentY(Math.log10(value));
  };
  return { ticks, y, exponentY, minExponent, maxExponent };
}
