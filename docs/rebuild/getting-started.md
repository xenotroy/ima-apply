# IMA Apply gebruiken

Open [IMA Apply](https://xenotroy.github.io/ima-apply/). De eerste werkruimte is een demonstratie met fictieve gegevens. Kies **Begin een eigen werkruimte** en vul een naam in.

Via **Organisatie & dossiers** leg je organisatie, locatie en afdelingen vast. Maak een RI&E-dossier met afgebakende scope, beoordelaar en geselecteerde vragen. **Inventariseren** opent uitsluitend de bevroren vragen van dat dossier. Antwoorden en bewijs van een andere beoordeling blijven afzonderlijk. Voeg bewijsrecords, waarnemingen en bevindingen toe; verbind een bevinding met scenario en actie. Beoordelen/afsluiten vraagt expliciet besluit en passend geverifieerd bewijs.

Vul bij de inventarisatie **Respondent / actor voor deze invoer** in. Antwoordkeuze, toelichting en bewijslinks worden automatisch lokaal opgeslagen wanneer validatie ze accepteert. Geweigerde antwoordtekst blijft als herstelbaar concept beschikbaar. De belangrijkste interview- en onderzoeksformulieren bewaren onafgemaakte invoer als concept; open hetzelfde formulier om te herstellen. **Rapportage → Markdown** bewaart ook de concepttekst; **Werkruimte exporteren** bewaart volledige vastgelegde JSON. Kijk bij een opslagfout naar de herstelkopieën en exporteer vóór sluiten. [Interviewopslag en herstel](interview-saving.md) noemt de beschermde formulieren, de resterende uitzonderingen, twee tabbladen, oude versies en de grens tussen lokale opslag en GitHub.

**Beheerde vragen** bewaart afzonderlijke vraaginhoud, criteria, bewijs en echte versies. **Risicobibliotheek** toont gevaar, risico, factor, gedeelde maatregelen en lokale reviews. **PI-bibliotheek & router** maakt een onderzoekset vanuit profiel, risico's, verplichtingen en signalen. Een niet geselecteerd onderwerp is onbekend; een signaal bepaalt onderzoeksprioriteit en geen risicoscore. Kies de juiste centrale, afdelings- of lokale onderzoeklaag.

Via **Onderzoek & cijfers** bewaar je een 5×Waarom- of BowTie-onderzoek. Verbind bewijs, systeemcondities en acties. Leg voor frequenties de urenbron per hele kalendermaand en dezelfde scope vast. Classificeer recordable/lost time bij de melding; ontbrekende informatie wordt geen nulfrequentie.

1. Maak een concreet risicoscenario: scope, gevaar, gebeurtenisroute en gevolg.
2. Schat in de risicowerkbank het uitgangsscenario zonder de afzonderlijk ingevoerde maatregelen. Kies W, B en E.
3. Voeg bestaande en geplande maatregelen toe. Leg werking, scorefactor, onzekerheid, bewijs en afhankelijkheid vast.
4. Gebruik de inschalingshulp uitsluitend met expliciete conditionele noemers. Controleer welke verliezen al in prestatiegegevens verwerkt zijn.
5. Vergelijk huidig risico en prognose. AHS en eenvoudige uitvoerbaarheid verbeteren de prioriteit, niet de fysieke risicoreductie.
6. Beantwoord relevante inventarisatievragen en voeg bewijs toe. Maak bij onvoldoende beheersing een scenario of actie.
7. Leg eigenaar, streefdatum en verificatieplan in het plan van aanpak vast. Een afgeronde actie vraagt een apart controleresultaat.
8. Bewaar de volledige werkruimte als JSON. CSV en Markdown rapporteren het dossier; afdrukken kan naar PDF.

Voor LOPA: kies de LOPA-tab, specificeer één initiator en één gevolgeindpunt, onderbouw de jaarfrequentie en het projectcriterium. Neem uitsluitend gekwalificeerde, bestaande onafhankelijke beschermlagen op. PFD en Kinney-reductiepercentages zijn verschillende grootheden.

## Van de ene pc naar de andere

Open **Werkruimte & synchronisatie**. Gebruik de private repository `xenotroy/ima-apply-workspaces` en een fine-grained GitHub-token met **Contents: read and write** voor uitsluitend die repository.

Op pc A: bekijk eerst de cloudversie en sla na bewerking op in GitHub. Op pc B: bekijk de cloudversie en kies bewust **Gebruik cloudversie** voordat je doorwerkt. Een conflict laat beide versies behouden; exporteer je eigen versie en vergelijk de dossiers.

De tokeninvoer moet opnieuw op een ander apparaat of in een nieuw tabblad. Het token wordt niet opgeslagen. Browserlokale opslag is geen automatische cloudbackup. Exporteer bij een opslagfout je actuele werkversie.

Het veld **Werkruimtebestand in de repository** bepaalt welk project je opent. Gebruik op beide pc’s hetzelfde pad. De private bronwerkruimte staat op `workspaces/bronwerkruimte.json`; zij bevat 260 oorspronkelijke themavragen en drie conceptlesteksten, zonder verzonnen projectbeoordelingen. Selecteer dit bestand, bekijk de cloudversie en kies **Gebruik cloudversie**. Bewaar eigen projecten bewust in afzonderlijke bestanden, bijvoorbeeld `workspaces/projectnaam.json`.

De aanvullende bronreview staat afzonderlijk in `workspaces/bronwerkruimte-reviewed-2026-10-11.json`. Deze behoudt dezelfde 260 vragen en drie lesconcepten en voegt drie afgebakende bronextracten toe, met werkelijk gelezen pagina’s, hashes en provenance. De oorspronkelijke bronwerkruimte blijft beschikbaar. Kies het reviewbestand op beide pc’s wanneer je deze aanvullende inhoud wilt gebruiken.

De nieuwe bronmomentopname voor de PI-router staat afzonderlijk in `workspaces/pi-bronwerkruimte-2026-10-11.json`: 1.300 bronvraagvoorkomens en 12 aanvullende eigen vragen. Begin in **Organisatie** met een werkelijk gekozen organisatie en kies die expliciet bij de router, of koppel een passend dossier met bestaande scope. Controleer de voorgestelde broncodes en procesblokdekking. De mapping is een kandidaatvoorstel; de bronmomentopname bewijst geen actuele volledige Porterbank of lokale maatregelenwerking.

Leg de routerset vast en kies voor een interview **Projectwerkruimte exporteren**. Importeer dit nieuwe JSON-bestand via **Werkruimte of content importeren** en bevestig de concrete preview. Het bevat alle geselecteerde vragen, bevroren dossier, bronbindings en herkomst/hash van de volledige bank; de oorspronkelijke bank blijft afzonderlijk bewaard. Je krijgt zo ruimte voor antwoorden en bewijs. Gebruik voor GitHub vervolgens een eigen projectbestand, bijvoorbeeld `workspaces/pi-deelonderzoek.json`, en hetzelfde pad op beide pc's. Bij **Gebruik exacte onderzoeksset** blijft de volledige bank in de huidige werkruimte; een grote bank plus alle dossierantwoorden kan de grens bereiken. Er worden geen vragen of notities afgekapt om onder de grens te komen.

De nieuwste voorlopige legacyprojectie is afzonderlijk beschikbaar als `workspaces/legacy-riebuilder-parity-2.3-strict.json` en `workspaces/legacy-riebuilder-parity-2.3-utc-review.json`. Zij bewaren ook de getypeerde risicobibliotheek. De UTC-review heeft dertien antwoorden met onbekende historische actor; een migratielabel bewijst geen oorspronkelijke vraagversie. Lees de zichtbare waarschuwingen vóór verder werken.

Voor project- of afdelingsselectie open je **Dossiers → Modules & scope**. Bewaar een moduleplan met scopenotities en volgorde en maak daaruit een dossier aan. Alle geselecteerde vragen worden bevroren, ook onbeantwoorde; latere planwijzigingen veranderen dit dossier niet. Voor een maatregelbesluit bewaar je eerst een risicobeoordelingsmoment en leg je daarna in de risicowerkbank de gekozen maatregel(s), kostenbasis en justificatie vast.

## Private broninhoud

```bash
node scripts/import-content.mjs --help
node scripts/import-content.mjs --input /pad/naar/vragenlijst.md --out private-data/vragenlijst.json
```

Gebruik **Kennis & bronnen → Private content importeren** om het bestand te laden. De importer ondersteunt Markdown-vragenlijsten, legacy RI&E-JSON en CSV. Een Moodle-cijferexport wordt niet automatisch een vragenlijst of bewijs van praktische bekwaamheid.

Voor bestaande projectdossiers is er een aparte [migratieroute](migration.md). Zij bewaart de originele bron, maakt een nieuwe private export met waarschuwingen en kent oude ratings geen nieuwe percentages toe. Lees het migratierapport voordat je de export via de browser opent.

## Lokaal ontwikkelen

```bash
cd web
npm ci
npm run dev
npm test
node --test ../scripts/import-content.test.mjs
npm run test:e2e
npm run build
```

Gebruik Node 24 of nieuwer. De workflow gebruikt Node 24. Installatie van de Playwright-browser voor ontwikkelaars: `npx playwright install chromium`.

GitHub Actions voert dezelfde browserflows uit met de reeds geïnstalleerde Chrome op de Ubuntu 24.04-runner. Daarmee hoeft de publicatie geen extra apt-installatie uit te voeren; een vastlopende pakketmirror heeft de eerdere workflow geblokkeerd. De werkelijke Chrome-versie wordt in de job gelogd. Lokaal kan dezelfde route met `IMA_BROWSER_CHANNEL=chrome npm run test:e2e`; zonder die variabele blijft de geïnstalleerde Playwright-Chromium de standaard. Zie de [Playwright-channelconfiguratie](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge) en de [GitHub-runnerinventaris](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md). Alle controles blijven voorwaarden voor publicatie; de verificatiejob stopt na maximaal 15 minuten.

Voor gelijktijdige lokale browserproeven kan iedere run een eigen poort gebruiken, bijvoorbeeld `IMA_TEST_PORT=4176 npm run test:e2e -- --output=/tmp/ima-browser-check`. De server gebruikt een strikte poortbinding; hergebruik van een bestaande ontwikkelserver gebeurt alleen met `IMA_REUSE_DEV_SERVER=1`. Zo kan een andere run haar server niet onder de eerste controle sluiten.
