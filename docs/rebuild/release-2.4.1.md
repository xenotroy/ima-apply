# IMA Apply 2.4.1 — zichtbare modulekeuze

De modulekeuze is nu een eigen ingang in het hoofdmenu en op de startpagina. Een uitklapbare boom en klikbare mindmap tonen de werkelijk beschikbare thema’s, modules en vragen. De gebruiker kan hele modules kiezen, afzonderlijke vragen opnemen of uitsluiten en zoeken in de beschikbare inhoud.

Twaalf herkenbare gevaarprofielen geven uitlegbare voorstellen. Alleen **Aanbevolen modules toevoegen** past de selectie aan; bestaande individuele uitsluitingen blijven behouden. Een voorstel is geen oordeel over lokale toepasselijkheid, aanwezigheid of risiconiveau. Publieke catalogusthema’s en werkelijk geladen oorspronkelijke modules behouden hun eigen herkomst.

De verkenner en het vastleggingsformulier delen hetzelfde herstelbare concept. Na opslaan komt de juiste plankaart in beeld; vanuit de kaart maakt de gebruiker een dossier met de exacte bevroren selectie en kan het interview direct openen. Een later gewijzigd plan verandert dit bestaande dossier niet. Markdown neemt onafgemaakte concepten mee, terwijl JSON de vastgelegde werkruimte bewaart. Zie de [startinstructie](module-selection.md).

Het optionele `excludedQuestionIds` bewaart individuele vraagkeuzes zonder oorspronkelijke modulelidmaatschappen te overschrijven. Oude plannen en hashes blijven identiek wanneer dit veld ontbreekt. De appversie is `2.4.1`; contentversie `2.4.0`, werkruimteschema 1 en risicomethode `ima-risk/2.1.0` blijven behouden.

## Verificatie

386 unittests en 73 import-/migratietests slagen. De volledige lokale Chrome-controle slaagt met 78 proeven, nul herpogingen en één overgeslagen proef waarvoor de private PI-vragenbank nodig is. De drie nieuwe browsergevallen controleren de directe ingang, echte vraagtekst, boom/mindmap, expliciet gevaaradvies, exacte individuele selectie, dossierfreeze, herladen, Markdown en JSON-overdracht naar een afzonderlijke browsercontext. TypeScript, Pages-productiebuild en dependency-audit slagen; de audit meldt nul kwetsbaarheden. Desktop en mobiel zijn visueel gecontroleerd, inclusief de leesbaarheid van vraagdetails en bediening zonder animaties bij verminderde beweging.

De volledige herbouw en resterende primaire bronintegratie blijven [actief](goal.md). Deze versie levert de gevraagde bruikbare keuze-ingang; zij sluit de afzonderlijke bron- en migratiebewijstaken niet af.
