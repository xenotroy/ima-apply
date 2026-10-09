/**
 * Public knowledge layer. All shipped questions are newly authored generic prompts.
 * Confidential source facts, licensed source text, lesson files and student data
 * belong in a private workspace import; source availability is explicit below.
 */
export type HierarchyLevel = 'eliminate' | 'source' | 'collective' | 'individual' | 'ppe';
export type SourceStatus =
  'authored' | 'read' | 'partial_read' | 'metadata_only' | 'reference_only' | 'unavailable';
export type SourceKind =
  'vault' | 'reference' | 'questionnaire' | 'training' | 'lms' | 'web' | 'other';

export interface SourceRecord {
  id: string;
  title: string;
  kind: SourceKind;
  status: SourceStatus;
  readScope: string;
  publication: 'public' | 'metadata_only' | 'private';
  notes: string;
  url?: string;
}

export interface Question {
  id: string;
  themeId: string;
  title: string;
  prompt: string;
  route: 'kern' | 'verdieping';
  evidenceHints: string[];
  assessmentGuidance: string;
  sourceIds: string[];
  suggestedHierarchy: HierarchyLevel[];
  roles: string[];
  /** Original private norms/references, only present after a private import. */
  legalReferences?: string;
}

export interface Theme {
  id: string;
  title: string;
  description: string;
  sourceIds: string[];
  questions: Question[];
}

export interface ContentPack {
  id: string;
  title: string;
  description: string;
  level: 'basis' | 'verdieping' | 'vakbekwaamheid';
  themeIds: string[];
  sourceIds: string[];
  status: 'available' | 'local_import' | 'source_gap';
}

export const sources: SourceRecord[] = [
  {
    id: 'IMA-ORIGINAL',
    title: 'IMA Apply — eigen generieke vragen',
    kind: 'other',
    status: 'authored',
    readScope: 'Nieuwe vragen en bewijsaanwijzingen voor deze herbouw.',
    publication: 'public',
    notes:
      'Ontwerphulp voor inventarisatie; antwoorden vormen geen automatische conformiteitsverklaring of risicoscore.',
  },
  {
    id: 'IMA-LEGACY',
    title: 'Bestaande IMA vragenbank',
    kind: 'questionnaire',
    status: 'partial_read',
    readScope: 'Voorbeeldvragenbank en één arbobeleidsmodule in de oorspronkelijke repository.',
    publication: 'metadata_only',
    notes:
      'Legacy import is ondersteund; bronrechten en actualiteit van uitgebreide moduleteksten zijn niet vastgesteld.',
  },
  {
    id: 'VAULT-SCENARIO',
    title: 'VaultTek — scenario- en bewijsstructuur',
    kind: 'vault',
    status: 'read',
    readScope: 'Domeincontext en conceptnote over thematische RI&E als scenariodatabase.',
    publication: 'metadata_only',
    notes:
      'Conceptuele bron: scheid gevaar, faalconditie, scenario, maatregel en verificatie. Geen vastgestelde universele methode.',
  },
  {
    id: 'VAULT-QSET',
    title: 'PI Vught — structuur van private themavragenlijsten',
    kind: 'questionnaire',
    status: 'partial_read',
    readScope:
      'Tien oorspronkelijke themalijsten: 260 vraagteksten, beoordelingscriteria en verificatie-aanwijzingen gelezen; kern/verdieping, bronmetadata en normverwijzingen privé geïmporteerd.',
    publication: 'private',
    notes:
      'Private intake bevat 177 kern- en 83 verdiepingsvragen. De publieke catalogus bevat eigen generieke formuleringen. Geen projectbevindingen of oorspronkelijke private vragen gepubliceerd; normverwijzingen niet zelfstandig juridisch gevalideerd.',
  },
  {
    id: 'PGA-32489',
    title: 'Praktijkgids Arbeidsveiligheid — Arbeidsomstandighedenwet, inleiding',
    kind: 'reference',
    status: 'partial_read',
    readScope:
      'Bronnotitie plus oorspronkelijke PDF: pagina 2 (AHS/procesnormen) en 7 (RI&E, PvA, actualisering, voorlichting).',
    publication: 'metadata_only',
    notes:
      'PDF van 20 pagina’s, geselecteerde pagina’s gelezen. Bronnotitie vermeldt bijgewerkt tot 26 januari 2026; wettelijke actualiteit bij toepassing afzonderlijk controleren. Geen gelicentieerde tekst meegeleverd.',
    url: 'https://www.praktijkgidsarbeidsveiligheid.nl/publicaties/praktijkgids-arbeidsveiligheid/32489',
  },
  {
    id: 'PGA-32490',
    title: 'Praktijkgids Arbeidsveiligheid — Arbobesluit, regeling en beleidsregels',
    kind: 'reference',
    status: 'partial_read',
    readScope:
      'Bronnotitie plus oorspronkelijke PDF-pagina 1: juridische bronlagen, onderwerpscope, sectoren en risicogroepen.',
    publication: 'metadata_only',
    notes:
      'PDF van 6 pagina’s, eerste pagina gelezen. Bronnotitie vermeldt bijgewerkt tot 26 januari 2026. Geen tekst uit de gelicentieerde publicatie meegeleverd.',
    url: 'https://www.praktijkgidsarbeidsveiligheid.nl/publicaties/praktijkgids-arbeidsveiligheid/32490',
  },
  {
    id: 'SDU-AI43',
    title: 'AI-43 — Ongevallenonderzoek',
    kind: 'reference',
    status: 'partial_read',
    readScope:
      'Referentienotitie plus PDF-pagina’s 11–13 en 37–39: §§2.2–2.4 en 5.10–5.12, risicomethoden, koppeling RI&E, grondoorzaken en implementatie.',
    publication: 'metadata_only',
    notes:
      'Oorspronkelijke PDF van 92 pagina’s selectief gelezen; gedrukte pagina’s 7–9 en 33–35. Publicatie vermeldt 18 januari 2024. Nieuwe vragen zijn eigen formuleringen; oorspronkelijke tekst niet herverdeeld.',
  },
  {
    id: 'SDU-AI82',
    title: 'AI-82 — samengesteld praktijkdossier PSA',
    kind: 'reference',
    status: 'partial_read',
    readScope:
      'Referentienotitie plus samengestelde PDF-pagina’s 7–8: hoofdstuk 3, inventarisatie, risicogroepen, instrumenten, participatie en haalbare maatregelen.',
    publication: 'metadata_only',
    notes:
      'Secundaire bronnenbundel van 28 pagina’s; geselecteerde methodiekpagina’s gelezen. Dit is geen integrale lezing van het oorspronkelijke AI-blad. Vermelde AI-82-datum 2 april 2025; later materiaal niet juridisch geverifieerd.',
  },
  {
    id: 'SDU-AI45',
    title: 'AI-45 — Risicobeheersing',
    kind: 'reference',
    status: 'metadata_only',
    readScope:
      'Verwijzing in de arbobeleidsmodule plus oorspronkelijke PDF-route in de lokale HVK-bronstructuur aangetroffen.',
    publication: 'metadata_only',
    notes:
      'PDF is een cloudplaceholder met 0 lokaal toegewezen blokken. Inhoud niet gelezen of als inhoud opgenomen; editie/actualiteit niet vastgesteld.',
  },
  {
    id: 'SDU-AI61',
    title: 'AI-61 — Risico-inventarisatie en -evaluatie',
    kind: 'reference',
    status: 'metadata_only',
    readScope:
      'Verwijzing in de arbobeleidsmodule plus oorspronkelijke PDF-route in de lokale HVK-bronstructuur aangetroffen.',
    publication: 'metadata_only',
    notes:
      'PDF is een cloudplaceholder met 0 lokaal toegewezen blokken. Inhoud niet gelezen of als inhoud opgenomen; editie/actualiteit niet vastgesteld.',
  },
  {
    id: 'EDU-HVK',
    title: 'HVK — competentie- en curriculumanalyse',
    kind: 'training',
    status: 'partial_read',
    readScope:
      'Lokale databasecontext, bronnenregister en centrale curriculum- en competentiematrix.',
    publication: 'metadata_only',
    notes:
      'Werkversies en analyses: koppeling van risicobeoordeling, onderzoek, AHS, advies en borging. Geen nieuwe examen- of accreditatiebesluiten.',
  },
  {
    id: 'EDU-MVK',
    title: 'MVK — vergelijking van vakinhoud en praktijktoepassing',
    kind: 'training',
    status: 'partial_read',
    readScope: 'Lokale MVK/TMK-vergelijkingsanalyse voor HVK-ontwerp.',
    publication: 'metadata_only',
    notes:
      'Secundaire analyse gelezen; oorspronkelijke MVK-lesbestanden en beoordelingsleidraden niet integraal onderzocht.',
  },
  {
    id: 'EDU-LESSONS',
    title: 'HVK/MVK — operationeel lesmateriaal',
    kind: 'training',
    status: 'metadata_only',
    readScope:
      'Vindnotities plus 138 gericht geselecteerde oorspronkelijke lesbestanden en zes HVK/MVK-curriculum- of handleidingvermeldingen op beschikbaarheid gecontroleerd.',
    publication: 'private',
    notes:
      'Alle geselecteerde bestanden hebben 0 lokaal toegewezen blokken. Het lezen van Riskmanagement 2 (2025-06) gaf een timeout. Ook RI&E (2025-04) en gerichte PDF-alternatieven waren placeholders. Geen oorspronkelijke deck- of curriculumtekst geïmporteerd.',
  },
  {
    id: 'LMS-MOODLE',
    title: 'Moodle/LMS — leerroute en brongebruik',
    kind: 'lms',
    status: 'partial_read',
    readScope:
      'Modulecontext en bronwerkwijze plus drie oorspronkelijke conceptteksten voor lesdagen: gevaarlijke stoffen; Seveso/Bal/ARIE; BHV, noodplan en gebouwveiligheid.',
    publication: 'metadata_only',
    notes:
      'Drie lesontwikkelingsteksten zijn privé behouden als bronrecords, zonder daaruit toetsvragen te verzinnen. Geen actuele Moodle-CSV, MBZ/XML-back-up, deelnemers- of voortgangsexport aangetroffen in de succesvol onderzochte routes; één operationele OneDrive-route bleef ontoegankelijk.',
  },
  {
    id: 'VAULT-BOWTIE',
    title: 'VaultTek — bowtie met kaartjes op scenariopaden',
    kind: 'vault',
    status: 'read',
    readScope: 'Ontwerpnote voor onderscheid tussen preventie en mitigatie.',
    publication: 'metadata_only',
    notes:
      'Oorspronkelijke beeldmaker onbekend. Referentiebeeld wordt niet herverdeeld; het principe wordt zelfstandig vormgegeven.',
  },
  {
    id: 'ARBO-AHS',
    title: 'Arboportaal — arbeidshygiënische strategie',
    kind: 'web',
    status: 'read',
    readScope:
      'Officiële toelichting op de volgorde van beheersmaatregelen; geraadpleegd 7 oktober 2026.',
    publication: 'public',
    notes:
      'Bronaanpak, collectieve techniek, individuele organisatie en PBM. De app kent hieraan geen automatisch gemeten risicoreductiepercentage toe.',
    url: 'https://www.arboportaal.nl/onderwerpen/persoonlijke-beschermingsmiddelen/persoonlijke-beschermingsmiddelen-als-hulpmiddel-voor-gezond-en-veilig-werken',
  },
];

