# Bewijsversies, bestandbytes en maatregelwerking

Versie 2.4 voegt een expliciete bewijsroute toe. Een vinkje “geverifieerd” en een verwijzing vormen op zichzelf geen nieuwe actuele risicocredit. De menselijke maatregelbeoordeling selecteert bewijs-ID’s, hun inhoudelijke verificatieversies en de exact beoordeelde scenario-/reductie- of PFD-basis.

## Registratie en bestand zijn afzonderlijke gegevens

De bestaande `verifiedContentSha256` blijft de oorspronkelijke metadatahash. `file.expectedSha256` betreft de bytes van het originele bewijsbestand. `verifiedFileBindingSha256` bevestigt menselijk de registratie van dat bestand, inclusief originele vastlegging en bekende opslagversie. MIME-type en de herkomst daarvan blijven apart; een opgegeven bestandstype bewijst geen inhoudelijke juistheid.

De app bewaart bijlagebytes in een afzonderlijke IndexedDB-opslag, onder hun SHA256. De productlimiet is 10.000.000 bytes per bestand. De tekstwerkruimte blijft maximaal 2.000.000 UTF-8 bytes. Een filecheck registreert wie, wanneer, hoe en met welke uitkomst bytes heeft gecontroleerd. Opslaan van uitsluitend een operationele hercontrole behoudt de bestaande menselijke verificatiedatum, inhoudshash en bestandsbinding. Ook een negatieve controle kan als actuele waarneming worden bewaard, zonder het historische menselijke oordeel te herschrijven. Veranderde, ontbrekende en ontoegankelijke bytes blijven verschillende uitkomsten.

Selectie van een bestand met een andere hash vervangt een bestaande registratie niet stil. Met **Bestand vervangen (opnieuw beoordelen)** kiest de gebruiker bewust een nieuwe bronversie. Die keuze vraagt een nieuwe inhoudelijke bewijsbeoordeling en vervolgens een nieuwe maatregelbevestiging.

## Private bestanden en een tweede pc

Verbind de private datarepository in **Werkruimte & synchronisatie**. Open het bewijsrecord en kies **Bijlage opslaan in private GitHub**. De byteclient weigert een publieke repository. Bestanden krijgen een inhoudsgebonden pad `attachments/sha256/<eerste twee tekens>/<sha256>.bin`; een bestaande verschillende inhoud op dat pad wordt niet overschreven. De werkruimte bewaart repository, branch, pad en de exact teruggelezen Git-blob-/commitidentiteit.

Bewaar daarna de werkruimte in GitHub. Op de andere pc open je dezelfde werkruimte, verbind je de private repository en gebruik je bij het bewijs **Private bron opnieuw controleren**. De app leest de onveranderlijke blobversie en controleert daarnaast of het huidige branchpad nog die bronversie aanwijst. Exacte historische bytes die nog terug te lezen zijn, bewijzen op zichzelf geen ongewijzigde actuele bronlocatie.

Een opgeslagen “match” in JSON wekt geen controle in een nieuwe sessie op. Alleen een werkelijk uitgevoerde controle in het tabblad levert de operationele sessiebevestiging. Een gedownload bestand kan een historische gebonden versie zijn; downloaden is geen nieuwe inhoudelijke beoordeling. De app voert geen continue bewaking van externe repositories uit.

## Actuele werking en historische beoordeling

Nieuwe actuele berekeningen gebruiken `ima-risk/2.1.0`. Dashboard, werkbank, ruimtelijke grafiek, rangschikking, rapport en CSV gebruiken dezelfde bewijsselectie. Gewijzigde scenarioafbakening, reductie, PFD, onafhankelijkheidsbasis, bewijsinhoud of menselijke verificatie vraagt herbevestiging. Bronregistraties blijven bewaard; de berekening sluit niet bevestigde werking uit en toont de reden.

Geplande, nog niet geverifieerde Fine–Kinney-ingrepen mogen een onzekere prognose tonen, met nul gegarandeerde reductie. Zij verlagen geen huidige score. AHS en uitvoerbaarheid blijven aparte prioriteringskeuzes en verlenen geen fysieke risicoreductie. Een geplande LOPA-laag krijgt geen gerealiseerde IPL-credit.

Een nieuw beoordelingsmoment bevriest uitsluitend de werkelijk gekoppelde bewijs-ID’s, hun toen actuele versies, ontbrekende ID’s en gebruikte bestandscontroles. Latere intrekking verandert de historische uitkomst niet. Oude beoordelingen met `ima-risk/2.0.0` worden niet herberekend volgens de nieuwe bewijsroute; oorspronkelijke hashes blijven gelijk. Een opgeslagen checkpoint kan via gewone bewerking niet stil herschreven of verwijderd worden. Import blijft een afzonderlijke bewuste werkruimtekeuze.

## Acties

Een actie kiest desgewenst exacte maatregel-, IPL- of modifier-ID’s met een bevroren doelversie. Een effectbeoordeling controleert de huidige doelversie en geselecteerde bewijsbasis. Een latere bronwijziging laat de bestaande actiehistorie leesbaar, maar maakt de actuele geldigheid opnieuw te beoordelen. Een positieve actiebeoordeling wijzigt geen reductiepercentage of risicocredit automatisch.

## Migratiegrens

Alleen daadwerkelijk herkenbare oorspronkelijke bestandshash, MIME-type, vastlegger en verwijzing worden getypeerd. Ambigue of ontbrekende oorspronkelijke gegevens blijven raw met een expliciete grens; de migratie creëert geen menselijke verificatie. Er is in deze bouwstap geen oorspronkelijk klantbewijsbestand overgedragen of actuele lokale maatregelenwerking vastgesteld.
