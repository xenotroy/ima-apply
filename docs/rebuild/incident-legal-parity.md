# Incidenten, wetgevingsgevolgen en onderwerpverbindingen — E05/E06

Deze aanvulling is ontwikkeld in een afzonderlijke werkruimte op basis van versie 2.4.0. Zij is geen verklaring van productiepublicatie of volledige klantdossieroverdracht. De scope is de oorspronkelijke incident-, onderwerp-, wetsignaal- en waarnemingsbetekenis, met additieve browservelden en brongetrouwe Markdown-migratie.

De migratie leest uitsluitend een expliciet geselecteerde bronkopie. Voor de beschreven proeven zijn fictieve tijdelijke fixtures gebruikt; geen oorspronkelijke klantdatabase, Vault-inhoud of werkelijke bewijsoverdracht is uitgevoerd. Zekerheid over de geteste codepaden: **hoog**. Aanwezigheid en juistheid van deze velden in een werkelijk dossier: **onbekend**.

## Additief contract

De bestaande drie incidentgroepen, kalenderdatum, classificatievlaggen, afdelings-ID en urenvalidatie blijven bestaan. De aanvullende `kind` bewaart afzonderlijk de oorspronkelijke zeven betekenissen: `unsafe_condition`, `near_miss`, `injury`, `illness`, `property_damage`, `environmental` en `other`.

| Record | Nieuwe optionele bronbetekenis |
| --- | --- |
| Incident | `kind`, `occurredAt`, `reportedAt`, `scopeId`, `organisation`, `location`, `status`, `tags`, `topicIds`, `basisRiskFactorIds`, `evidenceIds`, `investigationIds`, `sourceCreatedAt`, `sourceUpdatedAt` |
| Onderwerp | `parentId`, `tags`, `status` |
| Wetsignaal | `publishedOn`, `affectedRefs` |
| Waarneming | `topicIds`, `observedAt`, `location`, `scopeId`, `context`, `sourceCreatedAt`, `sourceUpdatedAt` |

Ontbrekende aanvullende velden in oude browserexports blijven afwezig. Geen oorspronkelijke meldtijd, actor, actieve status, gecontroleerde oorzaak, classificatie of historische wijziging wordt afgeleid uit de migratiedatum. Bestaande vraag-, actie- en risicosnapshots en hun hashcontracten worden hierdoor niet herschreven.

## Exacte tijden en afzonderlijke inhoud

De migrator gebruikt de werkelijke browserhelper voor een geldige kalender, tijd, expliciete offset en maximaal zeven fractiecijfers. Het oorspronkelijke ISO-lexeem blijft letterlijk behouden: geen UTC-normalisatie en geen afronding naar milliseconden. De bronkalenderdag wordt `occurredAt.slice(0, 10)` of `observedAt.slice(0, 10)`.

`2026-10-01T00:30:00.1234567+02:00` blijft dus een gebeurtenis op 1 oktober. Een datum zonder tijdzone bewijst geen bepaald tijdstip. De bestaande migratiegrens voor incidenten en waarnemingen blijft gelden: zonder bevestigd vereist gebeurtenis-/waarnemingstijdstip blijft het volledige record raw, met waarschuwing. Ongeldige optionele meld- of brontijden blijven afzonderlijk raw; andere bruikbare velden kunnen wel worden overgedragen.

Waarnemingsfeit en Context-sectie worden afzonderlijk geprojecteerd. Bij een herkenbare incidentsectie wordt alleen de oorspronkelijke Feiten-inhoud het feitelijke `description`-veld. De complete oorspronkelijke Markdown blijft daarnaast ongewijzigd in het raw bronrecord, inclusief secties en metadata die geen typed tegenhanger hebben.

Publicatiedatum, ingangsdatum en broncontroledatum zijn verschillende waarden. Voor `publishedOn` gebruikt de migrator dezelfde kalendercontrole als de browser; een onmogelijke datum of jaar nul wordt raw behouden met een specifieke waarschuwing. Geen publicatiedatum wordt afgeleid uit een andere datum.

## Relatierollen en scope

Alle aanvullende relaties worden pas afgerond nadat de mogelijke getypeerde doelen zijn geprojecteerd. Een ID moet uniek bevestigd zijn in de bijbehorende oorspronkelijke rol en werkelijk in de gekozen browsercollectie bestaan. Een verschillende niet-ASCII-casespelling wordt niet door JavaScript-lowercasing tot een bewezen oorspronkelijke .NET-ID gemaakt.

- Incidentonderwerpen verwijzen naar onderwerpen; waarnemingsonderwerpen eveneens rechtstreeks naar onderwerpen.
- Incident-BRF’s verwijzen alleen naar een werkelijk geprojecteerde, unieke BRF-definitieversie. Een oorspronkelijke taxonomiecode wordt niet stil een lokaal vastgestelde oorzaak of de nieuwste versie.
- Incidentbewijs verwijst naar bestaande bewijsregistraties. De verwijzing verleent geen bestandsintegriteit, menselijke verificatie of risicocredit.
- Een expliciet gekoppeld incidentonderzoek moet bij hetzelfde incident horen. Een volledige omgekeerde lijst wordt niet automatisch geconstrueerd.
- Onderwerpouders moeten werkelijk bestaan. Oorspronkelijke cyclus- en zelfverwijzingsranden blijven raw met waarschuwing; de migrator maakt daarvan geen ongeldige typed hiërarchie. Niet-cyclische bekende randen kunnen wel worden behouden.
- Wetsignalen bewaren `affectedRefs` met de bestaande benoemde collectiestructuur: `{kind:'workspace', collection, id}` of `{kind:'unresolved', originalId, rawSourceId}`. De betekenis is **geraakt record**, niet uitvoeringsbewijs of effectgoedkeuring. Finding → regelgeving wordt niet automatisch een omgekeerde wettelijke impactrelatie.

