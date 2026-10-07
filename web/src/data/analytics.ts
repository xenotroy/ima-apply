import type { WorkspaceIncident, WorkspaceState } from './model';

export const FREQUENCY_FACTOR = 1_000_000;

export interface AnalyticsSelection {
  /** Inclusive whole calendar months, YYYY-MM. */
  from: string;
  through: string;
  /** Empty/absent means the entire workspace; never an inferred sum of departments. */
  departmentId?: string;
  /** Explicit local reference date, YYYY-MM-DD. The current month is not complete. */
  asOf: string;
}

export interface AnalyticsIssue {
  code:
    | 'missing_hours'
    | 'duplicate_hours'
    | 'invalid_hours'
    | 'missing_source'
    | 'zero_hours'
    | 'missing_classification'
    | 'unknown_scope'
    | 'incomplete_month'
    | 'numeric_limit';
  period: string;
  message: string;
}

export interface SafetyCounts {
  /** Includes actual incidents, near misses and observations; not a rate numerator. */
  signals: number;
  incidents: number;
  nearMisses: number;
  observations: number;
  recordableIncidents: number;
  lostTimeIncidents: number;
  lostTimeDays: number | null;
  missingRecordableClassification: number;
  missingLostTimeClassification: number;
}

export interface SafetyAnalyticsMonth extends SafetyCounts {
  period: string;
  hoursWorked: number | null;
  /** Known hours from valid matching records; not a complete denominator by itself. */
  reportedHours: number;
  exposureIds: string[];
  denominatorComplete: boolean;
  classificationComplete: boolean;
  completeMonth: boolean;
  unassignedIncidents: number;
  recordableFrequencyRate: number | null;
  lostTimeFrequencyRate: number | null;
  issues: AnalyticsIssue[];
}

export interface SafetyAnalytics extends SafetyCounts {
  selection: AnalyticsSelection;
  months: SafetyAnalyticsMonth[];
  hoursWorked: number | null;
  reportedHours: number;
  denominatorComplete: boolean;
  classificationComplete: boolean;
  completePeriod: boolean;
  unassignedIncidents: number;
  nonMatchingExposureRecords: number;
  recordableFrequencyRate: number | null;
  lostTimeFrequencyRate: number | null;
  issues: AnalyticsIssue[];
}

function monthIndex(period: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || Number(period.slice(0, 4)) === 0)
    throw new RangeError('Gebruik een hele kalendermaand in de vorm JJJJ-MM.');
  return Number(period.slice(0, 4)) * 12 + Number(period.slice(5)) - 1;
}

function dateMonth(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new RangeError('Een incidentdatum of peildatum is ongeldig.');
  const period = date.slice(0, 7);
  monthIndex(period);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > days) throw new RangeError('Een incidentdatum of peildatum bestaat niet.');
  return period;
}

