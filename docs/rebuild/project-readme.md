# IMA Apply

Een browserwerkruimte voor risico-inventarisatie, onderbouwde beheersmaatregelen en zichtbaar restrisico.

**[Open IMA Apply](https://xenotroy.github.io/ima-apply/)** · [Handleiding](docs/rebuild/getting-started.md) · [Risicomethodiek](docs/rebuild/risk-methodology.md) · [Bronregister](docs/rebuild/source-register.md)

## Wat de app doet

- RI&E-scenario’s met scope, gevaar, gebeurtenisroute, gevolg en onderbouwing.
- Fine–Kinney/Wiruth met expliciete W/B/E-invoer en afzonderlijk initieel, huidig en verwacht risico.
- Interactieve ruimtelijke risicoprojectie, maatregelenverloop en onzekerheidsgrenzen.
- Effectinschaling op basis van bereik, conditionele beschikbaarheid, correct gebruik en werking.
- Afzonderlijke LOPA met jaarlijkse initiatorfrequentie, modifiers, onafhankelijke beschermlagen, PFD-intervallen en een lokaal vastgesteld criterium.
- AHS-voorkeur, eenvoudige uitvoerbaarheid en marginale scoreverbetering als aparte prioritering.
- Historische Fine- en Kinney-justificatiecalculators met afzonderlijke kostenratings.
- 16 thema’s, 78 eigen checkvragen, 8 contentpakketten en expliciete bronstatus.
- Private vragen/content uit Markdown, legacy JSON en Moodle/LMS-CSV.
- Organisaties, locaties, afdelingen en afzonderlijke RI&E-dossiers met bevroren vragen en gecontroleerde bronhashes.
- Bewijsregister, waarnemingen, bevindingen, eigen onderwerpen en regelgevingssignalen.
- Opgeslagen 5×Waarom-/BowTie-onderzoeken en incidentfrequenties met passende maanduren en expliciete datadekking.
- Gecontroleerde legacy dossierexport uit Markdown en SQLite met bronbehoud en reviewwaarschuwingen.
- Plan van aanpak met eigenaar, datum en apart resultaat van effectcontrole.
- Incidenten/signalen gekoppeld aan scenario’s en acties.
- Rapportage als Markdown, CSV en print/PDF; volledige JSON-overdracht.
- Lokale automatische opslag en versiegecontroleerde sync via een private GitHub-repository.

De eerste werkruimte bevat fictieve demonstratiegegevens. Begin een eigen werkruimte voor projectwerk. Een Kinney-score is een relatieve index, geen ongevalskans. AHS-gewichten en haalbaarheidsfactoren wijzigen de prioriteit, niet de scorefactorreductie.

## Eén account, meerdere pc’s

Deze site draait zonder installatie. De code en publieke kennisstructuur staan in deze repository. Dossiergegevens blijven lokaal of in **een afzonderlijke private repository**.

Open **Werkruimte & synchronisatie**. Voor de persoonlijke inrichting is de private repository `xenotroy/ima-apply-workspaces` aangemaakt. Gebruik op ieder apparaat een fine-grained GitHub-token met **Contents: read and write** voor uitsluitend de eigen datarepository. Het token blijft alleen in het tabbladgeheugen.

Bekijk op een nieuwe pc de cloudversie voordat je verder werkt. Uploads met een verouderde versie worden geblokkeerd; er is geen stil overschrijven. [Volledige synchronisatiewerkwijze](docs/rebuild/multi-device.md).

De aparte private bronwerkruimte is beschikbaar als `workspaces/bronwerkruimte.json`: 260 oorspronkelijke themavragen en drie lesconcepten. Kies dat bestand in de synchronisatiepagina om de echte private intake te openen. De publieke app blijft 78 eigen checkvragen leveren.

## Ontwikkelen en controleren

Node 24 of nieuwer:

```bash
cd web
npm ci
npm run dev
npm test
node --test ../scripts/import-content.test.mjs
node --test ../scripts/migrate-workspace.test.mjs
npx playwright install chromium
npm run test:e2e
npm run build
```

GitHub Actions controleert de risicokern, opslag/synchronisatie, private importer, browserflows en productiebuild voordat Pages wordt bijgewerkt. Productie-assets gebruiken `/ima-apply/` als basispad.

## Bronnen en toepassingsgrenzen

De vragen zijn eigen formuleringen, ontwikkeld met gericht onderzochte vaultcontext, PI Vught-vragenstructuren en opleidings-/methodiekbronnen. Het [bronregister](docs/rebuild/source-register.md) specificeert de werkelijk gelezen scope en ontbrekende bronnen. Integrale gelicentieerde publicaties, private projectinformatie en deelnemersgegevens zijn niet in de publieke app opgenomen.

Moodle/LMS-intake is een bestandsimport; er is geen permanente API-verbinding. Deelname of een cijfer wordt geen bewijs van praktische beheersing. De oude Avalonia/SQLite-software blijft behouden. SQLite-dossiers zijn niet stil omgezet; oude reductieratings vereisen inhoudelijke herbeoordeling.

De [volledige herbouwgoal](docs/rebuild/goal.md) blijft actief. [Functiepariteit](docs/rebuild/function-parity.md), [brondekking](docs/rebuild/source-coverage.md) en [migratiemapping](docs/rebuild/migration.md) onderscheiden gerealiseerde workflows van resterende scope. Origineel HVK/MVK-materiaal, actuele LMS-exports, complete historische revisies en een echte productieoverdracht zijn nog niet bewezen afgerond.

Zie [architectuur](docs/rebuild/architecture.md) voor modulegrenzen, migratie en implementatiestatus.
