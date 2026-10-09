# Beheerde lokale basisrisicofactoren

Het BRF-register in **Onderzoek & cijfers → BRF-register** bewaart eigen definities van onderliggende systeemcondities als afzonderlijke versieerbare records. Het vervangt vrije onderzoekscodes niet en verklaart een incidentoorzaak niet automatisch.

De oorspronkelijke `TaxonomyTerm` bevatte ID, taxonomie, versie, status, bovenliggende term en beschrijving. De gelezen voorbeeldset in `src/RieBuilder.Ima/SeedWorkspace/taxonomies/base-risk-factors` heeft expliciet `status: draft` en noemt zichzelf een eigen hybride projecttaxonomie die nog eigenaarschap en bronvalidatie vraagt. De browser maakt hiervan geen canonieke Tripod-set en vult het register niet automatisch met vastgestelde definities.

## Identiteit, versie en bronstatus

Een `BasisRiskFactorRecord` heeft twee identiteiten:

- `factorId`: de stabiele identiteit van het begrip binnen de lokale taxonomie.
- `id`: de stabiele identiteit van één concrete definitieversie.

Een versierecord bewaart code, titel, betekenis/toepassingsgrenzen, expliciete versie, bron of lokale afspraak, inhoudelijk eigenaar, vastlegger, vastleggingstijd en versieredenering. Optioneel verwijst `supersedesId` naar de voorafgaande versie van hetzelfde begrip; `parentRecordId` wijst naar een concrete bovenliggende versie in dezelfde taxonomie. Verbroken, verkeerde en cyclische relaties worden geweigerd.

De UI overschrijft eerder opgeslagen betekenissen niet. **Nieuwe definitieversie** maakt een nieuw record met dezelfde `factorId` en een nieuwe `id`; de gebruiker kiest zelf de volgende versie en beschrijft waarom de betekenis wijzigt. Eén identiteit kan dezelfde versienaam niet tweemaal hebben. Het systeem verzint geen semantische versienummering of vervangingsbetekenis.

Er zijn drie bron-/gebruiksstatussen:

| Status                       | Betekenis                                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concept (`draft`)            | Voorlopige projectdefinitie; eigenaarschap of bron mag nog onbekend zijn.                                                                                                                           |
| Lokaal vastgesteld (`local`) | Betekenis en toepassingsgrenzen zijn als lokale definitie afgesproken. Eigenaar en bron-/afspraakverwijzing zijn verplicht. Dit is geen erkenning als externe standaard of bewezen incidentoorzaak. |
| Teruggetrokken (`retired`)   | Versie wordt niet meer als actuele lokale definitie aangeboden. Historische verbindingen en inhoud blijven behouden. Een nooit vastgesteld concept wordt door terugtrekken niet alsnog vastgesteld. |

Statusstappen volgen `draft → local → retired` of `draft → retired`. Iedere statuswijziging bewaart actor, datum met tijdzone en redenering. Een teruggetrokken versie wordt niet stil opnieuw geactiveerd: leg bewust een nieuwe definitieversie vast. Bij gelijktijdige wijzigingen controleert de UI de gelezen voorganger; niet opgeslagen invoer blijft behouden als de actuele registratie is veranderd.

De vastgelegde actor is gebruikersinformatie, geen extern geauthenticeerde handtekening. Lokale vaststelling beoordeelt de **definitie**, niet de oorzaak van een specifiek incident.

## Gebruik in onderzoek

`Investigation.basisRiskFactors` blijft de bestaande vrije tekst-/codecollectie. Zij wordt niet automatisch vertaald naar beheerde IDs. Zo blijven oorspronkelijke betekenissen, projectcodes en onbesliste legacyverwijzingen zichtbaar.

Een onderzoek kan daarnaast met `basisRiskFactorIds` naar concrete definitieversies verwijzen. Conceptonderzoek mag ook voorlopige definities als expliciete hypothesekoppeling gebruiken. Motiveer de verbinding met feiten en bewijs in de onderzoeksconclusie; een gekozen code is op zichzelf geen causaal bewijs en verleent geen risicoreductiekrediet.

