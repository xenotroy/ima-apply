# Brondekking na de vervolgcontrole

Peildatum: 7 oktober 2026. **Hoge zekerheid** over de hieronder vastgelegde leestellingen, lokale beschikbaarheid en private intake. De controle is begrensd tot gerichte actieve bronroutes; er is geen volledige inventarisatie van alle opslag, alle opleidingen of een live LMS uitgevoerd.

De publieke app bevat **78 eigen checkvragen in 16 thema’s**. Daarnaast is een afzonderlijke private intake van **260 oorspronkelijke vragen uit tien themavragenlijsten** gemaakt. Deze aantallen zijn verschillende verzamelingen en mogen niet als één gepubliceerde vragenbank worden gepresenteerd. Oorspronkelijke projectvragen, lokale bevindingen, gelicentieerde publicatietekst en deelnemersgegevens zijn niet naar de publieke catalogus gekopieerd.

## Werkelijk verwerkt

| Bron-ID | Gelezen broninhoud | Private verwerking | Grens |
| --- | --- | --- | --- |
| `VAULT-QSET` | Alle 260 vraagteksten, toetsingscriteria en verificatie-aanwijzingen in tien oorspronkelijke themalijsten | Tien bronrecords, tien thema’s, 260 vragen; kern/verdieping, normverwijzingen en documentmetadata behouden | Geen nieuw juridisch oordeel over alle normverwijzingen; geen projectuitkomsten als algemene feiten gepubliceerd |
| `PGA-32489` | Oorspronkelijke PDF-pagina’s 2 en 7 van 20 pagina’s | Inzichten vertaald naar eigen algemene vragen; oorspronkelijke tekst niet opgenomen | Geselecteerde pagina’s over AHS/procesnormen, RI&E/PvA, actualisering en voorlichting |
| `PGA-32490` | Oorspronkelijke PDF-pagina 1 van 6 pagina’s | Algemene bronlaag en scope in eigen formuleringen | Geen volledige lezing van de publicatie |
| `SDU-AI43` | Oorspronkelijke PDF-pagina’s 11–13 en 37–39 van 92 pagina’s; §§2.2–2.4 en 5.10–5.12 | Eigen vragen over methodekeuze, RI&E, grondoorzaken en implementatie | Geen volledige lezing van het AI-blad |
| `SDU-AI82` | Pagina’s 7–8 van een 28 pagina’s tellend samengesteld praktijkdossier; hoofdstuk 3 | Eigen vragen over PSA-inventarisatie, instrumentkeuze, participatie en haalbare verbeteringen | Secundaire bronnenbundel; het oorspronkelijke volledige AI-blad is niet gelezen |
| `EDU-HVK`, `EDU-MVK` | Secundaire curriculum-/competentiematrix en vergelijking van opleidingsinhoud | Eigen thema’s en oefenvragen voor inventarisatie, maatregelen, onderzoek en verificatie | De onderliggende volledige oorspronkelijke onderwijs- en toetsbronnen zijn niet opnieuw geverifieerd |
| `LMS-MOODLE` | Drie volledige oorspronkelijke conceptteksten voor lesontwikkeling | Drie private tekstrecords, nul gesynthetiseerde vragen | Lesontwikkeling is geen geverifieerde live cursusinhoud of Moodle-export |

Het [bronnenregister](source-register.md) beschrijft de overige bron-ID’s en de exacte geselecteerde PDF-scope. De metadata in de publieke catalogus vermeldt afzonderlijk leesstatus en publicatiestatus.

## Dekking van de tien private themalijsten

De eerdere controle omvatte alleen werken, PSA en brand/BHV: samen 78 vragen. De vervolgcontrole heeft de **resterende zeven lijsten met 182 vragen** inhoudelijk beoordeeld op vraagtekst, beoordelingscriteria en bewijsaanwijzingen. De private intake bevat daardoor alle tien themalijsten.

| Thema | Totaal | Kern | Verdieping |
| --- | ---: | ---: | ---: |
| Werkorganisatie, bezetting en taakverdeling | 24 | 14 | 10 |
| Agressie en geweld | 30 | 18 | 12 |
| Alleen werken, alarmering en noodcommunicatie | 24 | 15 | 9 |
| PSA, werkdruk en sociale veiligheid | 24 | 15 | 9 |
| Brandveiligheid, BHV en evacuatie | 30 | 25 | 5 |
| Binnenklimaat, ventilatie, verlichting en geluid | 28 | 21 | 7 |
| Elektrische veiligheid en apparatuur | 26 | 17 | 9 |
| Biologische agentia, hygiëne en infectiepreventie | 28 | 20 | 8 |
| Kantoorwerk, beeldschermwerk en ergonomie | 22 | 15 | 7 |
| Gebouw, inrichting, lopen en bewegen | 24 | 17 | 7 |
| **Totaal** | **260** | **177** | **83** |

