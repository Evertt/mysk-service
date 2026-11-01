---
title: Rollen en shells
summary: Wie Fieldworks gebruiken, de drie shells waarin ze werken, en wat elke rol daar kan.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import RoleSwitcher from "#wiki/widgets/role-switcher/role-switcher.svelte";
</script>

Fieldworks is één app met drie **shells** (omgevingen, elk met eigen pagina's): de kantoorapp,
het monteursportaal en het klantportaal. Iemand werkt in één daarvan, en welke dat is, hangt af van
zijn rol in de organisatie. Elke shell heeft eigen pagina's, een eigen menu en eigen grenzen aan
wat hij laat zien.

<RoleSwitcher />

## De kantoorapp

Voor de mensen die het bedrijf draaien: planners, en de eigenaren en beheerders die ook de
organisatie beheren. Hij begint op `/`, het dashboard, en het hele bedrijf zit erin:

- **Opdrachten**: de lijst, de opdrachtpagina, het formulier. Maak een opdracht, geef hem een
  status, plan hem in (een monteur, een dag, een tijd), en accepteer of wijs de storingen af die
  klanten melden. Een badge bij Opdrachten telt de meldingen die nog wachten.
- **Klanten, Apparatuur en Monteurs**: de gegevens, met hun vestigingen, apparaten en locaties.
- **Activiteit**: het log van wie wat heeft gewijzigd.
- **Modules**: wat de organisatie heeft aangezet, zoals Planning of Facturatie, elk met een eigen
  plek in het menu.
- **Instellingen**, alleen voor eigenaren en beheerders: leden, uitnodigingen, opdrachttypes,
  apparatuurcategorieën, welke modules aan staan.

De rollen op kantoor: `owner` en `admin` (eigenaar en beheerder: de managers) en `member`
(medewerker). Een medewerker doet alles hierboven, behalve de instellingen.

## Het monteursportaal

Voor monteurs in het veld, op de telefoon. Het begint op `/my`: de opdrachten die voor de monteur
zijn ingepland, per dag, en de recente. Een opdracht opent met wat de monteur op locatie nodig
heeft: de klus, de apparaten, de vestiging met de toegangsinstructies, en de contactpersoon van de
klant, met knoppen om te bellen en te mailen.

Daar start de monteur de klus, schrijft hij de uren, voegt hij notities toe en rondt hij de klus
af: de klant tekent op het scherm, en de monteur ook. Wie de QR-code van een apparaat of een plek
scant, opent die in dit portaal, met de open opdrachten van de monteur ervoor.

Een monteur ziet alleen de opdrachten die aan hem zijn toegewezen. De rol is `engineer`, en een
eigenaar of beheerder koppelt het account aan de gegevens van een monteur, op de pagina van die
monteur.

## Het klantportaal

Voor de eigen contactpersonen van de klant. Het begint op `/portal`: een knop om een storing te
melden, de open opdrachten van de klant (ook die nog niet geaccepteerd zijn) en het laatst afgeronde
werk. Daarnaast zijn er pagina's voor hun opdrachten, apparaten en locaties.

Een contactpersoon ziet alleen de gegevens van zijn eigen klant, en als het kantoor hem voor slechts
een paar vestigingen heeft uitgenodigd, alleen die van die vestigingen. De notities van de monteurs
ziet hij niet; van een monteur ziet hij de voornaam. De rol is `customer`; een eigenaar of
beheerder nodigt een contactpersoon uit vanaf de pagina van de klant, onder Portaaltoegang.

## En een vierde plek: /ops

Ontwikkelaars hebben een klein gedeelte op `/ops` om de meldingen te lezen die mensen via Probleem melden vastleggen.
Het is geen shell van een tenant (een organisatie in de app) en staat niet in `shells.ts`; alleen
de e-mailadressen in `DEVELOPER_EMAILS` komen erin.

<HowItWorks />

Eén bestand kent de shells: `src/lib/auth/shells.ts`. Elke shell heeft een `name`, een `home` (waar
zijn leden beginnen, en waar de guard ze naartoe terugstuurt vanaf een pagina die niet van hen is) en
`owns(routeId)` (welke pagina's van hem zijn, op basis van het route-id van SvelteKit, zodat de pagina's van
een module in dezelfde route group meetellen). De guard is de controle die bij elke pagina
meekijkt; een route group is een map met de routes van één omgeving.

| Shell      | `home`    | Eigen routes                                                                   |
| ---------- | --------- | ------------------------------------------------------------------------------ |
| `office`   | `/`       | elke route behalve het klantportaal (een kantoormedewerker mag `/my` bekijken) |
| `engineer` | `/my`     | de route group `(field)`, en de links van de QR-codes, `/q/[token]`            |
| `customer` | `/portal` | de route group `(customer)`, en de links van de QR-codes                       |

**Welke shell een lid krijgt**, bepaalt `shellOf(roles)`, op basis van zijn rollen in de huidige
organisatie: een lid met als enige teamrol `engineer` krijgt het monteursportaal, een lid met als
enige rol `customer` het klantportaal, ieder ander de kantoorapp. Wie naast `engineer` ook een
kantoorrol heeft, werkt op kantoor.

**De guard** is `handleGuard` in `hooks.server.ts`. Bij elk paginaverzoek van een ingelogde
gebruiker vraagt hij `shellOf(roles).owns(routeId)`, en hij stuurt door naar de `home` van de
shell als de pagina niet van die shell is. Wie niet is ingelogd, gaat naar de inlogpagina en daarna
terug. `/wiki` is openbaar en blijft erbuiten.

De guard beslist alleen welke pagina je mag openen. Wat je mag lezen, beslist de server nog een
keer: via de gate waarmee elke remote function is gemaakt (`forMembers`, `forEngineers`,
`forCustomers`, …) en via het access registry. Een remote function is een functie op de server die
een pagina direct aanroept, de gate de toegangscontrole die ervoor zit, en het access registry het
register dat zegt wie welke gegevens mag lezen of wijzigen. Zo krijgt een klant die het opdrachtnummer van een
andere klant raadt een 404, via welke pagina hij het ook vraagt.

De demoaccounts volgen dezelfde verdeling: Jan is medewerker (kantoor), Lev monteur, Marieke
contactpersoon van een klant.

- <SourceLink path="src/lib/auth/shells.ts" line={28}><code>shells</code> en <code>shellOf()</code></SourceLink>
- <SourceLink path="src/lib/auth/roles.ts">de rollen</SourceLink>, met <code>isFieldEngineer()</code> en
  <code>isCustomerContact()</code>
- <SourceLink path="src/hooks.server.ts" line={145}><code>handleGuard</code></SourceLink>
- <SourceLink path="src/wiki/widgets/role-switcher/roles.ts">de kaarten hierboven</SourceLink>

<DocsPointer doc="docs/agents/tenancy.md" section="Tenancy" />
