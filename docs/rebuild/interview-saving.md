# Interviewinvoer bewaren en herstellen

IMA Apply 2.3.1 bewaart vastgelegde invoer automatisch in de browser. De status in de zijbalk bevestigt de normale lokale opslag. Vóór die opslag staat een gevalideerde herstelkopie klaar; een mislukte of onderbroken schrijfoperatie kan daardoor bij herladen worden hersteld. Alleen een herstelkopie met de passende opslagversie wordt automatisch gekozen. Meerdere concurrerende of oudere versies blijven afzonderlijk exporteerbaar.

## Tijdens een interview

1. Open het juiste dossier via **Organisatie & dossiers → Inventariseren**. Vul **Respondent / actor voor deze invoer** bewust in; nieuwe antwoorden zijn geblokkeerd zolang die ontbreekt.
2. Bij iedere wijziging probeert de applicatie antwoordkeuze, toelichting en bewijslinks vast te leggen. De volledige antwoordinvoer wordt eerst als concept bewaard. Weigert validatie de wijziging, bijvoorbeeld vanwege een te lange tekst, dan blijft het opgeslagen antwoord intact en blijft de geweigerde invoer herstelbaar en exporteerbaar. Een geslaagde antwoordwijziging behoudt dezelfde response-ID en de bestaande waarneming-/bevindingrelaties.
3. Lees de opslagstatus. Bij **Niet lokaal opgeslagen** blijft de actuele werkversie beschikbaar voor export. Ga dan naar **Rapportage** en exporteer JSON en Markdown voordat je het tabblad sluit.
4. De hieronder genoemde beschermde formulieren bewaren invoer direct als lokaal concept. Je hoeft niet eerst **Opslaan** te kiezen om dat concept terug te vinden. Open na sluiten of herladen hetzelfde formulier en controleer de melding **Concept hersteld**.
5. Kies alsnog de opslagknop van het formulier om er een dossierrecord van te maken. Het concept wordt pas opgeruimd wanneer de bijbehorende werkruimte daadwerkelijk duurzaam is geschreven.

Beschermde invoer omvat antwoordkeuze en antwoordtekst, dossiers, bewijs, waarnemingen, bevindingen, projectcontext, rondgangverslagen, scenario's, maatregelrecords, acties, incidenten, moduleplannen, dossiers uit een moduleplan, beheerde vraagdefinities, response-relaties, risicobibliotheekreviews/posities/scenario-invoer, LOPA-opzet en de volledige LOPA-invoer, onderzoeksrecords, maanduren, beoordelingsonderbouwing en justificatie. De oorspronkelijke basis van een onderzoek of beoordeling blijft bij het concept; gewijzigde brongegevens worden niet stil als dezelfde beoordeling behandeld.

Ook de percentages en conditionele noemeronderbouwing van de maatregelinschalingshulp blijven als concept behouden voordat je **Toepassen op W/B/E** kiest. Zij geven op zichzelf geen maatregelcredit. Voor een groot PI-interview maak je via de router een afgebakende **Projectwerkruimte exporteren** en werk je verder in dat nieuwe bestand; alle geselecteerde vragen gaan mee, de volledige bank blijft afzonderlijk.

Ook organisatie-, locatie-, afdelings-, onderwerp-, regelgeving- en dossierreviewformulieren bewaren nu een herstelconcept. De naam bij hernoemen of aanmaken van een werkruimte wordt eveneens behouden. Een nieuw werkruimteconcept wordt pas opgeruimd nadat de nieuwe werkruimte daadwerkelijk is opgeslagen. Zoekfilters, geopende tab en navigatiekeuzes zijn geen dossiergegevens. De respondent voor nieuwe invoer wordt bij een nieuw bezoek opnieuw bewust opgegeven; opgeslagen responses behouden hun auteur.

De volledige onderbouwing van een actierevisie blijft als concept behouden: actor, redenering, controledatum, verificateur, effectresultaat, gekozen bewijs en volgende stap. Een gewijzigde geselecteerde bewijsbasis verlangt expliciete herbevestiging. Een open formulier neemt geen concept mee naar een andere werkruimte met dezelfde actie-ID.

