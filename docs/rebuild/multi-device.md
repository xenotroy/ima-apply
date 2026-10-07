# Eén account, meerdere pc’s

IMA Apply 2.0 gebruikt een browserapp op GitHub Pages en een afzonderlijke private repository voor je dossiers. De publieke apprepository bevat de software en openbare, zelfgeschreven voorbeeldvragen. Eigen antwoorden, incidenten, vragenpakketten en brongegevens horen in de private datarepository.

| Onderdeel | Bestemming | Inhoud |
| --- | --- | --- |
| App en openbare documentatie | `xenotroy/ima-apply` | React-app, tests, methodiek, veilige demonstratiegegevens |
| Werkruimte | `xenotroy/ima-apply-workspaces` — private | `workspaces/default.json` met het volledige dossier |
| Lokale kopie | Browseropslag op de geopende pc | Automatisch opgeslagen werkruimte en versie voor conflictdetectie |
| GitHub-token | Geheugen van het geopende tabblad | Tijdelijke toegang tot de private datarepository |

## Eerste keer instellen

1. Open de app op [GitHub Pages](https://xenotroy.github.io/ima-apply/).
2. Begin een eigen werkruimte. De meegeleverde werkruimte is een fictieve demonstratie.
3. Maak op je GitHub-account een [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new). Selecteer uitsluitend de private repository `ima-apply-workspaces`. Geef **Contents: Read and write**. GitHub levert de bijbehorende metadatarechten. De app heeft geen toegang tot andere repositories nodig. Deze rechten sluiten aan op de [GitHub Contents API](https://docs.github.com/en/rest/repos/contents).
4. Open **Werkruimte & synchronisatie**. Vul `xenotroy/ima-apply-workspaces` en het token in.
5. Klik **Cloudversie bekijken**. Als nog geen werkruimtebestand bestaat, meldt de app dat nadat repository, private status, branch en leesrechten zijn gecontroleerd.
6. Klik **Opslaan in GitHub** om de eigen werkruimte te bewaren. Een bestaande cloudwerkruimte vereist dat je de bijbehorende versie eerst hebt opgehaald.

Een GitHub-login in een ander tabblad autoriseert de app niet vanzelf. De tokenverbinding geeft de app toegang tot het private dossier. Het token wordt nooit opgenomen in werkruimte-JSON, browseropslag of synchronisatiemetadata. Vernieuwen of sluiten van het tabblad beëindigt de geheugensessie; vul het token bij de volgende sessie opnieuw in. Via de knop naast de synchronisatieknoppen kun je het token direct uit het appgeheugen wissen.

## Op een andere pc verder werken

1. Open dezelfde app en **Werkruimte & synchronisatie**.
2. Vul dezelfde private repository en een token van hetzelfde GitHub-account in. Je kunt een afzonderlijk beperkt token per apparaat gebruiken.
3. Klik **Cloudversie bekijken**. De app toont naam, revisie en aantallen voordat je de cloudversie opent.
4. Bewaar eventuele lokale wijzigingen met **Lokale versie exporteren** en klik **Gebruik cloudversie**.
5. Werk verder. Lokale wijzigingen worden automatisch opgeslagen in deze browser. Klik na het werk **Opslaan in GitHub** om de andere pc de bijgewerkte versie te laten ophalen.

De synchronisatie gebeurt op verzoek. De app voert geen stil overschrijven of automatisch samenvoegen uit. Een lokaal opgeslagen dossier is pas naar andere pc’s overgedragen na een geslaagde GitHub-upload.

## Wanneer beide pc’s iets hebben gewijzigd

Een opgehaalde GitHub-versie heeft een blob-SHA. Bij upload controleert de app eerst dat het bestaande bestand nog die SHA heeft en stuurt diezelfde SHA mee naar GitHub. Heeft de andere pc tussentijds geüpload, dan stopt de upload. Ook HTTP 409 en 422 stoppen het verzoek; de app probeert nooit automatisch een nieuwere SHA te gebruiken. GitHub beschrijft de verplichte SHA bij updates en de relevante statuscodes in de [Contents API](https://docs.github.com/en/rest/repos/contents).

Herstel een conflict zo:

1. Exporteer de lokale werkruimte die nog niet kon worden geüpload.
2. Bekijk de nieuwste cloudversie en bewaar zo nodig ook die versie als JSON.
3. Open de cloudversie en breng de gewenste lokale wijzigingen opnieuw aan na vergelijking.
4. Upload de verzoende versie.

De JSON-export blijft tijdens een conflict beschikbaar. Bij een verlopen token, ontbrekende rechten, netwerkfout of ongeldig cloudbestand blijft de bestaande lokale werkruimte behouden. Bij een netwerkfout tijdens upload kan de upload op GitHub toch zijn voltooid: bekijk eerst de cloudversie voordat je opnieuw uploadt.

## Lokale opslag en overdracht

Browseropslag is specifiek voor de app-origin, de browser en het browserprofiel. Een andere browser, andere pc of gewist profiel bevat geen lokale kopie. Bewaar daarom het dossier in GitHub en exporteer het daarnaast wanneer je een afzonderlijke herstelkopie wilt.

De lokale opslag gebruikt een afzonderlijk versiekenmerk. Een andere tab die het dossier heeft gewijzigd, veroorzaakt een conflict in plaats van stil overschrijven. Op GitHub Pages gebruiken moderne browsers Web Locks om lokale writes over tabbladen te serialiseren. Zonder Web Locks blijft de versiecontrole actief, maar ontbreekt de garantie van een gezamenlijke lock tussen browserprocessen.

De JSON-import controleert schemaversie, vereiste velden, IDs, keuzes, datums, scoregrenzen en LOPA-intervallen. Verkeerde types, dubbele IDs, ongeldige scorefactoren, herkenbare toegangstokens en verboden credentialvelden worden afgewezen. Een beschadigde bestaande lokale kopie wordt bewaard en niet automatisch vervangen door een leeg dossier.

De werkruimte heeft een limiet van **900.000 UTF-8 bytes**, zodat het bestand binnen de volledig ondersteunde responsgrootte van de [GitHub Contents API](https://docs.github.com/en/rest/repos/contents) blijft. De werkruimte bevat tekst en bronverwijzingen; documenten, video's, pdf’s en LMS-attachments worden niet als binaire bestanden in deze JSON opgenomen.

## Implementatie en verificatie

De opslagmodule staat in `web/src/data/`. `WorkspaceState` omvat scenario’s en beheersmaatregelen, eventuele LOPA-scenario’s, geïmporteerde vragen en bronnen, antwoorden, verbeteracties en incidenten. Antwoorden bewaren desgewenst de gebruikte vraagtekst, bron-IDs en contentversie. Een afgesloten verbeteractie vereist een eigenaar, een expliciete controle van de werking en een verificatiedatum.

De private datarepository moet al bestaan en een geldige branch hebben, bijvoorbeeld door bij aanmaak een README toe te voegen. De app maakt ontbrekende repositories of branches niet aan. Repository- of autorisatiefouten worden niet behandeld als een leeg dossier. De app controleert de private status bij elke synchronisatiehandeling; de zichtbaarheid van een repository blijft onder beheer van de GitHub-accountbeheerder.

Gerichte verificatie:

```sh
cd web
npm test -- src/data/workspace.test.ts
```

De tests controleren importgrenzen, Unicode, tokenlekken, beschermde bestaande opslag, lokale conflicten, ontbrekende rechten, publieke repositories, veilige eerste uploads, SHA-conflicten, uploadfouten en het behoud van een ingediende snapshot wanneer de gebruiker verder bewerkt.
