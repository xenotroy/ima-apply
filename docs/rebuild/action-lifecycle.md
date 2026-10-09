# Acties: uitvoering, effectcontrole en revisies

De browseractie onderscheidt het uitvoeren van een verbetering, het plannen van haar controle, een positief of negatief controleresultaat en heropening. Dit bewaart de betekenis van de oorspronkelijke `ActionLifecycle` in `src/RieBuilder.Ima/Models/ImaModels.cs`; het kopieert niet de oude Markdown-bestandsindeling.

## Werkende cyclus

| Huidige fase              | Toegestane volgende stap                    | Vereiste inhoud                                                                                |
| ------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Gepland                   | In uitvoering, geannuleerd                  | Actor en redenering; uitvoering vraagt eigenaar.                                               |
| In uitvoering             | Uitgevoerd, geannuleerd                     | Werkelijke uitvoering wordt als gedateerde stap geregistreerd.                                 |
| Uitgevoerd                | Controle gepland, geannuleerd               | Controleplan en expliciete controledatum, vanaf het implementatietijdstip.                     |
| Controle gepland          | Effectief beoordeeld, onvoldoende effectief | Verificateur, werkelijk controleresultaat en geverifieerd bewijs uit dezelfde dossierscope.    |
| Effectief beoordeeld      | Afgesloten, heropend                        | Afsluiten bewaart de bestaande effectbeoordeling en haar oorspronkelijke datum.                |
| Onvoldoende effectief     | Heropend                                    | Een negatieve controle kan niet als effectief worden afgesloten.                               |
| Afgesloten of geannuleerd | Heropend                                    | De aanleiding blijft in de historie staan.                                                     |
| Heropend                  | Gepland, in uitvoering, geannuleerd         | Nieuwe cyclus; eerdere uitvoering en controle worden geen actief bewijs voor de nieuwe aanpak. |

Iedere opgeslagen statusstap en inhoudsrevisie vraagt een actor en redenering. Deze identiteit is door de gebruiker vastgelegd, geen extern geauthenticeerde handtekening. De UI stempelt het actuele tijdstip met tijdzone; de domeinroute bewaakt de volgorde van revisies en de relevante uitvoerings-/controledatums.

Een heropening wist uitsluitend de **actieve** implementatie, controleplanning, verificateur, effectuitkomst, controleresultaat en verificatiedatum. Volledige vorige inhoud en het eerder gebruikte bewijs blijven in de historische snapshots leesbaar. Geannuleerd is een afzonderlijke terminale uitkomst en levert geen effectclaim op.

Een positief én negatief oordeel vereist een bestaand bewijsrecord met `status: verified`, passende dossierscope, verificateur, verificatiedatum, inhoudelijke verificatienotitie en de hash van de daadwerkelijk geverifieerde bewijsinhoud. De actie archiveert de volledige gebruikte bewijsversie. Een checksum alleen maakt onbevestigd bewijs niet inhoudelijk geverifieerd. Het intrekken of wijzigen van actueel effectbewijs vraagt eerst heropening; een lopend positief label mag niet ongemerkt op gewijzigde inhoud steunen.

Wijzig de beoordeelde actieomschrijving, het controleplan of de bewijskoppelingen via heropening. Zuivere administratieve wijzigingen zoals eigenaar of streefdatum kunnen als aparte inhoudsrevisie worden bewaard. Ook dan blijft zichtbaar wie welke inhoud veranderde en waarom.

De actie-uitkomst wijzigt geen `Control` en berekent geen risicoreductie. De risicowerkbank beoordeelt de maatregel, aannames, afhankelijkheid en bewijs afzonderlijk.

## Compatibiliteit en historische grenzen

`WorkspaceAction.status` houdt de bestaande v1-waarden `open`, `in_progress` en `done`. De optionele `lifecycle` bevat de precieze fase, cyclusvelden, revisienummer en historie. Zo blijven vroege v1-exports leesbaar zonder verzonnen oudere events.

| Compatibiliteitsveld | Preciese fase                                                      |
| -------------------- | ------------------------------------------------------------------ |
| `open`               | Voorgesteld, gepland, heropend                                     |
| `in_progress`        | In uitvoering, uitgevoerd, controle gepland, onvoldoende effectief |
| `done`               | Effectief beoordeeld, afgesloten, geannuleerd                      |

