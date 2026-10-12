# Modulekeuze: van gevaar naar onderzoeksdossier

De hoofdmenu-ingang **Modulekeuze** opent de beschikbare thema’s, oorspronkelijke modules en vragen. Op het overzicht staat ook **Start modulekeuze**. De directe ingang is [IMA Apply — Modulekeuze](https://xenotroy.github.io/ima-apply/#modules); herladen bewaart deze pagina.

## Beginnen

1. Open **Modulekeuze**. Voor een nieuwe organisatie kun je eerst **Organisatie invullen** gebruiken.
2. Kies in de keuzehulp welke gevaren bij het werk voorkomen. De tool toont positieve voorstellen met de gevonden aanleiding. **Aanbevolen modules toevoegen** voegt die voorstellen alleen na jouw klik toe.
3. Klap de boom uit om de echte vragen te lezen, of wissel naar **Mindmap** en open een moduletak. Zoek op thema, vraag, gevaar of risico. Kies een volledige module of afzonderlijke vragen.
4. Klik **Keuze vastleggen** (of **Moduleplan**), vul de titel en project- of afdelingsscope in en sla de keuze op. De selectie uit de verkenner gaat mee naar dit formulier.
5. Kies **Dossier uit deze keuze** en vul titel, afgebakende scope en beoordelaar in. Het dossier bevriest de gekozen vragen. Vanaf dit dossier kun je het interview starten.

Een zoekfilter verandert de selectie niet. Een niet gevonden of niet voorgesteld onderwerp blijft handmatig beschikbaar in de volledige boom. Er wordt geen toepasselijkheid, lokale aanwezigheid, risicoscore of wettelijke acceptatie uit een zoekwoord afgeleid. Basisorganisatie, preventie en BHV krijgen een afzonderlijk voorstel dat de gebruiker beoordeelt.

## Selectie en herstel

De verkenner en het formulier voor een nieuw plan delen dezelfde herstelbare conceptinvoer. Modules, individuele vraagkeuzes en gekozen gevaarprofielen blijven behouden na sluiten en herladen. Afzonderlijke scopes, scopenotities en modulevolgorde blijven deel van het plan. Markdown kan onafgemaakte concepten meenemen; JSON bewaart de vastgelegde werkruimte.

Een module behoudt haar volledige oorspronkelijke `questionIds`. Het optionele `excludedQuestionIds` bewaart de individuele uitselectie. Alleen ingeschakelde en niet uitgesloten vragen worden in het dossier opgenomen, met behoud van de eerste gekozen volgorde en zonder dubbele vragen. De oude hashprojectie blijft identiek wanneer het nieuwe veld ontbreekt. Dossiers met een eerdere bevroren modulekeuze worden niet gewijzigd door een later plan of advies.

De voorstellen gebruiken uitsluitend werkelijk beschikbare modulelabels en vraagtekst, inclusief aanwezige gevaar-/risicovelden. Gekozen profielen leveren uitleg en verwijzingen naar gevonden vragen. Er worden geen ontbrekende private vragen, oorspronkelijke module-identiteiten of numerieke risico’s gegenereerd.

## Visuele bediening

Boom en mindmap bedienen dezelfde selectie. Gedeeltelijk geselecteerde modules tonen een gemengde checkbox en het werkelijke aantal gekozen vragen. De mindmap verbindt de onderzoeksselectie met de beschikbare modules; klik of toetsenbord opent de bijbehorende vragen. Animaties volgen `prefers-reduced-motion`; op smalle schermen blijft de bediening bruikbaar.

De [moduleplanregels](module-plan.md) beschrijven de scopevalidatie, volledige dossierfreeze, bronnen en migratie. De volledige herbouw en primaire bronintegratie blijven onderdeel van het [actieve goal](goal.md).
