import { describe, expect, it } from 'vitest';
import type { Question } from '../content/catalog';
import { modulePlanQuestionIds, moduleQuestionIds, type PlannedModule } from './module-plan';
import {
  moduleAdvice,
  moduleHazardProfiles,
  setModuleAllQuestionsSelected,
  setModuleEnabled,
  setModuleQuestionSelected,
} from './module-selection';

const module = (id = 'module', questionIds = ['q1', 'q2', 'q3']): PlannedModule => ({
  id,
  questionIds,
  origin: 'imported_theme',
  code: 'private-topic',
  title: 'Werkproces Ω',
  enabled: false,
  scopeNotes: '',
  sourceIds: [],
});
const question = (id: string, hazard = ''): Question => ({
  id,
  themeId: 'private-topic',
  title: 'Onderzoeksvraag',
  prompt: 'Welke omstandigheden gelden?',
  route: 'kern',
  evidenceHints: [],
  assessmentGuidance: '',
  sourceIds: [],
  suggestedHierarchy: [],
  roles: [],
  richFields: { hazard },
});
const effective = (modules: PlannedModule[]) =>
  modulePlanQuestionIds({ modules } as Parameters<typeof modulePlanQuestionIds>[0]);

describe('explicit and immutable module/question selection', () => {
  it('checking one question in a disabled module selects only that question and keeps all original members', () => {
    const initial = [module()],
      before = structuredClone(initial);
    const selected = setModuleQuestionSelected(initial, 'module', 'q2', true);
    expect(effective(selected)).toEqual(['q2']);
    expect(selected[0].questionIds).toEqual(['q1', 'q2', 'q3']);
    expect(selected[0].excludedQuestionIds).toEqual(['q1', 'q3']);
    expect(initial).toEqual(before);
    expect(effective(setModuleQuestionSelected(selected, 'module', 'q3', true))).toEqual([
      'q2',
      'q3',
    ]);
  });
  it('whole-module selection is explicit, while a disabled partial choice can be resumed without losing omissions', () => {
    const partial = setModuleQuestionSelected([module()], 'module', 'q2', true);
    const disabled = setModuleAllQuestionsSelected(partial, 'module', false);
    expect(effective(disabled)).toEqual([]);
    expect(disabled[0].excludedQuestionIds).toEqual(['q1', 'q3']);
    expect(effective(setModuleEnabled(disabled, 'module', true))).toEqual(['q2']);
    const all = setModuleAllQuestionsSelected(disabled, 'module', true);
    expect(effective(all)).toEqual(['q1', 'q2', 'q3']);
    expect(all[0]).not.toHaveProperty('excludedQuestionIds');
  });
  it('a final question omission does not invent replacement questions or mutate unrelated modules', () => {
    const initial = [module('one', ['q1']), module('other', ['q2'])];
    initial[0].enabled = true;
    const excluded = setModuleQuestionSelected(initial, 'one', 'q1', false);
    expect(excluded[0].enabled).toBe(true);
    expect(moduleQuestionIds(excluded[0])).toEqual([]);
    expect(excluded[0].questionIds).toEqual(['q1']);
    expect(excluded[1]).toBe(initial[1]);
    expect(() => setModuleQuestionSelected(initial, 'one', 'q2', true)).toThrow(/behoort niet/);
    expect(() => setModuleEnabled(initial, 'missing', true)).toThrow(/bestaande/);
    expect(() => setModuleEnabled([module(), module()], 'module', true)).toThrow(/bestaande/);
  });
});