De samengestelde 60-minutenvariant is een afgeleide selectie en is niet als extra oorspronkelijke vragenlijst geïmporteerd. De tabel geeft inventarisatieomvang; zij beweert geen volledige toepasselijkheid op iedere andere organisatie.

De technisch gecontroleerde private uitvoer is `private-data/pi-vught-questionnaires.json`, met schema `ima.content/v1` en publicatiestatus `private`. Alle 260 vragen behouden toetsingscriteria, verificatie en normverwijzingen. Alle tien bronrecords behouden aanwezige documentmetadata, bronbasis en thematische afsluitregels. Volledige oorspronkelijke Markdown-bestanden en dossierbevindingen zijn niet als ruwe records opgenomen. Documentvoeten worden afzonderlijk verwerkt, zodat de afsluitregel en bronbasis niet in de laatste vraag worden ingesloten.

## Algemene lessen voor vraagstelling en maatregelbeoordeling

De vervolgcontrole ondersteunt de volgende eigen algemene beoordelingsprincipes. Dit zijn ontwerpconclusies; onderstaande tekst bevat geen oorspronkelijke vragen of operationele bijzonderheden.

- **Werkorganisatie:** beoordeel naast aantallen ook taakcombinaties, ervaring, overdracht en de mogelijkheid om veilig te stoppen of te escaleren. Een bezettingsschema alleen bewijst niet dat capaciteit op het kritieke moment beschikbaar is.
- **Agressie en alleen werken:** toets veranderende omstandigheden, bereikbaarheid van hulp, feitelijke responstijd en uitvoerbaarheid onder belasting. Melding, acute hulp en nazorg hebben verschillende functies en vragen afzonderlijk bewijs.
- **Binnenklimaat en geluid:** kies representatieve plekken, taken, bezetting en perioden. Onderhoudsregistratie bewijst niet vanzelf voldoende werking tijdens gebruik. Een gemelde klacht vraagt onderzoek; zij is geen diagnose. Beoordeel ook of geluid noodzakelijke communicatie of signalering belemmert.
- **Elektrische veiligheid:** maak verantwoordelijkheden en grenzen tussen gebruikerscontrole en deskundige inspectie expliciet. Leg defectbeheersing, herstel en hercontrole vast. Onderzoek ook tijdelijk materiaal en omstandigheden waarin de gebruikelijke maatregelen onvoldoende dekking hebben.
- **Biologische blootstelling:** beschrijf taak, contactroute en gebruiksconditie. Onderzoek beschikbaarheid én werkelijk gebruik van middelen, interfaces met schoonmaak en onderhoud, en de afgesproken route na blootstelling. Een tekstuele procedure is geen bewijs dat die route tijdig werkt.
- **Ergonomie:** beoordeel taakduur, afwisseling en de demonstratie van instellingen, vooral bij gedeelde werkplekken. Een aanwezige verstelvoorziening biedt pas bescherming wanneer zij werkt, passend is ingesteld en wordt gebruikt.
- **Gebouw en routes:** controleer de werkelijke activiteit en tijdelijke veranderingen op locatie. Interviewinformatie vraagt fysieke verificatie waar inrichting, doorloop, toegankelijkheid of gebreken bepalend zijn.

Voor risico-effectiviteit volgt hieruit steeds dezelfde afzonderlijke onderbouwing: welk scenario wordt beïnvloed, welk onderdeel van de kans/blootstelling/ernst verandert, in welke omstandigheden werkt de maatregel, en welk bewijs ondersteunt die werking? Beschikbaarheid, gebruik, testresultaat en menselijke afhankelijkheid mogen niet uit één positief antwoord worden afgeleid. AHS en eenvoudige haalbaarheid ondersteunen maatregelkeuze en uitvoeringsvolgorde; zij leveren op zichzelf geen extra fysiek risicoreductiepercentage.

## Oorspronkelijk HVK/MVK-materiaal: gevonden, inhoud niet toegankelijk

De gerichte OneDrive-controle heeft **138 relevante oorspronkelijke bestanden** geselecteerd in lesmateriaalroutes voor riskmanagement, RI&E, maatregelen en uitvoering. Alle 138 hadden **0 lokaal toegewezen blokken**. Dit is beschikbaarheidsmetadata, geen inhoudelijke lezing. Daarnaast zijn zes vermeldingen van oorspronkelijke HVK/MVK-curriculumdocumenten en een docentenhandleiding gecontroleerd; ook deze hadden geen lokaal toegewezen inhoud. Deze tweede selectie kan niet zonder deduplicatie bij het eerste aantal worden opgeteld.

