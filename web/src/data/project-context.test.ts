import { describe, expect, it } from 'vitest';
import {
  createWorkspace,
  exportWorkspace,
  importWorkspace,
  emptyProjectDetails,
  projectContextFields,
  projectContextMarkdown,
} from './index';

function fixture() {
  return createWorkspace('Projectcontextfixture', {
    organisations: [
      { id: 'org-a', name: 'Organisatie A', description: '' },
      { id: 'org-b', name: 'Organisatie B', description: '' },
    ],
    departments: [
      { id: 'dep-a', organisationId: 'org-a', name: 'Productie', activity: '' },
      { id: 'dep-b', organisationId: 'org-b', name: 'Productie', activity: '' },
    ],
    sources: [
      { id: 'source-project', text: 'Oorspronkelijke projectcontext' },
      { id: 'source-walk', text: 'Volledig oorspronkelijk verslag' },
    ],
    projectContexts: [
      {
        id: 'context',
        title: 'Project A',
        organisationText: 'Bronorganisatie',
        locationText: 'Bronlocatie, geen geregistreerde site',
        contactName: '',
        contactEmail: '',
        organisationIds: ['org-a'],
        details: emptyProjectDetails(),
        sourceIds: ['source-project'],
      },
    ],
    dossiers: [
      {
        id: 'dossier',
        title: 'Afdelingsdossier',
        organisationId: 'org-a',
        projectContextId: 'context',
        departmentIds: ['dep-a'],
        scope: 'Afdeling A',
        assessor: 'Beoordelaar',
        status: 'active',
        createdAt: '2026-10-07T00:00:00.000Z',
        questions: [],
      },
    ],
    walkthroughs: [
      {
        id: 'walk',
        title: 'Rondgang',
        organisationId: 'org-a',
        departmentId: 'dep-a',
        dossierId: 'dossier',
        projectContextId: 'context',
        date: '',
        author: '',
        summary: 'Samenvatting is geen individueel feit.',
        body: 'Volledig\nverslag.',
        modules: [{ id: 'module', code: 'M1', title: 'Machines' }],
        sourceIds: ['source-walk'],
      },
    ],
    observations: [
      {
        id: 'observation',
        title: 'Feit',
        dossierId: 'dossier',
        departmentId: 'dep-a',
        walkthroughId: 'walk',
        date: '2026-10-07',
        observer: 'Waarnemer',
        facts: 'Afzonderlijk geconstateerd feit.',
        evidenceIds: [],
      },
    ],
  });
}

describe('usable project context and complete walkthroughs', () => {
  it('round-trips all thirteen context meanings, full prose, module identities and explicit unknowns', () => {
    const workspace = fixture();
    for (const [key, label] of projectContextFields)
      workspace.projectContexts![0].details[key] = `${label}\nExacte broninhoud.`;
    const reloaded = importWorkspace(exportWorkspace(workspace));
    expect(reloaded).toEqual(workspace);
    expect(Object.keys(reloaded.projectContexts![0].details)).toHaveLength(13);
    expect(reloaded.walkthroughs![0].author).toBe('');
    expect(reloaded.walkthroughs![0].date).toBe('');
    expect(reloaded.walkthroughs![0].createdAt).toBeUndefined();
    expect(reloaded.sites).toEqual([]);
    expect(reloaded.observations).toHaveLength(1);
  });

  it('rejects unsupported fields, missing detail keys and invented source references', () => {
    const workspace = fixture();
    delete (workspace.projectContexts![0].details as Partial<Record<string, string>>).activities;
    expect(() => exportWorkspace(workspace)).toThrow(/details.activities/);
    workspace.projectContexts![0].details = emptyProjectDetails();
    workspace.projectContexts![0].sourceIds.push('missing');
    expect(() => exportWorkspace(workspace)).toThrow(/Projectcontext.bronnen/);
    workspace.projectContexts![0].sourceIds = [];
    Object.assign(workspace.walkthroughs![0], { fabricatedLocation: 'Onbekende site' });
    expect(() => exportWorkspace(workspace)).toThrow(/onbekend veld/);
  });

  it('enforces the actual organisation and department of a walkthrough', () => {
    const workspace = fixture();
    workspace.walkthroughs![0].departmentId = 'dep-b';
    expect(() => exportWorkspace(workspace)).toThrow(/Rondgang/);
    workspace.walkthroughs![0].departmentId = 'dep-a';
    workspace.walkthroughs![0].organisationId = 'org-b';
    expect(() => exportWorkspace(workspace)).toThrow(/Rondgang/);
  });

  it('keeps organisation-wide reports outside a narrow departmental dossier', () => {
    const workspace = fixture();
    delete workspace.walkthroughs![0].departmentId;
    expect(() => exportWorkspace(workspace)).toThrow(/organisatiebrede rondgang/);
  });

  it('does not permit an observation link to widen or cross the source report scope', () => {
    const workspace = fixture();
    delete workspace.observations![0].departmentId;
    expect(() => exportWorkspace(workspace)).toThrow(/afdeling verschilt/);
    workspace.observations![0].departmentId = 'dep-a';
    workspace.dossiers!.push({ ...workspace.dossiers![0], id: 'other-dossier' });
    workspace.observations![0].dossierId = 'other-dossier';
    expect(() => exportWorkspace(workspace)).toThrow(/rondgang hoort bij een ander dossier/);
  });

  it('retains legacy location description without treating it as a site and produces readable complete output', () => {
    const lines = projectContextMarkdown(fixture()).join('\n');
    expect(lines).toContain('Bronlocatie, geen geregistreerde site');
    expect(lines).toContain('Datum: Niet vastgelegd | auteur Niet vastgelegd');
    expect(lines).toContain('Volledig\nverslag.');
    expect(lines).toContain('Machines [module]');
    expect(lines).toContain('Waarnemingen: Feit [observation]');
    expect(lines).toContain('Bronrecords: source-walk');
  });
});
