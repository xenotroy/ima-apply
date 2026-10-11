# PI-risicobasis en RI&E-router

Status: eigen generieke onderzoeksregels, versie 1.0.0. Dit ontwerp ondersteunt de voorbereiding van een deel-RI&E. Het kent geen lokale risicoscore, maatregelwerking of juridische conformiteitsverklaring toe. Concrete klantinformatie, letterlijke bronvragen en exacte broncodes worden uitsluitend als private werkruimte-inhoud geïmporteerd.

## Twee lagen en één risico-identiteit

De inrichtingsbrede basis beschrijft een mogelijk arbeidsrisico, concrete schadeweg, blootgestelde functies, algemene beheersprincipes en onderzoeksvragen. De lokale laag legt aanwezigheid, blootstelling, taak-/dienstverschillen, afwijkingen, aanvullende scenario’s en de werking van maatregelen vast. Een gemeenschappelijke maatregel wordt eenmaal als bron geregistreerd; iedere locatie controleert haar eigen toepassing. Een positief centraal antwoord wordt niet automatisch een positief lokaal antwoord.

Een scenario krijgt een canoniek basis-ID. Verschillende lokale controlemomenten verwijzen naar dat ID. Zo blijven bijvoorbeeld een centrale alarmvoorziening en een lokale ontvangststoring verbonden zonder het risico dubbel te registreren. Bij wijzigingen blijven bestaande bevroren onderzoekssets en dossiers intact.

De werkingscontrole verloopt afzonderlijk langs aanwezigheid, daadwerkelijk gebruik, effectbewijs en beoordeling van voldoende beheersing. Uitvoering van een actie is geen bewijs van effect. Opleiding, certificaat, algemene procedure of ontbreken van meldingen krijgt geen automatisch reductiepercentage. AHS-niveau geeft de voorkeursvolgorde van maatregelen; feitelijke reductie vraagt scenario- en bronbewijs in het risicomodel.

## Hoofdstukken en tabelvelden

1. Stelsel, wettelijke onderwerpen, interne eisen en bewijs.
2. Broninventaris, afbakening, actualiteit, overlap en datagaten.
3. Werkorganisatie, bezetting, PSA, alleenwerk en diensten.
4. Gebouw, werkplek, verkeer, ergonomie en omgeving.
5. Taken, middelen, fysieke/chemische/biologische blootstelling en bijzondere ruimten.
6. PI-taken, agressie, toezicht, bezoek, transport, interventie, brand en interfaces.
7. Lokale beoordeling, aanvullende deskundigheid, PvA en effectcontrole.

Iedere risicorij bevat thema en activiteit; gevaar met concreet schadepad; mogelijke groepen; gevolgen; bron-/collectieve-/individuele-/PBM-principes; bestaande documentclaims met verificatiestatus; lokaal verhogende omstandigheden; gerichte vragen/observaties; bron, versie en ontbrekende informatie. Niet ontvangen informatie blijft een datagat. Algemene vakkennis, documentclaim, feitelijke waarneming en geaccepteerd oordeel blijven herkenbaar afzonderlijk.

De huidige eigen basis omvat de onderwerpen in `PI_ROUTER_RULES`. De private bronuitwerking bevat een representatieve eerste tabel en daarna de volledige huidige basis met toegeschreven documentclaims. Deze tabellen stellen geen volledige lokaal geverifieerde dekking vast. Specialistische werkzaamheden vragen afzonderlijke taakafbakening en passende deskundigheid.

## Vier onafhankelijke ingangen

