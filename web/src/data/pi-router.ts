import { sha256 } from '@noble/hashes/sha2.js';
import {
  createWorkspace,
  createDossierFromModulePlan,
  type ModulePlan,
  type WorkspaceRecord,
  type WorkspaceState,
} from './model';

/** Public, independently authored research rules. Private source banks are bindings, never bundled. */
export const PI_ROUTER_VERSION = '1.0.0';
export type PiPresence = 'unknown' | 'present' | 'absent';
export type PiRiskSelection = 'unknown' | 'possible' | 'confirmed' | 'increased';
export type PiScope = 'central' | 'local' | 'both';
export type PiPriority = 'normal' | 'elevated' | 'urgent';
export const PI_PROFILE_FEATURES = [
  ['indoor', 'Binnenruimten en looproutes'],
  ['traffic', 'Voertuigen of intern transport'],
  ['manual_handling', 'Tillen, duwen, trekken of fysiek ingrijpen'],
  ['screens', 'Administratie en beeldschermwerk'],
  ['equipment', 'Machines, gereedschap of andere arbeidsmiddelen'],
  ['noise', 'Mogelijke geluidblootstelling'],
  ['vibration', 'Trillend gereedschap of voertuigen'],
  ['climate', 'Warmte, koude, lucht of verlichting'],
  ['chemicals', 'Gevaarlijke stoffen gebruiken of beheren'],
  ['biological', 'Contact met lichaamsmateriaal of besmet materiaal'],
  ['prisoner_contact', 'Contact, toezicht of begeleiding van gedetineerden'],
  ['search', 'Visitatie, fouillering of celinspectie'],
  ['intervention', 'Bijzondere interventie of IBT-rol'],
  ['transport_prisoners', 'Gedetineerden vervoeren of begeleiden'],
  ['visitors', 'Bezoekers ontvangen of begeleiden'],
  ['night_shift', 'Nachtwerk of onregelmatige diensten'],
  ['alone', 'Alleenwerk of geïsoleerde taakuitvoering'],
  ['contractors', 'Uitbesteed werk of externe partijen'],
  ['maintenance', 'Onderhoud, storingen of technisch werk'],
  ['height', 'Valgevaar bij werken op hoogte'],
  ['special_spaces', 'Besloten of bijzondere technische ruimten'],
  ['cleaning', 'Zelf schoonmaken'],
  ['food_work', 'Beroepsmatig voedsel bereiden of distribueren'],
  ['resident_cooking', 'Toezicht bij koken door gedetineerden'],
  ['medication', 'Medicatie verstrekken of medische ondersteuning'],
  ['storage', 'Opslag of magazijnwerk'],
  ['fire_response', 'Brandrespons, ontgrendeling of evacuatie'],
  ['special_groups', 'Bijzondere personeelsgroepen'],
  ['new_staff', 'Nieuwe, tijdelijke of unitvreemde medewerkers'],
  ['ionising', 'Ioniserende straling'],
  ['weapons', 'Vuurwapens hanteren of reinigen'],
  ['explosive', 'Mogelijke explosieve atmosfeer'],
  ['sports', 'Sport of spel begeleiden'],
  ['production', 'Arbeid of productie begeleiden/uitvoeren'],
  ['religious_care', 'Geestelijke verzorging'],
  ['multiperson_cell', 'Werk rond meerpersoonscellen'],
  ['gvm', 'Afzonderlijk GVM-onderdeel binnen scope'],
  ['hoisting', 'Hijsen of heffen'],
  ['ambulant', 'Ambulante werkzaamheden'],
] as const;
export type PiFeatureId = (typeof PI_PROFILE_FEATURES)[number][0];
export interface PiRouterSignal {
  id: string;
  topicIds: string[];
  kind: 'incident' | 'near_miss' | 'complaint' | 'change';
  severity: 'unspecified' | 'serious';
  sourceIds: string[];
  note: string;
}
export interface PiDocumentClaim {
  topicId: string;
  sourceId: string;
  claim: 'present' | 'absent' | 'effective' | 'ineffective' | 'unknown';
  note: string;
}
export interface PiExclusion {
  topicId: string;
  scopeTitle: string;
  reason: string;
  evidenceIds: string[];
  assessor: string;
  reviewedAt: string;
}
export interface PiRouterInputs {
  scopeTitle: string;
  assessor: string;
  dossierId?: string;
  organisationId?: string;
  /** Central investigation is linked to local application, not repeated as identical answers. */
  researchLevel?: 'central' | 'department' | 'local';
  features: Partial<Record<PiFeatureId, PiPresence>>;
  risks: Record<string, PiRiskSelection>;
  /** Additional organisational requirements; mandatory duties remain independent. */
  selectedObligations: string[];
  signals: PiRouterSignal[];
  documentClaims: PiDocumentClaim[];
  exclusions: PiExclusion[];
  noSignalsDeclared?: boolean;
  notes: string;
}
export interface PiRule {
  id: string;
  chapter: string;
  title: string;
  kind: 'risk' | 'obligation';
  obligationKind?: 'law' | 'internal' | 'good_practice';
  mandatory?: boolean;
  scope: PiScope;
  features: PiFeatureId[];
  alwaysScan?: boolean;
  activity: string;
  hazard: string;
  groups: string[];
  consequences: string[];
  controls: { source: string; collective: string; individual: string; ppe: string };
  localIncreases: string[];
  documents: string[];
  questions: string[];
  exclusionConditions: string;
  legalSourceIds: string[];
}
export interface PiLegalSource {
  id: string;
  title: string;
  url: string;
  checkedAt: string;
  verification: 'official_explanation';
  confidence: 'moderate';
}
const arbo = 'https://www.arboportaal.nl';
export const PI_LEGAL_SOURCES: PiLegalSource[] = [
  {
    id: 'pi-law-rie',
    title: 'SZW Arboportaal: inhoud en actualisatie RI&E',
    url: `${arbo}/onderwerpen/arbowet--en--regelgeving/risico-inventarisatie---evaluatie/waaruit-bestaat-de-rie`,
    checkedAt: '2026-10-11',
    verification: 'official_explanation',
    confidence: 'moderate',
  },
  {
    id: 'pi-law-prevention',
    title: 'SZW Arboportaal: preventiemedewerker, Arbowet artikel 13',
    url: `${arbo}/onderwerpen/ondersteuning-bij-arbowet/preventiemedewerker/wat-zegt-de-wet-over-de-preventiemedewerker`,
    checkedAt: '2026-10-11',
    verification: 'official_explanation',
    confidence: 'moderate',
  },
  {
    id: 'pi-law-instruction',
    title: 'SZW Arboportaal: voorlichting over gezondheidsrisico’s',
    url: `${arbo}/onderwerpen/arbozorg/voorlichting-gezondheidsrisicos`,
    checkedAt: '2026-10-11',
    verification: 'official_explanation',
    confidence: 'moderate',
  },
  {
    id: 'pi-law-bhv',
    title: 'SZW Arboportaal: bedrijfshulpverlening, Arbowet artikel 15',
    url: `${arbo}/onderwerpen/arbozorg/bedrijfshulpverlening/wat-zegt-de-wet-over-bedrijfshulpverlening`,
    checkedAt: '2026-10-11',
    verification: 'official_explanation',
    confidence: 'moderate',
  },
  {
    id: 'pi-law-pago',
    title: 'SZW Arboportaal: PAGO, Arbowet artikel 18',
    url: `${arbo}/onderwerpen/arbowet--en--regelgeving/arbobeleid/pago`,
    checkedAt: '2026-10-11',
    verification: 'official_explanation',
    confidence: 'moderate',
  },
  {
    id: 'pi-law-ahs',
    title: 'SZW Arboportaal: arbeidshygiënische strategie',
    url: `${arbo}/onderwerpen/persoonlijke-beschermingsmiddelen/persoonlijke-beschermingsmiddelen-als-hulpmiddel-voor-gezond-en-veilig-werken`,
    checkedAt: '2026-10-11',
    verification: 'official_explanation',
    confidence: 'moderate',
  },
];

