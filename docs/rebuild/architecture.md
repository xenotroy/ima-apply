# IMA Apply 2 — herbouw

De nieuwe browserapp is een zelfstandig opgebouwde RI&E- en risicowerkruimte. Zij draait op GitHub Pages en bewaart projectgegevens lokaal of in een afzonderlijke private GitHub-repository. De bestaande Avalonia/SQLite-app is behouden; bestaande lokale wijzigingen zijn niet door de herbouw vervangen.

## Onderdelen

- `web/src/domain`: zuivere rekenfuncties en modellen. Geen opslag, netwerk of UI in de risicokern.
- `web/src/data`: werkruimteschema, importvalidatie, lokale versiecontrole en private GitHub Contents-sync.
- `web/src/content`: 16 thema’s, 78 eigen checkvragen, 8 pakketten en een bronregister. Geen deelnemersgegevens of integrale gelicentieerde publicaties in de frontend.
- `web/src/components`: ruimtelijke scoreprojectie, scoreverloop, LOPA-frequentiediagram, organisatie/dossiers, bewijs, onderzoek en analytics.
- `web/src/App.tsx`: overzicht, risicowerkbank, afzonderlijke inventarisaties, acties, incidenten, bronnen, rapportage en overdracht.
- `scripts/import-content.mjs`: lokale omzetting van private Markdown-, JSON- en CSV-bronnen naar een importeerbaar contentpakket.
- `scripts/migrate-workspace.mjs`: gecontroleerde, read-only export van geselecteerde legacy Markdown- of SQLite-dossiers, inclusief afzonderlijk migratierapport.

Een werkruimte bevat scenario’s, maatregelen, LOPA-analyses, private vragen en bronmetadata, antwoorden, verbeteracties en incidenten. Stabiele IDs verbinden records. Antwoorden bewaren de gebruikte vraagtekst, bronroutes en contentversie. De browser toont projecties uit dat dossier; rapporten zijn afgeleid.

De additieve v1-collecties voegen organisaties, locaties, afdelingen, dossiers, bewijs, waarnemingen, bevindingen, onderwerpen, regelgevingssignalen, onderzoeken, maanduren en private contentrecords toe. Oude browserexports zonder deze collecties blijven leesbaar. Een dossier bewaart de volledige geselecteerde vragen en bronmetadata. De canonieke SHA-256 van iedere vraag wordt vóór import en opslag gecontroleerd; antwoorden horen bij één dossier/vraagcombinatie. Een nieuwe catalogusversie wijzigt bestaande vraagsnapshots niet.

Referentiechecks bewaken bestaan, organisatie, dossierscope en compatibiliteit van scenario, bevinding, actie en bewijs. Bewijsverificatie is verbonden aan de hash van de vastgelegde inhoud; gewijzigde inhoud vraagt opnieuw verificatie. Afsluiten van een bevinding vraagt besluitnemer, besluit en geverifieerd bewijs. Een acceptatiebesluit sluit de risicoscore niet automatisch af. Bijlageverwijzingen zijn opgenomen; de app downloadt of hasht het externe bijlagebestand zelf niet. Een descriptorhash bewijst geen integriteit van een later veranderd extern bestand.

5×Waarom en BowTie zijn afzonderlijk opgeslagen, handmatig onderbouwde onderzoeken. Inhoudelijke wijzigingen herstellen hun conceptstatus. BRF-codes zijn eigen projectcoderingen; een volledige versieerbare taxonomieregistry en oorspronkelijke actie-/risicorevisieketens zijn nog niet overgenomen. Incidentfrequenties gebruiken uitsluitend passende scope, geclassificeerde incidenten en de urenbron voor iedere verstreken hele kalendermaand. Ontbrekende classificatie of uren geeft geen berekenbare frequentie.

## Rekenen en opslaan

