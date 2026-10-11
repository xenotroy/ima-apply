# Herbruikbare risicobibliotheek en lokale screenings

De browser bewaart nu de oorspronkelijke bibliotheekfunctie: gevaar → risico → risicofactor, factorgebonden beoordelingsvragen en gedeelde maatregelen. De grafiek en boom zijn een inhoudsbibliotheek. Een concreet Kinney-/LOPA-scenario en zijn bewijs blijven een afzonderlijke beoordeling.

## Inhoud en identiteit

`WorkspaceState.riskLibraries` is een optionele collectie binnen schemaVersion 1. Elke definitieversie heeft een unieke record-ID, een blijvende bibliotheekidentiteit, een semantische versie, optioneel de exacte voorganger-ID, bron-ID's, eventuele oorspronkelijke bestandshash en de canonieke inhoudshash. De arrayvolgorde en de oorspronkelijke `sortOrder`-velden blijven beide behouden. Objectveldvolgorde verandert de hash niet; toevoegen, verwijderen of wijzigen van betekenisvolle inhoud wel.

Een bibliotheek bevat afzonderlijke module-, gevaar-, risico-, factor-, maatregel-, factor–maatregelkoppeling- en vraagrecords. Relaties gebruiken expliciete identiteiten. Twee factoren kunnen naar dezelfde maatregeldefinitie verwijzen. Reductierating, kostencategorie en volgorde horen bij de afzonderlijke koppeling. De gedeelde titel, omschrijving en het oorspronkelijke type horen bij de maatregeldefinitie. Vragen bewaren vraagtekst en toelichting afzonderlijk; factoren bewaren de oorspronkelijke LOD-beschrijving en standaardrating. Codes, omschrijvingen, bronrecords en ontbrekende moduleherkomst blijven zichtbaar.

Nieuwe bibliotheekversies worden toegevoegd. De bestaande inhoud wordt niet overschreven of verwijderd, ook als een gewijzigde versie een opnieuw berekende hash heeft. Een opvolger moet bij dezelfde bibliotheekidentiteit horen en een hogere versie hebben. Eerdere versies blijven beschikbaar voor reviews en layouts. De hash controleert inhoudsintegriteit binnen de werkruimte; zij is geen externe ondertekening of bewijs dat de bron feitelijk juist was.

## Exacte lokale scope en provenance

`riskLibraryReviews` bewaart append-only factor- en factor–maatregelreviews. Een review verwijst naar de exacte bibliotheekversie-ID én inhoudshash, de factor of koppeling, haar expliciete scope, ratings en toelichting. Een eigen nieuwe review vraagt een dossier, beoordelaar, tijdstip met tijdzone en inhoudelijke grond. Een gekozen afdeling moet bij de organisatie en het dossier horen. Een eigen beoordeling voor afdeling A overschrijft geen gegevens van afdeling B of een dossierbrede beoordeling.

Een vervolgreview kan alleen de review van dezelfde versie, node en exacte scope opvolgen. De eerdere review blijft bewaard. De expliciete opvolgketen bepaalt de actuele review en positie; het herschikken van arrays verandert die niet. Meerdere onverbonden of vertakte actuele histories binnen dezelfde scope en node worden geweigerd. Een latere bibliotheekversie ontvangt niet automatisch de oude lokale review. Bron-ID's moeten daadwerkelijk aanwezig zijn in dezelfde werkruimte.

Oorspronkelijke SQLite-reviews behouden hun aantoonbare project-/organisatie-/afdelingsscope. Bij een ontbrekende oorspronkelijke auteur komt geen migratieauteur te staan. `legacyUpdatedAt` bewaart de exacte oude tijdwaarde, inclusief lege tekst of een onopgeloste tijdzone. `reviewedAt` blijft dan afwezig. De UI toont deze oorspronkelijke scope ter inzage; nieuwe eigen beoordelingen worden via een bewust gekozen dossier vastgelegd.

## Betekenis van ratings en rangschikking

De oorspronkelijke ratings hebben een lokale ordinale schaal 1–3. De factorprioriteit is de oorspronkelijke effectrating × blootstellingsrating × waarschijnlijkheidsrating, met labels laag tot en met 4, midden 5–9, hoog 10–17 en zeer hoog 18–27. Zonder lokale review worden alleen de oorspronkelijke defaults getoond, duidelijk als onbeoordeeld en met onbekende relevantie. Dit is geen Fine–Kinney–Wiruth-score of gemeten ongevalskans.

De oorspronkelijke maatregelrangschikking blijft reproduceerbaar: factorprioriteit × reductierating × typegewicht × kostenmodifier × afnemende-opbrengstgewicht. Typegewicht is technisch/collectief 1, organisatorisch 0,5 en PBM 0,4. Kostenmodifier is laag 1,5, midden 1 en hoog 0,5. Organisatorische maatregelen krijgen in hun oorspronkelijke koppelvolgorde de gewichten 1, 0,6, 0,35 en vanaf de vierde 0,2. De UI toont deze afzonderlijke gewichten. Zij zijn lokale prioritering, geen fysisch model van risicoreductie.

