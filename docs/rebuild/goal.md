# Goal — volledige herbouw van IMA Apply

Status: **actief**. Vastgelegd op 7 oktober 2026 op verzoek van de gebruiker: “maak hier een goal van dus”. Dit document concretiseert de oorspronkelijke herbouwopdracht; het verkleint die opdracht niet tot de reeds gepubliceerde browserapp.

## Doel

Bouw IMA Apply opnieuw op tot een volledige, bruikbare veiligheidswerkruimte, met de huidige kennis uit de actieve vault en relevante oorspronkelijke vragenlijsten, naslagwerken, opleidingsmaterialen en Moodle/LMS-data. Werk de risicobeoordeling en effectiviteit van beheersmaatregelen inhoudelijk en technisch uit, met expliciete AHS-voorkeur, justificatie en uitvoerbaarheid. Maak de maatregelwerking overtuigend zichtbaar. Publiceer en onderhoud de software op GitHub en maak dezelfde dossiers bruikbaar vanaf meerdere pc’s met één account.

De concrete scope komt uit de oorspronkelijke gebruikersopdracht. `README.md`, `CONTEXT.md` en de bestaande code beschrijven de software waarvan de functies bij de volledige herbouw moeten worden beoordeeld. De bronstatus staat in `source-register.md`; de huidige implementatiegrenzen staan in `architecture.md`.

## Eindcriteria en huidig bewijs

| Onderdeel van de opdracht | Eindcriterium | Huidige stand en bewijs |
| --- | --- | --- |
| Volledige herbouw | Inventariseer bestaande functies, leg de vertaling naar de nieuwe architectuur vast en bewijs de belangrijkste werkprocessen in de nieuwe software. Een verwijderde of ontbrekende functie wordt niet stil als voltooid beschouwd. | Browserkern aanwezig. `README.md` bevat ook onderwerpen, wetgevingsbeheer, aparte RI&E-dossierrecords, analyses, basisrisicofactoren, moduleversies en blootstellings-KPI’s; de nieuwe `web/src/data/model.ts` bevat hiervoor nog geen volledige overeenkomstige modellen. Functiepariteit is nog niet aangetoond. |
| Actuele vaultkennis | Gebruik de kleinste relevante actieve bronnen; leg herkomst, versie en onderscheid tussen bron, interpretatie en projectbewijs vast. | Gericht geselecteerde vaultcontext verwerkt in catalogus en ontwerp. Het bronregister noemt de werkelijk gelezen scope. Verdere benodigde bronverwerking blijft onderdeel van dit goal. |
| PI Vught en extra vragenlijsten | Verwerk relevante oorspronkelijke vragenstructuren en thema’s tot bruikbare inventarisatie, bewijs en vervolgacties; private inhoud blijft private. | Generieke catalogus en private importer aanwezig. Drie oorspronkelijke lijsten technisch onderzocht; zeven andere aangetroffen lijsten vragen nog een inhoudelijke scopebeoordeling. Geen bewijs dat alle voor de herbouw benodigde themalijsten zijn verwerkt. |
| Praktijkgids Arbeidsveiligheid en SDU AI-bladen | Verwerk relevante oorspronkelijke inhoud in criteria, vragen, methodekeuze en beheersing, met traceerbare gelezen scope en bronstatus. | Geselecteerde Praktijkgids-, AI-43- en samengesteld PSA-dossierpassages verwerkt. AI-45 en AI-61 zijn metadata/cloudplaceholders; inhoudelijke verwerking is nog niet bewezen. |
| HVK- en MVK-lesmateriaal | Gebruik relevante oorspronkelijke lesinhoud voor risicomethodiek, inventarisatie, praktijktoepassing en verificatie. | Secundaire curriculum- en competentieanalyses verwerkt. Geselecteerde oorspronkelijke decks konden nog niet inhoudelijk worden gelezen; een bruikbare oorspronkelijke HVK/MVK-bronset is nog niet aangetoond. |
| Moodle/LMS-data | Verwerk daadwerkelijk beschikbare relevante leergegevens of cursusinhoud via een gevalideerde export of passende verbinding. Houd deelname, toetsresultaat en praktijkbekwaamheid onderscheiden. | CSV-intake aanwezig. Het bronregister vermeldt geen verwerkte werkelijke LMS-export of cursusbackup. De opdracht schrijft niet automatisch een permanente API-verbinding voor; een lege importmogelijkheid bewijst evenmin inhoudelijke integratie. |
| Effectiviteit en risicoreductie | Onderbouw werking per scenario en aangrijpingspunt; behandel bereik, beschikbaarheid, toepassing, bewijs, onzekerheid en afhankelijkheid expliciet. Scheid huidig risico van geplande verbetering. | Geïmplementeerd in `web/src/domain/risk.ts`, controleformulieren en tests. Werkelijke werking van lokale maatregelen vereist passend projectbewijs; demonstratiepercentages worden niet als empirische kalibratie aangemerkt. |
| AHS en justificatie | Maak bron-/collectieve voorkeur en eenvoudig haalbare maatregelen zichtbaar in de keuzeprioriteit. Houd prioriteitsbonus gescheiden van daadwerkelijke risicoreductie en noodzakelijke maatregelen. | AHS-gewichten, haalbaarheidsmultiplier en marginale prioriteit aanwezig. Historische Fine- en Kinney-calculators zijn afzonderlijk uitgewerkt. Lokale beleidsgewichten zijn expliciet benoemd. |
| Risicomodellen | Werk Fine–Kinney/Wiruth en vooral LOPA correct uit; onderzoek andere statische modellen en verantwoord methodekeuze, eenheden en toepassingsgrenzen. | Kinney- en LOPA-engines aanwezig; andere modellen inhoudelijk besproken in `risk-methodology.md`. De oorspronkelijke opdracht vereist onderzoek naar andere modellen, niet automatisch een volledige rekenengine voor iedere besproken methode. |
| Visuele risicobeoordeling | Toon begrijpelijk en aantrekkelijk hoe afzonderlijke maatregelen het scenario veranderen, inclusief initieel/huidig/prognose, factorwerking, onzekerheid en uitsluitingen. | Ruimtelijke scoreprojectie, maatregelverloop en aparte LOPA-frequentiegrafiek aanwezig. Reken- en browserproeven onderbouwen de huidige interacties. Een mooie weergave alleen bewijst geen juiste lokale inschaling. |
| GitHub en meerdere pc’s | Bewaar code, documentatie en releases op GitHub. Demonstreer hetzelfde dossier op afzonderlijke apparaten/sessies met één account, inclusief conflictbehoud, private opslag en herstel. | Publieke apprepository en private datarepository aanwezig. GitHub Contents-sync is geïmplementeerd en met de echte API beproefd. De persoonlijke toegang op ieder daadwerkelijk gebruikt apparaat en volledige praktijkworkflow blijven bij de eindcontrole te verifiëren. |
| Bestaande dossiers en overdracht | Leg een gecontroleerde overdrachtsroute vast en voorkom gegevensverlies of onbewezen omzetting van oude risicoratings. | Legacy vragen-JSON importeerbaar. SQLite-projectdossiers en bestaande Markdown IMA-dossiers zijn volgens `architecture.md` nog niet gemigreerd. De juiste mapping moet onderdeel van de herbouwaudit worden. |

