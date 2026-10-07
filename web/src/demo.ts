import type { Control, Scenario } from './domain/types';
import { createWorkspace } from './data/model';
const estimate = (value: number, min = value, max = value) => ({ min, value, max });
export function newControl(overrides: Partial<Control> = {}): Control {
  return {
    id: crypto.randomUUID(),
    title: 'Nieuwe beheersmaatregel',
    ahs: 'collective',
    status: 'planned',
    evidence: 'unverified',
    evidenceNote: '',
    rationale: '',
    probabilityReduction: estimate(0),
    exposureReduction: estimate(0),
    effectReduction: estimate(0),
    independent: false,
    feasibility: 'moderate',
    effort: 3,
    legalRequired: false,
    ...overrides,
  };
}
export function newScenario(): Scenario {
  return {
    id: crypto.randomUUID(),
    title: 'Nieuw risicoscenario',
    description: '',
    department: '',
    hazard: '',
    consequence: '',
    probability: 3,
    exposure: 6,
    effect: 7,
    controls: [],
    assessmentNotes: '',
  };
}
export function demoWorkspace() {
  const scenarios: Scenario[] = [
    {
      id: 'demo-machine',
      title: 'Beknelling bij de rollenbaan',
      department: 'Productie',
      hazard: 'Bewegende machinedelen',
      consequence: 'Dodelijke beknelling tussen bewegende delen',
      description:
        'Een medewerker verwijdert een vastgelopen product terwijl de rollenbaan onverwacht opnieuw start. Alle gegevens in deze werkruimte zijn fictief.',
      probability: 6,
      exposure: 6,
      effect: 15,
      assessmentNotes:
        'Demonstratie: beoordeel de maatregelen aan het concrete scenario. De reductiepercentages zijn aannames op scorefactoren.',
      controls: [
        newControl({
          id: 'demo-guard',
          title: 'Vaste afscherming van de knelzone',
          ahs: 'collective',
          status: 'existing',
          evidence: 'verified',
          evidenceNote: 'Fictief demonstratiebewijs: inspectie en functietest',
          rationale: 'Een fysieke afscherming beperkt toegang tot bewegende delen.',
          probabilityReduction: estimate(0.5, 0.4, 0.6),
          independent: true,
          dependencyGroup: 'toegang',
          effort: 4,
          legalRequired: true,
        }),
        newControl({
          id: 'demo-redesign',
          title: 'Automatische afvoer van vastlopers',
          ahs: 'source',
          evidence: 'unverified',
          evidenceNote: 'Demonstratie: ontwerpvoorstel; nog geen praktijkmeting',
          rationale:
            'Automatische productafvoer vermindert de noodzaak voor handmatige interventies.',
          exposureReduction: estimate(0.7, 0.5, 0.8),
          independent: true,
          dependencyGroup: 'interventie',
          feasibility: 'moderate',
          effort: 5,
        }),
        newControl({
          id: 'demo-lock',
          title: 'Bereikbare vergrendelbare isolatie',
          ahs: 'collective',
          evidenceNote: 'Demonstratie: ontwerp en geplande verificatie',
          rationale:
            'Fysieke energie-isolatie voorkomt onverwacht starten tijdens de interventie. Controleer onafhankelijkheid van de afscherming.',
          probabilityReduction: estimate(0.6, 0.4, 0.8),
          independent: true,
          dependencyGroup: 'energie',
          feasibility: 'easy',
          effort: 2,
          legalRequired: true,
        }),
        newControl({
          id: 'demo-training',
          title: 'Instructie veilig verhelpen van storingen',
          ahs: 'individual',
          evidenceNote: 'Demonstratie: training gepland',
          rationale:
            'Instructie ondersteunt veilig ingrijpen; de werking vraagt observatie op de werkplek.',
          probabilityReduction: estimate(0.2, 0.05, 0.3),
          independent: false,
          feasibility: 'easy',
          effort: 1,
        }),
      ],
    },
    {
      id: 'demo-chemicals',
      title: 'Dampblootstelling bij ontvetten',
      department: 'Onderhoud',
      hazard: 'Vluchtig oplosmiddel',
      consequence: 'Ernstige gezondheidsschade na blootstelling',
      description:
        'Ontvetten met een vluchtig oplosmiddel in een slecht geventileerde werkruimte. Fictief demonstratiescenario.',
      probability: 3,
      exposure: 6,
      effect: 7,
      controls: [
        newControl({
          id: 'demo-substitution',
          title: 'Substitutie door een watergedragen product',
          ahs: 'source',
          evidenceNote: 'Demonstratie: vervangend product nog te beoordelen',
          rationale:
            'Een minder gevaarlijk product kan de ernst van de relevante gezondheidsschade verlagen. Nieuwe productrisico’s apart beoordelen.',
          effectReduction: estimate(0.6, 0.3, 0.7),
          independent: true,
          feasibility: 'easy',
          effort: 2,
        }),
      ],
    },
    {
      id: 'demo-aggression',
      title: 'Agressie tijdens publiekscontact',
      department: 'Dienstverlening',
      hazard: 'Verbale en fysieke agressie',
      consequence: 'Letsel en langdurige psychische schade',
      description:
        'Een medewerker werkt alleen bij een gesprek met een mogelijk agressieve bezoeker. Fictief demonstratiescenario.',
      probability: 3,
      exposure: 3,
      effect: 7,
      controls: [
        newControl({
          id: 'demo-layout',
          title: 'Gespreksruimte met vrije vluchtweg',
          ahs: 'collective',
          evidenceNote: 'Demonstratie: ontwerpaanpassing',
          rationale:
            'Een vrije vluchtweg verkort blootstelling bij escalatie; toets bereikbaarheid in een oefening.',
          exposureReduction: estimate(0.4, 0.2, 0.5),
          independent: true,
          feasibility: 'easy',
          effort: 2,
        }),
      ],
    },
    {
      id: 'demo-process',
      title: 'Overvullen van een procesvat',
      department: 'Procesinstallatie',
      hazard: 'Uitstromende gevaarlijke vloeistof',
      consequence: 'Potentieel dodelijke blootstelling na vloeistofuitstroming',
      description:
        'Overvullen na een fout in de toevoerregeling. Het LOPA-eindpunt is uitstroming; letselkansen zijn niet inbegrepen. Alle frequenties en PFD’s zijn uitsluitend demonstratieaannames.',
      probability: 3,
      exposure: 2,
      effect: 15,
      controls: [],
      lopa: {
        initiatingEvent: 'Toevoerregeling faalt in geopende stand',
        initiatingFrequency: estimate(0.1, 0.05, 0.2),
        frequencyEvidence:
          'Fictieve demonstratieaanname: 0,1 gebeurtenissen per jaar; geen gevalideerde praktijkdata.',
        consequence: 'Vloeistofuitstroming buiten het vat',
        targetFrequency: 0.001,
        assumptions:
          'Demonstratiecriterium, geen wettelijke of universele acceptatiegrens. Geen omrekening vanuit Fine–Kinney.',
        modifiers: [],
        layers: [
          {
            id: 'demo-ipl-trip',
            title: 'Onafhankelijke hoog-hoog niveautrip',
            status: 'existing',
            evidence: 'verified',
            evidenceNote: 'Fictieve proof-test en ontwerptoets voor demonstratie',
            pfd: estimate(0.1, 0.05, 0.2),
            specific: true,
            independent: true,
            independentOfInitiator: true,
            auditable: true,
            effective: true,
            independenceNote: 'Fictief: eigen sensor, logica en afsluiter; geen gedeelde regellus.',
            dependencyGroup: 'trip',
          },
          {
            id: 'demo-ipl-alarm',
            title: 'Alarm met operatorinterventie',
            status: 'planned',
            evidence: 'unverified',
            evidenceNote: 'Geen bewijs van beschikbare responstijd of operatorprestatie',
            pfd: estimate(0.1, 0.05, 0.3),
            specific: true,
            independent: false,
            independentOfInitiator: false,
            auditable: false,
            effective: false,
            independenceNote: 'Onafhankelijkheid en responstijd nog onderzoeken.',
          },
        ],
      },
    },
  ];
  return createWorkspace('Demonstratiewerkruimte', {
    scenarios,
    actions: [
      {
        id: 'demo-action-1',
        title: 'Isolatievoorziening ontwerpen en verifiëren',
        scenarioId: 'demo-machine',
        owner: 'Rol: technische dienst',
        dueDate: '',
        status: 'open',
        notes:
          'Fictieve actie. Controleer bereikbaarheid, vergrendeling en afwezigheid van energie.',
      },
      {
        id: 'demo-action-2',
        title: 'Vervangend ontvettingsmiddel beoordelen',
        scenarioId: 'demo-chemicals',
        owner: 'Rol: veiligheidskundige',
        dueDate: '',
        status: 'in_progress',
        notes: 'Fictieve actie. Vergelijk gevaren, taakprestatie en blootstelling.',
      },
    ],
    incidents: [
      {
        id: 'demo-incident',
        title: 'Bijna-beknelling bij storingsinterventie',
        date: '2026-10-01',
        department: 'Productie',
        type: 'near_miss',
        description:
          'Fictieve melding om het verband tussen incident, scenario en verbeteractie te laten zien.',
        scenarioId: 'demo-machine',
        actionIds: ['demo-action-1'],
      },
    ],
  });
}
