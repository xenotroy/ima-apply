# IMA Apply 2 — herbouw

De nieuwe browserapp is een zelfstandig opgebouwde RI&E- en risicowerkruimte. Zij draait op GitHub Pages en bewaart projectgegevens lokaal of in een afzonderlijke private GitHub-repository. De bestaande Avalonia/SQLite-app is behouden; bestaande lokale wijzigingen zijn niet door de herbouw vervangen.

## Onderdelen

- `web/src/domain`: zuivere rekenfuncties en modellen. Geen opslag, netwerk of UI in de risicokern.
- `web/src/data`: werkruimteschema, importvalidatie, lokale versiecontrole en private GitHub Contents-sync.
- `web/src/content`: 16 thema’s, 78 eigen checkvragen, 8 pakketten en een bronregister. Geen deelnemersgegevens of integrale gelicentieerde publicaties in de frontend.
- `web/src/components`: ruimtelijke scoreprojectie, scoreverloop en apart LOPA-frequentiediagram.
- `web/src/App.tsx`: overzicht, risicowerkbank, vragenlijsten, acties, incidenten, bronnen, rapportage en overdracht.
- `scripts/import-content.mjs`: lokale omzetting van private Markdown-, JSON- en CSV-bronnen naar een importeerbaar contentpakket.

Een werkruimte bevat scenario’s, maatregelen, LOPA-analyses, private vragen en bronmetadata, antwoorden, verbeteracties en incidenten. Stabiele IDs verbinden records. Antwoorden bewaren de gebruikte vraagtekst, bronroutes en contentversie. De browser toont projecties uit dat dossier; rapporten zijn afgeleid.

## Rekenen en opslaan

Alle projectmutaties worden vóór vervanging van de UI-state gevalideerd. De lokale opslagschrijver serialiseert wijzigingen met Web Locks en controleert de verwachte opslagversie. Een storageconflict laat de oude opgeslagen versie intact; de gebruiker kan de nieuwe werkversie exporteren.

LOPA-bewerkingen blijven een lokaal formulierconcept totdat expliciet opslaan slaagt. Ongeldige conceptinvoer verandert geen opgeslagen scenario; de grafiek toont dan de laatste opgeslagen beoordeling met een foutmelding. Maatregelcredit vergt geschikte status, onderbouwing en expliciete beoordeling van afhankelijkheid.

Afgeronde acties hebben een eigenaar, een afzonderlijk resultaat van de effectcontrole en een controletijdstip. Afronden verandert geen maatregelcredit automatisch. Een incident kan een actie en scenario koppelen; feiten en onderzoeksconclusies blijven onderscheiden.

## Publicatie en meerdere pc’s

- Publieke broncode en website: `xenotroy/ima-apply`.
- Private dossiers: `xenotroy/ima-apply-workspaces`, standaard `workspaces/default.json`.
- Het GitHub-token blijft in het geheugen van het tabblad. Geen token in projectgegevens, localStorage, bestanden of sitebuild.
- Iedere upload controleert repositoryprivacy en de verwachte GitHub blob-SHA. Conflicten stoppen de upload.
- Codeupdates gaan door unit-, importer- en browserproeven voordat GitHub Actions de site publiceert.

GitHub is in deze versie een bestands- en versiebackend. Er is geen fictieve OAuth-login of centrale toepassingsserver. Een fine-grained token met toegang tot uitsluitend de private datarepository is nodig op elk apparaat. De website zelf vraagt geen apart account.

## Migratie en expliciete grenzen

De JSON-vragenbank van de desktopapp kan worden omgezet met de importer. De bestaande SQLite-projectdossiers en Markdown IMA-workspaces zijn niet automatisch gemigreerd. Een gebruiker moet daarvoor eerst een gecontroleerde, afzonderlijke datamapping maken; de oude 1–3 reductieratings mogen niet als gevalideerde percentagewerking worden geïnterpreteerd.

Private PI Vught-vragenlijsten kunnen lokaal worden geïmporteerd. De openbare catalogus gebruikt nieuwe generieke formuleringen. Praktijkgids/SDU/HVK/MVK-routes zijn bron- en opleidingscontext; het bronregister specificeert wat werkelijk is gelezen. Er bestaat geen actieve Moodle API-verbinding. CSV-import is bestandsinname, geen permanente LMS-synchronisatie.

De graphische risicoruimte gebruikt een log(1 + factor)-projectie en getallen uit de rekenkern. Zij is geen fysisch simulatiemodel. FTA/ETA, volledige FMEA/HAZOP, automatische bronactualisering, AI-generatie, SIL-verificatie en juridische acceptatiebesluiten zijn geen geïmplementeerde engines.

Bij chronische blootstellingsrisico’s blijven vakspecifieke blootstellingsmodellen en inhoudelijke criteria noodzakelijk; een Kinney-score vervangt deze niet. Zie de volledige risicomethodiek en het bronregister.
