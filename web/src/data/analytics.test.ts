import { describe, expect, it } from 'vitest';
import { calculateSafetyAnalytics, calendarMonths, type AnalyticsSelection } from './analytics';
import { createWorkspace, type WorkspaceIncident, type WorkspaceState } from './model';

const selection: AnalyticsSelection = { from: '2026-01', through: '2026-02', asOf: '2026-03-01' };
const oneMonth = { ...selection, through: '2026-01' };

function incident(id: string, patch: Partial<WorkspaceIncident> = {}): WorkspaceIncident {
  return {
    id,
    title: id,
    date: '2026-01-15',
    type: 'incident',
    department: 'Productie',
    departmentId: 'dep-a',
    description: '',
    actionIds: [],
    recordable: true,
    lostTime: false,
    ...patch,
  };
}

function fixture(): WorkspaceState {
  return createWorkspace('Analytics', {
    organisations: [{ id: 'org', name: 'Bedrijf', description: '' }],
    sites: [{ id: 'site', organisationId: 'org', name: 'Locatie', address: '' }],
    departments: [
      { id: 'dep-a', siteId: 'site', name: 'Productie', activity: '' },
      { id: 'dep-b', siteId: 'site', name: 'Onderhoud', activity: '' },
    ],
    incidents: [
      incident('jan'),
      incident('feb', {
        date: '2026-02-10',
        departmentId: 'dep-b',
        lostTime: true,
        lostTimeDays: 3,
      }),
      incident('near', { type: 'near_miss', recordable: undefined, lostTime: undefined }),
      incident('observation', { type: 'observation', recordable: undefined, lostTime: undefined }),
    ],
    exposure: [
      {
        id: 'hours-jan',
        period: '2026-01',
        hoursWorked: 1000,
        departmentId: '',
        source: 'Volledige urenadministratie januari',
      },
      {
        id: 'hours-feb',
        period: '2026-02',
        hoursWorked: 1000,
        departmentId: '',
        source: 'Volledige urenadministratie februari',
      },
    ],
  });
}

