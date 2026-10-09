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

De werkruimte bevat ook precies één private bron met `format: ima.migration-review/v1` en status `review-required`. De browser toont die als **Migratieconcept: menselijke controle vereist**: alle waarschuwingstypen en aantallen, iedere volledige waarschuwing met bron-ID, regels en recordtellingen. Expliciete UTC-aannames, ontbrekende historische vraagversies en oude risico-/maatregelratings zijn afzonderlijk zichtbaar, ook als hun aantal nul is. Andere raw klantrecords worden niet in dit paneel getoond en blijven volledig behouden in de export.

`raw` van de reviewbron bevat het volledige inhoudelijke migratierapport (`schema`, `migratedAt`, `target`, `warnings`, `rules`, `counts`). De bron krijgt een SHA-256 van canoniek JSON met gesorteerde objectkeys en behouden arrayvolgorde; haar stabiele ID volgt uit de geselecteerde bron-ID/hashset. De telling `sources` omvat deze reviewbron. De browser bevestigt de opgeslagen rapporthash voordat waarschuwingen getoond worden. Dit controleert exportconsistentie en is geen menselijke inhoudelijke goedkeuring. `migratedAt` is uitdrukkelijk de nieuwe projectiedatum, geen gereconstrueerde oorspronkelijke datum of beoordelaar.

De externe rapportfile bevat daarnaast de hash en bytegrootte van de uiteindelijke werkruimte-export. Die velden staan niet in de embedded review: een bestand kan zijn eigen definitieve hash niet als onderdeel van de gehashte inhoud bevatten. De inhoudelijke regels, tellingen en waarschuwingen in beide representaties zijn gelijk.

## Wat wordt overgedragen