Concrete geselecteerde routes omvatten:

- *Principes van riskmanagement 2 — Risico analyse v2025-06* en *RI&E v2025-04*;
- *AI-45 Risicobeheersing*, *AI-61 Risico-inventarisatie en -evaluatie*, een document met praktijkvoorbeelden van risicobeoordeling en een document met een Kinney-Wiruth-risicobeoordelingsmethode;
- oorspronkelijke HVK-opleidingsinhoud, MVK-leerdoelen, MVK-module-indeling en een handleiding voor de onderwijsomgeving.

De oorspronkelijke riskmanagementpresentatie kon niet worden geopend: een begrensde content-read gaf een timeout. Er is geen herhaald langdurig downloadproces gestart. De in de secundaire opleidingsdatabase beschreven map met 114 lokale bronkopieën was op de gecontroleerde route niet aanwezig. Een operationele lesmateriaalroute leverde eveneens een timeout op; de inhoud daarvan is niet als afwezig aangemerkt.

De oorspronkelijke inhoud is **verwerkbaar zodra een toegankelijke lokale kopie of een gecontroleerde tekstexport beschikbaar is**. Zij is nu geen bewezen bron voor het claimen van specifieke rekenregels, lesdoelen, toetscriteria of volledige opleidingsovername. De huidige importer verwerkt geen PDF, DOCX of PPTX rechtstreeks.

## Moodle/LMS: conceptmateriaal gelezen; concrete export niet gevonden

De volgende drie lesontwikkelingsteksten zijn volledig gelezen en privé behouden:

1. Hoofdintro van de lesdag gevaarlijke stoffen: broninformatie, blootstelling, beoordeling, maatregelen en borging.
2. Lesdagkaart Seveso/Bal/ARIE: procesveiligheid en analysemethoden, met de status van conceptontwikkeling.
3. Lesdagkaart BHV, bedrijfsnoodplan en gebouwveiligheid in relatie tot brand: noodorganisatie, gebouw en oefening, eveneens conceptontwikkeling.

`private-data/moodle-authoring-content.json` bevat drie bronrecords met oorspronkelijke Markdown-tekst. De importer heeft **nul vragen** uit dit lesproza afgeleid en geeft voor iedere bron expliciet aan dat geen checkvragen zijn gesynthetiseerd. Deze inhoud mag niet worden gelabeld als een actuele export van de LMS-cursus of als bewezen cursusdeelname.

In de succesvol geïnventariseerde actieve lesmateriaalroute en lokale downloadroute is geen concrete Moodle-CSV, MBZ-cursusback-up of Moodle-XML aangetroffen. De operationele OneDrive-lesmateriaalroute bleef ontoegankelijk; daardoor is geen complete afwezigheidsclaim mogelijk. Het gecontroleerde browservenster bevatte geen identificeerbare open Moodle-sessie. Er is geen live cursus geopend, geen deelnemersrecord gelezen en geen externe login of download gestart.

De bruikbare volgende bronvormen zijn een cursusback-up, vragenbankexport of gerichte cursus-/voortgangs-CSV uit de werkelijke onderwijsomgeving. CSV met vraagkolommen kan als private vragenbank worden geïmporteerd. CSV zonder vraagkolom levert bronmetadata en aantallen; zonder expliciete optie worden geen deelnemersrijen bewaard. MBZ/XML vragen eerst een gecontroleerde conversie. Cursusvoltooiing of een toetsresultaat vormt afzonderlijk leerbewijs en mag niet rechtstreeks worden omgezet in maatregelwerking of risicoreductie.

## Verificatie en resterende dekking

De tien importer-tests controleren normalisatie, documentgrenzen, CSV, legacy JSON, privacy en uitvoerlocatie. De echte private vragenlijsten zijn daarnaast op aantallen en veldbehoud gecontroleerd: 260 vragen, 177/83 routes, tien bronrecords met documentgegevens en nul ruwe dossierrecords. De drie lesconcepten leveren drie tekstrecords en nul vragen. Beide private outputbestanden vallen onder `.gitignore`; de bronbestanden en de vault zijn niet gewijzigd.

De inhoudelijke herbouw kan nu de volledige private themavragenset gebruiken. Volledige integratie van oorspronkelijke HVK/MVK-lesinhoud en actuele Moodle/LMS-data blijft open door concrete toegangsgrenzen. Bronnen met alleen metadata zijn daarom zichtbaar als bronroute en krijgen geen status van inhoudelijk verwerkt materiaal.