type DraftQuestion = [
  title: string,
  prompt: string,
  evidence: string[],
  guidance: string,
  hierarchy?: HierarchyLevel[],
  route?: 'kern' | 'verdieping',
];
function theme(
  id: string,
  title: string,
  description: string,
  sourceIds: string[],
  roles: string[],
  draft: DraftQuestion[],
): Theme {
  return {
    id,
    title,
    description,
    sourceIds,
    questions: draft.map(
      (
        [
          questionTitle,
          prompt,
          evidenceHints,
          assessmentGuidance,
          suggestedHierarchy = [],
          route = 'kern',
        ],
        index,
      ) => ({
        id: `${id}-${String(index + 1).padStart(2, '0')}`,
        themeId: id,
        title: questionTitle,
        prompt,
        route,
        evidenceHints,
        assessmentGuidance,
        sourceIds: ['IMA-ORIGINAL', ...sourceIds],
        suggestedHierarchy,
        roles,
      }),
    ),
  };
}

export const themes: Theme[] = [
  theme(
    'organisatie',
    'Organisatie, taken en RI&E',
    'Leg scope, werkpraktijk, risicogroepen en de uitvoering van maatregelen naast elkaar.',
    ['VAULT-SCENARIO', 'EDU-HVK', 'PGA-32489', 'PGA-32490'],
    ['medewerker', 'leidinggevende', 'preventiemedewerker'],
    [
      [
        'Werkelijke werkzaamheden',
        'Welke taken, locaties, diensten en afwijkende werkzaamheden vallen binnen deze inventarisatie?',
        ['Proceskaart met scope', 'Rondgang in verschillende diensten', 'Taakinterviews'],
        'Neem routinewerk, onderhoud, schoonmaak, storingen en tijdelijke werkzaamheden apart op. Een ontbrekende taak is een datagat.',
      ],
      [
        'Risicogroepen',
        'Welke medewerkers of derden lopen bij dezelfde taak een ander risico, en waardoor?',
        [
          'Overzicht functies en taken',
          'Taakgebonden blootstelling',
          'Geanonimiseerde werknemersinbreng',
        ],
        'Maak onderscheid tussen betrokken groepen en individuele gezondheidsinformatie. Onderzoek verschillen in ervaring, inzetbaarheid en werkcontext.',
      ],
      [
        'Bezetting en uitval',
        'Wat verandert in de veiligheid wanneer mensen, middelen of ondersteuning uitvallen?',
        ['Roosters zonder persoonsgegevens', 'Uitvalscenario', 'Waarneming op piekmoment'],
        'Beschrijf de faalconditie en de veilige terugval. Een gepland aantal medewerkers bewijst geen beschikbare hulp op het kritieke moment.',
        ['collective', 'individual'],
      ],
      [
        'Plan van aanpak',
        'Hoe wordt vastgesteld dat een afgesproken maatregel is uitgevoerd én het bedoelde scenario beheerst?',
        ['Actieregister', 'Acceptatiecriterium', 'Effectmeting na invoering'],
        'Scheid oplevering van werking. Leg bewijs, verantwoordelijke rol, reviewmoment en herbeoordeling vast.',
      ],
      [
        'Verandering',
        'Welke wijzigingen in proces, personeel, stoffen of installaties vragen om een nieuwe beoordeling?',
        ['Wijzigingsprocedure', 'Voorbeeld recente wijziging', 'Nieuwe scenarioanalyse'],
        'Controleer ook tijdelijke wijzigingen en nieuwe risico’s door de gekozen maatregel.',
        [],
        'verdieping',
      ],
      [
        'Werknemersinbreng',
        'Welke ervaring van medewerkers en hun vertegenwoordiging verandert de scope, maatregelkeuze of uitvoeringsafspraak?',
        ['Bespreking van de RI&E', 'Navolgbare verwerking van signalen', 'Terugkoppeling besluit'],
        'Controleer welke inbreng werkelijk is gebruikt. Deel de taakgebonden risico’s en maatregelen ook met tijdelijke krachten en betrokken derden.',
      ],
    ],
  ),
  theme(
    'agressie',
    'Agressie, dreiging en sociale interactie',
    'Onderzoek triggers, veilige inrichting, ondersteuning en leren van incidenten.',
    ['VAULT-QSET', 'SDU-AI82'],
    ['medewerker', 'leidinggevende', 'veiligheidskundige'],
    [
      [
        'Aanloop naar incident',
        'Welke concrete werksituaties kunnen escaleren tot bedreiging of fysiek geweld?',
        ['Taakinterview', 'Geanonimiseerde incidentpatronen', 'Observatie interactiemoment'],
        'Start bij de activiteit en escalatieketen. Een algemeen label agressie is nog geen scenario.',
      ],
      [
        'Inrichting en afstand',
        'Welke verandering in taak of inrichting kan onveilig contact voorkomen of afstand creëren?',
        ['Plattegrond zonder beveiligingsdetails', 'Taakherontwerp', 'Gebruikerstest'],
        'Onderzoek bron- en collectieve mogelijkheden vóór aanvullende afhankelijkheid van individuele vaardigheden.',
        ['eliminate', 'source', 'collective'],
      ],
      [
        'Veilige hulp',
        'Kunnen medewerkers bij dreiging tijdig hulp krijgen en een veilige positie bereiken?',
        ['Functionele alarmtest', 'Scenario-oefening', 'Observatie veilige terugtrekroute'],
        'Beoordeel de hele keten van herkennen, melden, ontvangen, reageren en aankomen. Laat operationele details in het private dossier.',
        ['collective', 'individual'],
      ],
      [
        'Nazorg en leren',
        'Hoe leiden meldingen, bijna-incidenten en nazorg tot aanpassing van het werk?',
        ['Geanonimiseerde evaluatie', 'Opvolging verbeterpunten', 'Terugkoppeling aan medewerkers'],
        'Afwezigheid van meldingen bewijst geen afwezigheid van risico. Onderzoek meldbereidheid en terugkoppeling.',
      ],
    ],
  ),
  theme(
    'alleenwerken',
    'Alleen werken, alarmering en noodcommunicatie',
    'Toets hulpbaarheid met realistische omstandigheden en controleerbare prestaties.',
    ['VAULT-QSET'],
    ['medewerker', 'leidinggevende', 'BHV', 'technische dienst'],
    [
      [
        'Hulpbaarheid',
        'Bij welke taken is directe hulp niet beschikbaar door afstand, deuren, geluid of gelijktijdig werk?',
        ['Taak- en locatieoverzicht', 'Observatie', 'Dienstscenario'],
        'Alleen werken is ook functioneel alleen zijn. Bepaal per scenario of werk aangepast of met ondersteuning uitgevoerd moet worden.',
        ['eliminate', 'collective', 'individual'],
      ],
      [
        'Melding onder belasting',
        'Werkt het melden van een noodsituatie ook met handschoenen, stress of beperkte bewegingsruimte?',
        ['Gecontroleerde gebruikstest', 'Medewerkersinterview', 'Gebruiksinstructie'],
        'Controleer beschikbaarheid, bedienbaarheid, dekking en bruikbare locatie-informatie; een apparaatbezit zegt weinig over de keten.',
        ['collective', 'individual'],
      ],
      [
        'Tijd tot hulp',
        'Hoe verhoudt de gemeten tijd tot effectieve hulp zich tot de tijd waarin het scenario ernstig wordt?',
        ['Gemeten oefenprestatie', 'Scenario met tijdsverloop', 'Opvolgregistratie'],
        'Gebruik een scenario-afhankelijk prestatiecriterium. Verzin geen algemene veilige responstijd en toets ook ongunstige diensten.',
      ],
      [
        'Uitval en gelijktijdigheid',
        'Welke werkbare terugval is er bij een defect meldmiddel of meerdere gelijktijdige hulpvragen?',
        ['Storingsprocedure', 'Oefening uitval', 'Beschikbare alternatieve middelen'],
        'Een terugvalprocedure telt pas als zij bekend, beschikbaar en getest is. Onderzoek gedeelde faaloorzaken.',
        ['collective', 'individual'],
        'verdieping',
      ],
    ],
  ),
  theme(
    'psa',
    'Werkdruk en sociale veiligheid',
    'Maak taakdruk, ongewenst gedrag, signalen en collectieve oorzaken onderzoekbaar.',
    ['VAULT-QSET', 'SDU-AI82'],
    ['medewerker', 'leidinggevende', 'preventiemedewerker', 'A&O-deskundige'],
    [
      [
        'Taakeisen en ruimte',
        'Wanneer passen taakeisen, beschikbare tijd en regelruimte onvoldoende bij elkaar?',
        ['Groepsgesprekken', 'Piekbelastinganalyse', 'Geanonimiseerde werkdrukmeting'],
        'Onderzoek oorzaken in werkorganisatie en prioriteiten. Individuele weerbaarheidstraining toont geen oplossing van structurele overbelasting.',
        ['source', 'collective'],
      ],
      [
        'Ongewenst gedrag',
        'Kunnen medewerkers ongewenst gedrag veilig bespreken en hoe wordt het vervolgens aangepakt?',
        ['Meldroute', 'Geanonimiseerde opvolging', 'Bekendheidstoets'],
        'Een formele regeling is opzet; bereikbaarheid, bruikbaarheid en veilige opvolging vragen ander bewijs.',
      ],
      [
        'Verschillende groepen',
        'Welke teams of functies ervaren een andere belasting en welke gegevens ondersteunen dat?',
        [
          'Geanonimiseerde groepsanalyse',
          'Taakverschillen',
          'Informatie van werknemersvertegenwoordiging',
        ],
        'Voorkom conclusies over kleine herkenbare groepen. Houd interviewverklaringen en uitkomsten van gevalideerd onderzoek gescheiden.',
        [],
        'verdieping',
      ],
      [
        'Effect van ingreep',
        'Welke veranderingen in het werk worden gevolgd om het effect van PSA-maatregelen vast te stellen?',
        ['Voor- en nameting', 'Procesindicatoren', 'Evaluatie met medewerkers'],
        'Koppel uitkomst aan werkcontext en andere veranderingen. Een gunstiger gemiddelde bewijst geen verbetering voor elke risicogroep.',
        ['source', 'collective'],
      ],
      [
        'Passend instrument',
        'Welke combinatie van gesprekken en onderzoeksinstrumenten past bij de PSA-signalen en de te onderzoeken groepen?',
        ['Onderzoeksopzet', 'Onderbouwing instrumentkeuze', 'Deskundige duiding'],
        'Een generieke checklist vervangt geen passende analyse. Maak duidelijk wat het instrument meet en welke conclusies het kan ondersteunen.',
        [],
        'verdieping',
      ],
      [
        'Haalbare eerste ingreep',
        'Welke eenvoudig uitvoerbare verandering kiezen betrokken medewerkers en leidinggevenden voor het concrete knelpunt?',
        ['Besproken alternatieven', 'Beschikbaar budget en tijd', 'Afgesproken effectcontrole'],
        'Onderbouw bereik en verwacht resultaat afzonderlijk van invoergemak. Betrek de mensen die de verandering in hun dagelijkse taak moeten toepassen.',
        ['source', 'collective'],
      ],
    ],
  ),
  theme(
    'brand',
    'Brand, BHV en evacuatie',
    'Verbind brandscenario’s, gebouw, aanwezigen en het werkelijk handelen van de noodorganisatie.',
    ['VAULT-QSET', 'LMS-MOODLE'],
    ['BHV', 'leidinggevende', 'gebouwbeheerder'],
    [
      [
        'Maatgevende scenario’s',
        'Welke brand- en medische noodsituaties bepalen de benodigde hulp en ontruimingsaanpak?',
        ['Scenarioanalyse', 'Aanwezigheidsprofiel', 'Noodplan'],
        'Beoordeel dag, nacht, beperkte mobiliteit, contractors en afwijkende gebouwsituaties afzonderlijk.',
      ],
      [
        'Preventie en scheiding',
        'Welke bronnen van brand en rook worden voorkomen, verwijderd of collectief afgeschermd?',
        ['Inspectie', 'Onderhoudsbewijs', 'Beoordeling taak en materialen'],
        'Brandpreventie, compartimentering, detectie en respons hebben verschillende functies; voorkom één ongespecificeerd reductiepercentage.',
        ['eliminate', 'source', 'collective'],
      ],
      [
        'Van alarm naar veilig',
        'Is de keten van ontdekken, alarmeren, reageren en veilig verlaten onder realistische omstandigheden getest?',
        ['Oefenverslag', 'Gebruikerstest', 'Waarneming vluchtroute'],
        'Het aanleggen van een voorziening bewijst nog geen succesvolle respons. Leg prestatie, knelpunten en opvolging vast.',
      ],
      [
        'Beschikbare hulp',
        'Zijn de benodigde BHV-capaciteit, middelen en bevoegdheden beschikbaar wanneer het noodscenario optreedt?',
        ['Dienstdekking', 'Materiaalcontrole', 'Oefening met afwezige sleutelrol'],
        'Kijk naar bereikbare hulp en deskundigheid in het scenario; tel opleidingscertificaten niet als beschikbaarheidsbewijs.',
        ['collective', 'individual'],
      ],
      [
        'Escalatie en herstel',
        'Hoe wordt vastgesteld dat knelpunten uit oefeningen zijn hersteld voordat een scenario opnieuw wordt vrijgegeven?',
        ['Afwijkingenregister', 'Herhalingstest', 'Vrijgavebewijs'],
        'Een afgesloten actie vraagt bewijs van de herstelde functie. Maak onbekende prestaties zichtbaar.',
        [],
        'verdieping',
      ],
    ],
  ),
  theme(
    'klimaat',
    'Binnenklimaat, verlichting, geluid en trillingen',
    'Koppel omstandigheden aan taak, duur, bron en representatieve metingen.',
    ['VAULT-QSET', 'EDU-HVK'],
    ['medewerker', 'gebouwbeheerder', 'arbeidshygiënist'],
    [
      [
        'Representatieve situatie',
        'Welke klachten of signalen hangen samen met seizoen, bezetting, taak of procescondities?',
        ['Klachtenpatroon zonder personen', 'Gebruiksgegevens', 'Meetplan'],
        'Een meting op één rustig moment kan de ongunstige situatie missen. Leg meetcontext en onzekerheid vast.',
      ],
      [
        'Bron en verspreiding',
        'Waar ontstaan warmte, luchtverontreiniging, geluid of trillingen en hoe bereiken zij de medewerker?',
        ['Broninventaris', 'Ventilatiegegevens', 'Taakobservatie'],
        'Beoordeel bron, overdracht en blootstelling afzonderlijk. Onderzoek bronaanpak of technische scheiding vóór alleen individuele beperking.',
        ['source', 'collective'],
      ],
      [
        'Werkende techniek',
        'Welke controle toont dat ventilatie, afscherming of bronafzuiging onder werkelijk gebruik blijft functioneren?',
        ['Inregel- of testgegevens', 'Onderhoudsregister', 'Effectmeting aan de werkplek'],
        'Een onderhoudssticker is geen effectmeting. Controleer gebruikscondities, verstoringen en veranderingen in bezetting.',
      ],
      [
        'Specialistisch onderzoek',
        'Voor welke blootstellingen is nader onderzoek nodig voordat een betrouwbaar oordeel mogelijk is?',
        ['Meetstrategie', 'Deskundigenadvies', 'Taakduur en intensiteit'],
        'Gebruik geen Fine–Kinney-score als vervanging voor een blootstellingsbeoordeling. De toepasselijke beoordelingsmethode volgt uit het risico.',
        [],
        'verdieping',
      ],
    ],
  ),
  theme(
    'elektra',
    'Elektrische veiligheid en energie-isolatie',
    'Beoordeel contact, ontsteking en onverwacht vrijkomende energie tijdens gebruik en onderhoud.',
    ['VAULT-QSET', 'EDU-HVK'],
    ['medewerker', 'technische dienst', 'installatieverantwoordelijke'],
    [
      [
        'Scenario en energie',
        'Welke werkzaamheden kunnen leiden tot aanraking, vlamboog, brand of onverwacht vrijkomende energie?',
        ['Installatie- en takenoverzicht', 'Onderhoudsinterview', 'Storingshistorie'],
        'Beschrijf ook niet-elektrische restenergie en tijdelijke apparatuur. Een keuringslijst is geen volledige scenariobeoordeling.',
      ],
      [
        'Veilige toestand',
        'Hoe wordt aantoonbaar voorkomen dat apparatuur onverwacht wordt ingeschakeld tijdens werkzaamheden?',
        ['Isolatieplan', 'Praktijkobservatie', 'Vrijgave en verificatie'],
        'Toets uitschakelen, scheiden, vergrendelen, verificatie en herstel in de juiste taakcontext. Meerdere labels op dezelfde handeling zijn geen onafhankelijke lagen.',
        ['eliminate', 'collective'],
      ],
      [
        'Defecten en herstel',
        'Wat gebeurt er met beschadigde of verdachte middelen totdat herstel en veilige vrijgave zijn aangetoond?',
        ['Afkeurregistratie', 'Fysieke quarantaine', 'Herstelbewijs'],
        'Controleer dat defecte middelen werkelijk uit gebruik blijven en niet alleen als melding zijn geregistreerd.',
        ['source', 'collective'],
      ],
      [
        'Rollen en afwijkingen',
        'Wie kan beoordelen, stoppen en vrijgeven wanneer veilig standaardwerk niet mogelijk is?',
        ['Rollen en bevoegdheden', 'Taakinstructie', 'Afwijkend-werkvoorbeeld'],
        'Leg de grenzen van bevoegdheid en deskundigheid vast. Een cursusdeelname bewijst geen bekwaamheid voor iedere technische taak.',
        ['individual'],
        'verdieping',
      ],
    ],
  ),
  theme(
    'stoffen',
    'Gevaarlijke stoffen en blootstelling',
    'Inventariseer stoffen, vrijkomende emissies, blootstellingsroutes en mogelijkheden tot bronaanpak.',
    ['EDU-HVK', 'LMS-MOODLE'],
    ['medewerker', 'preventiemedewerker', 'arbeidshygiënist'],
    [
      [
        'Volledige inventaris',
        'Welke gebruikte en door het proces gevormde stoffen kunnen medewerkers bereiken?',
        ['Stoffenregister', 'Veiligheidsinformatieblad', 'Procesobservatie'],
        'Neem ook lasrook, stof, verbrandingsproducten en onderhoudsmiddelen mee. Een inkooplijst mist procesemissies.',
      ],
      [
        'Blootstellingsscenario',
        'Bij welke taak, duur en werkomstandigheid treedt inhalatie, huidcontact of andere opname op?',
        ['Taakobservatie', 'Blootstellingsbeoordeling', 'Meetplan'],
        'Leg duur, intensiteit, frequentie, route en risicogroep vast. Onderscheid gevaarseigenschappen van feitelijke blootstelling.',
      ],
      [
        'Eliminatie en vervanging',
        'Kan het proces of materiaal zodanig veranderen dat de schadelijke blootstelling vervalt of afneemt?',
        ['Alternatievenvergelijking', 'Proef met vervanging', 'Beoordeling nieuwe gevaren'],
        'Vergelijk alternatieven op hun totale risico en maak randvoorwaarden zichtbaar. Minder gevarenlabels bewijzen geen lagere feitelijke blootstelling.',
        ['eliminate', 'source'],
      ],
      [
        'Collectieve bescherming',
        'Welke meting of test onderbouwt de werking van een gesloten proces, afzuiging of andere technische maatregel?',
        ['Functionele test', 'Voor- en nameting', 'Onderhoud en gebruikerscontrole'],
        'Meet in relevante gebruikscondities. Gebruik geen standaard efficiëntiepercentage zonder onderbouwing.',
        ['collective'],
      ],
      [
        'Persoonlijke bescherming',
        'Is aanvullende persoonlijke bescherming afgestemd op taak, blootstelling, pasvorm, onderhoud en gebruik?',
        ['Selectieonderbouwing', 'Gebruikscontrole', 'Passende fit- of functiecontrole'],
        'Beoordeel werkelijke bescherming en de reden waarom hogere maatregelen onvoldoende zijn. Een nominale productprestatie is geen gerealiseerde bescherming.',
        ['ppe'],
        'verdieping',
      ],
    ],
  ),
  theme(
    'biologie',
    'Biologische agentia en hygiëne',
    'Werk vanuit de taakgebonden contactroute, preventie en handelen na blootstelling.',
    ['VAULT-QSET', 'EDU-HVK'],
    ['medewerker', 'schoonmaak', 'bedrijfsarts', 'arbeidshygiënist'],
    [
      [
        'Contactroute',
        'Welke taken kunnen leiden tot contact met besmet materiaal, aerosolen of lichaamsvloeistoffen?',
        ['Taakoverzicht', 'Rondgang', 'Deskundigenadvies'],
        'Beschrijf contactroute en taak. Een algemene hygiëneverklaring is onvoldoende voor de taakgebonden beoordeling.',
      ],
      [
        'Veilige werkwijze',
        'Welke bron- of collectieve verandering kan contact met biologisch materiaal voorkomen?',
        ['Taakherontwerp', 'Veilige middelen', 'Scheiding schone en vuile route'],
        'Beoordeel beschikbaarheid en feitelijk gebruik tijdens de risicotaak; veronderstel geen reductie op basis van aanwezigheid.',
        ['eliminate', 'source', 'collective'],
      ],
      [
        'Keten schoonmaak',
        'Zijn overdracht, opslag, afval en schoonmaak zo ingericht dat een risico niet naar de volgende medewerker wordt verplaatst?',
        ['Contractafspraken', 'Taakobservatie', 'Controle schoonmaakproces'],
        'Neem interfaces tussen afdelingen en contractors mee. Evalueer ook secundaire blootstelling.',
        ['collective', 'individual'],
      ],
      [
        'Na blootstelling',
        'Kunnen medewerkers direct de passende deskundige hulp bereiken na een mogelijke biologische blootstelling?',
        ['Bereikbaarheidsroute', 'Gecontroleerde route-oefening', 'Bekendheidstoets'],
        'Toets de route en tijdigheid zonder medische persoonsgegevens in de RI&E te bewaren.',
        ['individual'],
        'verdieping',
      ],
    ],
  ),
  theme(
    'ergonomie',
    'Fysieke belasting en beeldschermwerk',
    'Beoordeel taakvariatie, kracht, houding, duur en werkelijk bruikbare hulpmiddelen.',
    ['VAULT-QSET', 'EDU-MVK'],
    ['medewerker', 'leidinggevende', 'ergonoom'],
    [
      [
        'Belastende taak',
        'Welke handelingen combineren kracht, herhaling, ongunstige houding of langdurig statisch werk?',
        ['Taakobservatie', 'Passende ergonomische analyse', 'Geanonimiseerde signalen'],
        'Beoordeel het totale taakprofiel; één correcte werkhouding zegt weinig over een volledige dienst.',
      ],
      [
        'Taak en hulpmiddel',
        'Welke verandering van product, werkhoogte, hulpmiddel of taak voorkomt de belasting aan de bron?',
        ['Werkplekproef', 'Taakontwerp', 'Gebruikersevaluatie'],
        'Test het hulpmiddel in de werkelijke ruimte en werkvolgorde. Alleen beschikbaar stellen is geen effectbewijs.',
        ['eliminate', 'source', 'collective'],
      ],
      [
        'Werkplekinstelling',
        'Kan de medewerker de werkplek op taak en lichaamsmaten instellen en wordt dit werkelijk gedaan?',
        ['Werkplekonderzoek', 'Demonstratie instellingen', 'Toegankelijkheid middelen'],
        'Beschrijf de beperkingen van de inrichting en instructie; houd ergonomisch risico en subjectief comfort apart.',
        ['collective', 'individual'],
      ],
      [
        'Herstel en verdeling',
        'Hoe veranderen belasting en herstel door pauzes, taakverdeling en rouleren?',
        ['Taakduurregistratie', 'Werkrooster', 'Herbeoordeling na aanpassing'],
        'Taakroulatie helpt alleen wanneer de belasting daadwerkelijk verandert. Verplaats dezelfde belasting niet tussen medewerkers.',
        ['individual'],
        'verdieping',
      ],
    ],
  ),
  theme(
    'arbeidsmiddelen',
    'Machines, arbeidsmiddelen en onderhoud',
    'Breng gevaarlijke bewegingen, beveiligingsfuncties en storingswerk in één scenario samen.',
    ['EDU-HVK', 'EDU-MVK'],
    ['operator', 'technische dienst', 'veiligheidskundige'],
    [
      [
        'Bereik van gevaar',
        'Bij welke stappen kan een medewerker een gevaarlijke beweging of energie bereiken?',
        ['Taakanalyse', 'Rondgang', 'Storings- en schoonmaakinterview'],
        'Onderzoek normaal gebruik, omstellen, verhelpen van blokkades, onderhoud en redelijkerwijs voorzienbare afwijkingen.',
      ],
      [
        'Ontwerp en afscherming',
        'Welke wijziging in ontwerp of collectieve beveiliging voorkomt toegang tot het gevaar?',
        ['Risicobeoordeling machine', 'Beveiligingsontwerp', 'Functionele verificatie'],
        'Een handleiding of CE-markering alleen bewijst geen veilige feitelijke toepassing. Beoordeel de configuratie en taak.',
        ['eliminate', 'source', 'collective'],
      ],
      [
        'Bypass en defect',
        'Wat gebeurt er wanneer beveiliging is overbrugd, defect of onverenigbaar met de taak?',
        ['Afwijkingenlog', 'Observatie gebruik', 'Stop- en herstelprocedure'],
        'Onderzoek oorzaken van omzeilen en de controle op terugkeer naar een veilige toestand. Neem common-cause-falen mee.',
      ],
      [
        'Effect van onderhoud',
        'Welke controles tonen dat veiligheidsfuncties na onderhoud nog hun functie vervullen?',
        ['Beproevingsverslag', 'Vrijgave', 'Preventief onderhoudsplan'],
        'Leg de geteste functie en testcondities vast. Een afgeronde onderhoudsbon bewijst niet iedere veiligheidsfunctie.',
        [],
        'verdieping',
      ],
    ],
  ),
  theme(
    'hoogte-ruimte',
    'Werken op hoogte en besloten ruimten',
    'Beoordeel eerst het vermijden van de taak en daarna veilige uitvoering en haalbare redding.',
    ['VAULT-SCENARIO', 'EDU-MVK'],
    ['uitvoerder', 'technische dienst', 'veiligheidskundige'],
    [
      [
        'Taak vermijden',
        'Kan het werk vanaf een veilige plaats of buiten de besloten ruimte worden uitgevoerd?',
        ['Werkmethodevergelijking', 'Ontwerpaanpassing', 'Taakvoorbereiding'],
        'Onderzoek vermijden of ontwerpwijziging vóór aanvullende bescherming tijdens de gevaarlijke taak.',
        ['eliminate', 'source'],
      ],
      [
        'Faalcondities',
        'Welke combinatie van toegang, energie, atmosfeer, valgevaar en veranderende omstandigheden maakt de taak gevaarlijk?',
        ['Taakrisicoanalyse', 'Isolatiegegevens', 'Meetstrategie'],
        'Een checklist is een startpunt; werk scenario’s en onderlinge afhankelijkheden uit.',
      ],
      [
        'Veilige uitvoering',
        'Welke collectieve voorzieningen en taakcontroles zijn vóór en tijdens het werk aantoonbaar beschikbaar?',
        ['Werkvergunning', 'Functionele controle', 'Taakobservatie'],
        'Toets de fysieke situatie en veranderingen tijdens het werk. Een ondertekende vergunning bewijst geen veilige atmosfeer of isolatie.',
        ['collective', 'individual'],
      ],
      [
        'Redding',
        'Kan redding worden uitgevoerd zonder dat de redder aan hetzelfde onbeheerde gevaar wordt blootgesteld?',
        ['Reddingsplan', 'Passende middelen', 'Scenario-oefening'],
        'Een telefoonnummer is geen reddingsfunctie. Onderzoek toegankelijkheid, middelen, deskundigheid en tijd tot hulp.',
        ['collective', 'individual'],
        'verdieping',
      ],
    ],
  ),
  theme(
    'transport',
    'Gebouw, intern transport en hijsen',
    'Onderzoek routes, kruisingen, vallende lasten en het scheiden van mens en bewegend materieel.',
    ['VAULT-QSET', 'EDU-MVK'],
    ['medewerker', 'logistiek', 'gebouwbeheerder'],
    [
      [
        'Botsing en val',
        'Waar kunnen looproutes, voertuigen, hoogteverschillen en materialen tot botsen, vallen of beknelling leiden?',
        ['Routeobservatie', 'Taak- en verkeersanalyse', 'Incidentpatronen'],
        'Observeer pieken en afwijkend gebruik. Beoordeel de feitelijke route, geen uitsluitend op papier getekende route.',
      ],
      [
        'Mens en voertuig',
        'Welke fysieke of procesmatige scheiding kan mens en voertuig uit elkaars bereik houden?',
        ['Inrichtingsontwerp', 'Proef met scheiding', 'Controle kruisingen'],
        'Zichtlijnen, markering en waarschuwingen hebben andere afhankelijkheden dan fysieke scheiding.',
        ['eliminate', 'collective'],
      ],
      [
        'Last en omgeving',
        'Welke omstandigheden kunnen tijdens hijsen of heffen leiden tot vallende, kantelende of onbeheerste lasten?',
        ['Hijsplan', 'Middelencontrole', 'Ondergrond en omgevingscondities'],
        'Beoordeel last, configuratie, omgeving en taak als geheel. Een geldige inspectie alleen dekt de hijssituatie niet.',
      ],
      [
        'Onderhoud van routes',
        'Hoe blijven loop- en vluchtroutes bruikbaar tijdens werkzaamheden, opslag en wijzigingen?',
        ['Rondgang', 'Afwijkingenopvolging', 'Controle tijdelijke situatie'],
        'Een routecontrole moet ook tijdelijke obstakels en werk van derden omvatten.',
        ['collective'],
        'verdieping',
      ],
    ],
  ),
  theme(
    'procesveiligheid',
    'Procesveiligheid, ATEX en druk',
    'Werk van initiërende gebeurtenis naar gevolg, preventie, mitigatie en aantoonbare beschermingslagen.',
    ['VAULT-SCENARIO', 'EDU-HVK', 'VAULT-BOWTIE'],
    ['proceseigenaar', 'technische dienst', 'process safety specialist'],
    [
      [
        'Verlies van beheersing',
        'Welke initiërende gebeurtenis kan leiden tot verlies van containment, ontsteking of onbeheerste druk?',
        ['Procesbeschrijving', 'HAZOP of scenarioanalyse', 'Bedrijfscondities'],
        'Maak initiërende gebeurtenis, top event en schadegevolg apart zichtbaar; een thema explosie is geen afgerond scenario.',
      ],
      [
        'Preventie en mitigatie',
        'Welke maatregel voorkomt de gebeurtenis en welke beperkt pas het gevolg nadat beheersing verloren is?',
        ['Bowtie', 'Barrièreregister', 'Functiebeschrijving'],
        'Ken elke barrière een duidelijke functie toe. Hetzelfde effect mag niet op meerdere plaatsen opnieuw als reductie worden geteld.',
        ['source', 'collective'],
      ],
      [
        'Onafhankelijke laag',
        'Is een opgevoerde beschermingslaag specifiek, effectief, onafhankelijk en aantoonbaar onderhouden voor dit scenario?',
        ['Onafhankelijkheidsanalyse', 'Testgegevens', 'Onderhoud en faaldata'],
        'Een alarm en menselijke reactie vormen doorgaans één functionele keten. Afhankelijkheid en gemeenschappelijke voeding kunnen vermenigvuldigen van faalkansen ongeldig maken.',
        [],
        'verdieping',
      ],
      [
        'Verantwoorde gegevens',
        'Waar komen frequenties en faalkansen vandaan en hoe passen zij bij de installatie en testcondities?',
        ['Databron', 'Aannameregister', 'Proof-testresultaten'],
        'Een LOPA-uitkomst vraagt passende frequenties, condities en erkende lagen. Vul ontbrekende data niet met schijnprecisie in.',
        [],
        'verdieping',
      ],
      [
        'Wijziging en degradatie',
        'Wat verandert in de beschermingsfunctie bij uitval, bypass, onderhoud of gewijzigde procescondities?',
        ['Bypassbeheer', 'Wijzigingsbeoordeling', 'Degradatie- en herstelregister'],
        'Geplande en gerealiseerde werking zijn verschillende toestanden. Herbeoordeel scenario en vereiste maatregelen bij degradatie.',
        [],
        'verdieping',
      ],
    ],
  ),
  theme(
    'maatregelkwaliteit',
    'Effectiviteit, AHS en justificatie',
    'Onderbouw technisch effect en uitvoerbaarheid afzonderlijk en bewaak dubbeltelling.',
    ['VAULT-SCENARIO', 'EDU-HVK', 'ARBO-AHS', 'SDU-AI43'],
    ['veiligheidskundige', 'proceseigenaar', 'preventiemedewerker'],
    [
      [
        'Aangrijpingspunt',
        'Welke aantoonbare stap in het scenario verandert door deze maatregel?',
        ['Scenario met aangrijpingspunt', 'Technische specificatie', 'Effectmeting'],
        'Benoem effect op kans, blootstelling of gevolg. Een proceduretitel onderbouwt geen numeriek reductiepercentage.',
      ],
      [
        'Hogere niveaus',
        'Welke bron- en collectieve oplossingen zijn onderzocht en waarom is de gekozen combinatie passend?',
        ['Alternatievenafweging', 'Technische haalbaarheid', 'Evaluatie werkpraktijk'],
        'Werk eerst aan de bron en daarna aan collectieve en individuele bescherming. Toon keuzes en grenzen.',
        ['eliminate', 'source', 'collective'],
      ],
      [
        'Bewijs van werking',
        'Welk bewijs ondersteunt de gekozen reductie en welke gebruiksomstandigheden begrenzen die werking?',
        ['Representatieve test', 'Voor- en nameting', 'Faal- en gebruiksgegevens'],
        'Scheid verwacht effect, bewezen functie en werkelijk gebruik. Geef onzekerheid weer als gegevens ontbreken.',
      ],
      [
        'Afhankelijkheid',
        'Kunnen twee maatregelen door dezelfde oorzaak uitvallen of overlappen zij in hun effect?',
        ['Afhankelijkheidsanalyse', 'Gedeelde voorzieningen', 'Taak- en storingsanalyse'],
        'Vermenigvuldigen veronderstelt passende onafhankelijkheid. Onderbouw het gezamenlijke effect zonder dubbeltelling.',
        [],
        'verdieping',
      ],
      [
        'Haalbaarheid en voordeel',
        'Welke maatregel levert aantoonbare verbetering met weinig implementatie-inspanning?',
        ['Kostenraming', 'Doorlooptijd', 'Onderbouwde risicowinst'],
        'Gebruik eenvoud als prioriteringsfactor. Zij verandert de fysieke reductie niet en heft noodzakelijke maatregelen niet op.',
      ],
      [
        'In stand houden',
        'Welke eigenaar, controle en herstelactie houden de maatregel effectief?',
        ['Controleregister', 'Onderhoudsplan', 'Prestatie-indicator'],
        'Stuur op de functie en degradatie. Invoering zonder blijvende controle kan het verwachte effect verliezen.',
      ],
      [
        'Geschikte beoordelingsmethode',
        'Waarom past de gekozen risicomethode bij het scenario, de benodigde diepgang en de beschikbare gegevens?',
        ['Methodevergelijking', 'Gegevens en aannames', 'Beoordelingscriteria'],
        'Onderscheid rangschikken met relatieve factoren, meten van blootstelling en berekenen van scenariofrequenties. Kies verdieping wanneer een grove score de beslissing onvoldoende onderbouwt.',
        [],
        'verdieping',
      ],
      [
        'Buiten de checklist',
        'Welke afwijkingen of onbekende combinaties zijn onderzocht naast de vaste vragen?',
        ['Kritische teamsessie', 'Taak- of procesafwijkingen', 'Scenario’s uit incidenten'],
        'Een bestaande vragenlijst helpt bij bekende aandachtspunten. Onderzoek ook nieuwe risico’s en afwijkend werk die nog geen eigen checklistvraag hebben.',
        [],
        'verdieping',
      ],
    ],
  ),
  theme(
    'onderzoek-leren',
    'Incidentonderzoek, onderwijs en LMS',
    'Verbind brongebruik, vakbekwaamheid, werkelijk handelen en terugkoppeling naar de RI&E.',
    ['SDU-AI43', 'EDU-HVK', 'EDU-MVK', 'LMS-MOODLE'],
    ['docent', 'medewerker', 'veiligheidskundige', 'LMS-beheerder'],
    [
      [
        'Feit en verklaring',
        'Welke informatie is een waarneming, registratie, verklaring of interpretatie en waar zitten tegenstrijdigheden?',
        ['Brondossier', 'Tijdlijn', 'Onafhankelijke verificatie'],
        'Bewaar ruwe informatie en conclusies apart. Een plausibele verklaring is geen vastgesteld causaal verband.',
      ],
      [
        'Van incident naar scenario',
        'Welke faalcondities uit een incident vragen om herziening van een scenario of maatregel?',
        ['Incidentanalyse', 'Barrière-evaluatie', 'Herbeoordeling RI&E'],
        'Onderzoek techniek, taak en organisatie; leg herstel en toetsing vast voordat een incident als afgehandeld telt.',
      ],
      [
        'Aantoonbare bekwaamheid',
        'Welke praktijksituatie toont dat de medewerker veilig kan handelen en afwijkingen herkent?',
        ['Praktijkdemonstratie', 'Scenario-oefening', 'Beoordelingscriteria'],
        'LMS-voltooiing of een kennistoets ondersteunt leerbewijs maar is geen gemeten risicoreductie of volledige taakbekwaamheid.',
        ['individual'],
      ],
      [
        'Niveau van oordeel',
        'Kan de gebruiker niet alleen een gevaar aanwijzen, maar ook methode, maatregelkeuze en onzekerheid onderbouwen?',
        ['Casusuitwerking', 'Maatregelafweging', 'Mondelinge verantwoording'],
        'Maak toepassingsvragen en verdiepende professionele oordeelsvorming herkenbaar. Dit is geen nieuw formeel examencriterium.',
        [],
        'verdieping',
      ],
      [
        'LMS-context',
        'Bij welke cursusversie en activiteit horen de geïmporteerde leergegevens en wat bewijzen zij precies?',
        ['Exportdatum en kolomdefinitie', 'Cursus- en activiteitsversie', 'Leeruitkomst'],
        'Bewaar deelnemersgegevens in de private workspace. Maak onderscheid tussen deelname, voltooiing, toetsuitslag en praktijkbewijs.',
        [],
        'verdieping',
      ],
      [
        'Terugkerende grondoorzaak',
        'Welke terugkerende conditie in ontwerp, middelen of organisatie blijft bestaan na het herstellen van het directe incident?',
        [
          'Vergelijking incidenten en afwijkingen',
          'Onderzoek taak en organisatie',
          'Toets van structurele verbetering',
        ],
        'Beoordeel of herstel alleen de laatste gebeurtenis voorkomt of ook de onderliggende faalconditie wegneemt. Maak verschillen tussen incidenten expliciet.',
        ['source', 'collective'],
        'verdieping',
      ],
      [
        'Leren uitvoerbaar maken',
        'Welke samenhangende verbetering vervangt een lange reeks losse acties voor hetzelfde probleem?',
        [
          'Gebundelde oorzaakanalyse',
          'Besluit over aanbevelingen',
          'Werkbare uitvoering en follow-up',
        ],
        'Onderzoek of acties op het juiste niveau aangrijpen. Leg acceptatie, aanpassing of afwijzing van aanbevelingen met reden vast en toets de gerealiseerde werking.',
        [],
        'verdieping',
      ],
    ],
  ),
];

