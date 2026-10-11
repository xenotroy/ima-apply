# Vastgelegde maatregeljustificatie

IMA bewaart een maatregelbesluit bij een eerder bewaard risicobeoordelingsmoment. De keuze bevat precies één geplande maatregel of een expliciet samengesteld pakket uit die bevroren invoer. Een andere geplande ingreep levert geen voordeel aan de gekozen ingreep. De oorspronkelijke risico-invoer blijft beschikbaar via het beoordelings-ID en de exacte SHA256.

## Werkwijze

1. Beschrijf het uitgangsscenario en de bestaande en geplande maatregelen in de risicowerkbank.
2. Bewaar een beoordelingsmoment met de volledige invoer en onderbouwing.
3. Kies dat moment en één geplande maatregel of het expliciete pakket.
4. Leg kostenbasis, ratingkalibratie, CF, DC en Kinney-kostendeler vast. Beschrijf de kostenomvang, valuta en beschouwde periode waar die relevant zijn.
5. Kies uitvoeren, uitstellen, niet uitvoeren of nader onderzoeken. Leg de beoordelaar en de redenering vast.
6. Bewaar het besluit. Een latere wijziging van scenario, selectie of ratings vraagt een nieuwe vastlegging. De eerdere beslissing blijft intact.

Een nieuwe werkruimte zonder bewaard beoordelingsmoment krijgt uitleg over deze bronvereiste. De software vult geen fictieve beoordelaar of besluitbasis in. Een bronmoment zonder geplande maatregelen geeft evenmin een automatisch pakket.

## Marginale vergelijking en gevoeligheidsgrenzen

Het huidige resultaat wordt opnieuw berekend uit de bevroren invoer. De geselecteerde prognose bevat de bestaande maatregelen en uitsluitend de gekozen plannen. De rekenengine beoordeelt afhankelijkheden en bewijsvoorwaarden opnieuw voor dit pakket.

`nominaal scoreverschil = huidige nominale score − nominale score van gekozen prognose`

`verschilondergrens = huidige scoreondergrens − prognosebovengrens`

`verschilbovengrens = huidige scorebovengrens − prognoseondergrens`

Deze ruime gevoeligheidsgrenzen laten de parametergrenzen afzonderlijk variëren. Er wordt geen gunstige gepaarde correlatie aangenomen. Het zijn geen statistische betrouwbaarheidsintervallen of gegarandeerde ongevalsreducties. Een negatieve ondergrens blijft negatief en verhindert een claim van een positieve conservatieve opbrengst.

Een verandering van het representatieve afhankelijkheidspad kan de nominale doelscore verhogen, terwijl de conservatieve grens verbetert. IMA bewaart dat getekende verschil. Bij zo’n padverandering, verloren bestaande credit, uitgesloten geselecteerde maatregel of een nulscore als uitgangswaarde wordt de vergelijking `unconfirmed`. Een negatief verschil wordt niet tot nul teruggebracht om een kunstmatig werkingspercentage te maken. De uitsluitingen en waarschuwingen blijven bij het besluit bewaard.

## Historische formules en afzonderlijk lokaal beleid

Fine: `J = R / (CF × DC)`. CF en DC zijn expliciet gekozen ratings. DC is geen reductiepercentage. De Pure Fine-functie blijft ongewijzigd; in deze workflow is R de huidige score van de bevroren beoordeling. Een ingevulde correctierating bewijst de werking van het gekozen plan niet. De oorspronkelijke Fine-ratings en deze lokaal gekalibreerde toepassing mogen niet stilzwijgend dezelfde bronstatus krijgen. Zie [de risicomethodiek](risk-methodology.md) voor de gecontroleerde oorspronkelijke publicaties en verschillen tussen de schalen.

Kinney/Wiruth: `J = R × scoreverbeteringsfractie / kostendeler`. De nominale fractie is hier het geselecteerde nominale scoreverschil gedeeld door de huidige nominale score. Dat is een expliciete IMA-toepassing op relatieve modelindices; het is geen gemeten ongevalskans. De oorspronkelijke pure functie accepteert uitsluitend een fractie tussen 0 en 1. Bij een onbevestigde vergelijking wordt geen bevestigde Kinney-uitkomst opgeslagen.

De conservatieve Kinney-ondergrens wordt uitsluitend weergegeven als de hele getekende verschilondergrens niet negatief is. Anders staat er “niet bevestigd”. De kostenratings en de kostendeler vragen een eigen lokale kalibratie; de app converteert historische dollarbedragen niet automatisch naar huidige eurobedragen.

AHS en haalbaarheid blijven afzonderlijke uitvoeringsprioriteiten volgens de vastgelegde lokale beleidsversie. De workflow bewaart de individuele prioriteiten voor de gekozen plannen, met hun AHS-gewicht en haalbaarheidsfactor. Die individuele scores worden niet opgeteld tot een fysieke pakketwerking. Een wettelijke markering blijft zichtbaar en gaat vóór optionele rangschikking. De kostenscore geeft geen automatische juridische vrijstelling of effectcontrole; uitvoering en verificatie lopen via de actiecyclus.

## Vastlegging, controle en export

Elke `JustificationRecord` bevat de bronbeoordelings-ID en -hash, het scenario-ID, selectie, kostenbasis en ratings, expliciet besluit, beoordelaar, redenering, UTC-tijdstip, risico-, justificatie- en beleidsversies, volledige berekeningsuitkomst en eigen canonical SHA256. De justificatie kan niet vóór de bronbeoordeling zijn gedateerd.

Bij import en export controleert de software de referenties, bronhash, eigen hash en volledige herberekening. Een aangepast resultaat met een nieuwe zelfgemaakte hash wordt dus nog steeds afgewezen als het niet uit die geselecteerde invoer volgt. De lokale hashes detecteren inhoudelijke verschillen; ze zijn geen onafhankelijke digitale handtekening of extern vertrouwensanker. Onbekende methode- of beleidsversies stoppen deze herberekening expliciet in plaats van stilzwijgend de huidige formule toe te passen.

De besluiten reizen mee in de volledige werkruimte-JSON en private GitHub-synchronisatie. Markdown- en afdrukrapporten tonen beide hashes, de gekozen maatregel-ID’s, ratings en kostenbasis, het besluit, getekende scoregrenzen, uitsluitingen en lokale beleidsfactoren. Oudere werkruimteversies zonder `justifications` betekenen een lege verzameling.

Implementatie: `web/src/data/justification.ts` en `web/src/components/JustificationWorkspace.tsx`. Betekenisvolle controles staan in `web/src/data/justification.test.ts` en `web/e2e/justification-workflows.spec.ts`: afzonderlijke maatregel versus ander plan, expliciet pakket, negatief verschil, afhankelijkheidspad, ontbrekend bewijs, nuluitgangswaarde, bron- en uitkomstmanipulatie, chronologie, latere wijzigingen, reload en rapportexport.