| Ingang                 | Selectie                                                                | Effect                                                                    | Bewijsgrens                                                                            |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Organisatieprofiel     | Taken, ruimten, middelen, stoffen, functies, diensten, externe partijen | Activeert relevante scenario’s; overige kenmerken blijven onbekend        | Afdelingsnaam of profiel is geen lokale feitelijke beoordeling                         |
| Risico’s               | Mogelijk, vastgesteld volgens invoer, lokaal verhoogd volgens invoer    | Activeert onderzoek; verhoogd geeft hogere onderzoeksprioriteit           | Selectie is toegeschreven aan onderzoeker/invoer, geen berekende score                 |
| Verplichtingen         | Wettelijk onderwerp, interne eis, goede praktijk                        | Wettelijke kern blijft onafhankelijk van gevaren- of incidentselectie     | Interne status, actuele versie en concrete juridische kwalificatie controleren         |
| Incidenten en signalen | Incident, bijna-ongeval, klacht, verandering                            | Activeert faalpadonderzoek; ernstig signaal verhoogt onderzoeksprioriteit | Geen meldingen bewijst geen afwezigheid; incident bepaalt niet zelfstandig risicoscore |

Er zijn drie onderzoekslagen: centraal/inrichtingsbreed, organisatorisch/afdeling en lokaal/taak. Private bronbindings benoemen de laag. Centrale beleidsvragen worden niet automatisch opnieuw in een lokale vragenlijst gezet; lokale toepasselijkheid, bekendheid, capaciteit en werking blijven wel in de onderzoeksset.

Een private vraagbinding kan daarnaast harde taakfilters hebben. Vraagregels over sport, arbeid/productie, bijzondere interventie, meerpersoonscellen, wapens, straling of een afzonderlijk specialistisch onderdeel worden pas aan de gerichte set gekoppeld wanneer die betreffende taak of scope is bevestigd. Een algemene agressietrigger laadt daardoor niet vanzelf alle bijzondere PI-processen. Verdiepende beeldscherm-, fysieke-belastings- en klimaatblokken vragen bovendien een relevant vastgelegd signaal of een expliciete lokaal verhoogde selectie. Aanwezig beeldschermwerk alleen bewijst nog geen behoefte aan een verdiepingsblok.

## Inhoudelijke beslismatrix

