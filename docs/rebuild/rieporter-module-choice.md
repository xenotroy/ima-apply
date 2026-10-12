# RIEporter-bronvragen en afdelingskeuze

De ingang **RIEporter & afdelingen** toont de proces- en aspectstructuur van daadwerkelijk geïmporteerde bronbindings. De directe route is [RIEporter-keuze](https://xenotroy.github.io/ima-apply/#rieporter). De algemene modulekeuze blijft afzonderlijk beschikbaar.

## Welke bank is beschikbaar?

De bewaarde private OE-14-momentopname van 7 september 2026 bevat 1.300 vraagvoorkomens in 46 bronprocessen en 189 aspecten. Twaalf aanvullende eigen onderzoeksvragen staan afzonderlijk in de bronwerkruimte. De occurrence-identiteiten behouden ook twee dubbel voorkomende zichtbare vraagcodes. Deze telling is gecontroleerd tegen de afzonderlijke occurrence-inventaris en de aanwezige vraagdefinities.

Dit bewijst de volledige bewaarde OE-14-momentopname. De huidige commerciële RIEporter-bibliotheek en oorspronkelijke technische module-GUIDs zijn niet aangetoond. De boom gebruikt daarom herleidbare, afgeleide procesgroeperingen met de werkelijke bronlabels en vraagidentiteiten. Een gekoppeld thema uit een andere vragenbank of oorspronkelijke IMA-database wordt geen RIEporter-module.

De 1.300 arbeidsrisicokoppelingen zijn kandidaatmapping; nul zijn in deze momentopname als gecontroleerd vastgelegd. Achtentwintig bronvragen hebben geen arbeidsrisicomapping. Zij blijven beschikbaar voor bewuste handmatige selectie. Een advies bewijst geen actuele afdelingstoepassing of maatregelwerking.

## Bronbank openen

Gebruik de bestaande private bronwerkruimte `workspaces/pi-bronwerkruimte-2026-10-11.json` via **Werkruimte & synchronisatie**, of het afzonderlijke private contentpakket via JSON-contentimport. Bewaar vóór het openen van een andere volledige werkruimte je huidige export. De bank is geen vooraf ingevuld PI Vught-klantdossier: organisaties, afdelingen, interviews en vastgestelde moduletoewijzingen ontbreken in deze bronkopie.

Private vraagtekst, proceslabels en afdelingsgegevens worden uit de geopende werkruimte gelezen. De publieke software bevat de selectiebediening en eigen onderzoeksregels. Een lege bank geeft een zichtbare vervolgstap; ontbrekende definities of bronrecords worden niet stil aangevuld.

## Afdeling en modulekeuze

1. Leg de echte organisatie en afdelingen vast, of neem ze over uit een gecontroleerde bestaande dossierexport.
2. Open de RIEporter-ingang en kies de bedoelde afdelingsscope. De boom volgt de werkelijke organisatie-/locatie-/afdelingsrelaties.
3. Gebruik het werkprofiel en de centrale, afdelings- of lokale onderzoekslaag voor een expliciet kandidaatvoorstel. Bekijk bronproces, aspecten, vraagcodes en vindplaatsen. Pas de selectie zelf aan.
4. Bewaar het moduleplan. Een afdelingsplan hoort bij exact één geregistreerde afdeling. Projectbrede plannen blijven een afzonderlijke tak.
5. Maak een dossier met de exacte bevroren vragen, of exporteer bij omvangrijke bronbanken een afzonderlijke projectwerkruimte. Controleer de importpreview voordat je die opent.
6. Gebruik **Aanpassen** bij een plan om actuele modulekeuzes te wijzigen. Een eerder dossier behoudt zijn oorspronkelijke bevroren selectie en antwoorden; de interviewknop opent dat dossier.

Een afdelingsnaam of A/B-pakketvoorstel levert geen vastgestelde moduletoewijzing. Unit 9 en Unit 10 worden niet door naamgelijkenis samengevoegd. Herstelconcepten, Markdown en JSON behouden hun eigen rol zoals beschreven bij [modulekeuze](module-selection.md) en [interviewopslag](interview-saving.md).

## Omvang en bronbehoud

De volledige bronwerkruimte is 1.493.391 bytes. De app valideert de volledige werkruimte tegen 2.000.000 UTF-8 bytes. Een extra dossierfreeze en meerdere volledige interviews kunnen die grens overschrijden. De afzonderlijke projectroute behoudt alle daadwerkelijk geselecteerde vragen en de oorspronkelijke bankhash/declaratie, terwijl de volledige bronbank apart beschikbaar blijft. Er wordt geen geselecteerde vraag afgekapt om een export passend te maken. Een afgebakende bankselectie wordt zichtbaar als `scoped_selection`, met de oorspronkelijke gedeclareerde omvang afzonderlijk van de werkelijk beschikbare bindings.

Zie [PI-router](pi-risk-library-router.md), [moduleplan](module-plan.md) en [meerdere pc’s](multi-device.md) voor de bestaande scope-, snapshot- en synchronisatieregels.