export function calendarMonths(from: string, through: string): string[] {
  const first = monthIndex(from);
  const last = monthIndex(through);
  if (last < first) throw new RangeError('De eindmaand ligt vóór de beginmaand.');
  if (last - first >= 120) throw new RangeError('Kies maximaal 120 hele maanden.');
  return Array.from({ length: last - first + 1 }, (_, i) => {
    const index = first + i;
    return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}

function countSignals(incidents: WorkspaceIncident[]): SafetyCounts {
  const actual = incidents.filter((incident) => incident.type === 'incident');
  const lostTime = actual.filter((incident) => incident.lostTime === true);
  const missingLostTimeClassification = actual.filter(
    (incident) => typeof incident.lostTime !== 'boolean',
  ).length;
  const daysKnown =
    missingLostTimeClassification === 0 &&
    lostTime.every(
      (incident) =>
        typeof incident.lostTimeDays === 'number' &&
        Number.isSafeInteger(incident.lostTimeDays) &&
        incident.lostTimeDays >= 0,
    );
  const days = lostTime.reduce((total, incident) => total + (incident.lostTimeDays ?? 0), 0);
  return {
    signals: incidents.length,
    incidents: actual.length,
    nearMisses: incidents.filter((incident) => incident.type === 'near_miss').length,
    observations: incidents.filter((incident) => incident.type === 'observation').length,
    recordableIncidents: actual.filter((incident) => incident.recordable === true).length,
    lostTimeIncidents: lostTime.length,
    lostTimeDays: daysKnown && Number.isSafeInteger(days) ? days : null,
    missingRecordableClassification: actual.filter(
      (incident) => typeof incident.recordable !== 'boolean',
    ).length,
    missingLostTimeClassification,
  };
}

function rate(count: number, hours: number): number | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const result = (count / hours) * FREQUENCY_FACTOR;
  return Number.isFinite(result) ? result : null;
}

/**
 * Reproducible counts and rates for a declared scope and whole-month period.
 * Classification is never inferred from severity, free-text department or an absent flag.
 * Workspace totals require workspace exposure records; department sums cannot prove coverage.
 */
export function calculateSafetyAnalytics(
  workspace: WorkspaceState,
  selection: AnalyticsSelection,
): SafetyAnalytics {
  const periods = calendarMonths(selection.from, selection.through);
  const referenceMonth = dateMonth(selection.asOf);
  const departmentId = selection.departmentId ?? '';
  if (departmentId && !workspace.departments?.some((department) => department.id === departmentId))
    throw new RangeError('De gekozen afdeling bestaat niet in deze werkruimte.');
  const periodSet = new Set(periods);
  const inPeriod = workspace.incidents.filter((incident) =>
    periodSet.has(dateMonth(incident.date)),
  );
  const selected = inPeriod.filter(
    (incident) => !departmentId || incident.departmentId === departmentId,
  );
  const exposure = (workspace.exposure ?? []).filter((record) => periodSet.has(record.period));
  const matchingExposure = exposure.filter((record) => record.departmentId === departmentId);
  const months = periods.map((period): SafetyAnalyticsMonth => {
    const counts = countSignals(selected.filter((incident) => dateMonth(incident.date) === period));
    const records = matchingExposure.filter((record) => record.period === period);
    const issues: AnalyticsIssue[] = [];
    const add = (code: AnalyticsIssue['code'], message: string) =>
      issues.push({ code, period, message });
    const validHours = (hours: number) => Number.isFinite(hours) && hours >= 0;
    const reportedHours = records.reduce(
      (total, record) => total + (validHours(record.hoursWorked) ? record.hoursWorked : 0),
      0,
    );
    let denominatorComplete = records.length === 1;
    if (records.length === 0)
      add('missing_hours', 'Geen urenbron voor deze maand en dezelfde scope.');
    if (records.length > 1)
      add('duplicate_hours', 'Meerdere urenrecords voor dezelfde maand en scope; niet opgeteld.');
    if (records.some((record) => !validHours(record.hoursWorked))) {
      denominatorComplete = false;
      add('invalid_hours', 'De urenbron bevat ongeldige uren.');
    }
    if (records.some((record) => typeof record.source !== 'string' || !record.source.trim())) {
      denominatorComplete = false;
      add('missing_source', 'De herkomst van de uren is niet vastgelegd.');
    }
    if (!Number.isFinite(reportedHours)) {
      denominatorComplete = false;
      add('numeric_limit', 'De uren vallen buiten het numerieke bereik.');
    }
    const hoursWorked = denominatorComplete ? records[0].hoursWorked : null;
    if (hoursWorked === 0)
      add('zero_hours', 'Nul gewerkte uren: deze maand heeft geen berekenbare frequentie.');
    const classificationComplete =
      counts.missingRecordableClassification === 0 && counts.missingLostTimeClassification === 0;
    if (!classificationComplete)
      add(
        'missing_classification',
        'Niet alle echte incidenten zijn als recordable en lost time beoordeeld.',
      );
    const unassignedIncidents = departmentId
      ? inPeriod.filter(
          (incident) =>
            incident.type === 'incident' &&
            !incident.departmentId &&
            dateMonth(incident.date) === period,
        ).length
      : 0;
    if (unassignedIncidents)
      add(
        'unknown_scope',
        `${unassignedIncidents} incident(en) hebben geen stabiele afdeling; de afdelingsteller kan onvolledig zijn.`,
      );
    const completeMonth = monthIndex(period) < monthIndex(referenceMonth);
    if (!completeMonth)
      add('incomplete_month', 'De kalendermaand is op de peildatum nog niet geheel verstreken.');
    const canCalculate =
      denominatorComplete && classificationComplete && completeMonth && unassignedIncidents === 0;
    const recordableFrequencyRate =
      canCalculate && hoursWorked !== null ? rate(counts.recordableIncidents, hoursWorked) : null;
    const lostTimeFrequencyRate =
      canCalculate && hoursWorked !== null ? rate(counts.lostTimeIncidents, hoursWorked) : null;
    if (
      canCalculate &&
      hoursWorked !== null &&
      hoursWorked > 0 &&
      (recordableFrequencyRate === null || lostTimeFrequencyRate === null)
    )
      add('numeric_limit', 'De frequentie valt buiten het numerieke bereik.');
    return {
      ...counts,
      period,
      hoursWorked,
      reportedHours: Number.isFinite(reportedHours) ? reportedHours : 0,
      exposureIds: records.map((record) => record.id),
      denominatorComplete,
      classificationComplete,
      completeMonth,
      unassignedIncidents,
      recordableFrequencyRate,
      lostTimeFrequencyRate,
      issues,
    };
  });
  const counts = countSignals(selected);
  const issues = months.flatMap((month) => month.issues);
  const reportedHours = months.reduce((total, month) => total + month.reportedHours, 0);
  const denominatorComplete =
    months.every((month) => month.denominatorComplete) && Number.isFinite(reportedHours);
  const hoursWorked = denominatorComplete
    ? months.reduce((total, month) => total + (month.hoursWorked ?? 0), 0)
    : null;
  const classificationComplete = months.every((month) => month.classificationComplete);
  const completePeriod = months.every((month) => month.completeMonth);
  const unassignedIncidents = months.reduce((total, month) => total + month.unassignedIncidents, 0);
  // A known zero-hour, zero-incident month can be part of a valid total period.
  // Actual incidents with zero matching hours indicate a numerator/scope problem.
  const zeroHourIncidentMonth = months.some(
    (month) => month.hoursWorked === 0 && month.incidents > 0,
  );
  const canCalculate =
    denominatorComplete &&
    classificationComplete &&
    completePeriod &&
    unassignedIncidents === 0 &&
    !zeroHourIncidentMonth;
  const recordableFrequencyRate =
    canCalculate && hoursWorked !== null ? rate(counts.recordableIncidents, hoursWorked) : null;
  const lostTimeFrequencyRate =
    canCalculate && hoursWorked !== null ? rate(counts.lostTimeIncidents, hoursWorked) : null;
  if (
    !Number.isFinite(reportedHours) ||
    (canCalculate &&
      hoursWorked !== null &&
      hoursWorked > 0 &&
      (recordableFrequencyRate === null || lostTimeFrequencyRate === null))
  )
    issues.push({
      code: 'numeric_limit',
      period: `${selection.from}–${selection.through}`,
      message: 'De totale uren of frequentie vallen buiten het numerieke bereik.',
    });
  return {
    ...counts,
    selection: { ...selection, departmentId },
    months,
    hoursWorked,
    reportedHours: Number.isFinite(reportedHours) ? reportedHours : 0,
    denominatorComplete,
    classificationComplete,
    completePeriod,
    unassignedIncidents,
    nonMatchingExposureRecords: exposure.length - matchingExposure.length,
    recordableFrequencyRate,
    lostTimeFrequencyRate,
    issues,
  };
}