Intervalvelden voor W/B/E-reductie, initiatorfrequentie, IPL-PFD en conditionele kans bewaren de exacte getalinvoer, ook een leeg veld, onvolledige exponent of omgekeerd interval. Het LOPA-criterium bewaart eveneens zijn invoer. Ongeldige getalinvoer wordt niet toegepast en blokkeert het vastleggen; de grafiek blijft de laatst geldige waarden tonen. **Toepassen op W/B/E** vervangt bewust alleen het gekozen factorconcept en laat de andere factorconcepten behouden. Corrigeer de gemarkeerde velden voordat je opslaat.

## Twee tabbladen en eerdere versies

Elk geopend tabblad schrijft een eigen concept. Ook een gedupliceerd tabblad krijgt een nieuwe identiteit. Een tabblad geeft voorrang aan zijn eigen concept en vervolgens aan zijn vorige identiteit bij herladen. Bij meerdere andere versies vraagt het formulier om een expliciete keuze.

Een geslaagde opslag verwijdert uitsluitend het bijbehorende concept van dat tabblad. Oudere versies blijven via **Rapportage → Herstelbare formulierconcepten** zichtbaar. Een oude record-ID die inmiddels is vastgelegd, wordt niet opnieuw als nieuw record geladen. Je kunt een nieuw record invullen terwijl de eerdere tekst behouden blijft. Bronwijzigingen blokkeren eveneens automatische herbinding van oude concepten.

Controleer de volledige tekst en verwijder een oude versie pas bewust met **Dit concept verwijderen**. Het tijdstip is geen bewijs dat een versie inhoudelijk beter is.

## Markdown en JSON

- **Rapportage → Markdown** levert het leesbare dossier met bronvragen, actor, relaties, maatregelen en beoordelingen, plus de nog niet vastgelegde formulierconcepten van de huidige werkruimte.
- **Concepten naar Markdown** bewaart de volledige conceptwaarden afzonderlijk. De tekst vermeldt expliciet dat deze nog geen vastgestelde dossierrecords zijn.
- **Werkruimte exporteren** levert volledige JSON voor import en verder werken, inclusief bevroren vragen, contentpakketversies en relaties. Losse formulierconcepten staan in hun afzonderlijke Markdown-export en maken geen deel uit van dit vastgelegde werkruimtebestand.
- **Herstelkopie exporteren** bewaart een volledige tussentijdse werkruimte als JSON wanneer die niet veilig automatisch over de huidige versie kan worden gezet.

Markdown is een leesbare backup en rapportage. Gebruik JSON voor volledige werkruimteoverdracht. Bewaar beide aan het begin en einde van een interview en bij relevante tussenstappen.

## Naar een andere pc

Lokale opslag en formulierconcepten horen bij deze browser op deze pc. Leg concepten eerst vast, exporteer vervolgens JSON en upload de werkruimte via **Werkruimte & synchronisatie** naar hetzelfde bestand in de private repository. Bekijk op de andere pc de cloudversie en kies **Gebruik cloudversie**. GitHub-uploads blijven bewuste handelingen met versiecontrole; zie [meerdere apparaten](multi-device.md).

Bij onvoldoende browseropslag kan ook de herstelkopie niet duurzaam worden geschreven. De applicatie toont de fout en waarschuwt bij sluiten zolang er nog onbewaarde invoer is. Exporteer dan de actuele werkruimte en concepten terwijl het tabblad nog open is. Wissen van browsergegevens verwijdert lokale opslag; een eerder geëxporteerd of geüpload bestand biedt daarvoor herstel.

## Verificatiegrens

Automatische Chrome-proeven onderbreken de normale opslag tijdens een interview en controleren exact de laatste regel, het laatste Unicode-teken en de respondent na herladen. Andere proeven gebruiken werkelijk gekloonde sessionStorage-tabbladen, afwijkende conceptteksten, expliciete versiekeuze, herstelde nieuwrecordconcepten en geblokkeerde bronwijzigingen. LOPA-, onderzoeks- en moduleproeven controleren ook invoer die buiten de zichtbare subtab ligt. Deze controles bewijzen de onderzochte herstelroutes; ze bewijzen geen herstel van gegevens die nooit duurzaam zijn opgeslagen of geëxporteerd.