Een reductierating wordt geen percentage of PFD. Een technisch type wordt geen automatische AHS-bronmaatregel. `isInPlace` is een lokale melding van aanwezigheid, geen verificatie van effectiviteit. Een hoge rangscore verandert geen Kinney-score, LOPA-frequentie of bewijsstatus. De nieuwe AHS-/haalbaarheid-/justificatieberekeningen van de risicowerkbank blijven hun eigen expliciete methode volgen.

## Browserworkflow en kaartposities

Via **Organisatie & dossiers → Risicobibliotheek** kiest de gebruiker een inhoudsversie, dossier of oorspronkelijke scope, en eventueel een module. De SVG-grafiek en boom tonen de relaties. Een factor toont omschrijving, LOD, beoordelingsvragen, toelichting en gekoppelde maatregelen. Een maatregel toont terugverwijzingen naar alle factoren die dezelfde definitie gebruiken. Native reviews zijn afzonderlijke vastleggingen per factor of koppeling.

`riskLibraryLayouts` bewaart getypeerde nodes `hazard`, `risk`, `factor` en `control_link`, eindige niet-negatieve coördinaten, exacte versie/hash en scope. De oorspronkelijke desktopnode `Maatregel` verwees naar de koppel-ID; deze wordt behouden als `control_link`, niet omgezet naar de gedeelde maatregel-ID. Een nieuwe positie wordt toegevoegd en kan een eerdere positie van precies dezelfde node en scope opvolgen. Andere scopes en bibliotheekversies veranderen niet.

De actie **Nieuw Kinney-scenario vanuit factor** vraagt een specifieke consequentie, verse menselijke W/B/E-keuzes uit de expliciete Kinney-schaal en de beoordelingsgrond. De drie selecties starten leeg. Het nieuwe scenario bevat de bibliotheek-/factorverwijzing en hash in zijn beschrijving, aantoonbare bronnen en de gekozen dossierscope. Het start met nul maatregelen. Oude ratings, aanwezigheid en reductie-/kostenrangschikking worden niet overgenomen als werking, bewijs of PFD. Een eventuele LOPA wordt daarna als afzonderlijk scenario met haar eigen initiërende gebeurtenis, frequentie, eindpunt en onderbouwde lagen uitgewerkt.

Import-, review-, scenario- en positieformulieren bewaren tekstwijzigingen als lokale concepten. Een herladen of gesloten formulier kan de invoer herstellen als de bronversie nog overeenkomt. Vastleggen wist het concept pas nadat de werkruimteopslag geslaagd is. Deze lokale concepten zijn nog geen vastgestelde reviews en synchroniseren niet vanzelf naar een andere pc.

## SQLite-projectie

`projectLegacyRiskLibrary(tables, options)` is een standalone projectiehelper. De aanroeper bewaart alle oorspronkelijke rijen eerst raw en levert vervolgens stabiele tabel-/primaire-sleutelidentiteiten, bron-ID's, de oorspronkelijke databasehash en een resolver voor uitsluitend aantoonbare scopes. De helper muteert geen bronrijen. Zij leest oorspronkelijke enumwaarden en 1–3-ratings exact; een onbekende waarde wordt niet geclamped of betekenisvol gemaakt.

Ontbrekende of ambigue scopes, onbekende node-typen, kapotte FK's, dubbele koppelingen en ongeldige ratings/coördinaten blijven raw met een gerichte waarschuwing. Bij meerdere oorspronkelijke review-/positierijen voor dezelfde exacte scope en node blijven alle betreffende rijen raw: er wordt geen willekeurige actuele versie gekozen. De helper koppelt nooit op een titel. Oorspronkelijke maatregelreviews krijgen geen verzonnen beoordelaar of migratietijd. Een als oorspronkelijk gemarkeerde bibliotheek vraagt de databasehash en de eigen bronrij van iedere node. De helper retourneert `{ library?, reviews, layouts }`; zonder herkenbare graph ontstaat geen lege nep-bibliotheek.

## Verificatie

De unittests controleren gedeelde maatregelen met verschillende factorratings, twee onafhankelijke afdelingsscopes, native versus onbekende historische provenance, hash- en volgorde-integriteit, behoud van eerdere versies, append-only updates, ontbrekende relaties en onbekende velden, oorspronkelijke rangschikkingsgewichten, verse Kinney-keuzes zonder control-/PFD-credit, volledige JSON-overdracht en concrete SQLite-FK-/layoutprojectie met raw-waarschuwingen.

De browserworkflow controleert grafiek/boom, beoordelingsvraagtoelichting, module- en scopekeuze, herstel van een nog niet vastgelegd formulierconcept na reload, twee verschillende lokale reviews, een afzonderlijke aanwezigheidsmelding, bewaarde kaartpositie, het nieuwe scenario met lege maatregelset, herladen, JSON-overdracht en de daadwerkelijk gedownloade Markdown-inhoud.
