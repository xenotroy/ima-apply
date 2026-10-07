# IMA Apply gebruiken

Open [IMA Apply](https://xenotroy.github.io/ima-apply/). De eerste werkruimte is een demonstratie met fictieve gegevens. Kies **Begin een eigen werkruimte** en vul een naam in.

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

## Private broninhoud

```bash
node scripts/import-content.mjs --help
node scripts/import-content.mjs --input /pad/naar/vragenlijst.md --out private-data/vragenlijst.json
```

Gebruik **Kennis & bronnen → Private content importeren** om het bestand te laden. De importer ondersteunt Markdown-vragenlijsten, legacy RI&E-JSON en CSV. Een Moodle-cijferexport wordt niet automatisch een vragenlijst of bewijs van praktische bekwaamheid.

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
