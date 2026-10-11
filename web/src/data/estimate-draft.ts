import type { Estimate } from '../domain/types';

export type EstimateDraft = Record<keyof Estimate, string>;
export interface EstimateBounds {
  min?: number;
  max?: number;
  percent?: boolean;
}

export function estimateDraft(estimate: Estimate, percent = false): EstimateDraft {
  const scale = percent ? 100 : 1;
  return {
    min: String(estimate.min * scale),
    value: String(estimate.value * scale),
    max: String(estimate.max * scale),
  };
}

/** Partial or out-of-order input is kept as text and never replaces a valid estimate. */
export function parseEstimateDraft(
  raw: EstimateDraft,
  { min = 0, max = 1, percent = false }: EstimateBounds = {},
): Estimate | null {
  if (!raw || typeof raw !== 'object') return null;
  const keys = ['min', 'value', 'max'] as const;
  if (
    !keys.every(
      (key) =>
        typeof raw[key] === 'string' &&
        /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(raw[key].trim()),
    )
  )
    return null;
  const scale = percent ? 100 : 1;
  const value = {
    min: Number(raw.min.trim().replace(',', '.')) / scale,
    value: Number(raw.value.trim().replace(',', '.')) / scale,
    max: Number(raw.max.trim().replace(',', '.')) / scale,
  };
  return Object.values(value).every(Number.isFinite) &&
    value.min >= min &&
    value.max <= max &&
    value.min <= value.value &&
    value.value <= value.max
    ? value
    : null;
}