| Ingang / criterium                               | Onderwerp                              | Niveau             | Benodigde bronnen                                      | Onderzoek                                                                            | Motivering                                                                              |
| ------------------------------------------------ | -------------------------------------- | ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Onafhankelijke verplichting                      | RI&E/PvA en actualisatie               | Centraal én lokaal | Actuele RI&E, scope, besluit-/wijzigingsregister       | Risico van bron via criterium/oordeel naar maatregel en effectcontrole reconstrueren | Voorbereiding mag geen gekozen risico vereisen om de RI&E-cyclus te onderzoeken         |
| Onafhankelijke verplichting                      | Preventie en deskundige bijstand       | Centraal én lokaal | Aanwijzing, mandaat, deskundigheid en overleg          | Tijd, kennis, samenwerking, toegankelijkheid en praktische ondersteuning             | Een ontbrekend lokaal signaal bewijst geen goed preventiestelsel                        |
| Onafhankelijke verplichting                      | Voorlichting/instructie                | Centraal én lokaal | Taakmatrix, instructie-/opleidingsgegevens             | Actualiteit, doelgroep, begrip en toepassing tijdens de taak                         | Deelname is geen zelfstandig werkingsbewijs                                             |
| Onafhankelijke verplichting                      | BHV                                    | Centraal én lokaal | Bezetting, middelen, scenario’s, oefeningen            | Nacht, uitval, gelijktijdige incidenten en externe aansluiting                       | Organisatie en lokale uitvoerbaarheid beide nodig                                       |
| Onafhankelijke verplichting                      | PAGO                                   | Centraal én lokaal | Aanbod, bedrijfsartsadvies, geaggregeerde informatie   | Koppeling met RI&E en blootgestelde groepen                                          | Onderzoek is gebaseerd op arbeidsrisico’s; aanbod en deelname zijn onderscheiden        |
| Gedetineerdencontact of agressiesignaal          | Agressie/toezicht                      | Centraal én lokaal | Taak-/incidentgegevens, alarm-/responsbewijs           | Concreet contactmoment, uitwijking, hulp, afbreken en nazorg                         | Scenario en faalpad bepalen verdere beoordeling                                         |
| Alleenwerk of nachttaak                          | Alleenwerk, diensten en ondersteuning  | Centraal én lokaal | Werkelijke taken/roosters, hulpketen en testgegevens   | Isolatie, contactverlies, respons bij uitval en herstel                              | Beschikbare hulp kan per taak en dienst verschillen                                     |
| Handmatig verplaatsen of ingrijpen               | Fysieke belasting                      | Centraal én lokaal | Taakgegevens, lasten/kracht, hulpmiddelen              | Houding, kracht, frequentie, duur en onverwachte belasting                           | Een algemeen antwoord vervangt geen taakgerichte waarneming                             |
| Beeldscherm-/observatiepost                      | Ergonomie en concentratie              | Centraal én lokaal | Werkplekonderzoek, werkelijke taaktijden               | Instelling, zicht, onderbrekingen en toezichtcombinatie                              | Werkinrichting en taakcombinatie kunnen elkaar beïnvloeden                              |
| Binnenmilieu of klimaatsignaal                   | Warmte/lucht/licht                     | Centraal én lokaal | Klachten, installatiegegevens, inspecties en metingen  | Verschillen per ruimte, periode, dienst en tijdelijke maatregel                      | Een screening is geen meetwaarde of bewezen werking                                     |
| Middelen gebruiken/onderhouden                   | Machine-/elektrische veiligheid        | Centraal én lokaal | Register, handleiding, bevoegdheid en oplevering       | Afscherming, energie-isolatie en veilige hervatting                                  | Technische taakgrenzen en gebruikerswerk niet vermengen                                 |
| Stoffen/schoonmaak                               | Stoffen en hygiëne                     | Centraal én lokaal | Product-/blootstellingsregister, werkwijze             | Product, concentratie, doseren, contactroutes, opslag en afval                       | Verdund of gebruikelijk is geen bewijs van afwezig risico                               |
| Lichaamsmateriaal, fouillering of zorgtaak       | Biologische blootstelling              | Centraal én lokaal | Taakscenario, voorzieningen en post-expositieroute     | Prikken, bijten, spatten, direct handelen en deskundige nazorg                       | Algemene risicoperceptie vervangt geen concrete contactroute                            |
| Brandrespons of gesloten binnenruimte            | Brand/evacuatie                        | Centraal én lokaal | Detectie, ontgrendeling, compartimentering, oefeningen | Rollen, afbreekgrens, rook, uitval en gelijktijdige situaties                        | Beveiliging en veilige noodrespons kunnen een interface hebben                          |
| Onderhoud of derden                              | Coördinatie en veilige oplevering      | Centraal én lokaal | Werkorders, afspraken en oplevercriteria               | Wie stelt veilig, controleert en informeert gebruikers?                              | Afgeronde werkorder bewijst geen veilige hervatting                                     |
| Beroepsmatige voedselhandeling of keukentoezicht | Hitte, snijmiddelen, brand en toezicht | Centraal én lokaal | Werkelijke taakverdeling en middelen                   | Personeel bereiden/distribueren onderscheiden van alleen toezicht                    | Een voedselveiligheidsvraag kan werknemersscenario’s ongedekt laten                     |
| Medicatiehandeling                               | Werknemersrisico en zorginterface      | Centraal én lokaal | Taak-/autorisatieafspraken, praktijk en incidenten     | Onderbreking, agressie, taakcombinatie en blootstelling                              | Geen herkenbare bronmodule betekent apart taakonderzoek, geen automatische brede module |

De runtime levert voor ieder onderwerp de toegepaste triggers, onderzoekslaag, prioriteit, documenten, eigen onderzoeksvragen, beschikbare exacte private bronbindings, motivering en datagaten. Een bronbinding blijft kandidaat totdat dekking en exacte inhoud zijn gecontroleerd. Technisch selecteerbare procesblokken en een verzameling vraagcodes zijn verschillende scope-eenheden.

