# IMA Apply gebruiken

Open [IMA Apply](https://xenotroy.github.io/ima-apply/). De eerste werkruimte is een demonstratie met fictieve gegevens. Kies **Begin een eigen werkruimte** en vul een naam in.

Via **Organisatie & dossiers** leg je organisatie, locatie en afdelingen vast. Maak een RI&E-dossier met afgebakende scope, beoordelaar en geselecteerde vragen. **Inventariseren** opent uitsluitend de bevroren vragen van dat dossier. Antwoorden en bewijs van een andere beoordeling blijven afzonderlijk. Voeg bewijsrecords, waarnemingen en bevindingen toe; verbind een bevinding met scenario en actie. Beoordelen/afsluiten vraagt expliciet besluit en passend geverifieerd bewijs.

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