type RiskArgs = [
  id: string,
  chapter: string,
  title: string,
  features: PiFeatureId[],
  scope: PiScope,
  activity: string,
  hazard: string,
  groups: string[],
  consequences: string[],
  source: string,
  collective: string,
  individual: string,
  ppe: string,
  increases: string[],
  documents: string[],
  questions: string[],
];
function risk(...a: RiskArgs): PiRule {
  const [
    id,
    chapter,
    title,
    features,
    scope,
    activity,
    hazard,
    groups,
    consequences,
    source,
    collective,
    individual,
    ppe,
    localIncreases,
    documents,
    questions,
  ] = a;
  return {
    id,
    chapter,
    title,
    features,
    scope,
    activity,
    hazard,
    groups,
    consequences,
    controls: { source, collective, individual, ppe },
    localIncreases,
    documents,
    questions,
    kind: 'risk',
    legalSourceIds: [],
    exclusionConditions:
      'Alle genoemde taak-/blootstellingstriggers aantoonbaar afwezig binnen deze scope, inclusief afwijkende diensten, storing en nood. Motiveer met bewijs, onderzoeker en datum. Geen strijdig signaal of documentclaim.',
  };
}
const personnel = ['PIW en toezicht', 'Facilitair', 'Externe medewerkers'];
const workOrganisation = '3. Werkorganisatie en psychosociale belasting';
const workplace = '4. Gebouw, werkplek en omgeving';
const tasks = '5. Taken, arbeidsmiddelen en blootstelling';
const specific = '6. PI-taken, incidenten en interfaces';
export const PI_ROUTER_RULES: PiRule[] = [
  ...[
    [
      'rie-cycle',
      'RI&E, PvA en actualisatie',
      'centrale inventarisatie, beoordeling en opvolging',
      'pi-law-rie',
      ['Actuele RI&E/PvA en scopeoverzicht', 'Wijzigings- en besluitregister'],
      [
        'Welke onderwerpen zijn per functie en dienst onderzocht en welke gegevens ontbreken?',
        'Laat één risico van bron via criterium en oordeel naar PvA en effectcontrole reconstrueren.',
      ],
    ],
    [
      'prevention',
      'Preventie en deskundige bijstand',
      'rollen, beschikbare deskundigheid en medezeggenschap',
      'pi-law-prevention',
      ['Aanwijzing en mandaat preventie', 'Deskundigencontract en overlegregistratie'],
      [
        'Wie ondersteunt de RI&E met welke kennis, tijd en onafhankelijk advies?',
        'Hoe bereiken medewerkers de preventiemedewerker en hoe is samenwerking met OR/PVT en deskundigen ingericht?',
      ],
    ],
    [
      'instruction',
      'Voorlichting, instructie en toezicht',
      'taakgerichte instructie en praktijktoepassing',
      'pi-law-instruction',
      ['Taak- en instructiematrix', 'Opleidingsregistraties en praktijkcontroles'],
      [
        'Is instructie afgestemd op actuele taken en blootstelling, inclusief tijdelijke medewerkers?',
        'Laat de uitvoering zien; deelname of een certificaat alleen bewijst geen veilige toepassing.',
      ],
    ],
    [
      'emergency-organisation',
      'BHV en noodorganisatie',
      'risicogestuurde noodhulp bij alle diensten',
      'pi-law-bhv',
      ['BHV-organisatie, bezetting en uitrusting', 'Oefen- en responservaringen'],
      [
        'Zijn mensen en middelen beschikbaar bij ziekte, nachtwerk en gelijktijdige incidenten?',
        'Hoe werkt lokale respons samen met externe hulpverlening en beveiliging?',
      ],
    ],
    [
      'health-surveillance',
      'PAGO en gezondheidskundige terugkoppeling',
      'aanbod afgestemd op arbeidsrisico’s',
      'pi-law-pago',
      ['PAGO-aanbod en advies bedrijfsarts', 'Geaggregeerde risico- en gezondheidsinformatie'],
      [
        'Hoe is het PAGO-aanbod gekoppeld aan de RI&E en relevante blootgestelde groepen?',
        'Welke geaggregeerde uitkomsten leiden tot aanpassing van maatregelen?',
      ],
    ],
  ].map((item): PiRule => {
    const [id, title, activity, legalId, documents, questions] = item as [
      string,
      string,
      string,
      string,
      string[],
      string[],
    ];
    return {
      id,
      title,
      activity,
      documents,
      questions,
      chapter: '1. Stelsel, verplichtingen en bewijs',
      kind: 'obligation',
      obligationKind: 'law',
      mandatory: true,
      scope: 'both',
      features: [],
      hazard:
        'Onvolledige preventie of onvoldoende aantoonbare uitvoering kan arbeidsrisico’s onbeheerst laten.',
      groups: ['Alle werknemers en betrokken tijdelijke medewerkers'],
      consequences: ['Ontbrekende preventie', 'Niet-navolgbare beoordeling of opvolging'],
      controls: {
        source: 'Structurele oorzaken en taakontwerp onderzoeken.',
        collective: 'Taken, middelen en bevoegdheden passend organiseren.',
        individual: 'Uitvoering en kennis per rol ondersteunen.',
        ppe: 'Alleen voor passende restrisico’s; geen vervanging voor het stelsel.',
      },
      localIncreases: [
        'Centrale afspraak niet lokaal bekend of uitvoerbaar',
        'Niet onderzochte groepen of diensten',
      ],
      exclusionConditions:
        'Niet uitsluiten door geen incidenten of geen geselecteerd risico. Centraal behandelen kan; lokale toepasselijkheid en uitvoering blijven zichtbaar.',
      legalSourceIds: [legalId],
    };
  }),
  {
    ...risk(
      'internal-requirements',
      '1. Stelsel, verplichtingen en bewijs',
      'Interne eisen en documentstatus',
      [],
      'both',
      'Geldige afspraken toepassen',
      'Verouderde of niet-vastgestelde documenten worden als norm toegepast.',
      personnel,
      ['Onjuiste taakgrens', 'Onvoldoende borging'],
      'Eén geldige bronversie en duidelijke scope.',
      'Toegankelijke documenten en wijzigingsbeheer.',
      'Bekendheid en taakgerichte terugkoppeling.',
      'Niet van toepassing op documentstatus.',
      ['Lege goedkeuringsvelden', 'Verschillende objectnamen'],
      ['Interne beleidsbronnen en versieregister'],
      [
        'Wie heeft deze versie vastgesteld en voor welke objecten geldt zij?',
        'Wat is wettelijke eis, interne eis of professionele goede praktijk?',
      ],
    ),
    kind: 'obligation',
    obligationKind: 'internal',
  },
  {
    ...risk(
      'reconstruction',
      '1. Stelsel, verplichtingen en bewijs',
      'Reconstructie en bronbeschikbaarheid',
      [],
      'both',
      'Een conclusie kunnen terugvolgen',
      'Bron genoemd maar niet ontvangen, gelezen of beschikbaar voor beoordeling.',
      personnel,
      ['Niet-navolgbaar oordeel'],
      'Herleidbare bronselectie.',
      'Register met versie, populatie, periode en gebruik.',
      'Tweede lezer reconstrueert een materiële conclusie.',
      'Niet van toepassing.',
      ['Ontbrekende versies', 'Niet-gebruik zonder motivering'],
      ['Bewijs- en bronregister'],
      [
        'Welke bron is genoemd, ontvangen, gelezen en beschikbaar gesteld?',
        'Kan een tweede onderzoeker feiten, criterium, afweging en oordeel terugvinden?',
      ],
    ),
    kind: 'obligation',
    obligationKind: 'good_practice',
  },
  {
    ...risk(
      'staffing',
      workOrganisation,
      'Bezetting, taakverdeling en competentiemix',
      ['new_staff', 'night_shift', 'prisoner_contact'],
      'both',
      'Toezicht, overdracht en gelijktijdige taken',
      'Onvoldoende beschikbare of bekwame ondersteuning bij overlappende gebeurtenissen.',
      ['PIW', 'Leidinggevenden', 'BHV/IBT', 'Tijdelijke medewerkers'],
      ['Letsel', 'Overbelasting', 'Vertraagde hulp'],
      'Taakontwerp en onnodige gelijktijdigheid verminderen.',
      'Passende bezetting, vervanging en gezamenlijke overdracht.',
      'Taakbevoegdheid, inwerkondersteuning en stop-/escalatieafspraak.',
      'Geen vervanging voor ondersteuning.',
      ['Assistentie verlaagt bezetting elders', 'Nieuwe teammix', 'Piekdrukte'],
      ['Taken en roosters', 'Bezettings- en competentiegegevens', 'Incidentanalyses'],
      [
        'Wie doet welke taak tijdens dag, nacht, uitval en nood?',
        'Wat gebeurt er bij twee gelijktijdige incidenten of uitval van de ervaren collega?',
      ],
    ),
    alwaysScan: true,
  },
  {
    ...risk(
      'psa',
      workOrganisation,
      'Werkdruk, omgangsvormen en traumatische belasting',
      ['night_shift', 'new_staff', 'prisoner_contact'],
      'both',
      'Dagelijkse samenwerking en ingrijpende gebeurtenissen',
      'Aanhoudende taakeisen of ongewenst gedrag leiden tot mentale en lichamelijke gezondheidsschade.',
      ['Alle functies', 'Leidinggevenden', 'Tijdelijke medewerkers'],
      ['Stressklachten', 'Uitval', 'Traumatische klachten'],
      'Onnodige taakeisen en bronnen van ongewenst gedrag aanpakken.',
      'Passende organisatie, aanspreekstructuur en teamondersteuning.',
      'Herstelruimte, nazorg en laagdrempelige melding.',
      'Niet geschikt als structurele PSA-maatregel.',
      ['Onvoldoende herstel', 'Niet gemelde intimidatie', 'Verschillen per team/dienst'],
      ['MO/MTO, verloop en verzuim met scope', 'PSA- en agressiesignalen', 'Nazorgafspraken'],
      [
        'Welke groepen en diensten ontbreken in de beschikbare signalen?',
        'Wat maakt melden veilig of lastig en welke oorzaken worden structureel aangepakt?',
      ],
    ),
    alwaysScan: true,
  },
  risk(
    'alone-work',
    workOrganisation,
    'Alleenwerk en assistentie',
    ['alone', 'night_shift'],
    'both',
    'Geïsoleerde taakuitvoering en hulp vragen',
    'Medewerker wordt onwel of aangevallen en hulp bereikt de situatie te laat.',
    ['PIW', 'Facilitair', 'Externe medewerkers', 'Nachtploeg'],
    ['Ernstig letsel', 'Verergering incident'],
    'Risicovolle alleenhandeling vermijden of taak anders inrichten.',
    'Beschikbare assistentie en dekkende communicatie.',
    'In-/uitmelding en afbreekcriteria.',
    'Aanvullend passend bij de taak.',
    ['Verlies zicht/contact', 'PZI-uitval', 'Afstand tot assistentie'],
    ['Taak- en bereikbaarheidsafspraken', 'Alarm-/responstesten'],
    [
      'Welke taken worden feitelijk zonder direct bereikbare hulp gedaan?',
      'Toon alarmdekking, ontvangst, locatiebepaling en hulprespons bij uitval.',
    ],
  ),
  risk(
    'shift-work',
    workOrganisation,
    'Nachtwerk en onregelmatige diensten',
    ['night_shift'],
    'both',
    'Roosters, nachtelijke taken en herstel',
    'Vermoeidheid vermindert alertheid en herstel en kan veiligheid en gezondheid beïnvloeden.',
    ['Nachtploeg', 'Wisseldiensten', 'Oproepkrachten'],
    ['Vermoeidheid', 'Fouten', 'Gezondheidsschade'],
    'Onnodige nachtelijke taaklast verminderen.',
    'Roosterontwerp, pauzemogelijkheid en noodbezetting.',
    'Herstel en aandacht voor individuele belastbaarheid.',
    'Geen oplossing voor vermoeidheid.',
    ['Overwerk', 'Onderbroken pauzes', 'Reistijd na zware dienst'],
    ['Werkelijke roosters en uren', 'Blootstellings- en gezondheidsadvies'],
    [
      'Welke diensten, overuren en pauzes worden werkelijk gewerkt?',
      'Hoe verschillen ondersteuning en belasting in de nacht van de dag?',
    ],
  ),
  risk(
    'special-groups',
    workOrganisation,
    'Bijzondere personeelsgroepen',
    ['special_groups', 'new_staff'],
    'both',
    'Werk aanpassen aan bijzondere kwetsbaarheid of ervaring',
    'Algemene taaktoedeling houdt onvoldoende rekening met kwetsbaarheid of gebrek aan ervaring.',
    [
      'Jongeren',
      'Zwangere werknemers',
      'Tijdelijke/inlenende medewerkers',
      'Medewerkers met beperkingen',
    ],
    ['Letsel', 'Gezondheidsschade'],
    'Niet-passende taak of blootstelling voorkomen.',
    'Passende werkvoorzieningen en veilige begeleiding.',
    'Persoonlijke afstemming zonder onnodige medische detailregistratie.',
    'Geschikte pasvorm wanneer nodig.',
    ['Onbekende inlenersscope', 'Niet aangepast inwerken'],
    ['Groepen en taaktoedeling', 'Advies en instructieafspraken'],
    [
      'Welke bijzondere groepen zijn aanwezig of kunnen binnen deze scope instromen?',
      'Welke taakgrenzen en aanpassingen zijn beschikbaar en worden toegepast?',
    ],
  ),
  risk(
    'routes',
    workplace,
    'Vallen, struikelen, stoten en beknelling',
    ['indoor', 'storage', 'manual_handling'],
    'both',
    'Lopen, goederen verplaatsen en deuren bedienen',
    'Natte vloer, obstakel of onverwachte deurbeweging veroorzaakt val, botsing of beknelling.',
    personnel,
    ['Botbreuk', 'Kneuzing', 'Beknelling'],
    'Obstakels, lekkage en gevaarlijke deurbeweging aanpakken.',
    'Veilige vloeren, routes, afscherming en verlichting.',
    'Tijdig melden en tijdelijk afzetten van defecten.',
    'Passend schoeisel waar nodig.',
    ['Haast', 'Zichtbeperking door last', 'Beveiligingsdeurconflict'],
    ['Inspecties en onderhoudsstatus', 'Loop- en vluchtrouteplattegrond'],
    [
      'Loop de route tijdens normale taakuitvoering en observeer deuren, vloeren en lasten.',
      'Welke oude inspectiepunten zijn hersteld en welk bewijs toont blijvende werking?',
    ],
  ),
  risk(
    'traffic',
    workplace,
    'Verkeer en voertuigen',
    ['traffic', 'transport_prisoners'],
    'both',
    'Terreinverkeer, rijden en laden/lossen',
    'Botsing of aanrijding door kruising van personen en voertuigen of beperkt zicht.',
    ['Chauffeurs', 'Logistiek', 'PIW', 'Externe partijen'],
    ['Ernstig letsel', 'Beknelling'],
    'Onnodige voertuigbewegingen en menging wegnemen.',
    'Scheiding routes, zicht, parkeer- en laadvoorzieningen.',
    'Bevoegdheid en duidelijke verkeersafspraken.',
    'Zichtbaarheid als aanvullende maatregel.',
    ['Achteruitrijden', 'Piekmomenten', 'Onbekende derden'],
    ['Verkeersplan', 'Voertuig- en bevoegdheidsgegevens'],
    [
      'Waar kruisen voetgangers en voertuigen en wat verandert bij piekdrukte?',
      'Hoe werkt veilige aankomst, uitstappen en laden in de gesloten omgeving?',
    ],
  ),
  risk(
    'ergonomics',
    workplace,
    'Beeldschermwerk en observatiepost',
    ['screens'],
    'both',
    'Rapporteren, observeren en communiceren',
    'Langdurige ongunstige houding of concentratieverstoring leidt tot klachten of fouten.',
    ['PIW-post', 'Administratie', 'Staf', 'Meldkamer'],
    ['Spier-/gewrichtsklachten', 'Visuele klachten', 'Fouten'],
    'Taakcombinatie en onnodige schermduur onderzoeken.',
    'Instelbare werkplek, verlichting en passende indeling.',
    'Werkhouding, herstel en afwisseling.',
    'Geen vervanging voor ergonomische inrichting.',
    ['Gedeelde post', 'Verstoring bij overdracht', 'Zicht vs houdingconflict'],
    ['Werkplekonderzoek', 'Taaktijden en klachten'],
    [
      'Hoe lang en met welke onderbrekingen werkt iedere groep aan beeldschermen?',
      'Observeer instelling, rapporteren en toezicht gelijktijdig.',
    ],
  ),
  risk(
    'climate',
    workplace,
    'Warmte, koude, ventilatie en verlichting',
    ['indoor', 'climate'],
    'both',
    'Binnenwerk en langdurig verblijf',
    'Ongeschikt binnenmilieu of onvoldoende zicht vergroot belasting en kan taakuitvoering hinderen.',
    ['PIW', 'Administratie', 'Facilitair'],
    ['Hittestress', 'Klachten', 'Verminderde alertheid'],
    'Warmte-/vervuilingsbronnen en bouwkundige oorzaak aanpakken.',
    'Geschikte ventilatie, zonwering en verlichting.',
    'Tijdelijke taak-/herstelafspraken op basis van blootstelling.',
    'Alleen waar taakgericht passend.',
    ['Zomerhitte', 'Vocht/schimmel', 'Tijdelijke ventilator beïnvloedt deuren'],
    ['Klachten, inspecties en metingen', 'Installatie- en onderhoudsgegevens'],
    [
      'Wat verschillen ruimte, seizoen, dienst en taakduur?',
      'Welke meetgegevens of waarnemingen tonen de werking en neveneffecten van maatregelen?',
    ],
  ),
  risk(
    'noise',
    tasks,
    'Geluid',
    ['noise', 'equipment'],
    'both',
    'Werk met lawaaiige bronnen of veel omgevingsgeluid',
    'Geluid veroorzaakt gezondheidsschade of maskeert communicatie en alarm.',
    ['Arbeid', 'Facilitair', 'Toezicht'],
    ['Gehoorschade', 'Communicatiefouten', 'Belasting'],
    'Stillere bron of werkmethode.',
    'Afscherming, akoestiek en brononderhoud.',
    'Blootstellingsduur en taakorganisatie.',
    'Passende gehoorbescherming met behoud van noodzakelijke communicatie.',
    ['Piekgeluid', 'Veel bronnen tegelijk', 'Afwijkend werk'],
    ['Bronnen en taaktijden', 'Geluidmetingen en communicatiecheck'],
    [
      'Welke bron, duur en pieken horen bij concrete taken?',
      'Is een alarm nog waarneembaar met bescherming en omgevingsgeluid?',
    ],
  ),
  risk(
    'vibration',
    tasks,
    'Trillingen',
    ['vibration', 'traffic'],
    'both',
    'Trillend gereedschap of voertuigwerk',
    'Herhaalde overdracht van trillingen veroorzaakt gezondheidsschade.',
    ['Chauffeurs', 'Technische medewerkers'],
    ['Hand-armklachten', 'Rugklachten'],
    'Andere methode of minder trillende bron.',
    'Onderhouden gereedschap, stoel en ondergrond.',
    'Taakduur en afwisseling.',
    'Geen ongefundeerde reductie aan handschoenen toekennen.',
    ['Lange taakduur', 'Slecht onderhoud'],
    ['Materieelgegevens', 'Taakduur en zo nodig meting'],
    [
      'Welke middelen worden hoe lang en onder welke omstandigheden gebruikt?',
      'Welke blootstellingsgegevens dragen de beoordeling?',
    ],
  ),
  risk(
    'physical-load',
    tasks,
    'Fysieke belasting',
    ['manual_handling', 'intervention', 'storage'],
    'both',
    'Tillen, dragen, duwen, trekken of ingrijpen',
    'Hoge kracht, ongunstige houding of onverwachte last beschadigt bewegingsapparaat.',
    ['PIW', 'Logistiek', 'Facilitair', 'Interventieteam'],
    ['Rug-/schouderletsel', 'Acute overbelasting'],
    'Last, afstand of fysieke handeling bij taakontwerp verminderen.',
    'Hulpmiddelen en passende werkhoogte/route.',
    'Taakverdeling en geschikte afbreekcriteria.',
    'Geen vervanging voor belastingreductie.',
    ['Onbekende inhoud van dozen', 'Onverwachte beweging', 'Hulp niet beschikbaar'],
    ['Taakgerichte belastinganalyse', 'Lasten, frequentie en hulpmiddelen'],
    [
      'Observeer representatieve taak: gewicht, kracht, houding, duur en frequentie.',
      'Wat verandert bij celontruiming, incident of defect hulpmiddel?',
    ],
  ),
  risk(
    'equipment',
    tasks,
    'Machines en arbeidsmiddelen',
    ['equipment', 'maintenance'],
    'both',
    'Gebruiken, reinigen en onderhouden',
    'Toegang tot bewegend deel of onverwachte start veroorzaakt snij-, plet- of ander letsel.',
    ['Arbeid', 'Facilitair', 'Externe medewerkers', 'Toezicht bij arbeid'],
    ['Amputatie', 'Beknelling', 'Snijletsel'],
    'Gevaarlijke handeling of energiebron vermijden.',
    'Afscherming, veilige bediening en energie-isolatie.',
    'Bevoegdheid, instructie en controle vóór hervatten.',
    'Taakgeschikt; geen vervanging voor afscherming.',
    ['Omzeilde beveiliging', 'Schoonmaak tijdens bedrijf', 'Taakgrens onduidelijk'],
    ['Middelenregister', 'Handleiding, keuring en veilige werkmethode'],
    [
      'Welke middelen worden werkelijk gebruikt en wie reinigt of lost storing op?',
      'Toon afscherming en veilige isolatie; wat bewijst veilige hervatting?',
    ],
  ),
  risk(
    'electricity',
    tasks,
    'Elektriciteit en energie-isolatie',
    ['equipment', 'maintenance'],
    'both',
    'Apparatuur gebruiken of technische storing oplossen',
    'Beschadiging of onjuiste veiligstelling leidt tot contact met spanning of onverwachte energie.',
    ['Facilitair', 'PIW bij kleine handelingen', 'Externe medewerkers'],
    ['Elektrocutie', 'Brand', 'Brandwonden'],
    'Onnodig werk aan actieve energiebron vermijden.',
    'Veilige installatie en aantoonbare isolatie.',
    'Taakbevoegdheid en stop bij afwijkingen.',
    'Alleen binnen passende specialistische werkmethode.',
    ['Eigen kleine reparatie buiten taak', 'Defect snoer', 'Onjuiste overdracht'],
    ['Installatiebeheer', 'Bevoegdheden en werkorders'],
    [
      'Waar stopt de gebruikstaak en begint technisch werk?',
      'Wie controleert veiligstelling en oplevering en hoe bereikt die informatie de gebruiker?',
    ],
  ),
  risk(
    'chemicals',
    tasks,
    'Gevaarlijke stoffen en schoonmaakmiddelen',
    ['chemicals', 'cleaning', 'maintenance'],
    'both',
    'Middelen doseren, gebruiken, opslaan en opruimen',
    'Inademing, huidcontact, mengen of morsen leidt tot vergiftiging, letsel of gezondheidsschade.',
    ['Schoonmaak', 'PIW', 'Facilitair', 'Externe medewerkers'],
    ['Irritatie', 'Vergiftiging', 'Brandwonden', 'Chronische schade'],
    'Stof/methode vervangen of onnodig gebruik vermijden.',
    'Gesloten dosering, ventilatie en veilige opslag.',
    'Taakgerichte blootstellingsbeoordeling en instructie.',
    'Passend gekozen bescherming met gebruikscontrole.',
    ['Onbekend product', 'Verkeerd verdunnen/mengen', 'Storing'],
    ['Productregister en veiligheidsinformatie', 'Blootstellings- en opslaggegevens'],
    [
      'Welke producten, hoeveelheden en handelingen komen per functie werkelijk voor?',
      'Observeer dosering, blootstellingsroutes en mors-/afvalafhandeling.',
    ],
  ),
  risk(
    'biological',
    tasks,
    'Biologische blootstelling en hygiëne',
    ['biological', 'prisoner_contact', 'search', 'cleaning', 'medication'],
    'both',
    'Contact met bloed, speeksel, afval of besmet materiaal',
    'Prik-, bijt-, spat- of huidcontact kan besmetting of gezondheidsklachten veroorzaken.',
    ['PIW', 'Zorg', 'Schoonmaak', 'Interventieteam'],
    ['Infectie', 'Ziekte', 'Nazorgbelasting'],
    'Onnodig contact voorkomen; scherp materiaal veilig verwijderen.',
    'Veilige werkmiddelen, hygiënevoorzieningen en afvoer.',
    'Taakmethode, post-expositieroute en instructie.',
    'Passende handschoenen/ogenbescherming volgens scenario.',
    ['Onverwacht scherp voorwerp', 'Spugen/bijten', 'Late nazorg'],
    ['Blootstellingsscenario’s', 'Hygiëne- en post-expositieafspraken'],
    [
      'Welke concrete contactroute kan optreden bij normale taak en incident?',
      'Laat zien waar men direct spoelt, meldt en deskundige nazorg krijgt.',
    ],
  ),
  risk(
    'height',
    tasks,
    'Werken op hoogte',
    ['height', 'maintenance'],
    'both',
    'Bereiken, repareren of inspecteren op hoogte',
    'Val bij instabiel opstapmiddel of onbeschermde rand veroorzaakt ernstig letsel.',
    ['Facilitair', 'Externe medewerkers', 'PIW bij afwijkende handeling'],
    ['Ernstig letsel', 'Dodelijk letsel'],
    'Werk vanaf veilige grondpositie organiseren.',
    'Veilige werkplek en collectieve randbeveiliging.',
    'Passend toegangsmiddel, bevoegdheid en afbreekcriteria.',
    'Alleen passende valbeveiliging inclusief reddingsmogelijkheid.',
    ['Improviseren op stoel', 'Niet bedoelde technische taak'],
    ['Taakgrenzen en werkmiddelen', 'Werk-/reddingsmethode'],
    [
      'Welke feitelijke handelingen vragen een verhoogde positie?',
      'Hoe wordt die positie veilig bereikt en wat gebeurt er als redding nodig is?',
    ],
  ),
  risk(
    'special-spaces',
    tasks,
    'Bijzondere en besloten ruimten',
    ['special_spaces', 'maintenance'],
    'both',
    'Betreden van technische of slecht toegankelijke ruimte',
    'Zuurstoftekort, gevaarlijke atmosfeer of moeilijke redding leidt tot ernstig letsel.',
    ['Facilitair', 'Externe medewerkers', 'Noodhulp'],
    ['Verstikking', 'Vergiftiging', 'Dodelijk letsel'],
    'Betreden vermijden door taak/ontwerp aan te passen.',
    'Veilige atmosfeer, energie-isolatie en toegangsvoorziening.',
    'Specifieke taakbeoordeling, toezicht en reddingsplan.',
    'Specialistisch gekozen middelen; geen redding zonder veilige methode.',
    ['Onbekende atmosfeer', 'Onvoorbereide hulpverlener'],
    ['Ruimte-/installatiegegevens', 'Toegangs- en reddingsmethode'],
    [
      'Welke ruimten hebben gevaarlijke atmosfeer, energie of moeilijke toegang?',
      'Hoe is veilige toegang én redding onderbouwd voor deze taak?',
    ],
  ),
  risk(
    'fire',
    specific,
    'Brand, rook en evacuatie in gesloten omgeving',
    ['fire_response', 'indoor', 'resident_cooking', 'maintenance'],
    'both',
    'Ontdekken, alarmeren, ontgrendelen en evacueren',
    'Rook/brand gecombineerd met gesloten deuren en beperkte hulp maakt veilige respons onmogelijk.',
    ['PIW', 'BHV', 'Facilitair', 'Externe hulpverleners'],
    ['Rookvergiftiging', 'Brandwonden', 'Dodelijk letsel'],
    'Ontstekingsbronnen en brandlast beperken.',
    'Compartimentering, detectie, ontgrendeling en veilige routes.',
    'Rollen, eerstehandelinggrens en gelijktijdige noodscenario’s oefenen.',
    'Alleen binnen passende taak en opleiding.',
    ['Geen zicht', 'Noodstroomuitval', 'Twee incidenten', 'Geblokkeerde route'],
    ['BHV- en gebouwgegevens', 'Alarm-/ontgrendeltests', 'Oefenverslagen'],
    [
      'Wie doet welke eerste handeling en wanneer wordt afgebroken?',
      'Toon ontgrendeling, vluchten en assistentie bij rook en systeemuitval.',
    ],
  ),
  risk(
    'aggression',
    specific,
    'Agressie, bedreiging en toezicht',
    ['prisoner_contact', 'visitors', 'intervention', 'search', 'transport_prisoners'],
    'both',
    'Insluiting, toezicht, gesprekken of handhaven',
    'Escalatie in contact met personen leidt tot aanval of bedreiging terwijl uitwijking/ondersteuning beperkt is.',
    ['PIW', 'Zorg', 'Bezoekersbegeleiding', 'Interventieteam'],
    ['Letsel', 'Traumatische klachten', 'Uitval'],
    'Vermijdbare escalatiebronnen en risicovolle taakopstelling aanpassen.',
    'Veilige indeling, zicht, uitwijking, bezetting en assistentie.',
    'Taakgerichte de-escalatie, afbreekcriteria, melden en nazorg.',
    'Alleen als scenario en taak dit dragen.',
    ['Onbekende persoon/situatie', 'Alleenwerk', 'Hulp elders ingezet'],
    ['Agressie- en bijna-incidentanalyses', 'Werkafspraken en alarm-/responsegegevens'],
    [
      'Reconstrueer een contactmoment met bron, faalpad en werkende barrières.',
      'Hoe zijn alarm, uitwijking en ondersteuning in deze ruimte/dienst geverifieerd?',
    ],
  ),
  risk(
    'search',
    specific,
    'Visitatie, fouillering en celinspectie',
    ['search'],
    'both',
    'Onderzoek aan persoon, cel of eigendommen',
    'Onverwacht scherp voorwerp, weerstand of onbekend materiaal veroorzaakt letsel/blootstelling.',
    ['PIW', 'Beveiliging', 'Interventieteam'],
    ['Snij-/prikletsel', 'Infectie', 'Agressieletsel'],
    'Onnodige directe hand-/lichaamsblootstelling vermijden.',
    'Veilige ruimte, middelen en assistentie.',
    'Taakgrens, inspectiemethode en onverwacht-materiaalroute.',
    'Passende bescherming voor concrete blootstelling.',
    ['Verborgen scherp voorwerp', 'Onbekende stof', 'Onvoldoende zicht'],
    ['Taakprocedure', 'Middelen en incidentleerpunten'],
    [
      'Welke vormen van onderzoek worden door wie gedaan?',
      'Wat verandert bij weerstand, vondst van scherp materiaal of onbekende stof?',
    ],
  ),
  risk(
    'intervention',
    specific,
    'Bijzondere interventie en ketenrespons',
    ['intervention'],
    'both',
    'IBT-inzet en overdracht aan ondersteunende teams',
    'Onvoldoende samenwerking of taakbevoegdheid vergroot fysieke belasting en letsel bij ingrijpen.',
    ['IBT', 'PIW', 'BHV', 'Zorg'],
    ['Letsel', 'Overbelasting', 'Traumatische belasting'],
    'Noodzaak en veilige alternatieven vóór interventie onderzoeken.',
    'Passende teambezetting, middelen en commandovoering.',
    'Rolbevoegdheid, scenario-oefening, afbreken en overdracht.',
    'Taakgeschikte bescherming.',
    ['Unitvreemd team', 'Middelen onbekend', 'Tegelijk ander incident'],
    ['Rol-/competentiematrix', 'Inzet- en evaluatiegegevens'],
    [
      'Welke medewerkers hebben deze afzonderlijke rol en wat is hun feitelijke inzet?',
      'Hoe verloopt de aansluiting met unit, zorg en BHV vóór, tijdens en na inzet?',
    ],
  ),
  risk(
    'prisoner-transport',
    specific,
    'In- en extern gedetineerdentransport',
    ['transport_prisoners'],
    'both',
    'Begeleiden, instappen, vervoeren en overdragen',
    'Agressie, verkeerssituatie of onveilige overdracht veroorzaakt letsel bij begeleiders.',
    ['PIW', 'Transportmedewerkers', 'Externe ketenpartners'],
    ['Letsel', 'Beknelling', 'Verkeersongeval'],
    'Onnodige verplaatsing en onveilige taakopstelling voorkomen.',
    'Veilige voertuig-/route-/overdrachtvoorzieningen.',
    'Duidelijke rol, informatie en noodprocedure.',
    'Taak- en scenarioafhankelijk.',
    ['Onvolledige overdracht', 'Onbekende vervoerssituatie'],
    ['Taak- en ketenafspraken', 'Route-/voertuiggegevens'],
    [
      'Gaat het om intern begeleiden, extern vervoer of beroepsmatig rijden?',
      'Waar vindt risico-overdracht plaats en wie organiseert ondersteuning?',
    ],
  ),
  risk(
    'visitors',
    specific,
    'Bezoek en externe personen',
    ['visitors'],
    'both',
    'Ontvangst, begeleiding en baliewerk',
    'Onbekende situatie, agressie of taakinterface leidt tot werknemerblootstelling.',
    ['Balie', 'PIW', 'Beveiliging', 'Externe medewerkers'],
    ['Letsel', 'Bedreiging', 'Stress'],
    'Taakstromen en onveilige confrontatieopstelling aanpassen.',
    'Passende ruimte, zicht, toegangsbeheer en assistentie.',
    'Heldere ontvangst- en overdrachtsafspraken.',
    'Alleen passend bij concrete taak.',
    ['Drukte', 'Onduidelijke taakgrens', 'Geen uitwijking'],
    ['Bezoek- en toegangsafspraken', 'Taak-/incidentgegevens'],
    [
      'Wie ontvangt/begeleidt bezoekers en wat verandert bij uitzonderingen?',
      'Welke risico’s voor bezoekers beïnvloeden de veiligheid van medewerkers?',
    ],
  ),
  risk(
    'food',
    tasks,
    'Voedselbereiding en keukentoezicht',
    ['food_work', 'resident_cooking'],
    'both',
    'Bereiden, distribueren of toezicht bij koken',
    'Hete vloeistof, snijmiddel, brandbron of confrontatie in keuken veroorzaakt werknemersletsel.',
    ['Voedselvoorziening', 'PIW', 'Facilitair'],
    ['Snijletsel', 'Verbranding', 'Agressieletsel'],
    'Gevaarlijke handeling of opstelling aanpassen.',
    'Veilige apparatuur, routes en toezichtpositie.',
    'Taakgrens en veilige uitgifte-/gebruikafspraken.',
    'Passend bij hete/scherpe handeling.',
    ['Onbekende PIW-taak', 'Drukte', 'Geen hulp'],
    ['Feitelijke taakverdeling', 'Middelen en werkwijze'],
    [
      'Bereidt/distribueert personeel beroepsmatig voedsel of houdt het alleen toezicht?',
      'Onderzoek hitte, messen, brand en toezicht ook wanneer een voedselmodule niet passend is.',
    ],
  ),
  risk(
    'medication',
    specific,
    'Medicatieverstrekking en werknemersrisico',
    ['medication'],
    'both',
    'Verstrekken, controleren of ondersteunen',
    'Onderbreking, weerstand of blootstelling bij handeling leidt tot werknemersschade; zorgveiligheid heeft afzonderlijke scope.',
    ['PIW', 'Zorg', 'Ondersteuners'],
    ['Agressie-/prikletsel', 'Stress', 'Blootstelling'],
    'Onnodige werknemerblootstelling en onveilige taakopstelling voorkomen.',
    'Geschikte voorzieningen en rolverdeling zorg/unit.',
    'Feitelijke handeling, autorisatie, instructie en storing-/incidentroute.',
    'Alleen bij concrete blootstellingsroute.',
    ['Onderbrekingen', 'Onbekende taakgrens', 'Opleiding als enige bewijs'],
    ['Taak-/autorisatieafspraken', 'Praktijk-/incidentgegevens'],
    [
      'Wat doet deze functie zelf, wat doet zorg en waar ligt de taakgrens?',
      'Welke werknemersblootstelling ontstaat; welk deel hoort bij aparte zorgkwaliteitsbeoordeling?',
    ],
  ),
  risk(
    'contractors',
    specific,
    'Onderhoud, derden en veilige hervatting',
    ['contractors', 'maintenance'],
    'both',
    'Werk uitbesteden, uitvoeren en opleveren',
    'Risico’s bij parallel werk of onvolledige overdracht blijven na oplevering bestaan.',
    ['Facilitair', 'Externe medewerkers', 'PIW', 'Overige gebruikers'],
    ['Letsel', 'Brand', 'Onveilige hervatting'],
    'Conflicterend werk en onnodige energie/blootstelling vermijden.',
    'Afzondering, veiligstelling en gecoördineerde werkplek.',
    'Taak-/bevoegdheidsgrens en bewijs van oplevercriteria.',
    'Volgens taakbeoordeling.',
    ['Onverwacht werk', 'Gebruik hervat zonder controle'],
    ['Werkorders en contractorafspraken', 'Oplever-/veiligstellingsbewijs'],
    [
      'Wie beheert taakinterface en informeert gebruikers?',
      'Welk criterium en welke controle bewijzen veilige hervatting?',
    ],
  ),
  risk(
    'storage',
    tasks,
    'Opslag, vallende voorwerpen en materialen',
    ['storage'],
    'both',
    'Opslaan, pakken en verplaatsen',
    'Instabiele opslag, stelling of onbekend materiaal leidt tot getroffen worden of blootstelling.',
    ['Logistiek', 'PIW', 'Facilitair'],
    ['Beknelling', 'Letsel', 'Blootstelling'],
    'Onnodige voorraad en risicovolle opslaghoogte verminderen.',
    'Passende stellingen, scheiding en veilige route.',
    'Belastingsgrenzen, inspectie en afval-/onbekendmateriaalroute.',
    'Passend bij concrete handling.',
    ['Onbekende inhoud', 'Gestapelde kratten', 'Route geblokkeerd'],
    ['Opslagregister en inspecties', 'Taken/lasten'],
    [
      'Waar, wat en hoeveel wordt opgeslagen en wie handelt dit af?',
      'Zijn stabiliteit, bereikbaarheid, gevaarlijke stoffen en vluchtwegen samen gecontroleerd?',
    ],
  ),
  risk(
    'ionising',
    tasks,
    'Ioniserende straling',
    ['ionising'],
    'both',
    'Specifieke apparatuur of radioactieve bron gebruiken',
    'Onvoldoende beheersing van een stralingsbron leidt tot blootstelling.',
    ['Bevoegde gebruikers', 'Onderhoud', 'Derden'],
    ['Stralingsschade'],
    'Niet-ioniserend alternatief of bronvermijding onderzoeken.',
    'Specialistische afscherming en toegangsbeperking.',
    'Deskundigheid, bron-/taakscope en dosimetrie passend vaststellen.',
    'Specialistisch en aanvullend.',
    ['Onbekende apparatuur', 'Onderhoud buiten scope'],
    ['Bron-/apparaatregister', 'Specialistische beoordeling en bevoegdheden'],
    [
      'Welke werkelijke bron of apparatuur is aanwezig?',
      'Welke specialistische scope en actuele eisen gelden voor dit concrete gebruik?',
    ],
  ),
  risk(
    'weapons',
    specific,
    'Vuurwapens en wapenreiniging',
    ['weapons'],
    'both',
    'Hanteren, vervoeren of reinigen',
    'Onbedoeld afgaan of reinigingsblootstelling veroorzaakt ernstig letsel.',
    ['Bevoegde wapen-/transportfuncties'],
    ['Dodelijk letsel', 'Chemische blootstelling'],
    'Onnodige wapen-/reinigingshandeling vermijden.',
    'Veilige daarvoor ingerichte ruimte en voorzieningen.',
    'Bevoegde taak, controle en veilige overdracht.',
    'Taakgeschikt en aanvullend.',
    ['Onjuiste taakgrens', 'Onverwacht geladen toestand'],
    ['Taakbevoegdheid en specifieke procedure', 'Reinigingsmiddelen'],
    [
      'Wie voert welke wapentaak daadwerkelijk uit?',
      'Hoe is veilige toestand aantoonbaar geborgd tijdens overdracht en reinigen?',
    ],
  ),
  risk(
    'explosive',
    tasks,
    'Explosiegevaar',
    ['explosive', 'chemicals', 'special_spaces'],
    'both',
    'Werk met ontvlambaar materiaal of bijzondere atmosfeer',
    'Ontvlambaar gas, damp of stof en ontstekingsbron leiden tot explosie.',
    ['Facilitair', 'Arbeid', 'Externe medewerkers'],
    ['Ernstig letsel', 'Brand', 'Dodelijk letsel'],
    'Explosieve atmosfeer voorkomen door stof/proceskeuze.',
    'Technische preventie en specialistisch geschikte middelen.',
    'Taak-/ruimtespecifieke beoordeling, coördinatie en ontstekingsbronbeheersing.',
    'Aanvullend; geen vervanging voor explosiepreventie.',
    ['Hotwork', 'Onbekende atmosfeer', 'Gevaarlijke opslag'],
    ['Stof-/proces-/ruimtegegevens', 'Specialistische beoordeling waar vereist'],
    [
      'Is een explosieve atmosfeer redelijkerwijs mogelijk bij normaal werk, storing of onderhoud?',
      'Wat is de afbakening met een afzonderlijk specialistisch onderzoek?',
    ],
  ),
];