## Uitvoeringsvolgorde voor verdere goalbeurten

1. Maak een functie- en datapariteitsmatrix vanuit de bestaande code en actuele projectcontext. Ontwikkel ontbrekende essentiële werkprocessen en migratiemapping vanuit die matrix; vervang de oorspronkelijke scope niet door uitsluitend de huidige zeven browsercollecties.
2. Werk de brondekking verder uit: beoordeel resterende relevante PI Vught-themalijsten en beschikbare oorspronkelijke Praktijkgids-/SDU-/HVK-/MVK-materialen. Onderzoek concrete toegang of leesbare exports voor cloudplaceholders. Registreer ontbrekende toegang eerlijk.
3. Verwerk werkelijke Moodle/LMS-brondata zodra de concrete bron beschikbaar is. Kies het passende intakepad op basis van het bronformaat; verzin geen dataset of koppeling.
4. Verbind broninhoud, scenario’s, bewijs, analyses en verbeteracties. Controleer de effectinschaling met concrete, brongetrouwe scenario’s en behoud de scheiding tussen risicoscore, frequentie en uitvoeringsprioriteit.
5. Verifieer de volledige werkstroom, migratie/overdracht, rapportage en gebruik vanuit afzonderlijke browsers/apparaten. Publiceer gecontroleerde verbeteringen via GitHub.

Een externe toegangsbeperking voor één bron verhindert niet het doorwerken aan onafhankelijke onderdelen. Markeer het goal pas als geblokkeerd volgens de geldende herhaalde-blokkadeaudit wanneer geen betekenisvolle veilige vervolgstap meer bestaat.

## Afsluitregel

Dit goal blijft actief totdat de volledige opdracht aantoonbaar is uitgevoerd. Een werkende demo, groen testresultaat, gepubliceerd GitHub-project of gedeeltelijk gelezen bronpakket is op zichzelf geen volledige afronding.

De eindcontrole herleidt ieder criterium hierboven naar actuele bestanden, concrete broninhoud, passende tests, migratiebewijs, bruikbare rapporten en daadwerkelijk runtimegedrag. Gebruik de testdekking die bij het betreffende criterium hoort; presenteer een beperkte test niet als bewijs voor een bredere integratie.

## Inspectie bij vastlegging

- Lokale herbouwcommits: `ec33835` en `f4e039b`.
- Gecontroleerde publieke hoofdbranch: `37e4c51e9a1231769ce27e3786aa0287007fcbd7`.
- [GitHub-repository](https://github.com/xenotroy/ima-apply).
- [Gepubliceerde app](https://xenotroy.github.io/ima-apply/).
- [Laatste gecontroleerde publicatieworkflow](https://github.com/xenotroy/ima-apply/actions/runs/37675669711): `success` op het moment van vastlegging.
- Private dossieropslag: `xenotroy/ima-apply-workspaces`; repositoryprivacy opnieuw gecontroleerd.
- Huidige bron- en implementatiegrenzen: `source-register.md`, `architecture.md`, `risk-methodology.md` en `web/src/data/model.ts`.

Deze inspectie bevestigt voortgang en een publicatiebasis. Zij bewijst niet dat alle eindcriteria zijn behaald. Zekerheid over deze statusvaststelling: **hoog**.
