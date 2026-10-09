# IMA Apply

Een browserwerkruimte voor risico-inventarisatie, onderbouwde beheersmaatregelen en zichtbaar restrisico.

Deze implementatiestand betreft appversie **2.1.0**. Het browserdataschema blijft additief `schemaVersion: 1`; de rekenmethode heeft haar eigen versie `ima-risk/2.0.0`.

**[Open IMA Apply](https://xenotroy.github.io/ima-apply/)** · [Handleiding](docs/rebuild/getting-started.md) · [Risicomethodiek](docs/rebuild/risk-methodology.md) · [Bronregister](docs/rebuild/source-register.md)

## Wat de app doet

- RI&E-scenario’s met scope, gevaar, gebeurtenisroute, gevolg en onderbouwing.
- Fine–Kinney/Wiruth met expliciete W/B/E-invoer en afzonderlijk initieel, huidig en verwacht risico.
- Interactieve ruimtelijke risicoprojectie met selecteerbare maatregelstappen, W/B/E-veranderingen en onzekerheidsgrenzen.
- Vastgelegde risicobeoordelingsmomenten met volledige historische invoer, methodeversie en resultaat.
- Effectinschaling op basis van bereik, conditionele beschikbaarheid, correct gebruik en werking.
- Afzonderlijke LOPA met jaarlijkse initiatorfrequentie, modifiers, onafhankelijke beschermlagen, PFD-intervallen en een lokaal vastgesteld criterium.
- AHS-voorkeur, eenvoudige uitvoerbaarheid en marginale scoreverbetering als aparte prioritering.
- Historische Fine- en Kinney-justificatiecalculators met afzonderlijke kostenratings.
- 16 thema’s, 78 eigen checkvragen, 8 contentpakketten en expliciete bronstatus.
- Private vragen/content uit Markdown, legacy JSON en Moodle/LMS-CSV.
- Organisaties, locaties, afdelingen en afzonderlijke RI&E-dossiers met bevroren vragen en gecontroleerde bronhashes. Een echte afdeling kan rechtstreeks bij een organisatie horen wanneer de locatie onbekend is.
- Bewijsregister, waarnemingen, bevindingen, eigen onderwerpen en regelgevingssignalen.
- Bewerkbare projectcontext met dertien inhoudelijke velden, volledige rondgangverslagen met modules en expliciete waarnemingslinks; versieerbaar lokaal register voor basisrisicofactoren.
- Opgeslagen 5×Waarom-/BowTie-onderzoeken en incidentfrequenties met passende maanduren en expliciete datadekking.
- Gecontroleerde legacy dossierexport uit Markdown en SQLite met bronbehoud en reviewwaarschuwingen.
- Tienfasige actiecyclus met uitvoering, positieve/negatieve effectcontrole, heropening en voor-/na-historie van nieuwe browserwijzigingen.
- Incidenten/signalen gekoppeld aan scenario’s en acties.
- Rapportage als Markdown, CSV en print/PDF; volledige JSON-overdracht.
- Lokale automatische opslag en versiegecontroleerde sync via een private GitHub-repository, tot 2.000.000 UTF-8 bytes met onveranderlijke blobversies.

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

Een werkelijke private SQLite-projectkopie is gecontroleerd en naar afzonderlijke browsergeldige exports omgezet, terwijl de oorspronkelijke database-, WAL- en SHM-bestanden ongewijzigd bleven. De standaardexport (761.198 bytes) bewaart dertien antwoorden raw omdat een tijdzone ontbreekt. De expliciete UTC-export (801.985 bytes) bevat dertien typed antwoorden, met 25 tijdzone- en dertien historische vraagwaarschuwingen. Beide bewaren drie conceptdossiers, vier afdelingen, vijf rondgangen en 110 vragen, plus projectcontext en bronrecords. UTC volgt hier een expliciete interpretatie van de huidige schrijfcode, met matige zekerheid over historische veldherkomst. Dit is geen inhoudelijk goedgekeurde klantoverdracht. Beide versies staan afzonderlijk in de private repository als `workspaces/legacy-riebuilder-strict.json` en `workspaces/legacy-riebuilder-utc-review.json`. De volledige teruglezing via onafhankelijke API-clients en echte browsercontexten, inclusief vernieuwen, is op 9 oktober 2026 gecontroleerd. Alle 248 oorspronkelijke raw bronrecords bleven intact; een extra gehashte migratiereview maakt waarschuwingen zichtbaar in de app en rapportage.

De [volledige herbouwgoal](docs/rebuild/goal.md) blijft actief. [Functiepariteit](docs/rebuild/function-parity.md), [brondekking](docs/rebuild/source-coverage.md) en [migratiemapping](docs/rebuild/migration.md) onderscheiden gerealiseerde workflows van resterende scope. Oorspronkelijk HVK/MVK-materiaal, inhoudelijke verwerking van AI-45/AI-61, werkelijke actuele LMS-data, complete historische revisies en een goedgekeurde productieoverdracht zijn nog niet bewezen afgerond. Drie behouden lesconcepten zijn geen actuele LMS-export.

Zie [architectuur](docs/rebuild/architecture.md) voor modulegrenzen, migratie en implementatiestatus.
