# Gecontroleerde overdracht van bestaande dossiers

`scripts/migrate-workspace.mjs` maakt een afzonderlijke private browserwerkruimte uit een geselecteerde Markdown IMA-werkruimte of een legacy SQLite-project. De bron wordt niet aangepast. De CLI uploadt niets en overschrijft geen eerdere migratie-export.

De nieuwe JSON gebruikt het actuele browsermodel met `schemaVersion: 1`. De oude Markdown-werkruimte gebruikt `schema: ima.workspace/v1` in haar frontmatter. Dat zijn verschillende representaties: het oude schemaveld en de volledige bron blijven bewaard in de provenance; het wordt niet als extra, onbekend veld aan browser-JSON toegevoegd.

## Gebruik

Vereist: Node.js 24 of nieuwer en de bestaande webdependencies. De CLI gebruikt de daadwerkelijke `web/src/data/validation.ts`, inclusief referentiecontroles en canonieke vraaghash, om het resultaat vóór schrijven te toetsen.

```sh
npm --prefix web ci

node scripts/migrate-workspace.mjs --help

node scripts/migrate-workspace.mjs \
  --markdown "/pad/naar/oude-ima-werkruimte" \
  --out private-data/md-werkruimte.json

node scripts/migrate-workspace.mjs \
  --sqlite "/pad/naar/gesloten-databasekopie.db" \
  --project-id 1 \
  --out private-data/sqlite-project-1.json
```

Bij één SQLite-project is `--project-id` niet verplicht. Bij meerdere projecten is een expliciete selectie verplicht. Een tweede naam voor de nieuwe werkruimte kan met `--name` worden opgegeven. De oorspronkelijke projectnaam blijft daarnaast in het bronrecord staan.

Gebruik een stabiele databasekopie nadat de desktopapp is gesloten. Een niet-leeg WAL-bestand veroorzaakt een stop: de CLI kan dan niet aantonen dat uitsluitend het gekozen `.db`-bestand een volledige, stabiele momentopname bevat. De CLI opent de oorspronkelijke database nooit met SQLite. Zij leest de bytes, opent alleen een wegwerpbare kopie met `readOnly: true` en `query_only`, controleert daarna opnieuw de oorspronkelijke hash en verwijdert de tijdelijke kopie. Hierdoor worden geen journal-, WAL- of SHM-bestanden naast de bron aangemaakt.

Er verschijnen twee bestanden:

- `private-data/md-werkruimte.json`: de gevalideerde browserwerkruimte.
- `private-data/md-werkruimte.migration-report.json`: regels, tellingen, controlehash en concrete waarschuwingen.

Beide blijven in de door Git genegeerde `private-data/`-map, met beperkte bestandsrechten. Bestaande bestanden, publieke uitvoerpaden en symlinkpaden worden geweigerd. Bij een fout tijdens het schrijven van het nieuwe rapport wordt uitsluitend de zojuist gemaakte nieuwe export verwijderd; een bestaand rapport blijft intact. Details met broninhoud verschijnen niet in de terminalmelding.

## Wat wordt overgedragen

