# IMA Apply 2.3.0 — interviewherstel, bronvragen en PI-router

Versie 2.3 bewaart interviewinvoer vóór de gewone opslag, herstelt onafgemaakte formulieren en breidt het bron- en dossiermodel uit met beheerde vraagpakketten, response-relaties, een herbruikbare risicobibliotheek en een PI-router. Het additieve dataschema blijft versie 1; de rekenmethode blijft `ima-risk/2.0.0`.

## Resultaat

- Een gevalideerd schrijfjournaal bewaart de laatste interviewinvoer bij onderbroken normale opslag. Beschermde formulierconcepten krijgen een eigen slot per tabblad, expliciete herstelkeuze bij meerdere versies en bescherming tegen veranderde brongegevens of reeds vastgelegde record-ID's. Ook door validatie geweigerde antwoordtekst blijft behouden. Concepten zijn via Markdown terug te vinden; volledige tussentijdse werkruimten blijven als JSON exporteerbaar. De handleiding noemt expliciet welke administratieve formulieren nog geen herstelconcept hebben.
- Vraagdefinities bewaren afzonderlijke inhoudsvelden, semantische versies, status, voorganger en bronrelaties. Een dossier bevriest alle definities van zijn beheerde pakketversie. Alleen geselecteerde actieve vragen komen in het onderzoek; mixed versies en late pakketwijzigingen worden geblokkeerd.
- Responses bewaren actor en meerdere waarneming-/bewijs-/bevindingrelaties, inclusief gecontroleerde inverse links. Antwoordwijzigingen behouden de response-ID. Historisch onbekende auteurs worden niet ingevuld.
- De bibliotheek bewaart geversioneerde gevaar/risico/factor-structuur, gedeelde maatregelen, vragen, scoped reviews en kaartposities. Oude ordinale ratings leveren geen automatisch effectpercentage, AHS-credit of PFD.
- De PI-router gebruikt organisatieprofiel, risico's, verplichtingen en incidenten als zelfstandige ingangen. Toepasselijkheid, onderzoeksprioriteit en risicoscore blijven gescheiden. Centrale, afdelings- en lokale onderzoekslagen krijgen eigen bronvraagkoppelingen; uitsluiting vraagt expliciete onderbouwing.
- De private PI-bronwerkruimte bewaart 1.300 oorspronkelijke vraagvoorkomens plus 12 afzonderlijke eigen onderzoeksvragen, met echte vraagcodes, herkomst, kandidaatmapping en expliciete hiaten. Dubbele zichtbare codes blijven onderscheiden; geen lokale omstandigheden of scores worden verzonnen.
- Een expliciete nieuwe projectexport bewaart alle geselecteerde bronvragen, de bevroren set, bronbindings en de bankhash. De volledige bronbank en bestaande dossiers blijven behouden. Dit schept interviewruimte binnen dezelfde grens van 2.000.000 bytes; een export zonder antwoorden is geen bewijs dat een volle bank én alle interviews in één bestand passen.

## Afzonderlijke private migratie

De nieuwe parity-exports bewaren alle 248 raw bronrecords naast 110 vragen, vijf moduleplannen/dossiers, de oorspronkelijke scoped graph, twee reviews en 38 layouts:

- `workspaces/legacy-riebuilder-parity-2.3-strict.json`: 1.152.872 UTF-8 bytes, nul typed antwoorden, 42 waarschuwingen.
- `workspaces/legacy-riebuilder-parity-2.3-utc-review.json`: 1.169.233 bytes, dertien typed antwoorden, 68 waarschuwingen, inclusief expliciet onbekende historische auteurs.

Beide zijn create-only opgeslagen en tweemaal volledig teruggelezen via hun onveranderlijke GitHub-blob. Oudere exports blijven behouden. De bronkopie heeft dezelfde hash voor en na verwerking; de originele database is niet geopend voor migratie. `legacy-import/1.0.0` is bij onbekende oude vraagversies een migratie-/projectielabel, geen bewezen historische bronversie.

## Verificatie

287 unittests, 45 import-/migratietests en alle 42 lokale Chrome-browserproeven slagen. TypeScript en de productiebuild met Pages-basispad slagen; de dependency-audit vindt nul kwetsbaarheden. De publieke CI beschikt bewust niet over de private PI-bank en slaat uitsluitend die afzonderlijke private bronproef over. Herstelproeven omvatten werkelijke dubbele tabbladen, onderbroken opslag, Unicode-tekst, LOPA-onderbouwing, verborgen onderzoeksvelden, modulekeuze, antwoord-ID's, inverse relaties, herladen en echte exports.

De PI-bank is afzonderlijk create-only in de private repository opgeslagen en tweemaal volledig teruggelezen. De echte browserproef gebruikt 1.312 vraagvoorkomens, selecteert en bevriest 243 vragen, exporteert een afzonderlijk project, importeert het opnieuw en controleert een antwoord na herladen en in Markdown. Een aanvullende capaciteitproef vult alle 243 vragen met 300 tekens bewijs en 300 tekens notitie, actor, bron-/vraaghash en tijd, plus een gekoppelde waarneming en bevinding: de afzonderlijke projectwerkruimte gebruikt 1.071.592 bytes. Dezelfde interviewgegevens met de volledige bank gebruiken 2.223.547 bytes en worden correct geweigerd.

De volledige herbouw blijft actief. De bronmomentopname en kandidaten ondersteunen onderzoek; lokale maatregelenwerking, volledige actuele Porterinhoud, ontbrekende opleidings-/AI-/LMS-bronnen en inhoudelijk goedgekeurde productieoverdracht blijven afzonderlijk te bewijzen. Zie [goal](goal.md), [PI-router](pi-risk-library-router.md) en [interviewopslag](interview-saving.md).
