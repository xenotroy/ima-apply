# Historische risicobeoordelingen

Een scenario is de actuele werkversie. **Beoordelingsmoment vastleggen** bewaart daarnaast een afzonderlijke volledige kopie: scenario, W/B/E, alle maatregelen en bewijsnotities, AHS-/uitvoerbaarheidsinvoer, bron-IDs, scope, eventuele LOPA, methodeversie, resultaat, beoordelaar, tijdstip en motivatie. Alleen een bewuste vastlegging maakt een nieuw record; iedere toetsaanslag wordt geen afzonderlijke beoordeling.

De oude vastlegging wordt niet herberekend of vervangen wanneer iemand daarna het scenario wijzigt. De JSON-export bevat de volledige historische invoer. De leesbare rapportage toont beoordelaar, aanleiding, factoren, werking, score-/frequentiebanden en inhoudshash. Er is geen automatische risicoreductie of acceptatiebesluit door het bewaren van een moment.

Import controleert scenario-identiteit, veldgrenzen, scopeverwijzingen en canonieke SHA-256. Voor de herkende methodeversie worden de historische uitkomsten opnieuw uit de historische invoer berekend en met de opgeslagen resultaten vergeleken. Een gewijzigde score met een opnieuw berekende hash blijft daardoor inconsistent. Een onbekende historische methodeversie wordt als historische data behouden; de huidige engine bevestigt haar formule niet.

De hash is een consistentiecontrole binnen de export, geen externe handtekening. De opgegeven beoordelaar is een vastgelegde naam, niet automatisch geauthenticeerd. GitHub-versies en afzonderlijke exports bieden aanvullend herstelbewijs. Een opgeslagen moment bewijst evenmin dat de maatregelen fysiek zijn geïnspecteerd.

Bewijsroutes: `web/src/data/risk-history.test.ts` en de browserflow in `web/e2e/risk-workflows.spec.ts`. Deze controleren scheiding tussen historisch en actueel, ontbrekende beoordelaar/motivatie, gewijzigd bronrecord, onjuist gereconstrueerde uitkomst, referenties, reload en leesbare rapportage.
