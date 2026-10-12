# IMA Apply 2.4.3 — volledige bronbanken veilig bewaren

De native werkruimtegrens is verhoogd van 2 naar 8 MB. Grote lokale werkruimte-enveloppen en tussentijdse herstelkopieën worden verliesloos gecomprimeerd, met controle van de gedecomprimeerde omvang en SHA-256. Oudere gewone opslag-enveloppen blijven leesbaar; JSON-import, export en GitHub-overdracht blijven gewone native JSON. De selectie- en dossiermodellen veranderen niet.

De [fflate-documentatie](https://github.com/101arrowz/fflate) beschrijft de synchrone zlib-API en de vooraf begrensde uitvoerbuffer. Beschadigde of te grote opslag wordt geweigerd met behoud van het oorspronkelijke record. De bestaande checks op tabconflicten en antwoordherstel blijven actief.

Verificatie: een quota-proef bewaart een grote bronbibliotheek en de nieuwste onderbroken invoer samen onder een 5 MiB-grens, inclusief twee opeenvolgende edits en bevestiging van een eerdere save. De browserproef controleert invoer, herladen, native JSON-export en import in een afzonderlijke browsercontext bij een werkruimte groter dan 2 MB. Een afzonderlijke opt-in proef leest de private geïntegreerde bronbank en controleert 1.300/46/189 plus exact behoud van moduleplannen, dossierfreezes, vragen en antwoorden. Private klantbestanden worden niet mee gepubliceerd.

Bij de PI Vught-voorbereiding worden uitsluitend de 876 ontbrekende bronvragen en hun bindingen toegevoegd. De huidige geselecteerde modules, individuele uitsluitingen, interviewvragen, antwoorden en risicobeoordelingen blijven gelijk. Bronbankbeschikbaarheid is afzonderlijk van toepasselijkheid en selectie.