Ontbrekende, ambigue, verkeerd getypeerde of niet geprojecteerde onderwerp-/BRF-/bewijs-/onderzoek-/ouderrelaties blijven exact in het raw bronrecord met een specifieke rolwaarschuwing. Zij worden niet omgezet in een andere relatierol. Het ingebedde `ima.migration-review/v1`-bronrecord bewaart die waarschuwingen ook in de browserexport.

`scopeId`, organisatie- en locatietekst blijven oorspronkelijke broncontext. Zij leveren geen bevestigde organisatie-/locatie-/afdelings-ID en veranderen geen KPI-scope. De migratie houdt de bestaande brede typeprojectie en expliciete recordable/lost-time-vlaggen aan. Een soort- of ernstlabel bepaalt geen classificatie. Het historische verschil tussen de oorspronkelijke brede gebeurtenistellingen en de huidige browser-KPI’s is hiermee niet stil hergekalibreerd.

## Grenzen en bewijs

De native veldgrenzen blijven gelden: onderwerpstatus maximaal 1.000 tekens, tags maximaal 1.000 tekens per waarde, waarnemings-scope-ID maximaal 160 tekens en de betrokken algemene tekstvelden maximaal 100.000 tekens. Onbruikbare aanvullende waarden worden niet afgekapt; zij blijven raw met waarschuwing wanneer het oorspronkelijke bronrecord binnen de bestaande JSON-veiligheidsgrens past. De generieke grens voor een afzonderlijke raw tekstwaarde en de werkruimtegrens van 2.000.000 UTF-8-bytes blijven bestaan. Een bronrecord dat die algemene grens overschrijdt vraagt een afgebakende bronselectie of een apart overdrachtscontract; deze aanvulling verhoogt de grens niet.

De 68 Node-migratietests omvatten vijf gerichte E05/E06-gevallen, naast de bestaande 63 proeven:

1. Exacte bronoffset en zeven fractiecijfers, bronkalenderdag rond een maandgrens, meld- en brontijden, vrije scope/organisatie/locatie, echte incidentrelaties, onderwerpouder, afzonderlijk waarnemingsfeit/context en drie verschillende wetgevingsdatums.
2. Ontbrekende relaties, niet geprojecteerde andere taxonomie, ambigue geraakte bron-ID’s, ontbrekende tijdzone, ongeldige kalender en meer dan zeven fractiecijfers; rolwaarschuwingen en exacte raw waarden blijven behouden. Publicatiejaar nul wordt niet geprojecteerd.
3. Tweeledige onderwerpcyclus, zelfverwijzing, ontbrekende ouder en geldige onafhankelijke/ouder-kindranden.
4. Alle zeven incidentsoorten met de bestaande brede typeprojectie, zonder classificatievlaggen af te leiden; ongeldige gebeurtenistijdstippen blijven raw. Oude browserincidenten zonder aanvullende velden blijven importeerbaar.
5. Te lange oorspronkelijke onderwerpstatus, tag en waarnemings-scope-ID veroorzaken geen afkapping of ongeldige typed export; een geldig label van 161 tekens blijft behouden.

Deze suite is geslaagd tegen de werkelijke browservalidator en native export/import. De oorspronkelijke fictieve bronbestanden en bronhashes worden in de proeven gecontroleerd. Nieuwe invoer, herladen en rapportage hebben hun aanvullende browserproeven in de ontwikkelwerkruimte; hun actuele uitslag wordt afzonderlijk door de integrerende agent vastgesteld. Dit document claimt geen reeds uitgevoerde echte productieoverdracht.

## Gecontroleerde ontwikkelstand

De integratie is lokaal gecontroleerd met 411 unittests, 78 import-/migratietests, 79 geslaagde Chrome-proeven en een geslaagde TypeScript/productiebuild. Eén private 1.300-bankproef is in deze afzonderlijke ontwikkelkopie overgeslagen omdat het private bronpakket daar niet is neergezet. De gepubliceerde `2.4.0` had hiervoor haar afzonderlijke echte private controle.

Vier nieuwe Chrome-proeven bewijzen incidentherstel met exact bronmoment en afzonderlijke soort, onderwerpouder en juridisch publicatiemoment met echt actie-ID, waarnemingsherstel met aparte context en rechtstreeks onderwerp, en conceptbehoud na geweigerde opslag bij een verdwenen onderwerpouder. Die laatste proef controleert een tweede herlaad vóór bewuste correctie en geldige opslag. De bestaande interviewproef selecteert het feitveld nu expliciet, omdat de waarneming een afzonderlijk contextveld heeft gekregen.

De versie is `2.5.0-dev.1` op `codex/incident-legal-parity`. Zij wordt als ontwikkelvoorstel aangeboden. De stabiele GitHub Pages-versie voor het interview blijft `2.4.0`.
