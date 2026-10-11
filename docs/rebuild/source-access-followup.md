# Aanvullende toegangstoets voor oorspronkelijke bronnen

Eerste toegangstoets: 7 oktober 2026. Bijgewerkt op 11 oktober na de metadatahercontrole van 9 oktober en aanvullende inhoudelijke lezing van 10 oktober. Dit is een afzonderlijke vervolgcontrole op [source-coverage.md](source-coverage.md). **Hoge zekerheid** over de gecontroleerde metadata en routegrenzen; geen conclusie over alle bestanden in alle opslag.

## Zelfstandige cloudroute onderzocht

De beschikbare Google Drive-plugin heeft read-only zoek-, maplijst- en metadatacapaciteiten. Ook tekst-fetch en een geauthenticeerde raw-file-fetch zijn beschikbaar. De aanwezigheid van die tools bewijst op zichzelf geen toegang tot een passend bronbestand. Er is in deze sessie geen OneDrive-/SharePoint-bestandsconnector beschikbaar. De Outlook-tools zijn geen route naar OneDrive-bestandsinhoud.

De controle bestond uit gerichte searches voor AI-45, AI-61, riskmanagement/risicoanalyse en de oorspronkelijke HVK-opleidingsinhoud en MVK-leerdoelen. Bestandsnamen en MIME-types zijn gecontroleerd; niet-passende zoekresultaten zijn niet inhoudelijk opgehaald. De eerder geselecteerde 138 lesbestanden en zes curriculum-/handleidingvermeldingen zijn niet opnieuw gelezen of gedownload.

| Bron-ID       | Concrete uitkomst van deze vervolgcontrole                                                                    | Inhoud gelezen?                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `SDU-AI45`    | Geen passend oorspronkelijk bestand in de gerichte Drive-zoekresultaten                                       | Nee                                                              |
| `SDU-AI61`    | Geen passend oorspronkelijk bestand; niet-passende resultaten uitgesloten                                     | Nee                                                              |
| `EDU-LESSONS` | Bij riskmanagement/risicoanalyse alleen secundaire lesnotities aangetroffen; geen passend oorspronkelijk deck | Nee                                                              |
| `EDU-HVK`     | Twee vermeldingen van hetzelfde oorspronkelijke curriculum-DOCX en tekstextracties aangetroffen               | Nee; parentmetadata plaatst deze onder de uitgesloten archieftak |
| `EDU-MVK`     | Oorspronkelijk leerdoelen-DOCX en een tekstextractie aangetroffen                                             | Nee; dezelfde uitgesloten archieftak                             |

De originele curriculumvermeldingen zijn van het juiste Office-bestandstype. De gecontroleerde parentketen loopt echter via de archieftak `CortexVault`. Daarom is gestopt vóór een inhoudelijke fetch. Alleen metadata voor het vaststellen van de route is onderzocht; oorspronkelijke tekst, tekstextracties en archiefmappen zijn niet inhoudelijk gelezen. Deze resultaten maken de bron vindbaar, maar veranderen de leesstatus in het bronnenregister niet.

## Actieve routes en bronlinks gecontroleerd

Er zijn twee aangetroffen zakelijke cloudroutes gericht doorgelopen tot `second-brain-zakelijk / CortexOS / 02 Werk / 02 Opleidingen / 01 HVK / 06 Opleidingsdatabase`. Dit is een padcontrole, geen volledige Drive-crawl of keuze voor één van de twee als nieuwe canonieke vault.

In beide routes bevat `01 Bronnen` alleen de drie bestaande Markdown-registers. De in die registers genoemde map `_bronbestanden` ontbreekt daar ook cloud-side. Ook de oorspronkelijke extractiemap is in beide gecontroleerde actieve databasefolders niet aanwezig. Daarmee is de eerdere lokale beperking niet opgelost door rechtstreeks de actieve Drive-map te lezen.

De actieve bronregisters en de lesmateriaal-vindnotitie zijn gericht op bronlinks gecontroleerd. Zij verwijzen naar een relatieve vaultmap of een lokale operationele OneDrive-route. Er is daarin geen geobserveerde SharePoint-/OneDrive-download-URL of directe Drive-link naar een ontbrekend oorspronkelijk bestand gevonden. De vindnotitie beschrijft een eerdere inventarisatie; die inventarisatie is hier niet opnieuw als daadwerkelijke upload- of toegankelijkheidscontrole aangemerkt.

## Veilige vervolgstap en huidige grens

