import type { Question } from '../content/catalog';
import type { PlannedModule } from './module-plan';

export interface ModuleHazardProfile {
  id: string;
  label: string;
  description: string;
}
export const moduleHazardProfiles: readonly ModuleHazardProfile[] = [
  {
    id: 'machine',
    label: 'Machines en arbeidsmiddelen',
    description: 'Contact met machines, bewegende delen en arbeidsmiddelen.',
  },
  {
    id: 'chemical',
    label: 'Gevaarlijke stoffen',
    description: 'Chemische stoffen, dampen, stof en blootstelling.',
  },
  {
    id: 'biological',
    label: 'Biologische agentia',
    description: 'Infectie, besmetting en biologisch materiaal.',
  },
  {
    id: 'fire',
    label: 'Brand en explosie',
    description: 'Ontsteking, brandbare materialen en explosie.',
  },
  {
    id: 'ergonomics',
    label: 'Fysieke belasting en ergonomie',
    description: 'Tillen, houding, repeterend werk en werkplekinrichting.',
  },
  {
    id: 'psychosocial',
    label: 'Psychosociale arbeidsbelasting',
    description: 'Werkdruk, agressie, intimidatie en sociale veiligheid.',
  },
  {
    id: 'contractors',
    label: 'Derden en aannemers',
    description: 'Afstemming en werkzaamheden met derden en aannemers.',
  },
  {
    id: 'work-at-height',
    label: 'Werken op hoogte',
    description: 'Valgevaar, ladders, steigers en hoogtewerk.',
  },
  {
    id: 'electrical',
    label: 'Elektrische gevaren',
    description: 'Elektrische installaties, spanning en aanraakgevaar.',
  },
  {
    id: 'noise',
    label: 'Geluid en trillingen',
    description: 'Geluidblootstelling, lawaai en trillingen.',
  },
  {
    id: 'confined-space',
    label: 'Besloten ruimten',
    description: 'Besloten ruimten, zuurstoftekort en beperkte vluchtmogelijkheden.',
  },
  {
    id: 'transport',
    label: 'Intern transport en verkeer',
    description: 'Voertuigen, aanrijding en beweging op het terrein.',
  },
];
const patterns: Record<string, RegExp> = {
  machine:
    /\b(machine\w*|arbeidsmiddel\w*|beknell\w*|knelzone\w*|bewegende delen|afscherming\w*|mechanical|machinery)\b/u,
  chemical:
    /\b(chem\w*|gevaarlijke stoffen|stoffen|dampen|stofblootstelling|oplosmiddel\w*|toxic\w*|carcinog\w*|cmr)\b/u,
  biological:
    /\b(biolog\w*|infect\w*|besmett\w*|besmet\w*|bacter\w*|virus\w*|schimmel\w*|biological)\b/u,
  fire: /\b(brand\w*|explosi\w*|ontvlamb\w*|ontstek\w*|atex|fire|explosion)\b/u,
  ergonomics:
    /\b(ergonom\w*|fysieke belasting|tillen|tilwerk|duwen|trekken|werkhouding\w*|repeter\w*|beeldscherm\w*|manual handling)\b/u,
  psychosocial:
    /\b(psa|psychosocia\w*|agress\w*|werkdruk|pesten|intimid\w*|stress\w*|discrimin\w*|sociale veiligheid)\b/u,
  contractors:
    /\b(aannemer\w*|contractor\w*|derden|onderaannemer\w*|werkvergunning\w*|externe medewerkers)\b/u,
  'work-at-height':
    /\b(hoogtewerk|werken op hoogte|valgevaar|valbeveilig\w*|steiger\w*|ladder\w*|hoogwerker\w*|work at height)\b/u,
  electrical: /\b(elektr\w*|electri\w*|spanning\w*|elektrocut\w*|stroomvoer\w*|aanraakgevaar)\b/u,
  noise: /\b(geluid\w*|lawaai\w*|trilling\w*|vibrat\w*|gehoor\w*|noise)\b/u,
  'confined-space': /\b(besloten ruim\w*|zuurstoftekort|verstikk\w*|confined space\w*)\b/u,
  transport: /\b(transport\w*|verkeer\w*|voertuig\w*|heftruck\w*|aanrijd\w*|traffic|vehicle\w*)\b/u,
};
const baselinePattern =
  /\b(organisatie|arbozorg|arbo\s?beleid|beleid\w*|basisbeleid|preventie\w*|bhv|bedrijfshulpverlening|veiligheidsbeleid|rie basis)\b/u;
