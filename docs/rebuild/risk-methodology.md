# IMA Apply 2 — risicobeoordeling en justificatie

Versie: `ima-risk/2.0.0`; bronnen gecontroleerd op 7 oktober 2026. Implementatie: `web/src/domain/risk.ts`, datamodel: `web/src/domain/types.ts`, verificatie: `web/src/domain/risk.test.ts`.

**Een hoge AHS-positie, een eenvoudig uitvoerbare ingreep of een hoge justificatiescore bewijst geen fysieke risicoreductie.** IMA berekent daarom drie verschillende uitkomsten: een relatieve Kinney-score, een jaarlijkse LOPA-scenariofrequentie en een afzonderlijke uitvoeringsprioriteit. Geen van deze uitkomsten is automatisch een oordeel over wettelijke toelaatbaarheid.

## 1. Bronnen en keuze van de methode

Kinney en Wiruth beschrijven in juni 1976 een relatief risicogetal als het product van likelihood, blootstelling en gevolg. Hun likelihoodgetallen zijn bewust gekozen scores, geen gemeten kansen. De schalen en publicatie zijn gecontroleerd in [*Practical Risk Analysis for Safety Management*, NWC TP 5865, pp. 7–10 en 12–13](https://upload.wikimedia.org/wikipedia/commons/7/70/Practical_Risk_Analysis_for_Safety_Management_%28IA_practicalriskana79kinn%29.pdf). Fine's eerdere aanpak en zijn afzonderlijke kostenjustificatie staan in [*Mathematical Evaluations for Controlling Hazards*, William T. Fine, 1971, Journal of Safety Research 3(4), pp. 157–166](https://safetydojo.org/files/Mathematical-Evaluation-for-Controlling-Hazards-Fine-1971.pdf). De tweede URL is een kopie van het oorspronkelijke artikel, geen nieuwe interpretatie.

Deze rebuild kiest de **Kinney/Wiruth-schalen van 1976**. De oorspronkelijke Fine-gevolgschaal verschilt daarvan. Meng daarom geen Fine-factor 25/50 met Kinney-factor 15/40 onder één ongewijzigde methodenaam. Schaalwijzigingen moeten een eigen methodeversie en motivering krijgen.

| Onderdeel | Ondersteuning in de huidige software | Betekenis |
| --- | --- | --- |
| Kinney/Wiruth | Rekenengine, intervallen en visualisatie | Relatieve screening van afgebakende arbeidsveiligheidsscenario's |
| LOPA | Rekenengine, gekwalificeerde IPLs en jaarlijkse frequentie | Eén oorzaak met één gespecificeerd gevolg; gekwantificeerde barrièrewerking |
| AHS en lokale justificatie | Afzonderlijke prioritering | Vergelijken van maatregelen; geen extra fysieke reductie |
| Fine- en Kinney-justificatie | Afzonderlijke pure functies | Historische formules met expliciete invoerfactoren |
| Matrix, BowTie, FMEA, HAZOP, fouten- en gebeurtenissenbomen | Onderzocht; geen complete rekenengine in deze versie | Methoden voor andere analysetaken, zie paragraaf 7 |

## 2. Het uitgangsscenario vastleggen

Leg eerst vast: activiteit, locatie, blootgestelde groep, gevaar, ongewenste gebeurtenis, oorzaak en concreet letsel/gevolg. Voeg bronverwijzingen en aannames toe. Een algemene categorie zoals “machineveiligheid” is onvoldoende voor een uitspraak over barrières. Een ingreep kan het ene scenario wegnemen en tegelijkertijd een ander introduceren.

De waarden `probability`, `exposure` en `effect` beschrijven het **uitgangsscenario zonder de maatregelen die vervolgens apart worden ingevoerd**. De engine berekent bestaande maatregelen daarna één keer. Als iemand reeds beheerst beoordeelde W/B/E-waarden invoert én de bestaande maatregelen opnieuw aftrekt, ontstaat dubbeltelling. Gebruik voor een beoordeling van een rechtstreeks ingeschatte huidige situatie daarom alleen de factoren of reconstrueer en motiveer het onbeheerst uitgangsscenario.

De tabelkeuze in de interface ondersteunt consistente beoordelingen. De beoordelaar blijft verantwoordelijk voor de koppeling tussen scenario en schaal. Een lesnotitie of generiek AI-blad kan een gevaar signaleren of een inspectievraag ondersteunen; het bewijst de werking van een lokale maatregel niet.

## 3. Kinney-score en effectiviteit

`R = W × B × E`. Referentiewaarden zijn W: `0.1, 0.2, 0.5, 1, 3, 6, 10`; B: `0.5, 1, 2, 3, 6, 10`; E: `1, 3, 7, 15, 40, 100`. De gevolglabels lopen van eerstehulp-letsel tot een catastrofe met veel doden. Dit volgt de bovengenoemde Kinney/Wiruth-publicatie; de software gebruikt arbeidsveiligheidslabels en converteert historische dollarbedragen niet naar euro's.

De continue visualisatie van maatregelwerking is een **expliciete IMA-modeluitbreiding**, geen door Fine of Kinney voorgeschreven percentagecalculator. Voor een preventief mechanisme geldt in dit model `W_na = W_voor × (1 − reductie_W)`. Kortere of minder frequente blootstelling kan B verlagen. Een afzonderlijk onderbouwd mitigatiemechanisme kan E verlagen. Een afscherming die een ongeval voorkomt verlaagt niet vanzelf de ernst van het letsel wanneer dat ongeval toch plaatsvindt.

Voorbeeld uit onze rekencontrole: W=6, B=6, E=15 geeft R=540. Een onderbouwde halvering van alleen de W-score geeft R=270; E blijft 15. Een afzonderlijke halvering van E geeft vervolgens R=135 als de werking onafhankelijk is. Dit is een halvering van modelindices, **geen voorspelling van het aantal ongevallen**. Controleer de residuele schaalinschatting tegen het werkelijke scenario; behandel fractionele uitkomsten zoals E=7.5 als modelwaarden, niet als nieuwe officieel vastgestelde categorieën.

### Effectiviteit onderbouwen in vier stappen

Een percentage zonder noemer en toepassingsvoorwaarden is geen bruikbare inschaling. `efficacyEstimate` biedt een **lokale rubric voor een voorstel op één score-as**. De functie vereist een ingevulde `conditionalBasis` met de definities en controle op overlap. De productregel volgt alleen met de hieronder beschreven conditionele definities; zij veronderstelt niet dat los ingeschatte gebruik, onderhoud en beschikbaarheid statistisch onafhankelijk zijn.

| Rubricveld | Precieze noemer / voorwaarde | Passend bewijs |
| --- | --- | --- |
| Bereik (`coverage`) | Aandeel van relevante situaties waarvoor het mechanisme werkelijk toepasselijk is | Taakobservaties, locaties, blootstellingssituaties en afgebakende uitzonderingen |
| Beschikbaarheid (`availability`) | Aandeel binnen de gedekte situaties waarin het systeem aanwezig en werkend is | Inspecties, storingen, testgegevens, onderhoud en bypassregistratie |
| Correcte toepassing (`correctUse`) | Aandeel correct gebruikte situaties **gegeven** dekking én beschikbaarheid | Praktijkobservaties, gebruikscontrole, pasvorm, instructie en daadwerkelijk handelen |
| Intrinsieke werking (`intrinsic`) | Scorewerking **gegeven** dekking, beschikbaarheid én correct gebruik | Mechanisme, gevalideerde prestatie, toepasselijke proef of deskundig gemotiveerde residuele inschatting |

`voorgestelde scorefactorreductie = bereik × conditionele beschikbaarheid × conditioneel correct gebruik × conditionele intrinsieke werking`

Een eerste productvoorstel kan bijvoorbeeld 0.75 × 0.9 × 0.5 × 0.8 = 0.27 zijn. De vier invoerwaarden in dit voorbeeld zijn **demonstratie-aannames**, geen standaardwerking van een bepaalde AHS-categorie. De rekenfunctie bewaakt fracties en intervallen, niet de waarheid van de gekozen noemers. Wanneer prestatiegegevens al beschikbaarheid, gebruik of bereik bevatten, moeten die factoren niet nogmaals worden afgetrokken. Bij onvoldoende gegevens: behoud `unknown` of `unverified` en onderzoek de werking; vul geen optimistische standaard in.

Het resultaat is een voorstel dat de beoordelaar motiveert en op de juiste W-, B- of E-as plaatst. Pas het niet identiek op alle drie assen toe en zet het niet zonder afzonderlijke PFD-onderbouwing om in een LOPA-IPL. Geplande/onbewezen status blijft gelden na gebruik van de rubric. Een hoge intrinsieke werking bij laag bereik of verkeerd gebruik kan zo transparant toch een beperkt uitvoeringsvoorstel opleveren.

### Bewijs en status

| Invoerstatus | Huidige berekening | Doelbeeld |
| --- | --- | --- |
| Bestaand, geverifieerd, mechanisme en bewijs beschreven | Telt mee | Telt mee |
| Bestaand, onbewezen of onbekend | Geen credit | Geen credit |
| Gepland, onderbouwd, werking geverifieerd voor het beschreven ontwerp | Geen credit | Alleen een prognose |
| Gepland, onbevestigde maar beschreven schatting | Geen credit | Nominale schatting; conservatieve reductieondergrens automatisch nul |
| Onbekende werking, ontbrekende onderbouwing of buiten gebruik | Geen credit | Geen credit |

`verified` is de expliciete verklaring van een beoordelaar, geen door de software uitgevoerde veldinspectie. Beschrijf bijvoorbeeld inspectie, meting, proef, ontwerpberekening, toepassingsvoorwaarden, meetdatum, verantwoordelijke en onderhoud. De engine controleert aanwezigheid van onderbouwing en rekengrenzen; hij controleert de inhoudelijke waarheid of geldigheid van het bewijs niet zelfstandig.

### Afhankelijkheid en onzekerheid

Vermenigvuldig effecten alleen bij werkelijk afzonderlijke, aantoonbaar onafhankelijke mechanismen. Een opleiding, instructie, toezicht en dezelfde operatorreactie mogen geen vier onafhankelijke barrières worden. Gemeenschappelijke sensor, actuator, voeding, software, onderhoudsfout of menselijke handeling kunnen een gedeelde afhankelijkheid vormen.

Bij dezelfde `dependencyGroup` telt de Kinney-engine één **volledige** standalone effectvector. Hij kiest de sterkste conservatief onderbouwde vector en vermenigvuldigt de andere effecten niet. Hij combineert ook niet de beste W-reductie van maatregel A met de beste E-reductie van maatregel B.

Maatregelen waarvan onafhankelijkheid onopgelost is (`independent:false`) worden niet met de beoordeelde onafhankelijke combinatie gestapeld. De engine vergelijkt twee **volledige alternatieve paden**: de combinatie van beoordeelde onafhankelijke groepen, of één sterkste zelfstandige onopgeloste maatregel. De laagste conservatieve restrisicoscore bepaalt het gekozen pad; bij gelijke conservatieve scores volgt de nominale score, en bij een volledige gelijke stand blijft de onafhankelijke combinatie gekozen. Een ingevulde groepsnaam heft `independent:false` niet op. Een aangevinkt onafhankelijkheidsveld bij andere maatregelen bewijst evenmin dat de onopgeloste maatregel daarvan onafhankelijk is.

Voorbeeld: een bestaande onafhankelijke W-reductie van 50% én een tweede W-reductie van 50% waarvan onafhankelijkheid onopgelost is, geven samen één 50%-werking: R=270 bij R_voor=540, niet R=135. Een geplande instructie krijgt geen extra marginale opbrengst boven een bestaande barrière als haar onafhankelijke werking niet is onderbouwd. Een complexere gezamenlijke werking vraagt een afzonderlijk faalmodel; deze conservatieve padkeuze schat die werking niet. Uitgesloten paden en onopgeloste onafhankelijkheid worden expliciet vermeld.

Elk reductieveld heeft `min ≤ value ≤ max`, tussen 0 en 1. De laagste risicogrens gebruikt de hoogste reducties; de hoogste risicogrens de laagste reducties. Deze grenzen zijn **gevoeligheidsgrenzen**, geen statistische betrouwbaarheidsintervallen. Ze omvatten alleen de ingevoerde parameteronzekerheid; ontbrekende scenario's, verkeerd bewijs en verkeerde modelstructuur zijn daarmee niet automatisch afgedekt. De engine retourneert zowel de nominale als de conservatieve risicoklasse.

De implementatie normaliseert klassegrenzen op `[0,20)`, `[20,70)`, `[70,200)`, `[200,400)` en `[400,∞)`. De historische tabellen hebben aangrenzende intervallen en vermelden boven 400 de hoogste categorie; de keuze om exact 400 conservatief in de hoogste categorie te zetten is een gedocumenteerde implementatiekeuze. De klasse “laag” heet bewust geen juridisch acceptatiebesluit. Een nuluitkomst vereist aantoonbare eliminatie van dit scenario, en beoordeling van eventuele andere routes of vervangende gevaren.

## 4. AHS en eenvoudig haalbare maatregelen

De Nederlandse AHS geeft een volgorde van bronaanpak, collectieve technische maatregelen, individuele/organisatorische maatregelen en PBM. Beoordeel telkens waarom een lager niveau nodig is. [Arboportaal, Ministerie van SZW: arbeidshygiënische strategie](https://www.arboportaal.nl/onderwerpen/persoonlijke-beschermingsmiddelen/persoonlijke-beschermingsmiddelen-als-hulpmiddel-voor-gezond-en-veilig-werken). Voor kankerverwekkende en mutagene stoffen vermeldt het ministerie specifiek dat een lager niveau om technische redenen nodig moet zijn en dat economische redenen hiervoor niet volstaan. [Arboportaal: verplichtingen van de werkgever](https://www.arboportaal.nl/onderwerpen/risicos-gevaarlijke-stoffen/kankerverwekkende-en-mutagene-stoffen/verplichtingen-van-de-werkgever).

AHS is dus geen algemeen rekenkundig reductiepercentage. Een bronmaatregel krijgt geen extra 20% fysieke reductie alleen vanwege haar label. Werkelijke werking volgt uit het causale mechanisme en het bewijs.

Voor uitvoeringsprioriteit gebruikt IMA een **lokaal, transparant besluitmodel**:

`prioriteit = extra nominale scoreverbetering / relatieve inspanning × AHS-gewicht × haalbaarheidsfactor`

| Lokale keuze `ima-priority/1.0.0` | Waarde |
| --- | --- |
| Bron | 1.40 |
| Collectief | 1.25 |
| Individueel/organisatorisch | 1.10 |
| PBM | 1.00 |
| Eenvoudig haalbaar | 1.50 |
| Gemiddeld haalbaar | 1.00 |
| Moeilijk haalbaar | 0.80 |

Dit zijn **gekozen beleidsgewichten, geen wettelijke of wetenschappelijk gekalibreerde constanten**. Zo krijgt een eenvoudig uitvoerbare maatregel met grote verwachte opbrengst meer uitvoeringsaandacht. De inspanning moet positief zijn en op dezelfde lokale schaal worden geschat. De engine vergelijkt iedere geplande maatregel afzonderlijk met de huidige bewezen beheersing; hij schrijft voordelen van andere plannen niet aan die maatregel toe. Afhankelijkheid kan het marginale voordeel tot nul terugbrengen.

Een als wettelijk noodzakelijk gemarkeerde maatregel komt vóór optionele maatregelen, ongeacht haar score. De invoervlag zelf is geen juridische vaststelling. Een goedkope ingreep mag daarnaast een noodzakelijke bronmaatregel, urgente ingreep of wettelijke verplichting niet verdringen. Kosten en gemak wijzigen noch W/B/E noch een LOPA-PFD.

Fine's historische functie is `J = R / (CF × DC)`, waarbij DC een **correctierating** uit zijn schaal is, niet simpelweg het reductiepercentage. Kinney/Wiruth gebruiken `J = R × effectiviteit / kostendeler`. Beide functies bestaan afzonderlijk; de lokale IMA-prioriteit gebruikt geen van beide namen. Historische kostenschalen en toenmalige beoordelingsdrempels worden niet zonder nieuwe kalibratie op eurokosten in 2026 toegepast. Fine noemt zijn justificatie nadrukkelijk een hulpmiddel en beschrijft dat noodzakelijke risicoreductie ook bij een ongunstige justificatie moet worden uitgevoerd. Zie de oorspronkelijke Fine-publicatie, pp. 164–166.

## 5. LOPA: geen Kinney-score met een andere naam

LOPA gebruikt één oorzaak-gevolgcombinatie, een frequentie van een initiërende gebeurtenis, geschikte onafhankelijke beschermingslagen en hun PFD. CCPS onderscheidt daarnaast enabling conditions en conditional modifiers. IPLs moeten de gespecificeerde ontwikkeling van het scenario kunnen stoppen en onafhankelijk zijn van zowel de initiator als de andere lagen. [AIChE/CCPS: LOPA Data, stappen en kernkenmerken](https://ccps.aiche.org/resources/tools/lopa).

De implementatie rekent:

`f_gevolg = f_initiator [/jaar] × product(geverifieerde modifiers) × product(PFD van toegelaten IPLs)`

De ingevoerde `targetFrequency` is het eigen criterium voor het expliciete gevolg, met dezelfde tijdsbasis. Het is geen universele tolerantiegrens. HSE benadrukt dat de organisatie eigen passende frequentiecriteria en onderbouwde PFD-waarden moet vaststellen; illustratieve tabelwaarden vormen niet automatisch acceptabele lokale invoer. [HSE/OMAR: Functional Safety Inspection Guide, paragraaf SIL Allocation, p. 19](https://www.hse.gov.uk/offshore/assets/docs/functional-safety-inspection-guide.pdf).

De engine geeft IPL-credit uitsluitend bij alle onderstaande verklaringen en onderbouwingen:

1. De laag bestaat en is in gebruik (`existing`).
2. De werking is geverifieerd; bewijs en verklaring van onafhankelijkheid zijn ingevuld.
3. De laag is specifiek voor dit scenario, effectief en auditeerbaar.
4. De laag is onafhankelijk van de initiator en andere lagen.
5. De PFD is een interval met `0 < min ≤ value ≤ max ≤ 1`.
6. Geen gedeelde `dependencyGroup` met een andere bewezen laag of modifier.

Een gepland ontwerp wordt niet stil als bestaande IPL opgenomen. Een perfect werkende PFD=0 wordt afgewezen. Een veiligheidsfunctie krijgt niet automatisch een PFD op basis van een naam als “SIL 2”; gegevens, toepassingsvoorwaarden, testinterval en berekening blijven nodig. Deze engine berekent geen PFDavg uit componentfaaldata en doet geen SIL-verificatie of hoogfrequente/PFH-berekening.

Bij gedeelde afhankelijkheid sluit deze eerste engine **alle betrokken IPLs/modifiers** uit. Dat is conservatief en kan een legitieme enkelvoudige barrière onderwaarderen. Het voorkomt een ongefundeerde gezamenlijke reductie; beoordeel de groep opnieuw als één werkelijk zelfstandig systeem of gebruik een gezamenlijk faalmodel. Een formulieraanvinkvak kan fysieke onafhankelijkheid niet bewijzen.

Modifiers tellen alleen mee als ze geverifieerd, gemotiveerd en onafhankelijk zijn. Onbewezen modifiers worden factor 1. Een aanwezigheidskans hoort uitsluitend bij een gevolg dat de aanwezigheid nodig heeft; zij verlaagt niet de kans op het vrijkomen zelf. Tel bedrijfstijd of blootstelling niet opnieuw af als die al in de initiatorfrequentie zit. De engine kan expliciete dependencyGroup-dubbeltellingen opsporen, maar geen semantische dubbeltelling uit een verkeerd beschreven scenario herkennen.

`riskReductionFactor = 1 / product(PFD)` gaat alleen over de getelde IPLs; modifiers worden niet als extra IPL-prestatie gepresenteerd. De uitkomst vermeldt getelde en uitgesloten lagen, een frequentie-interval en de vergelijking met het opgegeven criterium. “Below” betekent dat de bovengrens numeriek onder het criterium ligt, geen formeel besluit dat de installatie veilig of toelaatbaar is. Er volgt “uncertain” wanneer het interval het criterium doorkruist.

Rekenvoorbeeld met zelfgekozen demonstratie-invoer: f=0.1/jaar en twee werkelijk onafhankelijke IPLs met PFD=0.1 en 0.01 geven 0.0001/jaar en een IPL-RRF van 1000. W=6 uit Kinney mag niet naar f=6/jaar of kans=0.6 worden geconverteerd. Blootstellingsscore B is evenmin een aanwezigheidskans.

## 6. Visualisatie zonder schijnzekerheid

De holografische W/B/E-weergave toont de route van uitgangsscenario via huidige beheersing naar doelbeeld. Verplaatsing op één as toont welke factor een maatregel verandert. Maak onzekerheidsgrenzen, uitgesloten maatregelen en geplande status zichtbaar naast het diagram. Gebruik een logaritmische projectie voor positieve factoren; nul/eliminatie moet afzonderlijk worden gemarkeerd omdat log(0) niet bestaat.

Toon naast de projectie gewone getallen en een leesbaar maatregelenverloop. Een ruimtelijke bolgrootte, gloed of animatie is een presentatievorm, geen additionele dataset. De lijn naar het doelbeeld mag geen gerealiseerd resultaat suggereren. Voor LOPA is een aparte jaarlijkse frequentie- of barrièreweergave vereist; het dimensionloze Kinney-getal en gebeurtenissen per jaar mogen geen gedeelde y-as of gezamenlijke kleurgrenzen krijgen.

## 7. Andere modellen en uitbreidingsrichting

Een scenarioanalyse begint met identificatie, niet met een score. OSHA noemt bijvoorbeeld What-if/checklists, HAZOP, FMEA en fault-tree analysis; de methode moet passen bij de procescomplexiteit. [OSHA Technical Manual, Section IV, Chapter 5, Process Hazard Analysis](https://www.osha.gov/otm/section-4-safety-hazards/chapter-5). Deze Amerikaanse methodenbron is geen Nederlandse verplichting.

| Methode | Passende analysevraag | Grenzen / vervolg in IMA |
| --- | --- | --- |
| Risicomatrix | Welke gevaren vragen eerst aandacht? | Classificatietool. Categorieproducten zijn geen absolute kansen; kalibreer assen en grenzen. |
| BowTie | Welke routes leiden tot verlies van beheersing en welke preventieve/mitigatieve barrières horen erbij? | Geschikt voor causale visualisatie en eigenaarschap. Het aantal getekende barrières bewijst geen kwantitatieve reductie. |
| HAZOP / What-if | Welke afwijkingen en ongewenste scenario's kunnen optreden? | Identificatie met een deskundig team; input voor Kinney of LOPA. |
| FMEA | Welke component- of procesfouten hebben welke gevolgen? | Verschillende dimensies apart houden; een RPN heeft geen jaarlijkse frequentie-eenheid. |
| Foutenboom (FTA) | Welke combinaties van oorzaken veroorzaken het top-event? | Modelleer AND/OR-structuur, gedeelde basisevents en common-cause failures expliciet. |
| Gebeurtenissenboom (ETA) | Welke gevolgen volgen bij slagen/falen van opeenvolgende barrières? | Routefrequenties en conditionele kansen; nuttig wanneer meerdere gevolgen apart moeten worden beoordeeld. |
| Arbeidshygiënische blootstellings-/dosisresponsanalyse | Welke gemeten blootstelling geeft welke gezondheidsschade? | Meetstrategie, grenswaarden en toepasselijk inhoudelijk model; geen vervanging door een generieke Kinney-percentagekeuze. |

Een matrix kan verschillen samenpersen, rangordes omkeren en afhankelijk zijn van subjectieve categorietoekenning. [Louis Anthony Cox Jr., 2008, *What's wrong with risk matrices?*, Risk Analysis 28(2):497–512, DOI 10.1111/j.1539-6924.2008.01030.x](https://pubmed.ncbi.nlm.nih.gov/18419665/). Gebruik zulke getallen daarom als screening met zichtbare aannames.

HSE toont preventieve en mitigatieve barrières rond het verlies van beheersing in een BowTie. [HSE: Major Hazard Regulatory Model, p. 5](https://www.hse.gov.uk/regulating-major-hazards/assets/docs/major-hazards-regulatory-model.pdf). De **ontwerpkeuze** voor een volgende IMA-versie is dezelfde scenario-/controlrecords hiervoor te hergebruiken; dat voorkomt een los diagram zonder onderliggende bewijsstatus.

NASA's foutenboomhandboek behandelt onafhankelijke gebeurtenissen, gedeelde oorzaken en expliciete common-cause-modellen. Een gezamenlijke fout mag dus niet worden weggemodelleerd door alleen losse kansen te vermenigvuldigen. [NASA: Fault Tree Handbook with Aerospace Applications, hoofdstukken 5–6](https://s3vi.ndc.nasa.gov/ssri-kb/static/resources/Fault%20Tree%20Handbook_NASA.pdf). FTA/ETA zijn hier een uitgewerkte uitbreidingsrichting; er wordt geen complete boomengine geclaimd.

Voor chronische arbeidsgezondheidsrisico's zijn blootstellingsgegevens en de relatie met gezondheidseffecten bepalend; NIOSH gebruikt zulke gegevens in occupational risk assessment. [NIOSH: Occupational Risk Assessment](https://www.cdc.gov/niosh/occupational-risk-assessment/about/). Beoordeel schadelijk geluid, chemische blootstelling of ergonomische belasting daarom ook met het toepasselijke inhoudelijke toetsingskader.

## 8. Verificatie en resterende grenzen

De tests controleren bekende producten, richtingen van onzekerheidsgrenzen, factorselectiviteit, onbekend/onbewezen bewijs, huidige/geplande status, eliminatie, groepsafhankelijkheid, ontbreken van een fysieke AHS-bonus, zelfstandige marginale prioritering, twee historische justificaties en LOPA-kwalificatie. Zij controleren ook initiatorafhankelijkheid, modifiers, PFD=0 en intervallen die een frequentiecriterium kruisen.

De implementatie is zuiver en deterministisch: geen netwerk, AI-aanroep, lokale opslag of mutatie van de ingevoerde records in de rekenfuncties. De formule- en intervalcorrectheid heeft **hoge zekerheid** binnen de expliciete modelaannames. De overdraagbaarheid van een relatieve score naar een concreet besluit heeft **matige zekerheid** en vraagt kalibratie. De feitelijke werking van lokale maatregelen en toepasselijke LOPA-PFD's is **onbekend** totdat daarvoor geschikt lokaal bewijs is beoordeeld.

De engine doet geen automatische juridische bronactualisering, fysieke inspectie, beoordeling van bewijsverval, automatische incidentstatistiekkalibratie, volledige afhankelijkheidsanalyse, dynamische betrouwbaarheidsanalyse of generieke SIL-certificering. Leg veranderde scenario's, bewijs, methodeversies en professionele acceptatiebesluiten in het dossier vast. Formulewijzigingen en beleidsgewichten moeten afzonderlijk worden gereviewd: een gunstiger getal is op zichzelf geen verbeterde veiligheid.
