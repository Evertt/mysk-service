---
title: Meldingen
summary: De bel in de kopbalk van kantoor en van het monteursportaal toont de paar logregels waar je iets mee moet of van moet weten.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Het [activiteitenlog](/wiki/across/activity-log) legt alles vast, dus de paar dingen die jou
aangaan zouden erin verdrinken. De bel pikt ze eruit. Een stip erop telt wat er binnenkwam sinds je
hem het laatst opende (tot "9+"), en het paneel toont de nieuwste vijftig van de laatste dertig
dagen, per dag, elk met een icoon voor de categorie en de zin uit het log.

**Op kantoor** meldt de bel een planner:

- **Melding van een klant.** Een klant heeft in zijn portaal een storing gemeld en die wacht op
  acceptatie.
- **Waarschuwing.** Het systeem heeft zelf een opdracht gemaakt: een onderhoudsplan kwam aan de
  beurt, de conditie van een apparaat werd kritiek, een dockdeur bleef te lang open. Een deuralarm
  van de module Docks telt ook mee.
- **Voortgang in het veld.** Een monteur is aan een opdracht begonnen of heeft hem afgerond, of een
  checklist werd afgerond met een punt dat is afgekeurd.
- **Jouw gegevens.** Iemand wijzigde een record dat jij hebt aangemaakt of als laatste hebt
  gewijzigd.

**In het monteursportaal** meldt de bel een monteur wanneer een opdracht aan hem wordt toegewezen,
van hem wordt afgehaald, op een ander moment wordt ingepland, of wordt geannuleerd terwijl de
opdracht nog van hem is.

Je eigen wijzigingen laten nooit je eigen bel gaan. Open je het paneel, dan telt wat het toont als
gezien, tot en met de nieuwste logregel erin, dus iets wat binnenkomt terwijl het openstaat, blijft
ongelezen. Een tabblad dat al openstaat, werkt de stip zelf bij
([live updates](/wiki/across/live-updates)).

<TryIt as="planner" />

<TryIt as="engineer" />

<HowItWorks />

Er bestaat geen record voor een melding. Een melding is een logregel uit het activiteitenlog die
een regel uitkiest, dus het enige wat per persoon wordt opgeslagen, is hoe ver die heeft gelezen
(`notification_seen`: het id van de nieuwste logregel die zijn paneel toonde). De regels zijn
waarden, `{ id, audience, category, where }`, waarin `where` een voorwaarde is op de tabel
`activity`, voor elk request opnieuw gebouwd. Een regel die later bijkomt, geldt ook voor oude
logregels, omdat er niets werd opgeslagen toen die gebeurden.

1. **De regels van de kern** staan in <SourceLink path="src/lib/server/notifications/rules.ts" line={90}>coreNotificationRules</SourceLink>,
   in de volgorde die de categorie bepaalt: de eerste regel die past, geeft een logregel zijn
   categorie.
2. **Een module voegt zijn eigen toe** met `contribute(notificationRules, () => [...])` in zijn
   `server/index.ts`. Docks voegt `docks.doorAlerts` toe, Werkbonnen `checklists.rejected`. De
   kernel (het deel dat de modules aanroept) vraagt het alleen aan modules die een tenant (een
   organisatie in de app) aan heeft staan, dus een module die uit staat, voegt er geen toe. Zie <SourceLink path="src/lib/notifications/extensions.ts" line={72}>notificationRules</SourceLink>.
3. **De query** houdt de logregels van de tenant over, die van anderen (of van het systeem), nieuwer
   dan 30 dagen, en voor de stip nieuwer dan `lastSeen`, en kiest dan de categorie met één `case`
   over alle regels. Zie <SourceLink path="src/lib/server/notifications/notifications.ts" line={54}>rulesFor</SourceLink>.
4. **De stip is live.** De live query van de kantoorapp (`watchShell`) antwoordt opnieuw na elke
   gelogde wijziging, en de bel leest daaruit het nieuwe aantal.

Een regel heeft alleen de logregel nodig om te beslissen. Heeft hij meer nodig dan erin staat, dan
voeg je dat aan de logregel toe (`changes`), en sla je geen eigen record op. Regels schrijven hun
constanten erin met `literal()` en lezen de tabellen van de tenant alleen via gecorreleerde
subqueries, zodat een statement met alle regels weinig waarden bindt. Dat is van belang, omdat een
statement op Cloudflare hoogstens 100 waarden bindt.

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