| Legacy inhoud | Nieuwe representatie | Betekenis en grenzen |
| --- | --- | --- |
| Markdown werkruimtemetadata | Werkruimtenaam plus volledig raw bronrecord | Schema, oude versie, oorspronkelijke timestamps en overige metadata blijven terugvindbaar. |
| Vraagdefinitie | Inventarisatievraag; waar exact gekoppeld ook een bevroren dossiervraag | Vraag, toelichting, acceptatiecriteria en verwacht bewijs komen uit benoemde bronsecties. De route `verdieping` is de nieuwe presentatiekeuze voor nog niet getrieerde legacyvragen, geen claim over oorspronkelijke urgentie. |
| Assessment | Nieuw conceptdossier | Bekende titel, scope en assessor blijven behouden. Onbekende scope/assessor blijven leeg, met waarschuwing. Oude lifecycle en referenties staan raw; een oud afgerond label wordt geen nieuwe beoordeling of goedkeuring. |
| Markdown response | Dossierantwoord met snapshot en nieuwe vraaghash | Alleen bekend antwoordenum, expliciet tijdstip met zone en bevroren vraagtekst worden gebruikt. Onderbouwing blijft brongetrouw. |
| Bewijsdocument | `Evidence` met status `unverified` | Titel, beschrijving, bronverwijzing en vastleggingstijd worden behouden. Bij lokale bijlagen wordt beschikbaarheid/hash onderzocht zonder kopiëren. Integriteit of een oud bewijslabel wordt geen inhoudelijke verificatie. |
| Waarneming | Dossierwaarneming | Feit en context blijven expliciet gelabeld; de oorspronkelijke lokale kalenderdatum wordt behouden. |
| Bevinding v2 | Dossierbevinding, gekoppeld waar relaties aantoonbaar zijn | Bestaande conclusietekst blijft intact. Oude afsluit-/acceptatiestatus zonder het nieuwe besluit- en verificatiebewijs blijft raw; de nieuwe projectie vraagt review. |
| Verbeteractie | Open of lopende actie; oorspronkelijke lifecycle raw | `implemented`, `effective` en `closed` worden geen `done` zonder afzonderlijke effectverificatie. Geannuleerde acties worden niet opnieuw als open werk geprojecteerd. Meerdere bevindingen worden niet willekeurig tot één relatie teruggebracht. |
| Incident | Incident, bijna-incident of observatie | Tijdstip, feitelijke tekst, afdeling, ernst, recordability en verzuimvelden worden meegenomen voor zover exact aanwezig. Bekende actierelaties blijven verbonden. |
| Onderwerp en wetsignaal | `Topic` en `LegalRecord` | Alleen bruikbare bekende velden en relaties worden geprojecteerd. De CLI voert geen actuele wetscontrole uit; oorspronkelijke inhoud en verificatiedatum blijven als brongegevens herkenbaar. |
| 5x Waarom / BowTie | Conceptonderzoek wanneer incident en methodeversie exact bekend zijn | Genoemde bronsecties blijven overgedragen. Waarom-antwoorden blijven hypotheses. Een samengestelde “Gevaar en top event”-sectie wordt niet stil in een bedacht enkel top event veranderd. |
| Blootstellingsnoemer | Maandrecord met gewerkte uren | Alleen met geldige maand, bekende bron en ondubbelzinnige werkruimtebrede scope. Een onbekende afdelingsscope wordt niet verzonnen. |
| Vrije methode-invoer en oorspronkelijke risicobeoordeling | Volledig raw record | Geen numerieke factoren, LOPA-frequenties of reductiepercentages worden uit proza afgeleid. |
| Niet ondersteund of ambigu Markdown-record | Volledige raw brontekst met hash | Geen gedeeltelijk gegokte typed projectie. Modules, taxonomieën en afwijkende schema’s blijven zo terugvindbaar. Templates en binaire attachments worden niet als echte dossierrecords geïmporteerd. |

Raw Markdown-records bevatten oorspronkelijke tekst, relatieve bronlocatie, metadata en hashes. Raw SQLite-records bevatten tabel, oorspronkelijke rij en rijhash. Ze staan onder `sources` en worden daarmee opgenomen in de volledige werkruimte-export. Nieuwe bron-ID’s en record-ID’s worden deterministisch afgeleid; oorspronkelijke IDs blijven expliciet in de provenance. De migratie is een afzonderlijke momentopname, geen automatische merge met een bestaande browserwerkruimte.

## Twee verschillende vraaghashes

De oude IMA-vraagreferentie verwijst naar de hash van de volledige oorspronkelijke Markdown-vraagdefinitie, met CRLF naar LF genormaliseerd. Dat volgt uit `src/RieBuilder.Ima/Markdown/MarkdownDocument.cs` (MarkdownDocument.cs; oorspronkelijke private checkout). De nieuwe vraaghash dekt de volledige `Question`-JSON in de vaste veldvolgorde van [frozen.ts](../../web/src/data/frozen.ts), inclusief optionele `legalReferences` wanneer aanwezig.

Deze hashes worden niet onderling uitgewisseld. Een bronreferentie wordt alleen bevestigd als originele ID, versie en genormaliseerde bronhash exact bij de geselecteerde definitie passen. De CLI berekent daarna de nieuwe JSON-snapshothash voor de nieuwe representatie.

Is de oude vraagdefinitie veranderd of niet aanwezig, maar bevat de response wel de oorspronkelijke “Bevroren vraag”-tekst, dan wordt uitsluitend die aantoonbare tekst hersteld. Onbekende toelichting, criteria, bronroutes of bewijsverwachtingen worden niet uit de huidige vraagversie geleend. De oude referentie/hash blijft raw en het rapport vermeldt deze beperkte herstelroute. De nieuwe hash bewijst de integriteit van de nieuwe projectie; zij bewijst niet dat ontbrekende historische metadata is gereconstrueerd.

## SQLite: scores en context vereisen herbeoordeling

De legacy riskmap gebruikt lokale, naar 1–3 begrensde E/B/W-ratings en `ReductieScore`. De bronlogica staat in `src/RieBuilder.Data/Services/RieRepository.RiskMap.cs` (RieRepository.RiskMap.cs; oorspronkelijke private checkout). Het model bevat ook `KostenNiveau`, `IsInPlace` en relevantieratings. Dit zijn geen gevalideerde Kinney-factoren, reductiepercentages of LOPA-PFD’s.