| Legacy inhoud                                             | Nieuwe representatie                                                    | Betekenis en grenzen                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Markdown werkruimtemetadata                               | Werkruimtenaam plus volledig raw bronrecord                             | Schema, oude versie, oorspronkelijke timestamps en overige metadata blijven terugvindbaar.                                                                                                                                                                                                                                                                                                                                                 |
| Vraagdefinitie                                            | Inventarisatievraag; waar exact gekoppeld ook een bevroren dossiervraag | Vraag, toelichting, acceptatiecriteria en verwacht bewijs komen uit benoemde bronsecties. De route `verdieping` is de nieuwe presentatiekeuze voor nog niet getrieerde legacyvragen, geen claim over oorspronkelijke urgentie.                                                                                                                                                                                                             |
| Assessment                                                | Nieuw conceptdossier                                                    | Bekende titel, scope en assessor blijven behouden. Onbekende scope/assessor blijven leeg, met waarschuwing. Oude lifecycle en referenties staan raw; een oud afgerond label wordt geen nieuwe beoordeling of goedkeuring.                                                                                                                                                                                                                  |
| Markdown response                                         | Dossierantwoord met snapshot en nieuwe vraaghash                        | Alleen bekend antwoordenum, expliciet tijdstip met zone en bevroren vraagtekst worden gebruikt. Onderbouwing blijft brongetrouw.                                                                                                                                                                                                                                                                                                           |
| Bewijsdocument                                            | `Evidence` met status `unverified`                                      | Titel, beschrijving, bronverwijzing en vastleggingstijd worden behouden. Bij lokale bijlagen wordt beschikbaarheid/hash onderzocht zonder kopiëren. Integriteit of een oud bewijslabel wordt geen inhoudelijke verificatie.                                                                                                                                                                                                                |
| Waarneming                                                | Dossierwaarneming                                                       | Feit en context blijven expliciet gelabeld; de oorspronkelijke lokale kalenderdatum wordt behouden.                                                                                                                                                                                                                                                                                                                                        |
| Bevinding v2                                              | Dossierbevinding, gekoppeld waar relaties aantoonbaar zijn              | Bestaande conclusietekst blijft intact. Oude afsluit-/acceptatiestatus zonder het nieuwe besluit- en verificatiebewijs blijft raw; de nieuwe projectie vraagt review.                                                                                                                                                                                                                                                                      |
| Verbeteractie                                             | Open of lopende actie; oorspronkelijke lifecycle raw                    | `implemented`, `effective` en `closed` worden geen `done` zonder afzonderlijke effectverificatie. Geannuleerde acties worden niet opnieuw als open werk geprojecteerd. Meerdere bevindingen worden niet willekeurig tot één relatie teruggebracht.                                                                                                                                                                                         |
| Incident                                                  | Incident, bijna-incident of observatie                                  | Tijdstip, feitelijke tekst, afdeling, ernst, recordability en verzuimvelden worden meegenomen voor zover exact aanwezig. Bekende actierelaties blijven verbonden.                                                                                                                                                                                                                                                                          |
| Onderwerp en wetsignaal                                   | `Topic` en `LegalRecord`                                                | Alleen bruikbare bekende velden en relaties worden geprojecteerd. De CLI voert geen actuele wetscontrole uit; oorspronkelijke inhoud en verificatiedatum blijven als brongegevens herkenbaar.                                                                                                                                                                                                                                              |
| Geselecteerde BRF-taxonomiedefinitie                      | Concept in lokaal BRF-register                                          | Alleen exact `ima.taxonomy-term/v1`, taxonomie `ima-core:taxonomy:brf`, status `draft` en unieke bruikbare ID/versie/betekenis. Bron-ID is de aanwezige code. Nieuwe `createdAt` is expliciet migratieprojectiedatum; oorspronkelijke auteur/eigenaar/tijd blijven onbekend, zonder statusgeschiedenis. Een onversioneerde parentrelatie en vrije onderzoekscodes blijven raw/ongewijzigd. Geen autoseeding van de 14 voorbeelddefinities. |
| 5x Waarom / BowTie                                        | Conceptonderzoek wanneer incident en methodeversie exact bekend zijn    | Genoemde bronsecties blijven overgedragen. Waarom-antwoorden blijven hypotheses. Een samengestelde “Gevaar en top event”-sectie wordt niet stil in een bedacht enkel top event veranderd.                                                                                                                                                                                                                                                  |
| Blootstellingsnoemer                                      | Maandrecord met gewerkte uren                                           | Alleen met geldige maand, bekende bron en ondubbelzinnige werkruimtebrede scope. Een onbekende afdelingsscope wordt niet verzonnen.                                                                                                                                                                                                                                                                                                        |
| Vrije methode-invoer en oorspronkelijke risicobeoordeling | Volledig raw record                                                     | Geen numerieke factoren, LOPA-frequenties of reductiepercentages worden uit proza afgeleid.                                                                                                                                                                                                                                                                                                                                                |
| Niet ondersteund of ambigu Markdown-record                | Volledige raw brontekst met hash                                        | Geen gedeeltelijk gegokte typed projectie. Modules, overige/niet-draft taxonomieën en afwijkende schema’s blijven zo terugvindbaar. Templates en binaire attachments worden niet als echte dossierrecords geïmporteerd.                                                                                                                                                                                                                    |

Raw Markdown-records bevatten oorspronkelijke tekst, relatieve bronlocatie, metadata en hashes. Raw SQLite-records bevatten tabel, oorspronkelijke rij en rijhash. Ze staan onder `sources` en worden daarmee opgenomen in de volledige werkruimte-export. Nieuwe bron-ID’s en record-ID’s worden deterministisch afgeleid; oorspronkelijke IDs blijven expliciet in de provenance. De migratie is een afzonderlijke momentopname, geen automatische merge met een bestaande browserwerkruimte.

## Twee verschillende vraaghashes

De oude IMA-vraagreferentie verwijst naar de hash van de volledige oorspronkelijke Markdown-vraagdefinitie, met CRLF naar LF genormaliseerd. Dat volgt uit `src/RieBuilder.Ima/Markdown/MarkdownDocument.cs` (MarkdownDocument.cs; oorspronkelijke private checkout). De nieuwe vraaghash dekt de volledige `Question`-JSON in de vaste veldvolgorde van [frozen.ts](../../web/src/data/frozen.ts), inclusief optionele `legalReferences` wanneer aanwezig.

Deze hashes worden niet onderling uitgewisseld. Een bronreferentie wordt alleen bevestigd als originele ID, versie en genormaliseerde bronhash exact bij de geselecteerde definitie passen. De CLI berekent daarna de nieuwe JSON-snapshothash voor de nieuwe representatie.