Bij review met beheerde koppelingen bewaart `basisRiskFactorSnapshots` de volledige werkelijk gebruikte versie plus SHA-256. Een beoordeeld onderzoek vraagt daarvoor lokaal vastgestelde definities, of een historische teruggetrokken versie die aantoonbaar eerder lokaal vastgesteld was. Een teruggetrokken concept zonder lokale vaststelling voldoet hier niet aan.

Een snapshot dekt ook de status en statusgeschiedenis **zoals gebruikt bij de review**. De definitiehash omvat identiteit, versie, betekenis, bron, eigenaar en vastleggingscontext; zij sluit latere statusstappen uit. Daardoor kan een versie later worden teruggetrokken zonder een oude review stil te herschrijven. Een nieuwe definitieversie kan naast de oude blijven staan; historische onderzoeken blijven expliciet aan hun gekozen versie gekoppeld.

Import controleert zowel snapshothash als overeenkomst met de onveranderde definitieversie. Een gewijzigde betekenis met een opnieuw berekende snapshothash kan niet alsnog als dezelfde gekoppelde versie worden geïmporteerd. Dit is integriteits- en consistentiecontrole binnen de werkruimte, geen externe certificering.

De browser bevat nog geen volledige revisiegeschiedenis van het **hele onderzoek**. Een inhoudelijke onderzoekswijziging vraagt opnieuw review; het BRF-register bewaart de afzonderlijke definitieversies. Dat zijn verschillende historieclaims.

## Overdracht en legacygrenzen

De collectie `basisRiskFactorRecords` en de onderzoeksvelden zijn additief aan `schemaVersion: 1`. Oude exports zonder deze velden blijven geldig. De volledige JSON-export bevat alle definities, statusstappen, relaties en snapshots. Het Markdown-rapport toont registerinhoud, bron, eigenaar, versieredenering, statusgeschiedenis en de historische gebruikte onderzoeksversies.

De migratie-CLI projecteert uitsluitend werkelijk geselecteerde en veilig geparsed `ima.taxonomy-term/v1`-records met exacte taxonomie `ima-core:taxonomy:brf`, status `draft`, unieke ID/versie en bruikbare titel/beschrijving. ID, versie, betekenis en oorspronkelijke bronroute blijven behouden. De enige aanwezige broncode is de originele ID; die wordt dus ook de zichtbare code. `createdAt` is expliciet de vastlegging van de **nieuwe migratieprojectie**, geen verzonnen originele auteursdatum. Eigenaar en vastlegger blijven leeg, statusgeschiedenis blijft leeg en de volledige originele Markdown blijft raw bewaard.

Dit leest geen standaardset in een nieuwe browserwerkruimte in: alleen documenten die werkelijk in de gekozen migratiebron aanwezig zijn worden verwerkt. Andere taxonomieën, niet-draft statussen, ambiguë dubbele versies en onbruikbare records blijven uitsluitend raw. Een oude `parent_id` zonder expliciete versie wordt niet stil een gekozen bovenliggende versie. Vrije onderzoeks-/legacycodes worden niet automatisch `basisRiskFactorIds`; hun oorspronkelijke tekst blijft behouden. Een migratieprojectie is geen lokale vaststelling, bronvalidatie of oorzaakclaim.

## Verificatie

`web/src/data/brf.test.ts` toetst:

- Oude exports en oorspronkelijke vrije codes blijven intact.
- Twee versies behouden één identiteit, terwijl historische onderzoeksbetekenis gelijk blijft.
- Lokale vaststelling vraagt bron/eigenaar, actor, redenering en tijdvolgorde.
- Dubbele versies, verkeerde voorgangers, ontbrekende ouders en cyclische relaties worden geweigerd.
- Provisionele koppelingen blijven hypotheses; review vraagt exacte snapshots en een werkelijk lokaal vastgestelde definitie.
- Latere terugtrekking herschrijft de historische status niet.
- Gewijzigde snapshots/definities, onbekende velden en toegangstokens worden geweigerd.
- Markdown en volledige JSON bewaren de concrete betekenis en broncontext.

`web/e2e/brf-workflows.spec.ts` beproeft de browserroute van registratie via lokale vaststelling en onderzoeksreview naar een tweede versie, terugtrekking, herladen en Markdown-export met ongewijzigde historische snapshot. De fixtures zijn fictief en bevestigen geen feitelijke oorzaken of eerder vastgestelde productiegegevens.