Daarom creëert de CLI hieruit **geen berekende scenario’s of maatregelen met veronderstelde reductie**. Ratings en maatregelbeoordelingen blijven exact raw. Herkenbare risicofactorbeoordelingen kunnen als conceptbevinding zonder gekoppeld risicoscenario worden aangeboden, met expliciete herbeoordelingsbehoefte. De oude kostenmodifier wordt niet stil een nieuwe haalbaarheidsmultiplier of geschatte inspanning.

De database geeft wel concrete vragen, huidige criteria/normverwijzingen en antwoorden. De CLI bevriest die vraagdefinities bij export. SQLite-antwoorden hadden geen historische vraaghash of oorspronkelijke vraagtekst per antwoord: het rapport zegt daarom uitdrukkelijk dat dit de definitie bij export is. Toelichting wordt niet vanzelf bewijs. Een projectcontactpersoon wordt niet als assessor aangemerkt.

Project- en companygebonden rijen worden voor het gekozen project gefilterd. Companynamen worden bewaard. De oude `Department` heeft een `CompanyId` maar geen bevestigde locatie-entiteit die aan de nieuwe verplichte `siteId` voldoet. Afdelingscontext blijft daarom in scopeproza en raw relaties; er wordt geen fictieve locatie ingevoegd. Rondgangrapporten blijven raw, omdat vrije samenvatting en rapportproza geen automatisch af te leiden individuele waarneming zijn. Niet-herkende SQLite-tabellen worden met waarschuwing uitgesloten: hun scope en schema moeten eerst afzonderlijk worden onderzocht; de originele database blijft bewaard.

## Tijdzones en onduidelijke relaties

Timestamps met een expliciete zone kunnen worden genormaliseerd. Een SQLite-tijdstip zonder zone krijgt standaard geen verzonnen zone: het oorspronkelijke antwoord blijft raw en wordt niet als gedateerd nieuw antwoord geprojecteerd. Als een gecontroleerde bronanalyse bevestigt dat die databasevelden UTC voorstellen, kan dat expliciet:

```sh
node scripts/migrate-workspace.mjs \
  --sqlite "/pad/naar/gesloten-databasekopie.db" \
  --project-id 1 \
  --assume-utc \
  --out private-data/sqlite-project-1-utc.json
```

Het rapport markeert iedere dergelijke UTC-aanname. Het opt-in is een gekozen interpretatie, geen extra bronbewijs.

Ontbrekende, dubbele, niet representabele of dossieroverschrijdende relaties blijven in de originele raw records en leveren waarschuwingen op. De CLI maakt geen placeholder-assessment, department, scenario, eigenaar of verificatie om referentiechecks te laten slagen. Antwoorden, waarnemingen en bevindingen worden alleen gekoppeld aan een aantoonbaar passend dossier.

## Controle en openen

1. Bewaar de originele werkruimte/database als zelfstandige herstelbron.
2. Lees het private migratierapport, vooral raw-only records, onduidelijke tijdzones, veranderde vraagbronnen en niet overgedragen besluiten.
3. Controleer aantallen, primaire vraagtekst, antwoorden, scope en bewijskoppelingen tegen de originele gegevens.
4. Exporteer de reeds geopende browserwerkruimte voordat je de migratie-JSON opent via **Werkruimte of content importeren**.
5. Beoordeel conceptdossiers, bewijs, bevindingen en effecten in de nieuwe workflow. Pas daarna is eventuele private GitHub-synchronisatie een volgende expliciete stap in de app.

De browsergrens is **900.000 UTF-8 bytes** per werkruimte. De CLI kapt geen broninhoud af om onder deze grens te komen: een te groot of anderszins ongeldig resultaat stopt vóór schrijven. Maak bij grotere datasets bewust afzonderlijke project-/dossierselecties op bronkopieën en verifieer iedere export afzonderlijk. De huidige CLI houdt bronselecties begrensd tot 1.000 Markdown-bestanden, 5.000 rijen per herkenbare SQLite-tabel en 64 MiB per bronbestand.

## Wat de tests bewijzen

```sh
node --test scripts/migrate-workspace.test.mjs
```

De fixtures toetsen de daadwerkelijke browservalidatie, nieuwe canonieke snapshots, veranderd bronmateriaal, oorspronkelijke ratings, ontbrekende relaties, oorspronkelijke kalenderdatums, onbekende zones, projectselectie, bronbehoud, WAL-stops, symlinks, private create-only uitvoer en credentialblokkering. Deze tests gebruiken tijdelijke fictieve dossiers en databases. Zij bewijzen de migratieregeling voor die gevallen; zij bewijzen geen uitgevoerde productieoverdracht of inhoudelijke juistheid van een werkelijk legacydossier.