/** Local bindings retain exact source occurrence identities; equal visible codes are not collapsed. */
export interface PiQuestionBinding {
  questionId: string;
  key: string;
  code: string;
  aspect: string;
  process: string;
  sourceId: string;
  page: number;
  topicIds: string[];
  mappingStatus: 'candidate' | 'checked';
  researchLevel?: 'central' | 'department' | 'local' | 'any';
  requiredFeatureIds?: PiFeatureId[];
  /** Deeper source blocks require a recorded topic signal or explicit local increase. */
  requiredSignalTopicIds?: string[];
}
export interface PiRouterBindings {
  id: string;
  schema: 'ima.pi-router-bindings/v1';
  sourceIds: string[];
  sourceSha256: string;
  bankDate: string;
  status: 'proposal';
  questions: PiQuestionBinding[];
  coverage?: 'full_source' | 'scoped_selection';
  originalQuestionCount?: number;
  scopeNote?: string;
}
export interface PiTopicRoute {
  rule: PiRule;
  applicability: 'required' | 'selected' | 'needs_verification' | 'excluded';
  priority: PiPriority;
  reasons: string[];
  missing: string[];
  claimStatus: 'not_verified';
  questions: PiQuestionBinding[];
}
export interface PiContradiction {
  topicId: string;
  reason: string;
}
export interface PiRouteResult {
  version: string;
  topics: PiTopicRoute[];
  contradictions: PiContradiction[];
  questionIds: string[];
  documents: string[];
  selectedTopicIds: string[];
  unknownTopicIds: string[];
  obligations: string[];
}
export function emptyPiRouterInputs(scopeTitle = ''): PiRouterInputs {
  return {
    scopeTitle,
    assessor: '',
    researchLevel: 'local',
    features: {},
    risks: {},
    selectedObligations: [],
    signals: [],
    documentClaims: [],
    exclusions: [],
    notes: '',
  };
}
const unique = <T>(values: T[]) => [...new Set(values)];
const priorityRank: Record<PiPriority, number> = { normal: 0, elevated: 1, urgent: 2 };
function exclusionComplete(exclusion: PiExclusion | undefined, input: PiRouterInputs): boolean {
  return Boolean(
    exclusion &&
    exclusion.scopeTitle.trim() === input.scopeTitle.trim() &&
    exclusion.reason.trim() &&
    exclusion.assessor.trim() &&
    exclusion.evidenceIds.length &&
    /^\d{4}-\d{2}-\d{2}T/.test(exclusion.reviewedAt) &&
    Number.isFinite(Date.parse(exclusion.reviewedAt)),
  );
}
export function resolvePiRoute(
  input: PiRouterInputs,
  bindings: PiRouterBindings[] = [],
): PiRouteResult {
  assertPiRouterInputs(input);
  bindings.forEach(assertPiRouterBindings);
  const bindingQuestions = bindings
    .flatMap((binding) => binding.questions)
    .sort((a, b) => a.questionId.localeCompare(b.questionId));
  const occurrenceIds = new Set<string>();
  for (const question of bindingQuestions) {
    if (occurrenceIds.has(question.questionId))
      throw new Error(
        'Dezelfde bronvraag komt in meerdere geïmporteerde routerbindings voor. Kies één bronversie.',
      );
    occurrenceIds.add(question.questionId);
  }
  const contradictions: PiContradiction[] = [];
  if (input.noSignalsDeclared && input.signals.length)
    contradictions.push({
      topicId: '',
      reason:
        'Geen signalen verklaard, maar er zijn incidenten, klachten of veranderingen vastgelegd.',
    });
  const topics = PI_ROUTER_RULES.map((rule): PiTopicRoute => {
    const present = rule.features.filter((id) => input.features[id] === 'present');
    const unknown = rule.features.filter(
      (id) => !input.features[id] || input.features[id] === 'unknown',
    );
    const absent =
      rule.features.length > 0 && rule.features.every((id) => input.features[id] === 'absent');
    const selection = input.risks[rule.id] ?? 'unknown';
    const signals = input.signals.filter((signal) => signal.topicIds.includes(rule.id));
    const claims = input.documentClaims.filter((claim) => claim.topicId === rule.id);
    const positiveClaim = claims.some((claim) =>
      ['present', 'effective', 'ineffective'].includes(claim.claim),
    );
    const selected = selection !== 'unknown' || input.selectedObligations.includes(rule.id);
    const trigger = present.length > 0 || selected || signals.length > 0 || positiveClaim;
    const exclusion = input.exclusions.find((candidate) => candidate.topicId === rule.id);
    const reasons: string[] = [],
      missing: string[] = [];
    if (rule.mandatory)
      reasons.push(
        'Zelfstandige wettelijke onderzoeksplicht; niet afhankelijk van risico- of incidentselectie.',
      );
    if (present.length)
      reasons.push(
        `Profiel: ${present.map((id) => PI_PROFILE_FEATURES.find(([key]) => key === id)![1]).join('; ')}.`,
      );
    if (selection !== 'unknown')
      reasons.push(
        `Risicoselectie: ${selection === 'possible' ? 'mogelijk' : selection === 'confirmed' ? 'vastgesteld volgens invoer' : 'lokaal verhoogd volgens invoer'}; feitelijke onderbouwing blijft te controleren.`,
      );
    if (input.selectedObligations.includes(rule.id))
      reasons.push('Geselecteerde organisatorische verplichting.');
    if (signals.length)
      reasons.push(
        'Incident, klacht of verandering activeert onderzoek; bepaalt geen risicoscore.',
      );
    if (claims.length)
      reasons.push(
        'Documentclaim aanwezig; aanwezigheid, toepassing en effect zijn niet door de router geverifieerd.',
      );
    if (absent && (selected || signals.length || positiveClaim))
      contradictions.push({
        topicId: rule.id,
        reason:
          'Alle profieltriggers staan op afwezig terwijl een risico, signaal of documentclaim aanwezigheid suggereert.',
      });
    if (present.length && claims.some((claim) => claim.claim === 'absent'))
      contradictions.push({
        topicId: rule.id,
        reason: 'Profiel vermeldt aanwezigheid terwijl een documentclaim afwezigheid vermeldt.',
      });
    if (
      claims.some((claim) => claim.claim === 'effective') &&
      (signals.length || claims.some((claim) => claim.claim === 'ineffective'))
    )
      contradictions.push({
        topicId: rule.id,
        reason:
          'Claim van werkende beheersing botst met een signaal of claim van onvoldoende werking; controleer dezelfde taak, periode en scope.',
      });
    let applicability: PiTopicRoute['applicability'] = rule.mandatory
      ? 'required'
      : trigger
        ? 'selected'
        : 'needs_verification';
    if (exclusion) {
      if (rule.mandatory || trigger || rule.alwaysScan)
        contradictions.push({
          topicId: rule.id,
          reason:
            'Uitsluiting botst met een verplichte basiscontrole of positieve trigger; onderwerp blijft in onderzoek.',
        });
      else if (absent && exclusionComplete(exclusion, input)) {
        applicability = 'excluded';
        reasons.push(`Gemotiveerde uitsluiting voor deze scope: ${exclusion.reason}`);
      } else
        missing.push(
          'Uitsluiting mist aantoonbaar afwezige triggers, passende scope of volledige bewijs-/onderzoeker-/datumregistratie.',
        );
    }
    if (unknown.length && applicability !== 'excluded')
      missing.push(`Onbekende profielkenmerken: ${unknown.join(', ')}.`);
    if (!trigger && !rule.mandatory && applicability !== 'excluded')
      reasons.push(
        rule.alwaysScan
          ? 'Gemeenschappelijk onderwerp: basiscontrole per locatie/dienst nodig.'
          : 'Niet geselecteerd is onbekend; eerst taak-/blootstellingspoort controleren.',
      );
    if (applicability !== 'excluded')
      missing.push(
        'Lokale aanwezigheid, blootstelling, afwijkingen en werking van maatregelen nog te verifiëren.',
      );
    let priority: PiPriority = selection === 'increased' || signals.length ? 'elevated' : 'normal';
    if (signals.some((signal) => signal.severity === 'serious')) priority = 'urgent';
    const questions = ['required', 'selected'].includes(applicability)
      ? bindingQuestions.filter(
          (question) =>
            question.topicIds.includes(rule.id) &&
            (!question.researchLevel ||
              question.researchLevel === 'any' ||
              question.researchLevel === (input.researchLevel ?? 'local')) &&
            (question.requiredFeatureIds ?? []).every((id) => input.features[id] === 'present') &&
            (question.requiredSignalTopicIds ?? []).every(
              (id) =>
                input.risks[id] === 'increased' ||
                input.signals.some((signal) => signal.topicIds.includes(id)),
            ),
        )
      : [];
    if (!questions.length && ['required', 'selected'].includes(applicability))
      missing.push(
        'Geen passende bronvraagkoppeling voor deze onderzoekslaag en bevestigde taken; gebruik eigen onderzoeksvragen, koppel centrale bronnen en controleer moduledekking.',
      );
    return {
      rule,
      applicability,
      priority,
      reasons,
      missing,
      claimStatus: 'not_verified',
      questions,
    };
  });
  topics.sort(
    (a, b) =>
      priorityRank[b.priority] - priorityRank[a.priority] || a.rule.id.localeCompare(b.rule.id),
  );
  const selected = topics.filter((topic) => ['required', 'selected'].includes(topic.applicability));
  return {
    version: PI_ROUTER_VERSION,
    topics,
    contradictions,
    questionIds: unique(
      selected.flatMap((topic) => topic.questions.map((question) => question.questionId)),
    ),
    documents: unique(selected.flatMap((topic) => topic.rule.documents)),
    selectedTopicIds: selected.map((topic) => topic.rule.id),
    unknownTopicIds: topics
      .filter((topic) => topic.applicability === 'needs_verification')
      .map((topic) => topic.rule.id),
    obligations: selected
      .filter((topic) => topic.rule.kind === 'obligation')
      .map((topic) => topic.rule.id),
  };
}

function requireObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label}: object vereist.`);
}
function string(value: unknown, label: string, allowEmpty = true): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > 20_000)
    throw new Error(`${label}: ongeldige tekst.`);
}
function strings(value: unknown, label: string): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item.trim()) ||
    new Set(value).size !== value.length
  )
    throw new Error(`${label}: unieke tekst-ID’s vereist.`);
}
const ruleIds = new Set(PI_ROUTER_RULES.map((rule) => rule.id));
function topic(value: unknown) {
  string(value, 'Onderwerp', false);
  if (!ruleIds.has(value)) throw new Error(`Onbekend routeronderwerp: ${value}.`);
}
export function assertPiRouterInputs(value: unknown): asserts value is PiRouterInputs {
  requireObject(value, 'Routerinvoer');
  string(value.scopeTitle, 'Scope');
  string(value.assessor, 'Onderzoeker');
  string(value.notes, 'Notities');
  if (value.dossierId !== undefined) string(value.dossierId, 'Dossier', false);
  if (value.organisationId !== undefined) string(value.organisationId, 'Organisatie', false);
  if (
    value.researchLevel !== undefined &&
    !['central', 'department', 'local'].includes(String(value.researchLevel))
  )
    throw new Error('Onderzoekslaag ongeldig.');
  if (value.noSignalsDeclared !== undefined && typeof value.noSignalsDeclared !== 'boolean')
    throw new Error('Signaalverklaring ongeldig.');
  requireObject(value.features, 'Profiel');
  for (const [id, presence] of Object.entries(value.features))
    if (
      !PI_PROFILE_FEATURES.some(([key]) => key === id) ||
      !['unknown', 'present', 'absent'].includes(String(presence))
    )
      throw new Error('Profielkenmerk ongeldig.');
  requireObject(value.risks, 'Risicoselecties');
  for (const [id, selection] of Object.entries(value.risks)) {
    topic(id);
    if (!['unknown', 'possible', 'confirmed', 'increased'].includes(String(selection)))
      throw new Error('Risicoselectie ongeldig.');
  }
  strings(value.selectedObligations, 'Verplichtingen');
  value.selectedObligations.forEach((id) => {
    topic(id);
    if (PI_ROUTER_RULES.find((r) => r.id === id)?.kind !== 'obligation')
      throw new Error('Verplichtingsselectie verwijst naar een risico.');
  });
  for (const key of ['signals', 'documentClaims', 'exclusions'])
    if (!Array.isArray(value[key]) || value[key].length > 10_000)
      throw new Error(`${key}: lijst vereist.`);
  const signalIds = new Set<string>();
  for (const signal of value.signals as unknown[]) {
    requireObject(signal, 'Signaal');
    string(signal.id, 'Signaal-ID', false);
    if (signalIds.has(signal.id)) throw new Error('Dubbel signaal-ID.');
    signalIds.add(signal.id);
    strings(signal.topicIds, 'Signaalonderwerpen');
    signal.topicIds.forEach(topic);
    if (
      !signal.topicIds.length ||
      !['incident', 'near_miss', 'complaint', 'change'].includes(String(signal.kind)) ||
      !['unspecified', 'serious'].includes(String(signal.severity))
    )
      throw new Error('Signaalsoort of ernst ongeldig.');
    strings(signal.sourceIds, 'Signaalbronnen');
    string(signal.note, 'Signaalnotitie');
  }
  for (const claim of value.documentClaims as unknown[]) {
    requireObject(claim, 'Documentclaim');
    topic(claim.topicId);
    string(claim.sourceId, 'Claimbron', false);
    string(claim.note, 'Claimnotitie');
    if (!['present', 'absent', 'effective', 'ineffective', 'unknown'].includes(String(claim.claim)))
      throw new Error('Documentclaim ongeldig.');
  }
  const exclusions = new Set<string>();
  for (const exclusion of value.exclusions as unknown[]) {
    requireObject(exclusion, 'Uitsluiting');
    topic(exclusion.topicId);
    if (exclusions.has(String(exclusion.topicId)))
      throw new Error('Dubbele onderwerpuitzondering.');
    exclusions.add(String(exclusion.topicId));
    for (const key of ['scopeTitle', 'reason', 'assessor', 'reviewedAt'])
      string(exclusion[key], `Uitsluiting ${key}`);
    strings(exclusion.evidenceIds, 'Uitsluitbewijs');
  }
}
export function assertPiRouterBindings(value: unknown): asserts value is PiRouterBindings {
  requireObject(value, 'Routerbronbinding');
  if (value.schema !== 'ima.pi-router-bindings/v1' || value.status !== 'proposal')
    throw new Error('Routerbronbinding: schema/status ongeldig.');
  string(value.id, 'Binding-ID', false);
  strings(value.sourceIds, 'Bindingbronnen');
  string(value.bankDate, 'Bankdatum', false);
  if (typeof value.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceSha256))
    throw new Error('Bronbankhash ongeldig.');
  if (!Array.isArray(value.questions)) throw new Error('Bindingvragen ontbreken.');
  if (
    value.coverage !== undefined &&
    !['full_source', 'scoped_selection'].includes(String(value.coverage))
  )
    throw new Error('Bronbankdekking ongeldig.');
  if (
    value.originalQuestionCount !== undefined &&
    (!Number.isInteger(value.originalQuestionCount) ||
      Number(value.originalQuestionCount) < value.questions.length)
  )
    throw new Error('Oorspronkelijk bronvraagaantal ongeldig.');
  if (value.scopeNote !== undefined) string(value.scopeNote, 'Bronbankscopetoelichting', false);
  const occurrences = new Set<string>();
  for (const q of value.questions) {
    requireObject(q, 'Vraagbinding');
    for (const key of ['questionId', 'key', 'code', 'aspect', 'process', 'sourceId'])
      string(q[key], `Binding ${key}`, false);
    if (occurrences.has(String(q.questionId))) throw new Error('Dubbele bronvraagbinding.');
    occurrences.add(String(q.questionId));
    if (
      !Number.isInteger(q.page) ||
      Number(q.page) < 1 ||
      !['candidate', 'checked'].includes(String(q.mappingStatus))
    )
      throw new Error('Vraagpagina of mappingstatus ongeldig.');
    strings(q.topicIds, 'Bindingonderwerpen');
    q.topicIds.forEach(topic);
    if (
      q.researchLevel !== undefined &&
      !['central', 'department', 'local', 'any'].includes(String(q.researchLevel))
    )
      throw new Error('Vraagbinding onderzoekslaag ongeldig.');
    if (q.requiredFeatureIds !== undefined) {
      strings(q.requiredFeatureIds, 'Vraagbinding taakfilters');
      for (const id of q.requiredFeatureIds)
        if (!PI_PROFILE_FEATURES.some(([key]) => key === id))
          throw new Error('Onbekend bronvraag-taakfilter.');
    }
    if (q.requiredSignalTopicIds !== undefined) {
      strings(q.requiredSignalTopicIds, 'Vraagbinding verdiepingssignalen');
      q.requiredSignalTopicIds.forEach(topic);
    }
    if (!(value.sourceIds as string[]).includes(String(q.sourceId)))
      throw new Error('Vraagbinding verwijst buiten eigen bronbank.');
  }
}
export function piBindingsFromWorkspace(workspace: WorkspaceState): PiRouterBindings[] {
  return (workspace.contentRecords ?? [])
    .filter((record) => record.schema === 'ima.pi-router-bindings/v1')
    .map((record) => {
      assertPiRouterBindings(record);
      return record;
    });
}
export interface PiRiskLibrary {
  id: string;
  schema: 'ima.pi-risk-library/v1';
  status: 'draft_sourcegrounded';
  date: string;
  sourceIds: string[];
  scope: string;
  boundaries: string[];
  rows: {
    id: string;
    riskId: string;
    sourceStatus: 'general_knowledge' | 'general_knowledge_and_attributed_document_claim';
    documentedControls: string[];
    claimSourceIds: string[];
    verificationStatus: 'not_locally_verified';
    localLayer: {
      presence: 'unknown';
      exposure: 'unknown';
      deviations: 'unknown';
      controlPresence: 'unknown';
      controlUse: 'unknown';
      controlEffect: 'unknown';
    };
    questionBindingRecordId: string;
    missingInformation: string[];
  }[];
}
export function assertPiRiskLibrary(value: unknown): asserts value is PiRiskLibrary {
  requireObject(value, 'Brongetrouwe risicobasis');
  if (value.schema !== 'ima.pi-risk-library/v1' || value.status !== 'draft_sourcegrounded')
    throw new Error('Risicobasis schema/status ongeldig.');
  for (const key of ['id', 'scope', 'date']) string(value[key], `Risicobasis ${key}`, false);
  if (!Number.isFinite(Date.parse(value.date as string)))
    throw new Error('Risicobasisdatum ongeldig.');
  strings(value.sourceIds, 'Risicobasisbronnen');
  strings(value.boundaries, 'Risicobasisgrenzen');
  if (!Array.isArray(value.rows)) throw new Error('Risicobasisrijen ontbreken.');
  const riskIds = new Set<string>(),
    rowIds = new Set<string>();
  for (const row of value.rows) {
    requireObject(row, 'Risicobasisrij');
    topic(row.riskId);
    string(row.id, 'Risicobasisrij-ID', false);
    string(row.questionBindingRecordId, 'Risicobasisbinding', false);
    if (rowIds.has(row.id as string) || riskIds.has(row.riskId as string))
      throw new Error('Dubbele risicobasisrij.');
    rowIds.add(row.id as string);
    riskIds.add(row.riskId as string);
    strings(row.documentedControls, 'Toegeschreven maatregelen');
    strings(row.claimSourceIds, 'Claimbronnen');
    strings(row.missingInformation, 'Risicobasisdatagaten');
    if (
      !['general_knowledge', 'general_knowledge_and_attributed_document_claim'].includes(
        String(row.sourceStatus),
      ) ||
      row.verificationStatus !== 'not_locally_verified'
    )
      throw new Error('Risicobasisbronstatus ongeldig.');
    if ((row.sourceStatus === 'general_knowledge') !== !(row.claimSourceIds as string[]).length)
      throw new Error('Risicobasisclaimstatus botst met bronverwijzing.');
    if ((row.claimSourceIds as string[]).some((id) => !(value.sourceIds as string[]).includes(id)))
      throw new Error('Risicobasisclaimbron valt buiten bronregister.');
    requireObject(row.localLayer, 'Lokale risicolaag');
    for (const key of [
      'presence',
      'exposure',
      'deviations',
      'controlPresence',
      'controlUse',
      'controlEffect',
    ])
      if (row.localLayer[key] !== 'unknown')
        throw new Error('Een bronbibliotheek mag geen lokale bevestiging of werking verzinnen.');
  }
}
export function piRiskLibrariesFromWorkspace(
  workspace: Pick<WorkspaceState, 'contentRecords'>,
): PiRiskLibrary[] {
  return (workspace.contentRecords ?? [])
    .filter((record) => record.schema === 'ima.pi-risk-library/v1')
    .map((record) => {
      assertPiRiskLibrary(record);
      return record;
    });
}
export interface PiRouterRecord {
  id: string;
  schema: 'ima.pi-router/v1';
  ruleVersion: string;
  title: string;
  inputs: PiRouterInputs;
  createdAt: string;
  sourceIds: string[];
  bindingIds: string[];
  /** One occurrence snapshot per selected question; rule IDs point to the immutable rule version. */
  questionSnapshot: PiQuestionBinding[];
  bindingSnapshot: (Omit<PiRouterBindings, 'questions'> & { questionIds: string[] })[];
  result: Omit<PiRouteResult, 'topics'> & {
    topics: (Omit<PiTopicRoute, 'rule' | 'questions'> & {
      ruleId: string;
      questionIds: string[];
    })[];
  };
  sha256: string;
}
function compactResult(result: PiRouteResult): PiRouterRecord['result'] {
  const { topics, ...rest } = result;
  return {
    ...rest,
    topics: topics.map(({ rule, questions, ...topic }) => ({
      ...topic,
      ruleId: rule.id,
      questionIds: questions.map((question) => question.questionId),
    })),
  };
}
export function piRouterQuestionBindings(record: PiRouterRecord): PiQuestionBinding[] {
  return record.questionSnapshot.filter((question) =>
    record.result.questionIds.includes(question.questionId),
  );
}
export function piRouterResult(record: PiRouterRecord): PiRouteResult {
  const questions = new Map(record.questionSnapshot.map((q) => [q.questionId, q]));
  const { topics, ...rest } = record.result;
  return {
    ...rest,
    topics: topics.map(({ ruleId, questionIds, ...topic }) => {
      const rule = PI_ROUTER_RULES.find((rule) => rule.id === ruleId);
      if (!rule) throw new Error('Bevroren routerregel ontbreekt in deze regelversie.');
      return {
        ...topic,
        rule,
        questions: questionIds.map((id) => {
          const question = questions.get(id);
          if (!question) throw new Error('Bevroren bronvraagbinding ontbreekt.');
          return question;
        }),
      };
    }),
  };
}
function routerHash(record: Omit<PiRouterRecord, 'sha256'>): string {
  return Array.from(sha256(new TextEncoder().encode(JSON.stringify(record))))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
type PiAnchorWorkspace = Pick<
  WorkspaceState,
  'organisations' | 'dossiers' | 'departments' | 'sites' | 'projectContexts'
>;
function assertPiRouterAnchor(workspace: PiAnchorWorkspace, input: PiRouterInputs): void {
  if (
    input.organisationId &&
    !workspace.organisations?.some((organisation) => organisation.id === input.organisationId)
  )
    throw new Error('Routerorganisatie ontbreekt.');
  const dossier = workspace.dossiers?.find((dossier) => dossier.id === input.dossierId);
  if (input.dossierId && !dossier) throw new Error('Routerdossier ontbreekt.');
  if (
    input.organisationId &&
    dossier?.organisationId &&
    input.organisationId !== dossier.organisationId
  )
    throw new Error('Routerorganisatie botst met de organisatie van het gekoppelde dossier.');
  const context = workspace.projectContexts?.find(
    (context) => context.id === dossier?.projectContextId,
  );
  if (
    input.organisationId &&
    context?.organisationIds.length &&
    !context.organisationIds.includes(input.organisationId)
  )
    throw new Error('Routerorganisatie valt buiten de gekoppelde projectcontext.');
  const departmentOrganisations = (dossier?.departmentIds ?? []).flatMap((id) => {
    const department = workspace.departments?.find((item) => item.id === id);
    const organisationId =
      department?.organisationId ??
      workspace.sites?.find((site) => site.id === department?.siteId)?.organisationId;
    return organisationId ? [organisationId] : [];
  });
  if (input.organisationId && departmentOrganisations.some((id) => id !== input.organisationId))
    throw new Error('Routerorganisatie botst met een gekoppelde dossierafdeling.');
}
export function piRouterHasDossierAnchor(
  workspace: PiAnchorWorkspace,
  input: PiRouterInputs,
): boolean {
  const dossier = workspace.dossiers?.find((dossier) => dossier.id === input.dossierId);
  return Boolean(
    input.organisationId ||
    dossier?.organisationId ||
    dossier?.projectContextId ||
    dossier?.departmentIds.length,
  );
}
export function capturePiRouterRecord(
  workspace: WorkspaceState,
  input: PiRouterInputs,
  options: { id: string; now: string } = { id: crypto.randomUUID(), now: new Date().toISOString() },
): PiRouterRecord {
  assertPiRouterInputs(input);
  if (!input.scopeTitle.trim() || !input.assessor.trim())
    throw new Error('Scope en onderzoeker zijn vereist voor vastleggen.');
  assertPiRouterAnchor(workspace, input);
  const knownSources = new Set(workspace.sources.map((source) => source.id));
  const knownEvidence = new Set(
    (workspace.evidence ?? [])
      .filter(
        (evidence) =>
          !input.dossierId || !evidence.dossierId || evidence.dossierId === input.dossierId,
      )
      .map((evidence) => evidence.id),
  );
  const sourceIds = unique([
    ...input.signals.flatMap((signal) => signal.sourceIds),
    ...input.documentClaims.map((claim) => claim.sourceId),
  ]);
  for (const id of sourceIds)
    if (!knownSources.has(id)) throw new Error(`Routerbron ontbreekt: ${id}.`);
  for (const exclusion of input.exclusions)
    for (const id of exclusion.evidenceIds)
      if (!knownEvidence.has(id))
        throw new Error(`Uitsluitbewijs ontbreekt of hoort bij een ander dossier: ${id}.`);
  const bindings = piBindingsFromWorkspace(workspace);
  for (const binding of bindings)
    for (const id of binding.sourceIds)
      if (!knownSources.has(id)) throw new Error(`Routerbindingbron ontbreekt: ${id}.`);
  const frozenInput = structuredClone(input);
  const result = resolvePiRoute(frozenInput, bindings);
  const selectedQuestions = new Set(result.questionIds);
  const record: Omit<PiRouterRecord, 'sha256'> = {
    id: options.id,
    schema: 'ima.pi-router/v1',
    ruleVersion: PI_ROUTER_VERSION,
    title: input.scopeTitle,
    inputs: frozenInput,
    createdAt: options.now,
    sourceIds: unique([...sourceIds, ...bindings.flatMap((binding) => binding.sourceIds)]),
    bindingIds: bindings.map((binding) => binding.id),
    questionSnapshot: structuredClone(
      bindings
        .flatMap((binding) => binding.questions)
        .filter((q) => selectedQuestions.has(q.questionId))
        .sort((a, b) => a.questionId.localeCompare(b.questionId)),
    ),
    bindingSnapshot: structuredClone(
      bindings.map(({ questions, ...declaration }) => ({
        ...declaration,
        originalQuestionCount: declaration.originalQuestionCount ?? questions.length,
        questionIds: questions
          .filter((q) => selectedQuestions.has(q.questionId))
          .map((q) => q.questionId),
      })),
    ),
    result: structuredClone(compactResult(result)),
  };
  if (!options.id.trim() || !Number.isFinite(Date.parse(options.now)))
    throw new Error('Vastleg-ID of datum ongeldig.');
  return { ...record, sha256: routerHash(record) };
}
/** Frozen results are checked against their own content, not against a later mutable source bank. */
export function assertPiRouterRecord(value: unknown): asserts value is PiRouterRecord {
  requireObject(value, 'Routerrecord');
  if (value.schema !== 'ima.pi-router/v1' || value.ruleVersion !== PI_ROUTER_VERSION)
    throw new Error('Routerrecord: schema/regelversie onbekend.');
  string(value.id, 'Router-ID', false);
  string(value.title, 'Routertitel', false);
  string(value.createdAt, 'Vastlegging', false);
  if (!Number.isFinite(Date.parse(value.createdAt))) throw new Error('Routerdatum ongeldig.');
  strings(value.sourceIds, 'Routerbronnen');
  strings(value.bindingIds, 'Routerbindings');
  assertPiRouterInputs(value.inputs);
  if (
    !value.inputs.scopeTitle.trim() ||
    !value.inputs.assessor.trim() ||
    value.title !== value.inputs.scopeTitle
  )
    throw new Error('Routertitel, scope of onderzoeker is inconsistent.');
  requireObject(value.result, 'Routerresultaat');
  const { sha256: hash, ...record } = value;
  if (hash !== routerHash(record as unknown as Omit<PiRouterRecord, 'sha256'>))
    throw new Error('Routerrecordhash wijkt af.');
  // Rebuild using only the unique occurrence bindings sealed in the snapshot.
  if (!Array.isArray(value.result.topics)) throw new Error('Routeronderwerpen ontbreken.');
  if (!Array.isArray(value.questionSnapshot) || !Array.isArray(value.bindingSnapshot))
    throw new Error('Routerbronsnapshot ontbreekt.');
  const questions = value.questionSnapshot as PiQuestionBinding[];
  const declarations = value.bindingSnapshot as PiRouterRecord['bindingSnapshot'];
  if (
    declarations.length !== (value.bindingIds as string[]).length ||
    declarations.some(
      (declaration, index) => declaration.id !== (value.bindingIds as string[])[index],
    )
  )
    throw new Error('Binding-ID’s wijken af van snapshot.');
  const seen = new Set<string>();
  for (const declaration of declarations)
    strings(declaration.questionIds, 'Bevroren bankvraag-ID’s');
  for (const q of questions) {
    if (seen.has(q.questionId)) throw new Error('Dubbele bevroren bronvraagbinding.');
    seen.add(q.questionId);
    if (
      !declarations.some(
        (declaration) =>
          declaration.sourceIds.includes(q.sourceId) &&
          declaration.questionIds.includes(q.questionId),
      )
    )
      throw new Error('Vraagbinding heeft geen bevroren brondeclaratie.');
  }
  const inferredBindings = declarations.map((declaration) => ({
    ...declaration,
    questions: declaration.questionIds.map((id) => {
      const question = questions.find((q) => q.questionId === id);
      if (!question) throw new Error('Bevroren bankvraagbinding ontbreekt.');
      return question;
    }),
  }));
  const expected = compactResult(resolvePiRoute(value.inputs, inferredBindings));
  if (JSON.stringify(expected) !== JSON.stringify(value.result))
    throw new Error('Routerresultaat wijkt af van de bevroren invoer en regels.');
  const selectedQuestionIds = value.result.questionIds as string[];
  if (questions.some((question) => !selectedQuestionIds.includes(question.questionId)))
    throw new Error('Snapshot bevat bronvragen buiten de onderzoeksset.');
}
export function assertPiRouterCollections(
  workspace: Pick<
    WorkspaceState,
    | 'contentRecords'
    | 'sources'
    | 'dossiers'
    | 'evidence'
    | 'organisations'
    | 'departments'
    | 'sites'
    | 'projectContexts'
  >,
): void {
  for (const record of workspace.contentRecords ?? []) {
    if (record.schema === 'ima.pi-router-bindings/v1') {
      assertPiRouterBindings(record);
      for (const id of record.sourceIds)
        if (!workspace.sources.some((source) => source.id === id))
          throw new Error(`Bindingbron ontbreekt: ${id}.`);
      // Source banks may be imported before question definitions; show coverage gaps rather than invent questions.
    } else if (record.schema === 'ima.pi-risk-library/v1') {
      assertPiRiskLibrary(record);
      for (const id of record.sourceIds)
        if (!workspace.sources.some((source) => source.id === id))
          throw new Error(`Risicobasisbron ontbreekt: ${id}.`);
      for (const row of record.rows)
        if (
          !workspace.contentRecords?.some(
            (binding) =>
              binding.id === row.questionBindingRecordId &&
              binding.schema === 'ima.pi-router-bindings/v1',
          )
        )
          throw new Error('Risicobasisvraagbinding ontbreekt.');
    } else if (record.schema === 'ima.pi-router/v1') {
      assertPiRouterRecord(record);
      assertPiRouterAnchor(workspace, record.inputs);
      for (const id of record.sourceIds)
        if (!workspace.sources.some((source) => source.id === id))
          throw new Error(`Routerbron ontbreekt: ${id}.`);
      for (const exclusion of record.inputs.exclusions)
        for (const id of exclusion.evidenceIds) {
          const evidence = workspace.evidence?.find((e) => e.id === id);
          if (
            !evidence ||
            (record.inputs.dossierId &&
              evidence.dossierId &&
              evidence.dossierId !== record.inputs.dossierId)
          )
            throw new Error('Uitsluitbewijs ontbreekt of is buiten dossierscope.');
        }
    }
  }
}
export function piRouterRecord(record: WorkspaceRecord): PiRouterRecord | undefined {
  if (record.schema !== 'ima.pi-router/v1') return;
  assertPiRouterRecord(record);
  return record;
}
export const piApplicabilityLabels: Record<PiTopicRoute['applicability'], string> = {
  required: 'Zelfstandig te beoordelen verplichting',
  selected: 'In onderzoeksset',
  needs_verification: 'Toepasselijkheid nog te verifiëren',
  excluded: 'Gemotiveerd uitgesloten',
};
export function piRouterMarkdown(workspace: WorkspaceState): string[] {
  const records = (workspace.contentRecords ?? [])
    .map(piRouterRecord)
    .filter((r): r is PiRouterRecord => Boolean(r));
  const lines = piRiskLibraryMarkdown(workspace);
  if (!records.length) return lines;
  lines.push('', '## RI&E-router: bevroren onderzoekssets', '');
  for (const record of records) {
    lines.push(
      `### ${record.title} [${record.id}]`,
      `Onderzoeker: ${record.inputs.assessor} | vastgelegd: ${record.createdAt} | regelversie: ${record.ruleVersion}`,
      `Dossier: ${record.inputs.dossierId ?? 'Niet gekoppeld'} | organisatie: ${record.inputs.organisationId ?? 'Via dossier of nog niet gekoppeld'} | SHA-256: ${record.sha256}`,
      record.inputs.notes,
      `Onderzoekslaag: ${record.inputs.researchLevel ?? 'local'}. Centrale bronvragen worden niet automatisch op een lokale unit gedupliceerd.`,
      'Toepasselijkheid, onderzoeksprioriteit en feitelijke risicobeoordeling zijn afzonderlijke uitkomsten. Deze set bevat geen risicoscore of geverifieerde maatregelwerking.',
      '',
      'Profielselecties:',
    );
    for (const [id, label] of PI_PROFILE_FEATURES)
      lines.push(`- ${label}: ${record.inputs.features[id] ?? 'unknown'}`);
    lines.push('', 'Tegenstrijdigheden:');
    for (const contradiction of record.result.contradictions)
      lines.push(`- ${contradiction.topicId || 'Overkoepelend'}: ${contradiction.reason}`);
    if (!record.result.contradictions.length)
      lines.push(
        '- Geen tegenstrijdigheid door deze regels gevonden; dit bewijst geen volledigheid.',
      );
    for (const route of piRouterResult(record).topics) {
      lines.push(
        '',
        `#### ${route.rule.title} [${route.rule.id}]`,
        `${piApplicabilityLabels[route.applicability]} | niveau: ${route.rule.scope} | onderzoeksprioriteit: ${route.priority}`,
        `Motivering: ${route.reasons.join(' ')}`,
        `Datagaten: ${route.missing.join(' ')}`,
      );
      if (route.applicability === 'excluded') continue;
      lines.push(
        `Activiteit: ${route.rule.activity}`,
        `Scenario: ${route.rule.hazard}`,
        `Groepen: ${route.rule.groups.join('; ')}`,
        `Gevolgen: ${route.rule.consequences.join('; ')}`,
        `Bronaanpak: ${route.rule.controls.source}`,
        `Collectief: ${route.rule.controls.collective}`,
        `Individueel: ${route.rule.controls.individual}`,
        `PBM: ${route.rule.controls.ppe}`,
        `Lokaal verhogend: ${route.rule.localIncreases.join('; ')}`,
        `Documenten: ${route.rule.documents.join('; ')}`,
        'Onderzoeksvragen:',
        ...route.rule.questions.map((q) => `- ${q}`),
        'Exacte bronvraagkoppelingen (voorstel, aanwezigheid en dekking controleren):',
        ...route.questions.map(
          (q) =>
            `- ${q.code} [${q.key}; ${q.questionId}] | ${q.process} | ${q.aspect} | bron ${q.sourceId}, p. ${q.page} | ${q.mappingStatus}`,
        ),
      );
    }
    lines.push(
      '',
      'Signalen:',
      ...record.inputs.signals.map(
        (s) =>
          `- ${s.kind}/${s.severity} [${s.id}]: ${s.note} | onderwerpen ${s.topicIds.join(', ')} | bronnen ${s.sourceIds.join(', ')}`,
      ),
      'Documentclaims:',
      ...record.inputs.documentClaims.map(
        (c) =>
          `- ${c.topicId}/${c.claim}: ${c.note} | bron ${c.sourceId}; lokale werking niet geverifieerd`,
      ),
      'Uitsluitregistratie:',
      ...record.inputs.exclusions.map(
        (e) =>
          `- ${e.topicId}: ${e.reason} | scope ${e.scopeTitle} | ${e.assessor}, ${e.reviewedAt} | bewijs ${e.evidenceIds.join(', ')}`,
      ),
    );
  }
  return lines;
}