Is de oude vraagdefinitie veranderd of niet aanwezig, maar bevat de response wel de oorspronkelijke “Bevroren vraag”-tekst, dan wordt uitsluitend die aantoonbare tekst hersteld. Onbekende toelichting, criteria, bronroutes of bewijsverwachtingen worden niet uit de huidige vraagversie geleend. De oude referentie/hash blijft raw en het rapport vermeldt deze beperkte herstelroute. De nieuwe hash bewijst de integriteit van de nieuwe projectie; zij bewijst niet dat ontbrekende historische metadata is gereconstrueerd.

## SQLite: scores en context vereisen herbeoordeling

De legacy riskmap gebruikt lokale, naar 1–3 begrensde E/B/W-ratings en `ReductieScore`. De bronlogica staat in `src/RieBuilder.Data/Services/RieRepository.RiskMap.cs` (RieRepository.RiskMap.cs; oorspronkelijke private checkout). Het model bevat ook `KostenNiveau`, `IsInPlace` en relevantieratings. Dit zijn geen gevalideerde Kinney-factoren, reductiepercentages of LOPA-PFD’s.

Daarom creëert de CLI hieruit **geen berekende scenario’s of maatregelen met veronderstelde reductie**. Ratings en maatregelbeoordelingen blijven exact raw. Herkenbare risicofactorbeoordelingen kunnen als conceptbevinding zonder gekoppeld risicoscenario worden aangeboden, met expliciete herbeoordelingsbehoefte. De oude kostenmodifier wordt niet stil een nieuwe haalbaarheidsmultiplier of geschatte inspanning.

De database geeft wel concrete vragen, huidige criteria/normverwijzingen en antwoorden. De CLI bevriest die vraagdefinities bij export. SQLite-antwoorden hadden geen historische vraaghash of oorspronkelijke vraagtekst per antwoord: het rapport zegt daarom uitdrukkelijk dat dit de definitie bij export is. Toelichting wordt niet vanzelf bewijs. Een projectcontactpersoon wordt niet als assessor aangemerkt.

Project- en companygebonden rijen worden voor het gekozen project gefilterd. Companynamen worden bewaard. Een oude `Department` met een benoemde, bekende `CompanyId` wordt rechtstreeks aan die organisatie gekoppeld: `organisationId` is aanwezig en `siteId` ontbreekt. Het additieve afdelingsmodel accepteert precies één bekende locatie óf één rechtstreekse organisatie; bestaande browserafdelingen met `siteId` blijven geldig. De locatie blijft expliciet onbekend en wordt niet afgeleid uit de bedrijfsnaam of projectlocatietekst.

Scoped dossiers behouden de daadwerkelijke afdelings-ID. Wanneer een antwoord geen `CompanyId` bevat maar wel een bekende `DepartmentId`, volgt de organisatie uitsluitend uit de oorspronkelijke department-company-relatie. Een expliciete company-ID die daarmee strijdig is wordt niet gekozen of overschreven: de rij blijft raw met een waarschuwing. Equivalenten met dezelfde echte afdeling/organisatie/vraag worden bij duplicaatcontrole als één scope beschouwd; tegenstrijdige antwoorden blijven alle raw. Een afdeling zonder naam of zonder bruikbare oorspronkelijke organisatie krijgt geen verzonnen parent.

Een benoemd `RieProject` krijgt daarnaast een bewerkbare `ProjectContext`: oorspronkelijke organisatie-/locatiebeschrijving, contactnaam/e-mail, alle dertien inhoudelijke contextvelden, echte organisatie-ID's en bronverwijzing. De beschrijvende locatie wordt geen geregistreerde site. Dossiers behouden de projectcontext-ID. Ontbrekende contextvelden blijven lege tekst; onbekende tijdzones leveren geen fictief oorspronkelijk tijdstip op.

