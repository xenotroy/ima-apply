# Oorspronkelijke actiearchieven bewaren en inspecteren

De Markdown-migratie bewaart nu de geselecteerde oorspronkelijke actiearchieven uit `.history/actions/` als afzonderlijke private bronrecords, met een inspectiemanifest per actuele actie of niet te koppelen archiefmap. Dit sluit het archiefbehoud uit auditpunt **E03** aan op de bestaande migratie. Het levert geen nieuwe browsergebeurtenissen, historische beoordelaar, effectgoedkeuring of volledig herhaalde .NET-lifecyclevalidatie op.

Implementatie: [migrate-workspace.mjs](../../scripts/migrate-workspace.mjs). Verificatie: [migrate-workspace.test.mjs](../../scripts/migrate-workspace.test.mjs). De oorspronkelijke audit is een nulmeting van het moment waarop hij is geschreven: [completion-audit-2026-10-11.md](completion-audit-2026-10-11.md). De overige open punten uit die audit worden door deze migratiewijziging niet automatisch opgelost.

## De daadwerkelijke bronstructuur

De oorspronkelijke code gebruikt niet letterlijk de actie-ID als mapnaam. [ActionHistoryPath en InternalActionStem](../../src/RieBuilder.Ima/ImaWorkspace.cs) bouwen:

```text
.history/actions/<FileStem(actie-ID)>--<eerste 16 tekens SHA256(actie-ID)>/revision-<nummer>.md
```

`FileStem` vervangt `:` door `--` en controltekens en platformafhankelijke ongeldige bestandsnaamtekens door `-`. De migrator berekent de POSIX- en Windows-variant. Een map wordt alleen aan een actuele actie gekoppeld wanneer precies één daadwerkelijk geselecteerde actuele `ima.action/v1`- of `ima.action/v2`-bron die mapnaam verklaart. Een letterlijk gebruikte ID-map, onbekende mapnaam of dubbele actuele ID wordt niet stilzwijgend aan één actie toegewezen. De bestanden blijven afzonderlijk bewaard met een ontbrekende of ambigue koppeling in het manifest.

De uitzondering op het bestaande negeren van verborgen bestanden is begrensd:

- Alleen `.history/actions/`, directe archiefmappen en hun directe `revision-*.md`-bestanden worden gelezen; er is geen recursieve zoektocht in archieven.
- Ook een verkeerd gespelde of niet-numerieke revisienaam die binnen deze beperkte bestandsselectie valt, blijft raw behouden en krijgt een waarschuwing.
- Een verborgen directe archiefmap wordt uitsluitend toegelaten wanneer zijn naam exact uit een daadwerkelijk geselecteerde actuele actie-ID is berekend. Dit ondersteunt geldige ID’s die met een punt beginnen, zonder onbekende verborgen mappen te openen.
- Andere verborgen bomen, verborgen onbekende archiefmappen, geneste submappen en andere bestandsnamen blijven genegeerd. Een symlink op een toegelaten map- of revisiebestandgrens wordt geweigerd.
- Het bestaande maximum van 1.000 geselecteerde Markdown-bestanden telt gewone records en archiefbestanden samen. Ook het aantal directe archiefmappen is begrensd op 1.000. De bestaande grens van 64 MiB per bronbestand blijft gelden; de volledige browserwerkruimte moet daarnaast onder de grens van 2.000.000 bytes blijven. Een te grote export faalt; inhoud wordt niet afgekapt om hem passend te maken.

## Drie verschillende hashes

De oorspronkelijke actiehash is `SHA256(UTF8(File.ReadAllText(...)))`. `File.ReadAllText` detecteert en verwijdert een ondersteunde BOM bij het decoderen. CRLF blijft in de gelezen string staan. Dit is een ander algoritme dan de genormaliseerde Markdown-documenthash. De migratie houdt deze betekenissen afzonderlijk:

| Manifestveld | Inhoud | Betekenis |
| --- | --- | --- |
| `bytesSha256` | SHA-256 van de feitelijk gelezen bestandsbytes | Identiteit van het bronbestand, inclusief BOM en oorspronkelijke codering. |
| `exactTextSha256` | SHA-256 van de UTF-8-encoding van de exact gedecodeerde string | Controle van de oorspronkelijke `previous_revision_sha256`; CRLF behouden, gedecodeerde BOM geen tekstteken. |
| `normalizedDocumentSha256` | SHA-256 na de bestaande Markdown-normalisatie van CRLF naar LF | De oorspronkelijke document-/referentiehash, afzonderlijk van de actiehashketen. |

