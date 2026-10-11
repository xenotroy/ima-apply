# Respondenten en response-relaties

Een response bewaart het concrete antwoord op één vraag binnen één dossier. De browser voegt de optionele velden `respondedBy`, `observationIds` en `findingIds` toe aan `WorkspaceAnswer`; waarnemingen en bevindingen krijgen optionele `responseIds`. Meerdere responses kunnen dezelfde waarneming of bevinding onderbouwen. `Finding.questionId` blijft de afzonderlijke primaire vraagcontext en wordt niet vervangen door de many-to-many relatie.

De oorspronkelijke `RieQuestionResponseDraft/Record`, `RieObservationDraft/Record` en `RieFindingDraft/V2Record` in `src/RieBuilder.Ima/Models/RieModels.cs` bewaren deze auteur en meervoudige relaties. `ImaWorkspace.Rie.cs` verlangt een respondent, weigert een tweede response voor dezelfde assessmentvraag en controleert dat gekoppelde doelen binnen hetzelfde assessment vallen. Deze browseruitwerking vertaalt assessment naar dossier en houdt de bestaande bevroren vraag/hash/versiecontrole intact.

## Vastleggen en wijzigen

`upsertResponse(workspace, draft)` ontvangt het volledige antwoord, de expliciet ingevulde huidige respondent en optioneel de gewenste waarneming-, bevinding- en bewijs-ID's. De helper:

- weigert lege auteurs, dubbele responseparen, dubbele/missende verwijzingen en bekende dossierscopeconflicten;
- behoudt de bestaande response-ID bij een nieuwe keuze, tekstwijziging of wijziging van relaties;
- behoudt alle niet expliciet vervangen relaties;
- werkt beide richtingen van waarneming- en bevindingrelaties in één werkruimtepatch bij;
- bewaart de actuele menselijke actor en wijzigingstijd, zonder identiteit uit assessor, waarnemer of GitHub-account af te leiden;
- verandert andere responses en andere dossiers niet.

Een nieuwe expliciete bewijskeuze vereist exact dezelfde dossier-ID. In oudere exports toegestaan ongescopeerd bewijs blijft met onbekende scope bestaan wanneer een gebruiker alleen het antwoord of andere relaties wijzigt. Het wordt daarmee geen aangetoond dossiergebonden bewijs. Bewijs heeft geen nieuw afgeleid inverse responseveld.

`assertResponseRelations(workspace)` controleert daarnaast wederzijdse consistentie. Een expliciete link naar een waarneming/bevinding moet terugverwijzen naar dezelfde bestaande response. Een terugverwijzing moet dezelfde dossier-ID hebben en ook aan de antwoordzijde bestaan. De normale werkruimtevalidator blijft verantwoordelijk voor de overige recordvelden en de bevroren vraaginhoud.

## Historische onzekerheid

Ontbrekende auteur- en relatievelden in oude exports blijven afwezig. Het rapport vermeldt dan **Historisch niet vastgelegd**; een expliciete lege lijst wordt weergegeven als **Geen gekoppeld**. Laden, exporteren en rapporteren vullen geen historische actor in. Een daadwerkelijke menselijke wijziging legt de ingevulde actor en het actuele wijzigingstijdstip vast.

Historische ongescopeerde antwoorden blijven bruikbaar. Ze kunnen geen dossiergebonden waarneming of bevinding krijgen. Een andere dossierscope of ambigu responsepaar wordt geweigerd in plaats van opgelost met een willekeurige match.

## Interface en rapport

`ResponseRelationsPanel` toont de vastgelegde respondent, tijd en aantallen relaties. Zonder bestaand antwoord kan de gebruiker nog geen response-relaties opslaan. Het formulier selecteert uitsluitend bestaande waarnemingen en bevindingen in hetzelfde dossier. De bestaande bewijsinterface blijft het invoerpunt voor bewijslinks.

Relatiekeuzes worden als lokaal concept hersteld met `usePersistentDraft`, onder de exacte werkruimte/dossier/vraag-identiteit en een vingerafdruk van het oorspronkelijke antwoord. Een tussentijds gewijzigd antwoord blokkeert het vastleggen van het oude formulier. Een concept wordt alleen gewist na bevestigde werkruimteopslag; sluiten of een opslagfout bewaart de keuzes. Lokale concepten synchroniseren niet automatisch naar een andere computer.

`responseRelationsMarkdown(workspace, dossierId?)` projecteert auteur, tijd, response/vraag/dossier-ID en meerdere gekoppelde doelen in het rapport. Free text wordt ge-escaped; rapportage verandert geen gegevens.

## Verificatie

De regressies testen meervoudige relaties en inverse richting, behoud van ID en links na inhoudswijziging, meerdere responses bij dezelfde bevinding, selectief ontkoppelen zonder verlies van andere responses, historische onbekende auteurs, ongescopeerde legacydata, afwijzing van ontbrekende/duplicaat/cross-dossier/tegenstrijdige links, JSON export/import en rapportprojectie. De browserintegratie voegt een volledige reload/exportproef toe.

Migratie koppelt alleen aantoonbaar bestaande doelen in twee passen. Een oorspronkelijke onbekende of ambigue relatie blijft raw met waarschuwing; deze helper maakt geen historische relaties of auteurs aan.
