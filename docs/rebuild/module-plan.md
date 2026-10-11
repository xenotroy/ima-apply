# Modulekeuze per project en afdeling

De opgeslagen modulekeuze hoort bij een expliciete scope. Een projectplan kan aan een echte projectcontext en eventueel één organisatie worden gekoppeld. Een afdelingsplan bevat de werkelijke afdeling en haar organisatie; de locatie blijft onbekend als alleen de organisatie bekend is. Een organisatie buiten de gekozen projectcontext of een tegenstrijdige afdelingsorganisatie wordt geweigerd.

`WorkspaceState.modulePlans` is een optionele toevoeging aan schemaVersion 1. Oude exports zonder deze collectie blijven leesbaar. Een plan bewaart zijn ID, titel, scope, relaties, revisie en bronrecords. Elke module bevat de oorspronkelijke identiteit, code, titel, geordende vraag-ID's, selectiestatus, scopenotities en bronnen. De toewijzingsvolgorde (`sortOrder`) en oorspronkelijke definitievolgorde (`definitionSortOrder`) zijn afzonderlijke velden. Een ontbrekende oorspronkelijke volgorde blijft ontbrekend.

De browser laat de gebruiker een plan opslaan, modules selecteren, scopenotities wijzigen en modules verschuiven. Uitschakelen verwijdert de identiteit en notes niet: de module kan later bewust opnieuw worden gekozen. De arrayvolgorde bepaalt de vraagvolgorde. Een vraag die bij meerdere gekozen modules hoort, verschijnt eenmaal op haar eerste gekozen positie. Opslaan van een plan maakt geen antwoorden, bevindingen of risicobeoordelingen aan.

## Bronidentiteit

Er zijn drie onderscheiden herkomsten:

- `legacy_module`: een daadwerkelijke geselecteerde `Modules`-identiteit uit de oude database, met bronrecords van definitie en toewijzing;
- `catalog_theme`: een thema uit de eigen publieke IMA-vragenbank;
- `imported_theme`: een groep daadwerkelijk geïmporteerde vragen met hun bestaande thema-ID.

Een nieuw thema krijgt geen oude module-identiteit. Een geïmporteerd thema met dezelfde naam als een catalogusthema blijft een aparte keuze. Een vraag die al bij een daadwerkelijk bewaarde legacy-module hoort, wordt in de keuzelijst niet opnieuw als nieuw thema gepresenteerd. De applicatie leidt geen onbekende modulecode of oorspronkelijke auteursversie uit een thema af.

## Dossier uit een opgeslagen keuze

De knop **Dossier uit deze keuze** vraagt een concrete dossiertitel, afgebakende scope en beoordelaar. Deze informatie wordt door de gebruiker ingevuld. De applicatie kopieert alleen daadwerkelijk aanwezige scope-relaties en bevriest alle vragen van de ingeschakelde modules in de opgeslagen volgorde. Een ontbrekende vraag of bron verhindert het aanmaken van het gehele dossier; er ontstaat geen stilzwijgend gedeeltelijk dossier.

Het dossier bevat de volledige vraagversies en hashes, bronkopieën en een `modulePlanSnapshot` met de ingeschakelde modules, notes, volgorde, scope en planrevisie. `modulePlanSnapshotSha256` controleert ook deze planinhoud. Het is een integriteitscontrole binnen de export, geen externe ondertekening of bewijs dat de broninhoud historisch waar was. De validator controleert dat de bevroren modulekeuze exact dezelfde vraagvolgorde en scope heeft als het dossier.

Latere planwijzigingen wijzigen bestaande dossiers niet. Rapport en Markdown-export tonen zowel het actuele plan als de afzonderlijke bevroren dossierkeuze. Hierdoor blijft zichtbaar welke selectie en scopenotities voor een beoordeling zijn gebruikt.

## SQLite-overdracht

De migratie leest uitsluitend een gecontroleerde kopie. `GeselecteerdeModules` wordt geprojecteerd als projectplan. `DepartmentModules` wordt geprojecteerd als een afzonderlijk plan voor de werkelijke `DepartmentId`/`CompanyId`-relatie. `ScopeNotes` en `SortOrder` blijven behouden, inclusief lege teksten en nulwaarden. De moduledefinities bewaren hun eigen identiteit, code, titel en definitievolgorde. Vraagvolgorde volgt de oorspronkelijke vraagvolgorde, nummer en stabiele ID.

De oorspronkelijke repository ordent projectmodules op categorie, definitievolgorde en code. Voor afdelingsplannen bewaart de nieuwe browser bovendien de werkelijk opgeslagen toewijzingsvolgorde; categorie, definitievolgorde en code dienen bij gelijke volgorde als stabiele sortering. Een nieuwe exportwaarschuwing maakt duidelijk dat de huidige definitie bij export is bevroren.

Onbeantwoorde vragen uit een geselecteerde afdelingsmodule blijven in het conceptdossier van die afdeling beschikbaar, ook als die afdeling geen enkele antwoordrij heeft. Ze worden niet aan het projectdossier toegevoegd alleen omdat een afdeling of rondgang de module heeft geselecteerd. Oorspronkelijke antwoordvragen blijven bij hun echte antwoordscope bewaard, ook als de huidige modulekeuze later is veranderd.

Een huidige databasekeuze bewijst geen oude modulekeuze op de historische antwoorddatum. Daarom krijgen gemigreerde dossiers geen verzonnen historische `modulePlanSnapshot`: de actuele plannen en bij export bevroren vragen zijn aparte gegevens met een controlewaarschuwing. De originele records blijven volledig raw beschikbaar. Ontbrekende moduledefinities, dubbele strijdige toewijzingen en onbekende afdelingsscope worden niet gegokt of projectbreed gemaakt.

## Verificatie

De betekenisvolle controles dekken scopeconflicten, ongeldige geïmporteerde structuren en onbekende velden, geselecteerde versus uitgeschakelde definities, vraagvolgorde, overlapping, bronrelaties, digestcontrole en het behoud van bestaande dossiers na een planwijziging. De SQLite-fixture bevat een geselecteerde afdeling zonder antwoorden, twee verschillende ordervelden en een scopenotitie die niet naar de projectscope mag lekken. De browserworkflow maakt een afdelingsplan en dossier, wijzigt het plan, herlaadt en controleert beide versies in het rapport en de daadwerkelijke Markdown-download.