Alle projectmutaties worden vóór vervanging van de UI-state gevalideerd. De lokale opslagschrijver serialiseert wijzigingen met Web Locks en controleert de verwachte opslagversie. Een storageconflict laat de oude opgeslagen versie intact; de gebruiker kan de nieuwe werkversie exporteren.

LOPA-bewerkingen blijven een lokaal formulierconcept totdat expliciet opslaan slaagt. Ongeldige conceptinvoer verandert geen opgeslagen scenario; de grafiek toont dan de laatste opgeslagen beoordeling met een foutmelding. Maatregelcredit vergt geschikte status, onderbouwing en expliciete beoordeling van afhankelijkheid.

Afgeronde acties hebben een eigenaar, een afzonderlijk resultaat van de effectcontrole en een controletijdstip. Afronden verandert geen maatregelcredit automatisch. Een incident kan een actie en scenario koppelen; feiten en onderzoeksconclusies blijven onderscheiden.

## Publicatie en meerdere pc’s

- Publieke broncode en website: `xenotroy/ima-apply`.
- Private dossiers: `xenotroy/ima-apply-workspaces`, standaard `workspaces/default.json`.
- Een afzonderlijke private bronwerkruimte bevat 260 oorspronkelijke themavragen en drie conceptlesteksten: `workspaces/bronwerkruimte.json`. De synchronisatiepagina laat het bestand per project kiezen. Repo, bestand en SHA horen samen bij de conflictcontrole.
- Het GitHub-token blijft in het geheugen van het tabblad. Geen token in projectgegevens, localStorage, bestanden of sitebuild.
- Iedere upload controleert repositoryprivacy en de verwachte GitHub blob-SHA. Conflicten stoppen de upload.
- Codeupdates gaan door unit-, importer- en browserproeven voordat GitHub Actions de site publiceert.

GitHub is in deze versie een bestands- en versiebackend. Er is geen fictieve OAuth-login of centrale toepassingsserver. Een fine-grained token met toegang tot uitsluitend de private datarepository is nodig op elk apparaat. De website zelf vraagt geen apart account.

## Migratie en expliciete grenzen

De JSON-vragenbank kan worden omgezet met de contentimporter. De aparte migratie-CLI exporteert geselecteerde Markdown- of SQLite-dossiers met een expliciete mapping, volledige raw provenance voor niet veilig interpreteerbare records, waarschuwingen en browservalidatie. De regeling is met fictieve fixtures getest; een werkelijke productieoverdracht is nog niet uitgevoerd. Oude 1–3 ratings worden niet omgezet naar Kinney-factoren of reductiepercentages. Zie `migration.md` voor de concrete veldmapping en grenzen.

Private PI Vught-vragenlijsten kunnen lokaal worden geïmporteerd. De openbare catalogus gebruikt nieuwe generieke formuleringen. Praktijkgids/SDU/HVK/MVK-routes zijn bron- en opleidingscontext; het bronregister specificeert wat werkelijk is gelezen. Er bestaat geen actieve Moodle API-verbinding. CSV-import is bestandsinname, geen permanente LMS-synchronisatie.

Een werkruimte heeft momenteel een grens van 900.000 UTF-8 bytes. Grote bronsets of meerdere uitgebreide beoordelingen vragen afzonderlijke werkruimtebestanden. De app kapt niets af; een te grote mutatie wordt geweigerd en de vorige werkruimte blijft behouden.

De graphische risicoruimte gebruikt een log(1 + factor)-projectie en getallen uit de rekenkern. Zij is geen fysisch simulatiemodel. FTA/ETA, volledige FMEA/HAZOP, automatische bronactualisering, AI-generatie, SIL-verificatie en juridische acceptatiebesluiten zijn geen geïmplementeerde engines.

Bij chronische blootstellingsrisico’s blijven vakspecifieke blootstellingsmodellen en inhoudelijke criteria noodzakelijk; een Kinney-score vervangt deze niet. Zie de volledige risicomethodiek en het bronregister.