const allThemeIds = themes.map((item) => item.id);
export const contentPacks: ContentPack[] = [
  {
    id: 'rie-basis',
    title: 'RI&E basisinventarisatie',
    description:
      'Brede eigen vragenbank met concrete vragen, bewijsaanwijzingen en scenarioverdieping.',
    level: 'basis',
    themeIds: allThemeIds,
    sourceIds: ['IMA-ORIGINAL', 'VAULT-SCENARIO'],
    status: 'available',
  },
  {
    id: 'institutioneel-veldwerk',
    title: 'Interviews bij complexe dienstverlening',
    description:
      'Eigen veldvragen geïnspireerd op de structuur van private themalijsten: organisatie, agressie, alleen werken, PSA, BHV en gezondheid.',
    level: 'verdieping',
    themeIds: [
      'organisatie',
      'agressie',
      'alleenwerken',
      'psa',
      'brand',
      'klimaat',
      'elektra',
      'biologie',
      'ergonomie',
      'transport',
    ],
    sourceIds: ['VAULT-QSET', 'IMA-ORIGINAL'],
    status: 'available',
  },
  {
    id: 'barrieres-onderbouwen',
    title: 'Barrières, effectiviteit en AHS',
    description:
      'Onderzoek werking, afhankelijkheid en onzekerheid; leg uitvoerbaarheid naast de onderbouwde risicowinst.',
    level: 'verdieping',
    themeIds: ['procesveiligheid', 'maatregelkwaliteit', 'onderzoek-leren'],
    sourceIds: ['VAULT-SCENARIO', 'ARBO-AHS', 'EDU-HVK'],
    status: 'available',
  },
  {
    id: 'mvk-toepassen',
    title: 'MVK praktijktoepassing',
    description:
      'Eigen checkvragen voor herkenning, taakanalyse, maatregelkeuze en praktisch bewijs. Geen officiële opleidings- of examenvragen.',
    level: 'vakbekwaamheid',
    themeIds: [
      'organisatie',
      'arbeidsmiddelen',
      'hoogte-ruimte',
      'transport',
      'stoffen',
      'ergonomie',
      'onderzoek-leren',
    ],
    sourceIds: ['EDU-MVK', 'IMA-ORIGINAL'],
    status: 'available',
  },
  {
    id: 'hvk-verantwoorden',
    title: 'HVK professionele oordeelsvorming',
    description:
      'Verdieping van methodekeuze, onderzoek, integrale scenario’s, AHS, implementatie en navolgbare verantwoording.',
    level: 'vakbekwaamheid',
    themeIds: [
      'organisatie',
      'procesveiligheid',
      'maatregelkwaliteit',
      'stoffen',
      'psa',
      'onderzoek-leren',
    ],
    sourceIds: ['EDU-HVK', 'LMS-MOODLE', 'IMA-ORIGINAL'],
    status: 'available',
  },
  {
    id: 'private-vault',
    title: 'Eigen VaultTek-bronnen',
    description:
      'Importeer geselecteerde Markdown-vragenlijsten en JSON lokaal. Oorspronkelijke broninhoud blijft in de private workspace.',
    level: 'verdieping',
    themeIds: [],
    sourceIds: ['VAULT-QSET', 'IMA-LEGACY'],
    status: 'local_import',
  },
  {
    id: 'private-naslag',
    title: 'Praktijkgids en SDU AI-bladen',
    description:
      'Geselecteerde PDF-pagina’s uit Praktijkgids, AI-43 en de samengestelde PSA-bundel zijn verwerkt in eigen vragen. Volledige publicaties worden niet meegeleverd; AI-45/61 blijven bronverwijzingen.',
    level: 'verdieping',
    themeIds: [],
    sourceIds: ['PGA-32489', 'PGA-32490', 'SDU-AI43', 'SDU-AI82', 'SDU-AI45', 'SDU-AI61'],
    status: 'source_gap',
  },
  {
    id: 'private-lms',
    title: 'Moodle/LMS en lesmateriaal',
    description:
      'CSV/JSON-intake voor eigen exports. Live LMS-data en het volledige operationele lesmateriaal zijn nog niet geïmporteerd.',
    level: 'vakbekwaamheid',
    themeIds: [],
    sourceIds: ['LMS-MOODLE', 'EDU-LESSONS'],
    status: 'local_import',
  },
];

export const questions = themes.flatMap((item) => item.questions);
export const catalog = {
  version: '2026.10',
  language: 'nl',
  sources,
  themes,
  contentPacks,
  questions,
};
export const answerOptions = [
  { value: 'yes', label: 'Voldoet / aantoonbaar' },
  { value: 'partial', label: 'Deels' },
  { value: 'no', label: 'Knelpunt' },
  { value: 'unknown', label: 'Onbekend / verificatie nodig' },
  { value: 'na', label: 'Niet van toepassing' },
] as const;

export function questionsForPack(packId: string): Question[] {
  const pack = contentPacks.find((item) => item.id === packId);
  return pack ? questions.filter((item) => pack.themeIds.includes(item.themeId)) : [];
}