De bronalgoritmen zijn controleerbaar in [ImaWorkspace.Sha256](../../src/RieBuilder.Ima/ImaWorkspace.cs) en [MarkdownDocument.Parse](../../src/RieBuilder.Ima/Markdown/MarkdownDocument.cs). De oorspronkelijke helper [ComputeFileSha256Async](../../src/RieBuilder.Ima/ImaWorkspace.Rie.cs) voor bewijsbestanden hasht een bestandsstream; dat byte-algoritme wordt niet verward met de actiehashketen.

Elk archiefbronrecord met formaat `legacy-action-revision/v1` bevat het relatieve pad, `bytesBase64`, byteaantal, codering en de bytehash. Wanneer het decoderen lukt, bevat het ook de exacte gedecodeerde tekst; wanneer het ondersteunde YAML-/sectiesubset wordt herkend, bevat het de geparseerde metadata en genormaliseerde documenthash. De archiefbytes blijven ook bij een onbegrepen dialect volledig beschikbaar.

UTF-8 zonder/met BOM en UTF-16LE/BE met BOM zijn voor archieven ondersteund. UTF-32 of ongeldig gecodeerde tekst wordt expliciet als onbevestigd bewaard, met de oorspronkelijke bytes en zonder verzonnen teksthash. De gewone actuele Markdown-selectie blijft de bestaande strikte UTF-8-selectie. Deze wijziging breidt die actuele invoercodering niet uit naar UTF-16/32. Een andere brondialect of .NET-vervangingsdecodering wordt niet als identiek geclaimd.

## Scalars en identiteit controleren zonder informatieverlies

De algemene migratieparser kan een niet-geciteerd YAML-getal omzetten naar een JavaScript-getal. Dat mag niet bepalen of een oorspronkelijk revisieveld geldig was: `.NET Integer` leest de oorspronkelijke scalartekst en gebruikt `NumberStyles.Integer`.

Daarom bevat het manifest zowel `parsedRevision` als `revisionLexeme` en de afzonderlijk gecontroleerde `revision`. `revision: 1.0` behoudt bijvoorbeeld de geparseerde waarde `1` en bronlexeme `1.0`, maar krijgt gecontroleerde revisie `null` en een waarschuwing. Geldige geciteerde gehele getallen en een teken met voorloopnullen blijven toegelaten. De werkelijk aanwezige `ima.action/v1`-parserdefault bij een ontbrekende of lege revisie blijft herkenbaar als effectieve revisie 1; een ontbrekende verplichte `v2`-revisie wordt niet op 1 gezet.

Ook `previous_revision_sha256` heeft een geparseerde waarde, een afzonderlijke bronlexeme en de oorspronkelijke scalarstring. Een niet-geciteerde `12345` of `true` verdwijnt dus niet als een lege voorganger. Bij revisie 1 krijgt die waarde de oorspronkelijke fout voor een verboden voorganger. De native nullregels voor `null`, `~` en die exacte geciteerde waarden worden behouden. Een sequence of ander niet-bevestigd scalartype wordt expliciet onbevestigd.

De oorspronkelijke ID-controle gebruikt `.NET OrdinalIgnoreCase`. JavaScript-Unicode-`toLowerCase()` is daar niet gelijk aan. De migrator bevestigt exact gelijke ID’s en de gedeelde ASCII-casevergelijking. Verschillende niet-ASCII-spellingen krijgen `legacy_action_history_id_comparison_unconfirmed`; er wordt geen gelijkheid of mismatch gegokt. Exact gelijke Unicode-ID’s blijven controleerbaar. Voor een oordeel over verschillende Unicode-spellingen is controle met de oorspronkelijke runtime nodig.

## Manifest en waarschuwingen

Het bestaande `workspace.contentRecords`-contract bevat één private manifestprojectie met:

```text
format: ima.legacy-action-history/v1
sourceIds: de actuele en afzonderlijke archiefbron-ID’s, voor zover bekend
publication: private
manifest: huidige bron, archiefverwijzingen, ontbrekende reeksen, issues en controlescope
manifestSha256: SHA256 van canonieke JSON van manifest
```

Het manifest bevat geen tweede bewerkbare kopie van elk archiefdocument. De archiefbronnen zijn de afzonderlijke raw bronrecords; het manifest verwijst daarnaar met stabiele nieuwe projectie-ID’s. Een `browserActionId` is alleen aanwezig voor een actuele actie die daadwerkelijk in de browserprojectie bestaat. Een raw gebleven actie krijgt geen verzonnen native actie.