const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
function questionText(question: Question): string {
  return normalized(
    [
      question.themeId,
      question.title,
      question.prompt,
      question.assessmentGuidance,
      question.richFields?.hazard,
      question.richFields?.risk,
      question.richFields?.riskFactor,
      question.richFields?.rootCauses,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}
export interface ModuleAdvice {
  moduleId: string;
  status: 'baseline' | 'matched' | 'unassessed';
  recommended: boolean;
  reasons: string[];
  matchedSignalIds: string[];
  matchedQuestionIds: string[];
}
/** Positive, explainable hints only: no absence inference and no mutation of human selection. */
export function moduleAdvice(
  modules: readonly PlannedModule[],
  questions: readonly Question[],
  signalIds: readonly string[],
): ModuleAdvice[] {
  const signals = moduleHazardProfiles.filter((profile) => signalIds.includes(profile.id));
  const available = new Map(questions.map((question) => [question.id, question]));
  return modules.map((module) => {
    const members = module.questionIds.flatMap((id) =>
      available.has(id) ? [available.get(id)!] : [],
    );
    const heading = normalized(`${module.code}\n${module.title}`);
    const baseline =
      baselinePattern.test(heading) ||
      members.some((question) =>
        baselinePattern.test(normalized(`${question.themeId}\n${question.title}`)),
      );
    const matchedSignalIds: string[] = [],
      matchedQuestionIds = new Set<string>(),
      reasons: string[] = [];
    if (baseline)
      reasons.push(
        'Basisorganisatie, preventie of BHV blijft een afzonderlijk te beoordelen onderwerp.',
      );
    for (const profile of signals) {
      const pattern = patterns[profile.id];
      const matching = members.filter((question) => pattern.test(questionText(question)));
      const headingMatch = members.length > 0 && pattern.test(heading);
      if (!matching.length && !headingMatch) continue;
      matchedSignalIds.push(profile.id);
      matching.forEach((question) => matchedQuestionIds.add(question.id));
      reasons.push(
        `${profile.label}: ${matching.length ? `aansluiting in gekoppelde vragen [${matching.map((question) => question.id).join(', ')}]` : 'aansluiting in de beschikbare modulenaam/themacode'}.`,
      );
    }
    if (!baseline && !matchedSignalIds.length)
      reasons.push(
        signals.length
          ? 'Geen tekstuele aansluiting op de gekozen profielen aangetoond; toepasselijkheid blijft te beoordelen.'
          : 'Geen bekend gevarenprofiel gekozen; toepasselijkheid blijft te beoordelen.',
      );
    return {
      moduleId: module.id,
      status: baseline ? 'baseline' : matchedSignalIds.length ? 'matched' : 'unassessed',
      recommended: baseline || matchedSignalIds.length > 0,
      reasons,
      matchedSignalIds,
      matchedQuestionIds: [...matchedQuestionIds],
    };
  });
}
function changeModule(
  modules: readonly PlannedModule[],
  moduleId: string,
  change: (module: PlannedModule) => PlannedModule,
): PlannedModule[] {
  if (modules.filter((module) => module.id === moduleId).length !== 1)
    throw new Error('Kies één bestaande module-ID.');
  return modules.map((module) => (module.id === moduleId ? change(module) : module));
}
/** Enabling an advised module preserves the person's individual exclusions. */
export function setModuleEnabled(
  modules: readonly PlannedModule[],
  moduleId: string,
  enabled: boolean,
): PlannedModule[] {
  return changeModule(modules, moduleId, (module) => ({ ...module, enabled }));
}
/** A whole-module selection is an explicit request to select every original member. */
export function setModuleAllQuestionsSelected(
  modules: readonly PlannedModule[],
  moduleId: string,
  selected: boolean,
): PlannedModule[] {
  return changeModule(modules, moduleId, (module) => {
    if (!selected) return { ...module, enabled: false };
    const { excludedQuestionIds: _omitted, ...definition } = module;
    return { ...definition, enabled: true };
  });
}
/** Checking one question in a disabled module activates only that question. */
export function setModuleQuestionSelected(
  modules: readonly PlannedModule[],
  moduleId: string,
  questionId: string,
  selected: boolean,
): PlannedModule[] {
  return changeModule(modules, moduleId, (module) => {
    if (!module.questionIds.includes(questionId))
      throw new Error('Vraag behoort niet tot deze module.');
    if (!module.enabled && selected)
      return {
        ...module,
        enabled: true,
        excludedQuestionIds: module.questionIds.filter((id) => id !== questionId),
      };
    const exclusions = new Set(module.excludedQuestionIds ?? []);
    if (selected) exclusions.delete(questionId);
    else exclusions.add(questionId);
    return {
      ...module,
      excludedQuestionIds: module.questionIds.filter((id) => exclusions.has(id)),
    };
  });
}
