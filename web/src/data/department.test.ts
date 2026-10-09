import { describe, expect, it } from 'vitest';
import { createWorkspace, exportWorkspace, importWorkspace } from './index';
import { departmentLabel, departmentOrganisationId, type Department } from './dossier';
import { calculateSafetyAnalytics } from './analytics';

function fixture() {
  return createWorkspace('Afdelingen zonder verzonnen locatie', {
    organisations: [
      { id: 'org-a', name: 'Organisatie A', description: '' },
      { id: 'org-b', name: 'Organisatie B', description: '' },
    ],
    sites: [{ id: 'site-a', organisationId: 'org-a', name: 'Werkplaats', address: '' }],
    departments: [
      { id: 'old', siteId: 'site-a', name: 'Productie', activity: '' },
      { id: 'direct', organisationId: 'org-a', name: 'Productie', activity: '' },
      { id: 'other', organisationId: 'org-b', name: 'Productie', activity: '' },
    ],
    dossiers: [
      {
        id: 'dossier',
        title: 'Beoordeling',
        organisationId: 'org-a',
        departmentIds: ['direct'],
        scope: 'Afdeling zonder bekende locatie',
        assessor: 'Beoordelaar',
        status: 'active',
        createdAt: '2026-10-07T00:00:00.000Z',
        questions: [],
      },
    ],
    observations: [
      {
        id: 'observation',
        title: 'Feit',
        dossierId: 'dossier',
        departmentId: 'direct',
        date: '2026-01-15',
        observer: 'Waarnemer',
        facts: 'Bronvast feit.',
        evidenceIds: [],
      },
    ],
  });
}

describe('known department parent without inventing a site', () => {
  it('round-trips existing site-based and additive direct-organisation departments', () => {
    const workspace = fixture();
    expect(importWorkspace(exportWorkspace(workspace))).toEqual(workspace);
    expect(departmentOrganisationId(workspace.departments![0], workspace.sites!)).toBe('org-a');
    expect(departmentOrganisationId(workspace.departments![1], workspace.sites!)).toBe('org-a');
    expect(workspace.departments![1].siteId).toBeUndefined();
    expect(workspace.sites).toHaveLength(1);
  });

  it('rejects missing, doubled and orphan parent relationships', () => {
    const invalid: Department[] = [
      { id: 'direct', name: 'Productie', activity: '' },
      { id: 'direct', siteId: 'site-a', organisationId: 'org-a', name: 'Productie', activity: '' },
      { id: 'direct', organisationId: 'missing', name: 'Productie', activity: '' },
      { id: 'direct', siteId: 'missing', name: 'Productie', activity: '' },
      { id: 'direct', organisationId: '', name: 'Productie', activity: '' },
    ];
    for (const department of invalid) {
      const workspace = fixture();
      workspace.departments![1] = department;
      expect(() => exportWorkspace(workspace)).toThrow();
    }
  });

  it('does not let a direct department bypass assessment organisation boundaries', () => {
    const workspace = fixture();
    workspace.dossiers![0].organisationId = 'org-b';
    expect(() => exportWorkspace(workspace)).toThrow(/buiten de gekozen organisatie/);
    workspace.dossiers![0].departmentIds = [];
    expect(() => exportWorkspace(workspace)).toThrow(/buiten de dossierorganisatie/);
  });

  it('retains the exact assessment department boundary for direct departments', () => {
    const workspace = fixture();
    workspace.departments!.push({
      id: 'not-selected',
      organisationId: 'org-a',
      name: 'Andere afdeling',
      activity: '',
    });
    workspace.observations![0].departmentId = 'not-selected';
    expect(() => exportWorkspace(workspace)).toThrow(/dossierscope/);
  });

  it('distinguishes identically named departments and explicitly labels an unknown location', () => {
    const workspace = fixture();
    expect(
      departmentLabel(workspace.departments![0], workspace.sites!, workspace.organisations!),
    ).toBe('Productie · Organisatie A · Werkplaats');
    expect(
      departmentLabel(workspace.departments![1], workspace.sites!, workspace.organisations!),
    ).toBe('Productie · Organisatie A · Locatie niet vastgelegd');
    expect(
      departmentLabel(workspace.departments![2], workspace.sites!, workspace.organisations!),
    ).toBe('Productie · Organisatie B · Locatie niet vastgelegd');
  });

  it('uses a direct department stable ID for a matching frequency without requiring site metadata', () => {
    const workspace = fixture();
    workspace.incidents = [
      {
        id: 'incident',
        title: 'Incident',
        type: 'incident',
        date: '2026-01-15',
        department: 'Productie',
        departmentId: 'direct',
        description: '',
        actionIds: [],
        recordable: true,
        lostTime: false,
      },
    ];
    workspace.exposure = [
      {
        id: 'hours',
        departmentId: 'direct',
        period: '2026-01',
        hoursWorked: 100,
        source: 'Afdelingsuren',
      },
    ];
    const reloaded = importWorkspace(exportWorkspace(workspace));
    const analytics = calculateSafetyAnalytics(reloaded, {
      departmentId: 'direct',
      from: '2026-01',
      through: '2026-01',
      asOf: '2026-02-01',
    });
    expect(analytics.recordableFrequencyRate).toBe(10_000);
    expect(analytics.issues).toEqual([]);
    expect(
      calculateSafetyAnalytics(reloaded, {
        departmentId: 'other',
        from: '2026-01',
        through: '2026-01',
        asOf: '2026-02-01',
      }).recordableFrequencyRate,
    ).toBeNull();
  });
});
