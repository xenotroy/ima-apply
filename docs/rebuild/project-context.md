# Projectcontext en rondgangverslagen

Deze additieve schemaVersion-1-uitbreiding maakt oorspronkelijke project- en rondganginformatie bruikbaar in de browser. Zij vervangt geen oorspronkelijke database, reconstructie van revisies of zelfstandige feitencontrole. Oude browserexports zonder de nieuwe collecties blijven geldig.

## Aantoonbare bronmapping

| Oorspronkelijke bron | Nieuwe betekenis | Bewaarde grens |
|---|---|---|
| `RieProject.cs`: Naam | `ProjectContext.title` | Geen projectcontext zonder echte projectnaam. |
| Organisatie, Locatie, ContactNaam, ContactEmail | Beschrijvende organisatie/locatie en contactvelden | Contact is geen assessor; locatieproza is geen geregistreerde site. |
| ActiviteitenEnProcessen, WerkplekkenEnSituaties, Personeelsopbouw, WerkEnRoostersystematiek | Activiteiten, werkplekken, personeel, roosters | Volledige oorspronkelijke tekst, inclusief regeleinden. |
| ArbeidsmiddelenEnInstallaties, GevaarlijkeStoffenEnBiologischeAgentia, FysiekeBelasting, PsychosocialeArbeidsbelasting | Middelen, stoffen/agentia, fysieke en psychosociale belasting | Geen automatische omzetting van proza naar risicoscores. |
| Verzuimgegevens, OngevallenEnIncidentgegevens, EerdereRieEnOpenstaandeActies, BhvEnNoodorganisatie, ToegepasteWetEnRegelgeving | Verzuim, incidentcontext, eerdere RI&E/acties, BHV, regelgeving | Geen incident, noemer, actie of rechtszekerheid uit contextproza afgeleid. |
| `Company.cs`: echte `RieProjectId` | Projectcontext `organisationIds` | Alleen werkelijk projectgebonden, benoemde organisaties. Company heeft geen extra contextvelden. |
| `WalkthroughReport.cs`: CompanyId, DepartmentId | Rondgang `organisationId`, optionele `departmentId` | Geen keuze tussen tegenstrijdige FKs; ontbrekende expliciete afdeling wordt niet brede scope. |
| Title, Date, Author, Summary, Body | Titel, kalenderdatum, auteur, samenvatting, volledig verslag | Ontbrekende auteur/datum blijft leeg; samenvatting is geen bewezen afzonderlijk feit. |
| `WalkthroughReportModule.cs` + `Module.cs` | Rondgang `modules` met stabiele identiteit/code/titel | Legacy-module is geen nieuwe vragenlijstthema-ID. Ontbrekende modules blijven raw met waarschuwing. |
| CreatedAt, UpdatedAt | Oorspronkelijke tijdstempels indien ondubbelzinnig | Zonder tijdzone geen stil UTC- of migratietijdstip. Bestaande `--assume-utc` blijft een expliciete interpretatie. |

Deterministische nieuwe IDs behouden de bronidentiteit. Alle oorspronkelijke geselecteerde SQLite-rijen blijven onder `sources` met originele inhoud en SHA-256. De semantische records verwijzen naar deze bronnen. De oude IMA-Markdown-templates bevatten geen projectcontext-/rondgangschema; onbekende schema's blijven volledig raw. Bestaande Markdown-assessments en hun afbakening blijven via de bestaande dossiermapping beschikbaar.

## Browserworkflow

Onder **Organisatie & dossiers → Projectcontext & rondgangen** kunnen projectcontexten en volledige rondgangverslagen worden aangemaakt, bekeken en bewerkt. Alle dertien contextvelden zijn afzonderlijk benoemd. Contexten kunnen aan nieuwe of bestaande dossiers worden gekoppeld. Een gewijzigd contextverband van een afgerond dossier maakt dat dossier opnieuw concept. Formulieren controleren dat het bewerkte record ondertussen niet is veranderd.

Een rondgang heeft een bekende organisatie en optioneel een echte afdeling, passend dossier en context. Modulecodes/-titels zijn afzonderlijke, bewerkbare records; bestaande module-ID's blijven behouden. Een waarneming kan expliciet naar een passend rondgangverslag verwijzen. Validatie blokkeert verkeerde organisatie, dossier of afdeling. Samenvatting en verslag worden niet automatisch als waarnemingen ingevoerd.

De leesbare rapportage bevat contextvelden, volledige verslagtekst, modules, bronverwijzingen en gekoppelde waarnemingen. De JSON-export bevat de complete semantische én raw records. Dit is actuele bewerkbare context; oorspronkelijke revisies worden niet gereconstrueerd.

## Acceptatiebewijs

- `web/src/data/project-context.test.ts`: alle dertien betekenissen, tekst en relaties round-trippen; onbekende metadata, echte scopegrenzen, bronrefs en leesbare output.
- `scripts/migrate-workspace.test.mjs`: volledige SQLite-contextmapping, bronbestand ongewijzigd, module alleen door rondgang geselecteerd, ontbrekende module, onbekende metadata en conflicterende/missende afdeling.
- `web/e2e/project-context-workflows.spec.ts`: handmatig vastleggen, koppelen, wijzigen, waarneming verwijzen, herladen en volledige rapportprojectie.

Een werkelijke productieoverdracht wordt afzonderlijk getoetst op de geselecteerde private bron. Fictieve regressiefixtures bewijzen geen volledigheid van alle historische dossiers.
