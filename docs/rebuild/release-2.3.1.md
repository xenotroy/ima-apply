# IMA Apply 2.3.1 — herstelconcepten en aanvullende bronlezing

Deze versie beschermt aanvullende administratieve formulieren en actierevisies tegen verlies bij sluiten of herladen. Numerieke intervalinvoer blijft exact als concept behouden totdat zij geldig wordt vastgelegd. De appversie is `2.3.1`; nieuwe publieke vraagsnapshots gebruiken inhoudsversie `2.4.0`. Het werkruimteschema blijft versie 1 en de rekenmethode blijft `ima-risk/2.0.0`.

## Gedrag tijdens onderzoek

- Organisaties, locaties, afdelingen, onderwerpen, regelgeving en dossierreviews bewaren hun invulvelden, gemaakte keuzes en bronbasis. Gewijzigde ouders, dossiers en reeds vastgelegde nieuwrecord-ID's worden niet stil opnieuw gebruikt.
- Werkruimtenamen zijn herstelbaar. Het concept bij een nieuwe werkruimte wacht op de daadwerkelijke opslag van die nieuwe werkruimte, ook als een oudere opslag al is afgerond.
- Actierevisies bewaren de volledige onderbouwing, actor, bewijskeuze en effectcontrolevelden. Gewijzigd geselecteerd bewijs vraagt herbevestiging. Een andere werkruimte met dezelfde actie-ID krijgt haar eigen formulier en concept.
- W/B/E-reductie, initiatorfrequentie, IPL-PFD, conditionele kans en lokaal LOPA-criterium bewaren ook lege velden, `1e-`, `-` en omgekeerde intervallen. De huidige beoordeling blijft behouden als invoer ongeldig is. Geldige decimale komma's en punten zijn toegestaan; ruwe tekstbuffers worden niet in vastgelegde risicorecords opgeslagen.
- Markdown bevat de nog niet vastgelegde concepten. JSON bewaart de volledige vastgelegde werkruimte. Een concept van een ander tabblad of een nieuwere wijziging wordt niet door een oudere schrijfoperatie verwijderd.

Zie [interviewopslag](interview-saving.md) voor herstel, export en overdracht naar een andere pc. Lokale concepten blijven browsergebonden; een bewuste JSON-export of GitHub-upload biedt de overdrachtsroute.

## Inhoudelijke bronverwerking

Dertig extra beschikbare PDF-pagina's zijn gelezen en op pagina- en bronhash gecontroleerd. Cumulatieve dekking: PGA-32489 pagina's 1–16 van 20; de beschikbare PGA-32490-webprint 1–6 van 6; AI43 36 van 92 pagina's, inclusief drie inhoudsopgavepagina's. AI43 blijft een toegeschreven tekstkopie met ontbrekende figuren, zonder bewezen oorspronkelijke uitgeverslayout. Een geheel gelezen webprint is geen actuele wetsconsolidatie.

Negentien bestaande eigen vraagcriteria zijn aangescherpt. Alle 78 publieke vraag-ID's, zestien thema's en acht contentpakketten blijven behouden. Nieuwe publieke bronmetadata bevat de afgebakende officiële controles. Oudere bevroren vragen en dossiers behouden hun oorspronkelijke versies, tekst en hashes.

Een afzonderlijke private bronwerkruimte bewaart de bestaande 260 vragen, drie Moodle-lesconcepten en drie oude extracten ongewijzigd. Zij voegt dertig exacte paginatekstrecords, 21 afzonderlijke criteriumvoorstellen en drie review-/verificatie-/grensrecords toe. Die voorstellen zijn geen extra actieve vragen, vastgestelde beleidseisen of automatische risicocredit. De volledige PI-bank wordt niet door deze bronverwerking gewijzigd.

De [bronlezing](source-review-continued.md), het [bronregister](source-register.md) en de [brondekking](source-coverage.md) noemen de gebruikte scope en resterende originelen.

## Volledigheidsgrens

De [volledigheidsaudit](completion-audit-2026-10-11.md) benoemt concrete resterende betekenispariteit: de verbinding van bewijsversies met risicomaatregelen en uitvoeringsacties, binaire bewijsintegriteit, bijzondere actie-/incidentvelden, wettelijke impactrelaties en oorspronkelijke AI-/onderwijs-/LMS-bronnen. De oorspronkelijke `.history/actions/`-selectie wordt afzonderlijk behandeld in [oude actiegeschiedenis](legacy-action-history.md).

Een geslaagde herstelproef bewijst geen volledige herbouw. De [volledige goal](goal.md) blijft actief; lokale maatregelenwerking en een beoordeelde productieoverdracht zijn afzonderlijke acceptatiestappen.

## Verificatie

291 unittests, 66 import-/migratietests en 61 lokale Chrome-browserproeven slagen. TypeScript en de productiebuild met het GitHub Pages-pad slagen; de dependency-audit meldt nul kwetsbaarheden. De browserproeven controleren ook ongeldige numerieke tekst, vertraagde opslag, twee tabbladen, gewijzigde bewijsbasis, afzonderlijke werkruimten en daadwerkelijke Markdown-downloads.

De 56 migratietests omvatten 21 aanvullende gevallen voor oude actierevisies. Een onafhankelijke review controleerde daarnaast vijf afzonderlijke reproducties van revisielexemen, voorgangerwaarden en Unicode-ID's: bronbytes, teksthash, manifesthash, browserimport en ongewijzigde fixtures. Er is in deze versie geen werkelijk productieactiearchief gemigreerd.

Acht aanvullende bronartefacten zijn create-only in de private repository opgeslagen. Twee afzonderlijke volledige terugleesoperaties per artefact bevestigen de exacte inhoud. De nieuwe bronwerkruimte `workspaces/bronwerkruimte-reviewed-continued-2026-10-11.json` is 595.111 UTF-8 bytes en bevat 260 vragen, twintig bronverwijzingen en zestig private contentrecords. De private PI-bank bleef ongewijzigd. Deze controles bewijzen de beschreven bronoverdracht; zij bewijzen geen inhoudelijke bekrachtiging van de criteriumvoorstellen of inrichting van iedere persoonlijke pc.