Gebruik de lifecyclefase voor inhoudelijke labels en tellingen: het brede `done` is geen effectbewijs. Zonder lifecycle krijgt een bestaand `done` het expliciete label **Oud afgerond · effect niet opnieuw vastgesteld**. Die actie kan alleen bewust worden heropend voordat de nieuwe workflow haar inhoud wijzigt. Bestaande vrije controletekst en datum blijven in het originele record en in de eerste nieuwe voorgangersnapshot behouden.

Een nieuwe of bestaande open/lopende registratie zonder afzonderlijke historie kan een echte inhoudsrevisie of statusstap vastleggen. De eerste revisie bewaart de aangetroffen v1-inhoud; zij claimt geen eerdere aanmaak-, uitvoerings- of beoordelingsgeschiedenis. Nieuwe acties beginnen gepland. Het model kent ook de oorspronkelijke voorgestelde fase voor expliciete representatie, maar de huidige aanmaakinterface presenteert uitsluitend een geplande actie.

De migratie-CLI blijft conservatief: oorspronkelijke lifecyclevelden, labels en Markdown-revisiegegevens blijven raw provenance. Zij maakt daaruit geen nieuw browser-event met een verzonnen actor, geen herstelde externe hashketen en geen bevestigde effectuitkomst. Een oorspronkelijke `effective`-registratie zonder controleerbaar nieuw bewijs wordt dus niet automatisch een nieuwe effectieve browseractie. Volledige oude revisieketens blijven een afzonderlijke broncontrole.

## Revisie- en conflictcontrole

Iedere revisie bevat de volledige actie-inhoud vóór en na de wijziging, inclusief de relevante bewijsversie. Het event heeft een oplopend revisienummer, actor, tijdstip, redenering, voorgangerhash en eigen SHA-256. Import controleert de keten, de actuele inhoud tegen de laatste snapshot én de betekenis van de overgangen. Een zelf opnieuw berekende hash maakt een ongeldige statusstap niet geldig.

De eerste voorgangerhash dekt de daadwerkelijk aangetroffen v1-actie. Daarna verwijst ieder event naar het vorige event. Canonieke JSON sorteert objectvelden lexicografisch en behoudt de arrayvolgorde. Het revisieverzoek geeft een `expectedRevision`; de App vergelijkt bovendien de gelezen voorgangersnapshot/-hash met de actuele werkruimte voordat de wijziging wordt toegepast. De lokale opslagversie en GitHub-SHA bewaken vervolgens conflicten tussen werkruimteversies en apparaten. De UI behoudt een niet opgeslagen draft als inmiddels een andere actierevisie binnenkomt.

Deze hashketen is een **consistentie- en integriteitscontrole binnen de export**. Zij is niet extern ondertekend, onvervalsbaar of een bewijs van geauthenticeerde identiteit. Iemand met volledige schrijfrechten kan een hele alternatieve geldige geschiedenis construeren; onafhankelijke Git-geschiedenis/backups blijven aanvullende bronnen.

Historie wordt niet stil afgekapt. Een actie heeft maximaal 250 revisies en de gehele werkruimte valt onder `MAX_WORKSPACE_BYTES` in `web/src/data/validation.ts`. De UI toont de actuele actieomvang inclusief historie en de werkruimtegrens. Bij bereiken van de grens stopt opslaan met behoud van bestaande inhoud; bewaar een volledige export en begin bewust een afzonderlijke vervolgactie.

## Acceptatiebewijs

`web/src/domain/action-lifecycle.test.ts` controleert de afzonderlijke uitvoering/controle, negatieve beoordeling, heropening, volledigheid van voorgangers, actor/redenering, expected revisie, tijdvolgorde, werkelijk geverifieerd scopebewijs, inhoudsrevisies, oude exports, annulering, wijziging/intrekking van bewijs en import met gewijzigde of semantisch ongeldige geschiedenis. De browserworkflow wordt afzonderlijk beproefd in `web/e2e/risk-workflows.spec.ts`.

Deze tests bewijzen de daarin uitgevoerde nieuwe routes; zij stellen geen eerdere productieacties of historische effectiviteit vast.