## Uitsluiting en tegenstrijdigheden

Niet geselecteerd en onbewezen “nee” blijven onbekend. Uitsluiting vraagt aantoonbaar afwezige relevante triggers, passende scope, motivering, onderzoeker, datum en geregistreerd bewijs. Normaal werk, afwijkende diensten, storing en nood horen in die afbakening. Een wettelijke kern, gemeenschappelijke personeelscontrole of positieve taak-/risico-/signaaltrigger blokkeert uitsluiting.

De router signaleert ten minste:

- Afwezig profiel terwijl een risico, incident of documentclaim aanwezigheid suggereert.
- Aanwezig profiel terwijl een document afwezigheid beweert.
- Een claim van werkende beheersing naast een faalsignaal of claim van onvoldoende werking.
- Een verklaring van geen signalen naast geregistreerde signalen.
- Uitsluiting die botst met een verplichting, basiscontrole of positieve trigger.

Deze signalering vraagt vergelijking van dezelfde taak, periode en scope. Verschillende documenten kunnen over verschillende populaties gaan; een gevonden tegenstelling is een onderzoekspunt, geen automatisch bewezen fout.

## Bewijs- en bronregister

Een bron krijgt datum, versie, scope, populatie/periode, herkomst en status. Genoemd, ontvangen, inhoudelijk gelezen en beschikbaar gesteld voor beoordeling zijn afzonderlijke statussen. Een bron die bewust niet is gebruikt krijgt een reden. Gelijke bytes zijn één inhoudelijke bron en geen onafhankelijke bevestiging. Gelijke titels met verschillende hashes blijven afzonderlijk tot inhoudelijk vergeleken.

Exacte vraagcodes kunnen meermaals in een bron voorkomen. De binding gebruikt daarom een unieke occurrencekey en vraag-ID naast zichtbare code, aspect, proces, bron-ID en pagina. Eén bronvraag kan meerdere scenario’s ondersteunen en wordt eenmaal in de gekozen onderzoeksset opgenomen.

De private intake leest vaste JSON-toewijzingen als gegevens. Objectliteral-bronnen worden beperkt tot objecten, arrays, tekst, getallen, booleans en null; functies, imports, uitvoerbare expressies en prototypevelden worden geweigerd. Aangeleverde JavaScript wordt niet uitgevoerd. Ruwe Vault-bronnen en verschillende Drive-locaties worden niet overschreven of samengevoegd.

## Opslag, gebruik en verificatie

Profiel, risico-ingangen, signalen, bronclaims, notities en uitsluitonderbouwing worden tijdens wijziging als herstelbaar lokaal concept bewaard. Vastleggen voegt een bevroren `ima.pi-router/v1`-record toe aan de werkruimte. De snapshot bewaart unieke geselecteerde bronvraagbindings, hun bankherkomst/hash en de regelversie. Het resultaat bevat regel-/vraag-ID’s, zonder dezelfde volledige vraagbinding per thema te kopiëren.

`piRouterResult(record)` herbouwt de weergave met de passende regelversie. `piRouterQuestionBindings(record)` geeft de unieke geselecteerde bindings voor de gecontroleerde overgang naar een moduleplan en conceptdossier. SHA-256 en herberekening controleren zowel invoer als resultaat. Latere profiel-/bronbankwijzigingen herschrijven eerdere sets niet.

De Markdown-export bevat afbakening, onderzoeker, profiel, motivering, datagaten, tegenstrijdigheden, scenario’s, beheersprincipes, vragen, exacte occurrencecodes en bewijs-/signaalnotities. De volledige JSON-werkruimte blijft het herstelbestand. Markdown is een leesbare dossierweergave.

