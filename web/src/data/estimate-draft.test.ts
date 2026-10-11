import { describe, expect, it } from 'vitest';
import { estimateDraft, parseEstimateDraft } from './estimate-draft';

describe('uncommitted estimate text', () => {
  it('retains precise decimal/scientific strings while validating only complete intervals', () => {
    const raw = { min: '0.0500', value: '1e-1', max: '0.2000' };
    expect(parseEstimateDraft(raw)).toEqual({ min: 0.05, value: 0.1, max: 0.2 });
    expect(raw).toEqual({ min: '0.0500', value: '1e-1', max: '0.2000' });
  });
  it('does not turn blank, partial, nonfinite or an inverted range into a replacement value', () => {
    for (const raw of [
      { min: '', value: '0.1', max: '0.2' },
      { min: '1e-', value: '0.1', max: '0.2' },
      { min: '0', value: 'Infinity', max: '1' },
      { min: '0.4', value: '0.2', max: '0.3' },
      { min: '0', value: '0x1', max: '1' },
      { min: '0', value: '0,1.5', max: '1' },
      { min: '0', value: '0.2', max: '1.1' },
    ])
      expect(parseEstimateDraft(raw)).toBeNull();
  });
  it('accepts a decimal comma without rewriting the entered text or accepting grouped numbers', () => {
    const raw = { min: '0,0500', value: '1,0e-1', max: ',2000' };
    expect(parseEstimateDraft(raw)).toEqual({ min: 0.05, value: 0.1, max: 0.2 });
    expect(raw).toEqual({ min: '0,0500', value: '1,0e-1', max: ',2000' });
    expect(parseEstimateDraft({ min: '0', value: '1,000,000', max: '1' })).toBeNull();
  });
  it('keeps percent factors and initiator units distinct and honours positive PFD bounds', () => {
    expect(parseEstimateDraft({ min: '10', value: '20', max: '30' }, { percent: true })).toEqual({
      min: 0.1,
      value: 0.2,
      max: 0.3,
    });
    expect(parseEstimateDraft({ min: '10', value: '20', max: '30' }, { max: 1e6 })).toEqual({
      min: 10,
      value: 20,
      max: 30,
    });
    expect(parseEstimateDraft({ min: '0', value: '0.1', max: '0.2' }, { min: 1e-12 })).toBeNull();
    expect(estimateDraft({ min: 0, value: 0.5, max: 1 }, true)).toEqual({
      min: '0',
      value: '50',
      max: '100',
    });
  });
});