describe('positive hazard-profile advice from actual available content', () => {
  it('keeps every module visible and every human selection intact for absent or unknown signals', () => {
    const modules = [
      module('machine', ['q1']),
      { ...module('base', ['q2']), title: 'Organisatie en RI&E', enabled: true },
      { ...module('bhv', ['q3']), title: 'Bedrijfshulpverlening', enabled: true },
      { ...module('policy', ['q4']), title: 'Beleid en verantwoordelijkheden', enabled: true },
    ];
    const questions = [question('q1', 'Machinecontact'), question('q2'), question('q3')];
    const before = structuredClone({ modules, questions });
    for (const signalIds of [[], ['unknown-signal']]) {
      const result = moduleAdvice(modules, questions, signalIds);
      expect(result.map((advice) => advice.moduleId)).toEqual(modules.map((entry) => entry.id));
      expect(result[0].status).toBe('unassessed');
      expect(result.slice(1).map((advice) => advice.status)).toEqual([
        'baseline',
        'baseline',
        'baseline',
      ]);
      expect(result[0].reasons.join(' ')).toContain('te beoordelen');
    }
    expect({ modules, questions }).toEqual(before);
  });
  it.each([
    ['machine', 'Bewegende delen van machines'],
    ['chemical', 'Gevaarlijke stoffen en dampen'],
    ['biological', 'Besmetting met biologische agentia'],
    ['fire', 'Brand en explosie'],
    ['ergonomics', 'Repeterende werkhouding en tillen'],
    ['psychosocial', 'Psychosociale arbeidsbelasting en agressie'],
    ['contractors', 'Werkzaamheden van aannemers en derden'],
    ['work-at-height', 'Valgevaar bij werken op hoogte'],
    ['electrical', 'Elektrische spanning'],
    ['noise', 'Geluid en trillingen'],
    ['confined-space', 'Zuurstoftekort in besloten ruimten'],
    ['transport', 'Aanrijding door heftruck'],
  ])(
    'explains %s using an exact linked question rich-field without adding risk scores',
    (signal, hazard) => {
      const result = moduleAdvice(
        [module('original-module:Ω', ['actual-q'])],
        [question('actual-q', hazard)],
        [signal],
      );
      expect(result[0]).toMatchObject({
        moduleId: 'original-module:Ω',
        status: 'matched',
        recommended: true,
        matchedSignalIds: [signal],
        matchedQuestionIds: ['actual-q'],
      });
      expect(result[0].reasons.join(' ')).toContain('[actual-q]');
      expect(Object.keys(result[0]).sort()).toEqual([
        'matchedQuestionIds',
        'matchedSignalIds',
        'moduleId',
        'reasons',
        'recommended',
        'status',
      ]);
    },
  );
  it('uses actual theme/risk fields, ignores unlinked questions and unavailable phantom membership, and leaves nonmatches unassessed', () => {
    const risk = { ...question('risk'), richFields: { risk: 'Elektrische schok' } };
    const themed = { ...question('theme'), themeId: 'chemische-stoffen' };
    const modules = [
      module('risk-module', ['risk']),
      module('theme-module', ['theme']),
      module('neutral', ['neutral']),
      { ...module('missing', ['missing-q']), title: 'Machines' },
    ];
    const result = moduleAdvice(
      modules,
      [risk, themed, question('neutral'), question('unlinked', 'Machinecontact')],
      ['chemical', 'electrical', 'machine'],
    );
    expect(result.map((advice) => advice.status)).toEqual([
      'matched',
      'matched',
      'unassessed',
      'unassessed',
    ]);
    expect(result[0].matchedQuestionIds).toEqual(['risk']);
    expect(result[1].matchedQuestionIds).toEqual(['theme']);
    expect(moduleHazardProfiles.map((profile) => profile.id)).toEqual([
      ...new Set(moduleHazardProfiles.map((profile) => profile.id)),
    ]);
  });
  it('evaluates original membership without undoing a human omission; shared question IDs retain both module identities', () => {
    const modules = [
      { ...module('one', ['q1']), excludedQuestionIds: ['q1'] },
      module('two', ['q1']),
    ];
    const before = structuredClone(modules);
    const result = moduleAdvice(
      modules,
      [question('q1', 'Machinecontact')],
      ['machine', 'machine'],
    );
    expect(result.map((advice) => advice.moduleId)).toEqual(['one', 'two']);
    expect(result[0].matchedSignalIds).toEqual(['machine']);
    expect(modules).toEqual(before);
    expect(effective(modules)).toEqual([]);
  });
});