Een complete bronbank met honderden bevroren vragen en lange interviews kan de grens van 2.000.000 UTF-8-bytes overschrijden. `createPiProjectWorkspace(workspace, record)` maakt daarom expliciet een **afzonderlijke** projectwerkruimte met alle geselecteerde vraagoccurrences, een volledig bevroren moduleplan/dossier, de brongetrouwe bibliotheek, oorspronkelijke bronbankhash en herkomst naar de oude routerhash. De oorspronkelijke werkruimte en volledige bronbank worden niet gewijzigd. De bindings zijn herkenbaar als `scoped_selection`; uitbreiding vereist herselectie uit de volledige bank. Er worden geen geselecteerde vragen afgekapt. Bewijskopieën houden hun oorspronkelijke herkomst en krijgen geen nieuwe lokale verificatie.

De knop **Projectwerkruimte exporteren** levert herstelbaar JSON op. Importeer dit bestand via **Werkruimte of content importeren** en **Import openen** om het interview afzonderlijk uit te voeren. De organisatie wordt bewust gekozen of uit het gekoppelde dossier gebruikt; zonder geldig organisatie-, afdelings- of projectanker blijft dossiergebruik geblokkeerd. Bewaar de export van de bestaande werkruimte voordat je wisselt.

De capaciteit is beproefd met iedere geselecteerde vraag beantwoord, 300 tekens bewijs en 300 tekens notitie per antwoord, bron-/vraaghash, actor en tijd, plus één gekoppelde waarneming en bevinding. Afzonderlijke projectexport houdt daarvoor voldoende ruimte; een complete bronbankwerkruimte met dezelfde interviewgegevens past niet in alle gevallen. De blijvende bytegrens wordt niet verhoogd en een geweigerde wijziging wordt niet als opgeslagen getoond.

De concrete vragenlijst wordt pas gebruikt nadat kandidaatkoppelingen en vraagdekking zijn gecontroleerd. Deze software schrijft daarmee nog niets naar RIEporter. Werkelijke invoer, antwoordrichting en invoercontrole zijn aparte stappen. Gereed betekent uiteindelijk dat iedere vastgestelde toepasselijke vraag onderbouwd is verwerkt, lokale werking onderzocht is, relevante datagaten zijn afgehandeld en de feitelijke invoer is gecontroleerd.

## Officiële bronnen

Officiële SZW-uitleg geraadpleegd op 11 oktober 2026. Zekerheid: matig over de volledige juridische kwalificatie. De geconsolideerde wetstekst op wetten.overheid.nl was in de gebruikte browse-omgeving niet op te halen; bijzondere toepassingsvoorwaarden en uitzonderingen zijn niet integraal gecontroleerd.

- [RI&E-inhoud en actualisatie, SZW Arboportaal](https://www.arboportaal.nl/onderwerpen/arbowet--en--regelgeving/risico-inventarisatie---evaluatie/waaruit-bestaat-de-rie).
- [Preventiemedewerker en artikel 13, SZW Arboportaal](https://www.arboportaal.nl/onderwerpen/ondersteuning-bij-arbowet/preventiemedewerker/wat-zegt-de-wet-over-de-preventiemedewerker).
- [Voorlichting gezondheidsrisico’s, SZW Arboportaal](https://www.arboportaal.nl/onderwerpen/arbozorg/voorlichting-gezondheidsrisicos).
- [BHV en artikel 15, SZW Arboportaal](https://www.arboportaal.nl/onderwerpen/arbozorg/bedrijfshulpverlening/wat-zegt-de-wet-over-bedrijfshulpverlening).
- [PAGO en artikel 18, SZW Arboportaal](https://www.arboportaal.nl/onderwerpen/arbowet--en--regelgeving/arbobeleid/pago).
- [AHS-volgorde, SZW Arboportaal](https://www.arboportaal.nl/onderwerpen/persoonlijke-beschermingsmiddelen/persoonlijke-beschermingsmiddelen-als-hulpmiddel-voor-gezond-en-veilig-werken).

Runtime: `web/src/data/pi-router.ts`. UI: `web/src/components/PiRouterWorkspace.tsx`. Private bibliotheek, broninventaris en beslismatrix blijven onder de genegeerde private-data-map en worden niet als publieke broninhoud meegestuurd.