/** Readable projection; JSON remains the complete restorable workspace. */
export function piRiskLibraryMarkdown(workspace: WorkspaceState): string[] {
  const libraries = piRiskLibrariesFromWorkspace(workspace);
  if (!libraries.length) return [];
  const lines = [
    '',
    '## Brongetrouwe PI-risicobasis: centrale basis en lokale verificatielaag',
    '',
  ];
  const cell = (value: string) => value.replaceAll('|', '\|').replaceAll('\n', '<br>');
  for (const library of libraries) {
    lines.push(
      `### ${library.id}`,
      `Status: brongetrouw concept | vastgelegd: ${library.date}`,
      library.scope,
      'Een toegeschreven documentclaim blijft gescheiden van een lokale waarneming of beoordeling. Alle lokale lagen staan onbekend.',
    );
    lines.push(
      '| Thema / activiteit | Gevaar / scenario | Groepen | Gevolgen | AHS-principes | Bestaande maatregel / verificatie | Lokaal verhogend | Onderzoeksvragen | Bronnen / datagaten |',
      '|---|---|---|---|---|---|---|---|---|',
    );
    for (const row of library.rows) {
      const rule = PI_ROUTER_RULES.find((rule) => rule.id === row.riskId)!;
      const status = row.claimSourceIds.length
        ? 'Toegeschreven documentclaim; aanwezigheid, toepassing en effect lokaal onbekend.'
        : 'Niet aangetoond; aanwezigheid, toepassing en effect lokaal onbekend.';
      lines.push(
        '| ' +
          [
            rule.title + '; ' + rule.activity,
            rule.hazard,
            rule.groups.join('; '),
            rule.consequences.join('; '),
            `Bron: ${rule.controls.source} Collectief: ${rule.controls.collective} Individueel: ${rule.controls.individual} PBM: ${rule.controls.ppe}`,
            row.documentedControls.join(' ') + ' ' + status,
            rule.localIncreases.join('; '),
            rule.questions.join(' '),
            `${row.claimSourceIds.join(', ') || 'Algemene vakkennis; geen specifieke lokale claim'}; ${row.missingInformation.join('; ')}; vraagbinding: ${row.questionBindingRecordId}`,
          ]
            .map(cell)
            .join(' | ') +
          ' |',
      );
    }
    lines.push('', 'Scopegrenzen:', ...library.boundaries.map((boundary) => `- ${boundary}`));
  }
  return lines;
}