`WalkthroughReports` worden afzonderlijke rondgangrecords met titel, oorspronkelijke kalenderdatum, auteur, samenvatting, volledige body, echte organisatie/afdeling, passend conceptdossier en projectcontext. Geselecteerde `WalkthroughReportModules` worden als module-identiteiten met hun oorspronkelijke code/titel bewaard, ook wanneer de module uitsluitend door de rondgang is geselecteerd. Rapporten met een ontbrekende of tegenstrijdige afdelingsrelatie blijven raw; hun scope wordt niet organisatiebreed gemaakt. Onbekende datum/auteur blijft expliciet leeg. De oorspronkelijke rapport-, module- en projectrijen blijven eveneens raw met hashes.

Een samenvatting wordt geen automatisch afgeleid individueel feit of bevinding. In de browser kan de gebruiker afzonderlijke waarnemingen aan een passend rondgangrecord koppelen. **Projectcontext & rondgangen** toont en bewerkt de semantische records; de leesbare rapportage en JSON-export bevatten hun volledige inhoud. De oorspronkelijke IMA-Markdown-code bevat geen afzonderlijk projectcontext- of rondgangschema. Een onbekend Markdown-schema wordt daarom niet op naam of proza gegokt; het blijft raw. Zie [project-context.md](project-context.md) voor mapping en acceptatiebewijs. Niet-herkende SQLite-tabellen worden met waarschuwing uitgesloten: hun scope en schema moeten eerst afzonderlijk worden onderzocht; de originele database blijft bewaard.

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

De browsergrens is **2.000.000 UTF-8 bytes** per werkruimte. De CLI kapt geen broninhoud af om onder deze grens te komen: een te groot of anderszins ongeldig resultaat stopt vóór schrijven. Maak bij grotere datasets bewust afzonderlijke project-/dossierselecties op bronkopieën en verifieer iedere export afzonderlijk. De huidige CLI houdt bronselecties begrensd tot 1.000 Markdown-bestanden, 5.000 rijen per herkenbare SQLite-tabel en 64 MiB per bronbestand.

## Wat de tests bewijzen

```sh
node --test scripts/migrate-workspace.test.mjs
```

De fixtures toetsen de daadwerkelijke browservalidatie, nieuwe canonieke snapshots, veranderd bronmateriaal, oorspronkelijke ratings, ontbrekende relaties, oorspronkelijke kalenderdatums, onbekende zones, projectselectie, bronbehoud, WAL-stops, symlinks, private create-only uitvoer en credentialblokkering. Deze tests gebruiken tijdelijke fictieve dossiers en databases. Zij bewijzen de migratieregeling voor die gevallen; zij bewijzen geen uitgevoerde productieoverdracht of inhoudelijke juistheid van een werkelijk legacydossier.

## Daadwerkelijke private kopiecontrole, 9 oktober 2026

De aangetroffen lokale SQLite-database is via een gecontroleerde private bytekopie verwerkt. Integriteitscontrole en foreign-keycontrole waren goed; de oorspronkelijke DB/WAL/SHM behielden hun hashes, grootte en wijzigingstijden. Alleen kopieën zijn met SQLite geopend. De oorspronkelijke projectstatus als echt klantdossier is onbekend.

De strikte versie bevat drie conceptdossiers, vier afdelingen, vijf rondgangen en 110 vragen; dertien antwoorden blijven raw vanwege ontbrekende tijdzones. De afzonderlijke UTC-controleversie bevat dertien getypeerde antwoorden, 25 expliciete UTC-waarschuwingen en dertien waarschuwingen over ontbrekende historische vraagversies. De huidige oorspronkelijke schrijfcode gebruikt UTC; zekerheid over iedere historische veldherkomst is matig. Oude ratings blijven oorspronkelijk.

De private bestanden `workspaces/legacy-riebuilder-strict.json` (761.198 bytes) en `workspaces/legacy-riebuilder-utc-review.json` (801.985 bytes) zijn create-only opgeslagen en volledig teruggelezen door twee onafhankelijke API-clients. Echte browsercontexten openden beide cloudversies; de volledige JSON bleef na vernieuwen exact gelijk. Alle 248 raw bronrecords en getypeerde inhoud bleven behouden. Eén extra gehashte reviewbron toont alle waarschuwingen in de app en de leesbare rapportage. Dit is overdrachtsbewijs, geen inhoudelijke goedkeuring of reconstructie van ontbrekende historische revisies.
