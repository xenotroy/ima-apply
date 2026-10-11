# Concrete resterende functiepariteit

Audit op 11 oktober 2026, na de uitbreiding voor moduleplannen en maatregeljustificatie. Dit document benoemt werkende oorspronkelijke functies die nog geen volledige browsertegenhanger hebben. Het breidt de opdracht niet uit met alleen voorbereide interfaces.

## Beheerde vraagdefinities en responses

De oorspronkelijke `RieQuestionDefinitionRecord` in `src/RieBuilder.Ima/Models/RieModels.cs` bewaart afzonderlijke vraagtekst, toelichting, acceptatiecriteria en verwacht bewijs; vraagstatus draft/active/retired; semantische vraag- en contentpakketversie; voorganger; meerdere onderwerp-/wetgevingsrelaties en tags. `AddRieQuestionDefinitionCore` in `ImaWorkspace.Rie.cs` verlangt bij een opvolger hetzelfde pakket en hogere vraag- én pakketversie. Een pakketversie waaraan een assessment refereert mag geen nieuwe definities krijgen.

De oorspronkelijke assessmentworkflow selecteert actieve definities, gebruikt één versie per pakket en bevriest de hash van alle definities in die pakketversie, naast de gekozen vragen. De browser bevriest nu geselecteerde vragen en moduleplannen. Dat is waardevol inhoudsbehoud, maar geen volledig beheerde pakketversie. De huidige Markdown-projectie voegt toelichting en criteria samen. De rijke SQLite-vraagvelden gevaar, risico, risicofactor, technische/organisatorische maatregelen, basisoorzaken en cultuur blijven vooral raw.

Responses bewaren oorspronkelijk de respondent en meerdere waarneming-/bewijs-/bevindingrelaties. Waarnemingen en bevindingen kunnen terugverwijzen naar meerdere responses. De browser heeft dossier-ID, vraaghash, snapshot en bewijslinks; auteur en beide overige response-relaties ontbreken nog. Versie 2.2 controleert wel dat een ingevuld `contentVersion` overeenkomt met de bevroren vraagversie. Een ontbrekend historisch label blijft onbekend.

Vervolgacceptatie:

- Eén gestructureerde definitie met afzonderlijke inhoudsvelden, broncontext, versie/status en opvolger; geen los bewerkbare kopieën van dezelfde vraag.
- Nieuwe dossiers gebruiken actieve definities. Mixed pakketversies en late wijzigingen van een bevroren pakket worden geweigerd; eerdere dossiers behouden hun inhoud.
- Vraagversie 1 blijft volledig leesbaar en reproduceerbaar na invoering van versie 2, inclusief rijke velden en pakketfreeze.
- Nieuwe responses leggen een auteur vast. Historisch ontbrekende auteurs blijven onbekend. Meerdere response-relaties blijven intact na reload/export; relaties naar andere dossiers worden geweigerd.
- Migratie koppelt alleen aantoonbare bestaande doelen, in twee passen; ontbrekende of ambigue relaties blijven raw met waarschuwing.

Een volledige oorspronkelijke statusovergangs-API of desktopvraagbeheerinterface is niet aangetroffen. Een uitgebreide transitiehistorie is dus een mogelijke verbetering, geen bewezen bestaande workflow die ontbreekt.

## Herbruikbare risicobibliotheek

`src/RieBuilder.Data/Services/RieRepository.RiskMap.cs` implementeert bibliotheekimport/upsert, gevaar → risico → risicofactor, factorgebonden beoordelingsvragen, gedeelde maatregelen via many-to-many koppelingen, lokale scopebeoordelingen en kaartposities. Reductie- en kostenratings behoren bij de factor–maatregelkoppeling. `RiskMapViewModel.AddChildNode` is expliciet voorbereid zonder opslag; volledige handmatige node-CRUD was geen werkende oorspronkelijke functie.

De gecontroleerde private kopie bevat 1 gevaar, 3 risico’s, 5 factoren, 6 maatregelen, 10 koppelingen, 5 beoordelingsvragen, 2 scoped factorratings, 0 scoped maatregelratings en 38 layouts. De migratie bewaart deze rijen raw en projecteert factorratings naar open bevindingen. Concrete Kinney-scenario’s vervangen de herbruikbare graph niet.

Vervolgacceptatie:

- Eén geversioneerde bibliotheekgraph met bronhash, codes, beschrijvingen, volgorde, moduleherkomst, beoordelingsvragen/toelichting en expliciete gedeelde maatregelkoppelingen.
- Afzonderlijke dossiergebonden screenings/reviews met exacte bibliotheek-/nodeverwijzing en oorspronkelijke methodebetekenis.
- Twee factoren kunnen dezelfde maatregel gebruiken; twee afdelingen kunnen verschillende lokale beoordelingen bewaren. Wijzigen van één scope verandert de andere niet.
- Graph-/boomweergave, module-/scopefilter, vraagtoelichting en bewuste doorgang naar een nieuw Kinney-/LOPA-scenario. Behouden layouts verwijzen naar getypeerde nodes.
- Latere bibliotheekversies herschrijven eerdere lokale beoordelingen niet; volledige JSON-overdracht behoudt graph en relaties.

Oude 1–3-ratings blijven lokale ordinale ratings. `Technisch` wordt niet automatisch AHS-bronaanpak; `IsInPlace` wordt niet bewijs van effectiviteit; `ReductieScore` wordt geen percentage of PFD. Oude type-, kosten- en afnemende-opbrengstgewichten waren lokale rangschikking, geen fysische effectmodellering.

## Externe bron- en praktijkgrenzen

De nog ongelezen oorspronkelijke HVK/MVK-materialen, AI-45/AI-61 en werkelijke Moodle/LMS-data blijven afzonderlijke brontaken. Geselecteerde bronextracten en drie lesconcepten zijn geen volledige bronintegratie. API- en browseroverdracht bewijzen geen inrichting van ieder persoonlijk apparaat of inhoudelijk bekrachtigde klantoverdracht. Zie [bronregister](source-register.md), [toegangsvervolg](source-access-followup.md) en [goal](goal.md).
