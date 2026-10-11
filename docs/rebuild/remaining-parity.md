# Concrete functiepariteit en resterende grenzen

Audit bijgewerkt op 11 oktober 2026 voor versie 2.3. De in versie 2.2 ontbrekende beheerde vraagdefinities, response-relaties en herbruikbare risicobibliotheek hebben nu browsertegenhangers. Een nieuwe browserworkflow en een reconstructie van niet aangetroffen historische gegevens zijn verschillende prestaties.

## In versie 2.3 gerealiseerd

| Oorspronkelijke betekenis                                                                                                                                                    | Browsertegenhanger en behoud                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vraagdefinities met afzonderlijke tekst, toelichting, acceptatiecriteria en verwacht bewijs; status, semantische versie, contentpakket, voorganger, onderwerp/wetgeving/tags | Beheerde vraagdefinities; hogere opvolgerversies binnen hetzelfde pakket; rijke velden behouden. Nieuwe dossiers selecteren actieve definities en bevriezen alle definities van de gekozen pakketversie, inclusief niet geselecteerde concept-/retired definities. Mixed pakketversies en late toevoegingen aan een bevroren pakket worden geweigerd. |
| Responses met respondent en meerdere waarneming-/bewijs-/bevindingrelaties; inverse relaties                                                                                 | Nieuwe invoer verlangt een bewuste actor. Dezelfde response-ID blijft bij wijzigingen behouden. Waarneming- en bevindinglinks worden atomair in beide richtingen gecontroleerd binnen dezelfde dossierscope. Bewijslinks krijgen bestaans- en scopecontrole. Historisch ontbrekende auteurs blijven onbekend.                                         |
| Herbruikbare gevaar → risico → factor-bibliotheek, gedeelde maatregelen, factorgebonden vragen, lokale ratings en kaartposities                                              | Geversioneerde, gehashte bibliotheekgraph met gedeelde factor–maatregelkoppelingen. Afzonderlijke scopes bewaren eigen reviews en layouts. Bewuste invoer maakt een nieuw scenario met menselijke W/B/E-keuze; bibliotheekratings worden niet in Kinney-reductie omgezet.                                                                             |
| Rijke oorspronkelijke vraag-/bibliotheekvelden in migratie                                                                                                                   | Markdown en SQLite gebruiken de echte browservalidator. Actuele exports bewaren alle 248 oorspronkelijke raw records en projecteren aantoonbare rijke velden, graph, reviews en layouts. Ambigue of ontbrekende relaties blijven raw met waarschuwing.                                                                                                |

Zie [vraagdefinities](question-definitions.md), [response-relaties](response-relations.md), [risicobibliotheek](risk-library.md) en [migratie](migration.md) voor de precieze grenzen.

De oorspronkelijke bibliotheekkopie bevat 1 gevaar, 3 risico's, 5 factoren, 6 gedeelde maatregelen, 10 koppelingen, 5 beoordelingsvragen, 2 scoped factorratings en 38 layouts. Oorspronkelijke 1–3-ratings blijven ordinale screening; `IsInPlace` bewijst geen effectiviteit, `ReductieScore` is geen percentage of PFD en `Technisch` bepaalt niet automatisch het AHS-niveau.

## Historische gegevens die niet kunnen worden ingevuld

- Een huidige vraagdefinitie of exportfreeze bewijst niet welke vraagversie bij een ouder antwoord is gebruikt. Alleen aantoonbaar vastgelegde historische versies worden overgenomen. `legacy-import/1.0.0` bij onbekende SQL-vraagversies benoemt de migratieprojectie, niet een bewezen oorspronkelijke versie.
- De geselecteerde SQLite-antwoorden hebben geen betrouwbare respondentkolom. De dertien UTC-reviewresponses blijven daarom expliciet zonder historische auteur, met waarschuwingen. Een beoordelaarsnaam wordt niet als respondent ingevuld.
- Tijdzonevrije oorspronkelijke datums blijven raw in de standaardexport. De afzonderlijke UTC-review is een expliciete interpretatie; zekerheid over historische herkomst blijft matig.
- De oorspronkelijke `AddChildNode`-functie was voorbereid zonder opslag. Volledige handmatige graph-CRUD is geen bewezen werkende oorspronkelijke workflow. Het beheer van geversioneerde imports en bestaande nodes is geïmplementeerd.
- Een volledige oorspronkelijke transitiehistorie voor vraagstatus is niet aangetroffen. Nieuwe statuskeuzes reconstrueren die geschiedenis niet.

## Bron- en praktijkwerk dat overblijft

De PI-bibliotheek en router ondersteunen afbakening, documentonderzoek, rondgangen en interviews. De 1.300-vragenbank is een bewaarde bronmomentopname, geen bewijs van de complete actuele Porterbank of van lokale maatregelenwerking. Bronvraagkoppelingen zijn kandidaatmapping totdat een deskundige procesblokdekking en lokale toepasselijkheid bevestigt. De browser is geen uitgevoerde wijziging in RI&E Porter.

De nog ongelezen oorspronkelijke HVK/MVK-materialen, inhoudelijke AI-45/AI-61-bronnen en werkelijke actuele Moodle/LMS-data blijven brontaken. Geselecteerde extracten en drie lesconcepten bewijzen geen volledige bronintegratie. API- en Chrome-overdracht bewijzen geen inrichting van ieder persoonlijk apparaat of inhoudelijk bekrachtigde klantoverdracht.

De [volledige herbouwgoal](goal.md) blijft actief. Zie het [bronregister](source-register.md), [brondekking](source-coverage.md) en [toegangsvervolg](source-access-followup.md).

## Volledigheidscontrole na versie 2.3

De [audit van 11 oktober](completion-audit-2026-10-11.md) benoemt concrete resterende betekenispariteit en acceptatiegevallen voor bewijsversies bij risicomaatregelen, binaire bewijsintegriteit, afzonderlijke actiecontext, bijzondere incidentvelden en directe wettelijke impactrelaties. Het selectiegat voor oude actiearchieven is in [2.3.1](legacy-action-history.md) hersteld en met fictieve brongevallen gecontroleerd; een werkelijk productiearchief is nog niet geselecteerd en overgedragen. De oorspronkelijke tabellen zijn geen bewijs dat de overige ketenvereisten al zijn afgerond. De extra bronlezing en herstelconcepten van [2.3.1](release-2.3.1.md) sluiten hun eigen controlepunten; de volledige goal blijft actief.