describe('reproduceerbare veiligheids-KPI’s', () => {
  it('uses explicit whole months, actual incident classifications and one matching denominator', () => {
    const result = calculateSafetyAnalytics(fixture(), selection);
    expect(result.signals).toBe(4);
    expect(result.incidents).toBe(2);
    expect(result.nearMisses).toBe(1);
    expect(result.observations).toBe(1);
    expect(result.hoursWorked).toBe(2000);
    expect(result.recordableFrequencyRate).toBe(1000);
    expect(result.lostTimeFrequencyRate).toBe(500);
    expect(result.lostTimeDays).toBe(3);
    expect(result.months.map((month) => month.period)).toEqual(['2026-01', '2026-02']);
    expect(result.months[0].recordableFrequencyRate).toBe(1000);
    expect(result.months[1].lostTimeFrequencyRate).toBe(1000);
    expect(result.issues).toEqual([]);
  });

  it('does not add department hours to a workspace denominator', () => {
    const workspace = fixture();
    workspace.exposure!.push({
      id: 'dep-hours',
      period: '2026-01',
      hoursWorked: 400,
      departmentId: 'dep-a',
      source: 'Afdelingsuren',
    });
    const result = calculateSafetyAnalytics(workspace, oneMonth);
    expect(result.hoursWorked).toBe(1000);
    expect(result.recordableFrequencyRate).toBe(1000);
    expect(result.nonMatchingExposureRecords).toBe(1);
  });

  it('never invents whole-workspace coverage from the sum of departments', () => {
    const workspace = fixture();
    workspace.exposure = [
      { id: 'a', period: '2026-01', hoursWorked: 600, departmentId: 'dep-a', source: 'Afdeling A' },
      { id: 'b', period: '2026-01', hoursWorked: 400, departmentId: 'dep-b', source: 'Afdeling B' },
    ];
    const result = calculateSafetyAnalytics(workspace, oneMonth);
    expect(result.hoursWorked).toBeNull();
    expect(result.reportedHours).toBe(0);
    expect(result.recordableFrequencyRate).toBeNull();
    expect(result.issues.some((issue) => issue.code === 'missing_hours')).toBe(true);
  });

  it('matches department by stable ID and excludes other departments and workspace hours', () => {
    const workspace = fixture();
    workspace.exposure!.push({
      id: 'a',
      period: '2026-01',
      hoursWorked: 400,
      departmentId: 'dep-a',
      source: 'Afdeling A',
    });
    workspace.incidents.push(incident('other', { departmentId: 'dep-b', department: 'Productie' }));
    const result = calculateSafetyAnalytics(workspace, { ...oneMonth, departmentId: 'dep-a' });
    expect(result.incidents).toBe(1);
    expect(result.hoursWorked).toBe(400);
    expect(result.recordableFrequencyRate).toBe(2500);
    expect(result.nonMatchingExposureRecords).toBe(1);
  });

  it('withholds department rates when a real incident has no attributable stable department', () => {
    const workspace = fixture();
    workspace.exposure!.push({
      id: 'a',
      period: '2026-01',
      hoursWorked: 400,
      departmentId: 'dep-a',
      source: 'Afdeling A',
    });
    workspace.incidents.push(
      incident('unassigned', { departmentId: undefined, department: 'Productie' }),
    );
    const result = calculateSafetyAnalytics(workspace, { ...oneMonth, departmentId: 'dep-a' });
    expect(result.incidents).toBe(1);
    expect(result.unassignedIncidents).toBe(1);
    expect(result.recordableFrequencyRate).toBeNull();
    expect(result.lostTimeFrequencyRate).toBeNull();
    expect(result.issues.some((issue) => issue.code === 'unknown_scope')).toBe(true);
    // Workspace attribution is explicit: all incidents belong in its numerator.
    expect(calculateSafetyAnalytics(workspace, oneMonth).recordableFrequencyRate).toBe(2000);
  });

  it.each(['recordable', 'lostTime'] as const)(
    'never treats missing %s classification as false',
    (key) => {
      const workspace = fixture();
      workspace.incidents[0] = incident('unknown', {
        [key]: undefined,
        actualSeverity: 'lost_time',
      });
      const result = calculateSafetyAnalytics(workspace, oneMonth);
      expect(result.classificationComplete).toBe(false);
      expect(result.recordableFrequencyRate).toBeNull();
      expect(result.lostTimeFrequencyRate).toBeNull();
      expect(result.issues.some((issue) => issue.code === 'missing_classification')).toBe(true);
    },
  );

  it('does not require recordable/lost-time classification of near misses or observations', () => {
    const workspace = fixture();
    workspace.incidents = workspace.incidents.filter((record) => record.type !== 'incident');
    const result = calculateSafetyAnalytics(workspace, oneMonth);
    expect(result.classificationComplete).toBe(true);
    expect(result.recordableFrequencyRate).toBe(0);
    expect(result.lostTimeFrequencyRate).toBe(0);
  });

  it('does not use a month with missing incident-hours coverage in a total-period rate', () => {
    const workspace = fixture();
    workspace.exposure = workspace.exposure!.filter((record) => record.period !== '2026-02');
    const result = calculateSafetyAnalytics(workspace, selection);
    expect(result.hoursWorked).toBeNull();
    expect(result.reportedHours).toBe(1000);
    expect(result.recordableFrequencyRate).toBeNull();
    expect(result.months[0].recordableFrequencyRate).toBe(1000);
    expect(result.months[1].recordableFrequencyRate).toBeNull();
  });

  it('requires a denominator even for a selected month with no reported incidents', () => {
    const workspace = fixture();
    workspace.incidents = workspace.incidents.filter((record) => record.date.startsWith('2026-01'));
    workspace.exposure = workspace.exposure!.filter((record) => record.period === '2026-01');
    const result = calculateSafetyAnalytics(workspace, selection);
    expect(result.months[1].incidents).toBe(0);
    expect(result.months[1].recordableFrequencyRate).toBeNull();
    expect(result.recordableFrequencyRate).toBeNull();
  });

  it('rejects ambiguous duplicate matching exposure rather than adding it', () => {
    const workspace = fixture();
    workspace.exposure!.push({ ...workspace.exposure![0], id: 'duplicate' });
    const result = calculateSafetyAnalytics(workspace, oneMonth);
    expect(result.denominatorComplete).toBe(false);
    expect(result.hoursWorked).toBeNull();
    expect(result.recordableFrequencyRate).toBeNull();
    expect(result.issues.some((issue) => issue.code === 'duplicate_hours')).toBe(true);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'withholds rates for invalid hours %s',
    (hoursWorked) => {
      const workspace = fixture();
      workspace.exposure![0].hoursWorked = hoursWorked;
      const result = calculateSafetyAnalytics(workspace, oneMonth);
      expect(result.denominatorComplete).toBe(false);
      expect(result.recordableFrequencyRate).toBeNull();
      expect(result.issues.some((issue) => issue.code === 'invalid_hours')).toBe(true);
    },
  );

  it('requires source attribution for hours', () => {
    const workspace = fixture();
    workspace.exposure![0].source = '  ';
    const result = calculateSafetyAnalytics(workspace, oneMonth);
    expect(result.hoursWorked).toBeNull();
    expect(result.issues.some((issue) => issue.code === 'missing_source')).toBe(true);
  });

  it('does not calculate a zero-denominator month or include its incidents in a misleading period rate', () => {
    const workspace = fixture();
    workspace.exposure![0].hoursWorked = 0;
    const result = calculateSafetyAnalytics(workspace, selection);
    expect(result.months[0].recordableFrequencyRate).toBeNull();
    expect(result.recordableFrequencyRate).toBeNull();
  });

  it('can include an explicitly recorded zero-hour, zero-incident month in a nonzero complete period', () => {
    const workspace = fixture();
    workspace.exposure![0].hoursWorked = 0;
    workspace.incidents = workspace.incidents.filter((record) => record.date.startsWith('2026-02'));
    const result = calculateSafetyAnalytics(workspace, selection);
    expect(result.hoursWorked).toBe(1000);
    expect(result.recordableFrequencyRate).toBe(1000);
    expect(result.months[0].recordableFrequencyRate).toBeNull();
  });

  it('does not infer lost-time days but still counts a classified lost-time incident', () => {
    const workspace = fixture();
    workspace.incidents[1].lostTimeDays = undefined;
    const result = calculateSafetyAnalytics(workspace, selection);
    expect(result.lostTimeDays).toBeNull();
    expect(result.lostTimeIncidents).toBe(1);
    expect(result.lostTimeFrequencyRate).toBe(500);
  });

  it('withholds rates for a current or future calendar month relative to the explicit reference date', () => {
    const result = calculateSafetyAnalytics(fixture(), { ...selection, asOf: '2026-02-28' });
    expect(result.months[0].completeMonth).toBe(true);
    expect(result.months[1].completeMonth).toBe(false);
    expect(result.months[1].recordableFrequencyRate).toBeNull();
    expect(result.recordableFrequencyRate).toBeNull();
    expect(result.issues.some((issue) => issue.code === 'incomplete_month')).toBe(true);
  });

  it('keeps reference-date and period calculations independent of host timezone, including leap dates', () => {
    expect(calendarMonths('2025-12', '2026-02')).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(() =>
      calculateSafetyAnalytics(fixture(), { ...oneMonth, asOf: '2024-02-29' }),
    ).not.toThrow();
    expect(() =>
      calculateSafetyAnalytics(fixture(), { ...oneMonth, asOf: '2026-02-29' }),
    ).toThrow();
    expect(() => calendarMonths('2026-02', '2026-01')).toThrow();
    expect(() => calendarMonths('2026-13', '2027-01')).toThrow();
    expect(() => calendarMonths('2020-01', '2030-01')).toThrow();
  });

  it('rejects unknown stable scope IDs and invalid incident dates rather than silently dropping data', () => {
    const workspace = fixture();
    expect(() =>
      calculateSafetyAnalytics(workspace, { ...oneMonth, departmentId: 'missing' }),
    ).toThrow();
    workspace.incidents[0].date = '2026-02-31';
    expect(() => calculateSafetyAnalytics(workspace, selection)).toThrow();
  });

  it('does not fabricate finite totals after numeric overflow', () => {
    const workspace = fixture();
    workspace.exposure![0].hoursWorked = Number.MAX_VALUE;
    workspace.exposure![1].hoursWorked = Number.MAX_VALUE;
    const result = calculateSafetyAnalytics(workspace, selection);
    expect(result.denominatorComplete).toBe(false);
    expect(result.hoursWorked).toBeNull();
    expect(result.recordableFrequencyRate).toBeNull();
    expect(result.issues.some((issue) => issue.code === 'numeric_limit')).toBe(true);
  });

  it('does not mutate the source workspace or analysis selection', () => {
    const workspace = fixture();
    const before = JSON.stringify(workspace);
    const options = { ...selection };
    calculateSafetyAnalytics(workspace, options);
    expect(JSON.stringify(workspace)).toBe(before);
    expect(options).toEqual(selection);
  });
});