/** A separate workspace for interviewing: the full source bank and current workspace are untouched. */
export function createPiProjectWorkspace(
  workspace: WorkspaceState,
  record: PiRouterRecord,
  options: {
    now: string;
    workspaceId: string;
    routerId: string;
    dossierId: string;
    planId: string;
  } = {
    now: new Date().toISOString(),
    workspaceId: crypto.randomUUID(),
    routerId: crypto.randomUUID(),
    dossierId: crypto.randomUUID(),
    planId: crypto.randomUUID(),
  },
): WorkspaceState {
  assertPiRouterRecord(record);
  assertPiRouterAnchor(workspace, record.inputs);
  if (!piRouterHasDossierAnchor(workspace, record.inputs))
    throw new Error('Kies een organisatie of bestaand dossier vóór projectexport.');
  const selectedIds = new Set(record.result.questionIds);
  if (!selectedIds.size) throw new Error('Projectexport vereist een niet-lege bronvragenset.');
  const selected = [...selectedIds].map((id) => {
    const question = workspace.questions.find((q) => q.id === id);
    if (!question) throw new Error(`Projectexport: vraagdefinitie ontbreekt: ${id}.`);
    return structuredClone(question);
  });
  const sourceBanks = piBindingsFromWorkspace(workspace).filter((binding) =>
    record.bindingIds.includes(binding.id),
  );
  // Take the frozen bindings, not a later bank edit; retain original bank identity, hash and coverage count.
  const scopedBindings: PiRouterBindings[] = record.bindingSnapshot.map((declaration) => ({
    ...structuredClone(declaration),
    questions: record.questionSnapshot.filter((q) =>
      declaration.questionIds.includes(q.questionId),
    ),
    coverage: 'scoped_selection',
    originalQuestionCount:
      declaration.originalQuestionCount ??
      sourceBanks.find((bank) => bank.id === declaration.id)?.originalQuestionCount ??
      sourceBanks.find((bank) => bank.id === declaration.id)?.questions.length ??
      declaration.questionIds.length,
    scopeNote: `Afgebakende onderzoeksset ${record.id}, SHA-256 ${record.sha256}. Volledige bronbank blijft afzonderlijk bewaard. Uitbreiding vereist herselectie uit die bronbank.`,
  }));
  const project = createWorkspace(`Project: ${record.title}`, {
    questions: selected,
    sources: structuredClone(workspace.sources),
    organisations: structuredClone(workspace.organisations ?? []),
    sites: structuredClone(workspace.sites ?? []),
    departments: structuredClone(workspace.departments ?? []),
    projectContexts: structuredClone(workspace.projectContexts ?? []),
    contentRecords: [...scopedBindings, ...piRiskLibrariesFromWorkspace(workspace)].map(
      (value) => structuredClone(value) as unknown as WorkspaceRecord,
    ),
  });
  project.id = options.workspaceId;
  project.createdAt = options.now;
  project.updatedAt = options.now;
  const original = workspace.dossiers?.find((dossier) => dossier.id === record.inputs.dossierId);
  const groups = new Map<string, PiQuestionBinding[]>();
  for (const binding of piRouterQuestionBindings(record)) {
    const group = groups.get(binding.process) ?? [];
    group.push(binding);
    groups.set(binding.process, group);
  }
  const organisationId = original?.organisationId ?? record.inputs.organisationId;
  const plan: ModulePlan = {
    id: options.planId,
    title: `Onderzoeksset: ${record.title}`,
    scope: original?.departmentIds.length === 1 ? 'department' : 'project',
    ...(organisationId ? { organisationId } : {}),
    ...(original?.projectContextId ? { projectContextId: original.projectContextId } : {}),
    ...(original?.departmentIds.length === 1 ? { departmentId: original.departmentIds[0] } : {}),
    revision: 1,
    sourceIds: record.sourceIds,
    modules: [...groups].map(([process, questions], index) => ({
      id: `${options.routerId}:process:${index}`,
      origin: 'imported_theme',
      code: process,
      title: process,
      enabled: true,
      questionIds: questions.map((q) => q.questionId),
      sortOrder: index,
      sourceIds: unique(questions.map((q) => q.sourceId)),
      scopeNotes: `Kandidaatkoppelingen en lokale werking vereisen menselijke controle. Bronselectie ${record.id}, SHA-256 ${record.sha256}. Geen uitgevoerde RIEporter-invoer.`,
    })),
  };
  // These are source questions: no managed actor, approval, status or version is invented.
  const dossier = createDossierFromModulePlan(
    plan,
    selected as unknown as Parameters<typeof createDossierFromModulePlan>[1],
    project,
    {
      id: options.dossierId,
      title: `Onderzoeksdossier: ${record.title}`,
      scope: record.inputs.scopeTitle,
      assessor: record.inputs.assessor,
      createdAt: options.now,
    },
  );
  if (original) dossier.departmentIds = [...original.departmentIds];
  project.modulePlans = [plan];
  project.dossiers = [dossier];
  const copiedProof = new Map<string, string>();
  const proofProvenance: WorkspaceRecord[] = [];
  for (const id of unique(record.inputs.exclusions.flatMap((exclusion) => exclusion.evidenceIds))) {
    const evidence = workspace.evidence?.find((item) => item.id === id);
    if (!evidence) throw new Error(`Projectexport: uitsluitbewijs ontbreekt: ${id}.`);
    const copiedId = `${options.routerId}:evidence:${copiedProof.size}`;
    const {
      verifiedBy: _by,
      verifiedAt: _at,
      verificationNote: _note,
      verifiedContentSha256: _hash,
      ...data
    } = evidence;
    project.evidence!.push({
      ...structuredClone(data),
      id: copiedId,
      dossierId: dossier.id,
      status: 'unverified',
      description: `Bronkopie uit werkruimte ${workspace.id}, bewijs ${id}; oorspronkelijke dossierscope ${evidence.dossierId ?? 'niet vastgelegd'}. ${evidence.description}`,
    });
    copiedProof.set(id, copiedId);
    proofProvenance.push({
      id: `${copiedId}:provenance`,
      schema: 'ima.pi-project-evidence-copy/v1',
      parentWorkspaceId: workspace.id,
      sourceEvidenceId: id,
      sourceDossierId: evidence.dossierId ?? null,
      copiedEvidenceId: copiedId,
      note: 'Bewijskopie voor dezelfde onderzoeksafbakening. Oorspronkelijke verificatie wordt niet als nieuwe lokale verificatie overgenomen.',
    });
  }
  project.contentRecords!.push(...proofProvenance);
  const projectInput = {
    ...structuredClone(record.inputs),
    exclusions: record.inputs.exclusions.map((exclusion) => ({
      ...structuredClone(exclusion),
      evidenceIds: exclusion.evidenceIds.map((id) => copiedProof.get(id)!),
    })),
    dossierId: dossier.id,
    ...(organisationId ? { organisationId } : {}),
  };
  const projectRecord = capturePiRouterRecord(project, projectInput, {
    id: options.routerId,
    now: options.now,
  });
  if (
    JSON.stringify(projectRecord.result.questionIds) !== JSON.stringify(record.result.questionIds)
  )
    throw new Error('Projectexport wijkt af van de volledige geselecteerde vragenset.');
  project.contentRecords!.push(projectRecord as unknown as WorkspaceRecord, {
    id: `${options.routerId}:scope`,
    schema: 'ima.pi-project-scope/v1',
    parentWorkspaceId: workspace.id,
    parentRouterId: record.id,
    parentRouterSha256: record.sha256,
    createdAt: options.now,
    selectedQuestionCount: selectedIds.size,
    sourceBanks: scopedBindings.map((bank) => ({
      id: bank.id,
      sourceSha256: bank.sourceSha256,
      originalQuestionCount: bank.originalQuestionCount ?? bank.questions.length,
    })),
    note: 'Nieuwe projectwerkruimte; bestaande interviews en dossiers blijven in de oorspronkelijke werkruimte. Alle geselecteerde bronvragen zijn aanwezig; niet-geselecteerde bronvragen blijven in de afzonderlijke volledige bronbank.',
  });
  assertPiRouterCollections(project);
  return project;
}
