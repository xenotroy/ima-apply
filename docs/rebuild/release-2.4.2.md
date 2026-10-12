# IMA Apply 2.4.2 — RIEporter-bronstructuur en afdelingskeuze

**RIEporter & afdelingen** is een eigen hoofdmenu-ingang en directe `#rieporter`-route. De keuzehulp leest de daadwerkelijk geopende private bronbank en toont procesblokken, aspecten, vraagcodes, afzonderlijke occurrence-identiteiten en vindplaatsen. De gecontroleerde OE-14-momentopname bevat 46 processen, 189 aspecten en 1.300 bronvragen. Dit bewijst die bronmomentopname, geen actuele complete commerciële RIEporter-bibliotheek of technische module-GUIDs.

Het werkprofiel, risico’s en de centrale/afdelings/lokale onderzoekslaag gebruiken de bestaande PI-routerregels voor een expliciet kandidaatvoorstel. Toevoegen bewaart handmatige vraaguitsluitingen. De afdelingsboom volgt werkelijke organisatie-/afdelingsrelaties en opgeslagen plannen. Gebruikers kunnen afdelingen toevoegen, afzonderlijke keuzes vastleggen en bestaande RIEporter-plannen met andere bronprocessen uitbreiden. Projectbrede plannen blijven afzonderlijk. Oude dossierfreezes en antwoorden veranderen niet door planbewerking.

De afzonderlijke projectexport behoudt alle oorspronkelijke vraagleden van gekozen processen als definities en bevriest de effectieve selectie. De oorspronkelijke bankhash en verklaarde omvang blijven aanwezig; de projectbank heet expliciet `scoped_selection`. Het nieuwe project begint zonder eerdere interviews, acties of bewijs uit de bronwerkruimte; die blijven in hun bestaande werkruimte. Uitvoer gebruikt de echte native validator en 2MB-grens. Ontbrekende bronleden en beheerde pakketmetadata blokkeren een onveilige scoped kopie. Er worden geen geselecteerde vragen afgekapt.

## Verificatie

397 unittests, 73 import-/migratietests en de volledige lokale Chrome-controle slagen. Die Chrome-run omvat 81 geslaagde proeven zonder retries en één overgeslagen oude private-bankproef. De nieuwe private bronproef is lokaal uitgevoerd met de daadwerkelijke 1.300-vragenbank. Publieke CI heeft beide private bronbestanden niet en slaat de twee afzonderlijke private-bankproeven over. TypeScript, Pages-build en dependency-audit slagen; nul kwetsbaarheden.

De nieuwe browsergevallen toetsen een echte fictieve JSON-import met twee afdelingen, dubbele zichtbare codes, profieladvies, individuele selectie, uitbreiden van een bestaand procesplan, ongewijzigde andere afdeling en dossierfreeze, herladen, Markdown, JSON-overdracht naar een afzonderlijke browsercontext en de echte afdelingformulieren. De read-only broncontrole bewijst 46/189/1.300 met behoud van oorspronkelijke bankbytes. Een afzonderlijke native proef behoudt veertien brondefinities en bevriest dertien gekozen vragen in een export van 33.010 bytes. Die proef gebruikt fictieve organisatie-/afdelingsgegevens en is geen feitelijke PI Vught-beoordeling.

Een onafhankelijke review vond dat een opgeslagen RIEporter-plan aanvankelijk algemene moduleopties kreeg bij bewerken. Dit is hersteld: bronprocesopties en availability-checks worden nu ook in het editpad gebruikt. De browserregressie voegt daadwerkelijk een tweede proces toe en bewaart de eerdere dossierfreeze en andere afdelingskeuze.

De appversie is `2.4.2`; contentversie `2.4.0`, schema 1 en bestaande risicomethode blijven behouden. Zie [starten met RIEporter](rieporter-module-choice.md). De resterende volledige herbouw en primaire bronintegratie zijn afzonderlijke vervolgtaken.

## Argumentatie en keuzes

De RIEporter-pagina heeft een afzonderlijke tab **Argumentatie & keuzes**, filterbaar per afdeling. Per opgeslagen plan toont deze selectie en motivering, bronverwijzingen, voorwaarden voor aanvullende modules en nog niet beoordeelde procesblokken. Afgebakende bronbanken worden als zodanig aangeduid. Werkgebieden zonder eigen plan krijgen geen stilzwijgende bovenliggende selectie. Als een voorbereidingsrecord van schema `ima.department-module-decisions/v1` een eerdere planhash bevat, waarschuwt de tab na wijziging van de selectie. De browserproef controleert geselecteerd, voorwaardelijk, onbekend, een andere afdeling zonder plan en een gewijzigde planrevisie.

Private PI Vught-voorbereiding wordt afzonderlijk aangeleverd en bevat geen openbare klantdata in deze repository. Bestaande dossierfreezes blijven behouden.