De zelfstandige actieve cloudroute van 7 oktober leverde **nul nieuw gelezen oorspronkelijke bronnen** en **nul nieuwe inhoudelijke criteria** op. In die toegangstoets is geen private inhoudsintake gemaakt en zijn geen nieuwe risicorekenregels of opleidingsclaims aan de app toegevoegd. De private metadata-audit is uitsluitend bewaard in het geïgnoreerde bestand `private-data/source-access-audit.json`; private Drive-bestands-ID’s en routes naar privébestanden staan niet in deze publieke notitie.

De concrete vervolgroutes zijn:

1. Een toegankelijke lokale kopie van de geselecteerde operationele HVK/MVK-bestanden, afkomstig van de pc waar de bron daadwerkelijk beschikbaar is. Voor de curriculummetadata gaat het om HVK-opleidingsinhoud en MVK-leerdoelen; voor risicomethodiek om het riskmanagement-/RI&E-deck en de specifieke AI-45/AI-61-PDF’s.
2. Een gecontroleerde tekstexport van diezelfde geselecteerde originelen. PDF-paginanummers, deck-/documentversie en extractiescope moeten dan naast de private tekst worden geregistreerd. Dit voorkomt dat een secundaire samenvatting of een lege cloudplaceholder als gelezen oorspronkelijk materiaal wordt opgevoerd.
3. Een geobserveerde download- of bestandslink via een beschikbaar OneDrive-/SharePoint-bestandskanaal. Er wordt geen niet-geobserveerde URL, bestands-ID of inlogroute geconstrueerd.

Een dergelijke toegankelijke kopie kan privé worden onderzocht zonder de operationele bron te wijzigen. De huidige JSON/Markdown/CSV-intake kan de gecontroleerde tekst en bronmetadata privé behouden; PDF/DOCX/PPTX vragen eerst een gerichte extractie. De inhoudelijke grens blijft dus de toegang tot geselecteerde originelen, niet het ontbreken van algemene cloudzoekfunctionaliteit.

## Gerichte hercontrole van 9 oktober

Een begrensde metadatahercontrole van exact geselecteerde routes bevestigde dat de actieve `_bronbestanden`- en extractiemap nog ontbreken. De geselecteerde risicodecks, AI-45/AI-61, oorspronkelijke HVK/MVK-curriculumdocumenten en onderwijsomgevinghandleiding waren nog cloudplaceholders met nul lokaal toegewezen blokken. Een positief leesrecht op zo’n bestand bewijst geen lokale inhoud. De operationele lesmateriaalroute gaf opnieuw een timeout.

De drie eerder gelezen Moodle-lesconcepten bestonden wel en waren lokaal beschikbaar. De hercontrole heeft geen actuele Moodle-export, nieuwe cursusinhoud of deelnemersdata gelezen. De private audit `private-data/source-access-revalidation-2026-10-09.json` bewaart deze afzonderlijke uitkomsten; de audit is geen nieuwe volledige opslaginventarisatie.

## Aanvullende inhoud die wél beschikbaar was

Op 10 oktober zijn negentien geselecteerde aanvullende PDF-pagina’s uit de al beschikbare actieve `PGA-32489`, `PGA-32490` en `SDU-AI43` gelezen. Dit is een andere route dan de ontbrekende AI-45/AI-61- en onderwijsbestanden. De cumulatieve scope is nu PGA-32489 pagina’s 1–8 van 20, PGA-32490 pagina’s 1–3 van 6 en AI-43 zeventien pagina’s van 92, waarvan drie inhoudsopgavepagina’s.

De leesmanifesten en geselecteerde extracten zijn op 11 oktober onderling gecontroleerd: de drie binaire bronhashes matchen, alle negentien paginahashes en tekstlengtes matchen, en de private tekstrecords bevatten exact de geselecteerde extracten. De bronnen bleven ongewijzigd. AI-43 is daarbij preciezer gekwalificeerd als toegeschreven tekstkopie met ontbrekende afbeeldingen; een oorspronkelijke uitgeversbinair of volledige figuurlayout is niet geverifieerd.

Deze lezing levert wél aangescherpte eigen criteria op voor onderzoekdiepte, bewijsbeheer, tijdlijn, causaliteit/BRF, toepassingsscope en het onderscheid tussen arbeidsveiligheids-KPI’s en procesveiligheidsfrequenties. De [inhoudelijke vertaling en exacte scope](source-coverage.md) beschrijven deze verwerking. De aanvullende tekst blijft privé; de 78 publieke vraag-ID’s blijven behouden. Deze voortgang lost de ontbrekende oorspronkelijke HVK/MVK-bronnen, AI-45/AI-61-inhoud of actuele LMS-data niet op.
