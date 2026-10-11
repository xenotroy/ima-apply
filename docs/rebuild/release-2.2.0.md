# IMA Apply 2.2.0 — moduleplannen en maatregeljustificatie

Deze uitbreiding bewaart de modulekeuze per project/afdeling en de onderbouwing van een gekozen maatregelbesluit. Het additieve browserdataschema blijft versie 1; de fysieke rekenmethode blijft `ima-risk/2.0.0`.

## Resultaat

- Moduleplannen bewaren selectie, oorspronkelijke module-identiteiten, vraagvolgorde, scopenotities, bronverwijzingen en revisie. Nieuwe dossiers bevriezen plan en vragen met hashes, inclusief onbeantwoorde vragen. Een latere planwijziging verandert dat dossier niet.
- Justificaties koppelen één geplande maatregel of een expliciet pakket aan een precies bewaard risicobeoordelingsmoment. Kostenbasis, ratings, actor, datum, motivatie, besluit en berekende uitkomst reizen mee in JSON en rapporten.
- Alleen gekozen plannen tellen mee in de justificatie. Negatieve scoreverschillen, onzekerheid en ontbrekende modelcredit blijven zichtbaar. AHS-/haalbaarheidsfactoren zijn afzonderlijke prioritering, geen extra fysieke reductie.
- Een ingevuld antwoordversielabel moet overeenkomen met de bevroren dossiervraag. Historisch ontbrekende labels blijven onbekend.
- Negentien aanvullende PGA-/AI-43-pagina’s zijn met bron- en paginahashes geverifieerd. Zeven publieke criteria zijn aangescherpt; alle 78 eigen vraag-ID’s blijven behouden. AI-43 blijft expliciet een toegeschreven tekstkopie met ontbrekende afbeeldingen.

## Gecontroleerde private inhoud

De aanvullende bronwerkruimte `workspaces/bronwerkruimte-reviewed-2026-10-11.json` bevat 260 vragen, 16 bronrecords en 6 contentrecords, 400.916 UTF-8 bytes. Twee API-teruglezingen zijn exact gelijk aan de lokale gevalideerde export. De oorspronkelijke bronwerkruimte is behouden.

Dezelfde gecontroleerde SQLite-kopie levert vijf moduleplannen en vijf conceptdossiers. De 52 projectvragen en 85/2/49/28 afdelingsvragen blijven bij hun eigen scope; onbeantwoorde afdelingsmodules gaan mee. Alle 248 oorspronkelijke raw bronrecords blijven exact behouden. Originele database-, WAL- en SHM-bestanden bleven tijdens de export byte- en tijdstempelgelijk.

Afzonderlijke create-only exports in de private repository:

- `workspaces/legacy-riebuilder-modules-2026-10-11-strict.json`: 990.953 bytes, nul typed antwoorden, 41 reviewwaarschuwingen.
- `workspaces/legacy-riebuilder-modules-2026-10-11-utc-review.json`: 1.003.609 bytes, dertien typed antwoorden, 54 reviewwaarschuwingen.

Beide exports zijn tweemaal volledig teruggelezen en gevalideerd. De UTC-interpretatie blijft van matige zekerheid; exporttijd is geen gereconstrueerde historische vraag- of selectieversie. Deze bestanden vervangen oudere exports of eigen gebruikersdossiers niet.

## Verificatie

Lokale controles: **195 unittests, 38 import-/migratietests en 20 Chrome-browserworkflows geslaagd**, TypeScript/productiebuild geslaagd, productie-dependency-audit nul gevonden kwetsbaarheden. De migratiechecks zijn ook met Node 24.19.0 uitgevoerd. De browserproeven controleren onder meer echte UI-selectie, afzonderlijke maatregel/pakket, latere wijzigingen, reload, rapportprojectie en daadwerkelijke Markdown-/JSON-downloads.

De volledige herbouw blijft actief: beheerde vraag-/pakketversies, rijke vraagvelden, respondent-/response-relaties en de herbruikbare risicobibliotheek vragen nog werk. Ongelezen oorspronkelijke HVK/MVK-materialen, AI-45/AI-61 en werkelijke Moodle/LMS-data blijven brontaken. Zie [resterende pariteit](remaining-parity.md) en [goal](goal.md).