`hashChainStatus: consistent` betekent uitsluitend dat de expliciet beschreven bronconsistentiecontroles voor de geselecteerde bestanden geen fout of onbekende controle opleverden. Het betekent niet dat het volledige oorspronkelijke YAML-dialect, iedere verplichte actiewaarde, de lifecycle, de oorspronkelijke auteur, de tijdlijn of de effectbeoordeling is geverifieerd. `validationScope`, `hashAlgorithm` en `interpretation` staan daarom in ieder manifest. Het oorspronkelijke [GetActionHistoryErrors en ValidateArchivedAction](../../src/RieBuilder.Ima/ImaWorkspace.cs) voeren méér controles uit dan deze migratieprojectie.

De selectie meldt concreet:

| Situatie | Uitkomst |
| --- | --- |
| Eén of meer revisies vóór de huidige ontbreken | Compacte `missingRanges` en `legacy_action_history_missing_revision`; geen reconstructie. Ook helemaal ontbrekende archiefmappen worden zichtbaar wanneer de huidige bron een latere revisie of voorganger declareert. |
| Archiefinhoud gewijzigd, voorgangerhash wijkt af | `legacy_action_history_hash_mismatch`; oorspronkelijke hashes en bytes blijven bewaard. |
| Dubbele numerieke revisie, bijvoorbeeld `1` en `01` | Beide bestanden behouden, `legacy_action_history_duplicate_revision`; geen willekeurige voorganger gekozen. |
| Bestandsrevisie hoger dan de huidige | `legacy_action_history_future_revision`; mogelijke rollback/fork blijft zichtbaar. |
| Voorbereid archief van de huidige revisie verschilt van de huidige tekst | `legacy_action_history_prepared_revision_changed`; actuele actie wordt niet door het archief vervangen. |
| Archief-ID of gedeclareerde revisie past niet | Expliciete mismatch wanneer die vergelijkbaar is; onbekend schema/scalar of Unicode-vergelijking krijgt onbevestigde broncontrole. |
| Eerste revisie bevat een voorganger | `legacy_action_history_initial_hash_invalid`. |
| Ontbrekende/dubbele/ongedecodeerde voorganger of ontbrekende hash | `legacy_action_history_predecessor_unconfirmed`; geen ontbrekend hashgegeven berekend en ingevuld. |
| Onbekende huidige koppeling, YAML-subset of codering | Afzonderlijke private bronnen met concrete `current_missing`, `current_ambiguous`, `parser_unconfirmed` of `encoding_unconfirmed`-meldingen. |

Iedere manifestprojectie krijgt bovendien `legacy_action_history_requires_review` in het bestaande migratieverslag en private `ima.migration-review/v1`-bronrecord. De waarschuwingen zitten dus ook in de werkruimte en verdwijnen niet wanneer alleen de werkruimte wordt overgedragen.

Na import is het manifest in **Bronnen → Private contentrecords** als volledige JSON inspecteerbaar. De volledige JSON-werkruimte bevat ook de afzonderlijke bronrecords met de archiefbytes. Het manifest wordt meegenomen door de bestaande import-/exportgrens; er is geen nieuw native actietype of browserhistorietype nodig voor dit bronbehoud. De generieke browsergrens controleert de werkruimtestructuur en limieten, maar herhaalt niet zelfstandig de volledige manifest-hashketencontrole. Voor opnieuw gecontroleerde bronconsistentie moet de read-only migrator opnieuw op dezelfde gecontroleerde bronkopie worden uitgevoerd.

## Verificatie en productiegrens

Op 11 oktober 2026 slaagt de gerichte hoofdscript-suite met **56 tests**, waaronder **21 nieuwe actiearchieftests**. De nieuwe tests omvatten een complete keten, volledige werkruimte-roundtrip via de echte browservalidator, canonieke manifesthash, bytebehoud, BOM/CRLF, UTF-16LE/BE, onbegrepen YAML/UTF-32, ontbrekende/gewijzigde/dubbele/toekomstige/voorbereide revisies, een verkeerde ID/revisie, scalarlexemen, Unicode-identiteit, bronlimieten en symlinkweigering op iedere toegelaten grens. Een aparte test bewaakt het onderscheid tussen een bekende verborgen archiefmap en een onbekende verborgen boom.

```sh
node --test scripts/migrate-workspace.test.mjs
```

Alle nieuwe fixtures zijn fictief en bestaan alleen in tijdelijke testmappen. Deze bouwstap heeft geen echte legacywerkruimte gemigreerd, geen bestaande private export overschreven, geen oorspronkelijke database geopend of gewijzigd en geen Vaultbestand geschreven. Een productie-export vereist een concrete gecontroleerde bronkopie binnen de bestaande private create-only migratieroute; de testuitslag is geen uitspraak over de volledigheid of authenticiteit van nog niet geselecteerde echte archieven.
