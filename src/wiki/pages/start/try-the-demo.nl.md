---
title: De demo proberen
summary: Log met één klik in als planner, monteur of klant van de SHLTR-demo, en wat je in elke rol kunt proberen.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
	import DemoSwitchedOff from "#wiki/parts/demo-switched-off.svelte";
</script>

De demo is een verzonnen bedrijf, SHLTR: het installeert, onderhoudt en keurt deuren, docks,
trappen en airco. Het heeft klanten met vestigingen en apparaten, een jaar aan opdrachten en de
komende weken ingepland, en alle optionele modules staan aan. De namen en notities zijn in het
Nederlands, zoals bij een Nederlands bedrijf, in welke taal je de app ook gebruikt.

Waar de demo aan staat (op staging, en op de eigen computer van een ontwikkelaar), heeft de
inlogpagina onder het formulier drie knoppen, **Inloggen als**: Planner, Monteur en Klant. Eén klik
en je bent ingelogd; je typt niets. De knoppen **Probeer het** op deze pagina doen hetzelfde: elke
knop logt je in met zijn rol en opent de startpagina van die rol. Ze verschijnen alleen waar de
demo aan staat en je nog niet in de demo bent ingelogd. Ben je dat wel, dan wissel je met
**Bekijk als** (zie hieronder).

<DemoSwitchedOff />

## Als planner

Je komt binnen op het dashboard van kantoor, als Jan Weggemans, planner.

<TryIt as="planner" />

Probeer eens:

1. Open **Opdrachten**. Zoek, filter op status of type, groepeer, pas de kolommen aan.
2. Open een opdracht met de status **Nieuw (te accepteren)**: die heeft een klant gemeld.
   Accepteer hem, dan krijgt hij de status Nieuw, of plan hem meteen in met een monteur, een dag en
   een tijd. Of wijs hem af met een reden.
3. Open een opdracht en wijzig de status, vanuit de lijst of vanuit het formulier van de opdracht.
4. Open een klant, dan een van zijn vestigingen, een apparaat en de servicegeschiedenis van dat
   apparaat.
5. Open **Activiteit**: alles wat je net hebt gedaan, staat in het log.

## Als monteur

Je komt binnen in het monteursportaal, als Lev Hoekstra, op een pagina in de vorm van een telefoon.

<TryIt as="engineer" />

1. Open een opdracht die voor vandaag is ingepland, en kies **Klus starten**.
2. Schrijf wat uren en voeg een notitie toe.
3. Kies **Klus afronden**: teken met je vinger of muis, en teken nog een keer als monteur.

Wissel daarna naar de planner (zie hieronder) en open die opdracht: de aftekening en de notitie
staan erop.

## Als klant

Je komt binnen in het klantportaal, als Marieke Verhoeven, die bij Riedel B.V. werkt.

<TryIt as="customer" />

1. Kies **Storing melden** bij een van de apparaten. De melding verschijnt bij je opdrachten, als
   nog te accepteren.
2. Open een opdracht die klaar is: de aftekening, en de werkbon waar die module aan staat.
3. Open een apparaat: de keuringsstatus en de geschiedenis.

Je ziet alleen de gegevens van Riedel. De opdrachten en apparaten van de andere klanten staan er
niet bij, en je komt er ook niet bij door het adres te veranderen.

## Wisselen zonder uit te loggen

Ben je eenmaal binnen, dan heeft het gebruikersmenu **Bekijk als**, met dezelfde drie rollen en de
huidige aangevinkt. Kies een andere en je bent ingelogd als die rol en gaat naar de startpagina
ervan. Zo zie je het snelst één wijziging van twee kanten: meld een storing als klant, accepteer
hem als planner, en zie de opdracht van de klant veranderen.

Geen van de drie is eigenaar of beheerder. Iedereen kan de demo openen, dus geen van hen kan de
leden, uitnodigingen of instellingen van SHLTR wijzigen.

<HowItWorks />

Het inloggen gaat zonder wachtwoord, dus het bestaat alleen waar de omgeving dat zegt:
`DEMO_SIGN_IN=true` (in de variabelen van staging in `wrangler.jsonc`, of in de `.env` van een
ontwikkelaar). Productie zet die niet. Waar hij uit staat, wordt er niets van getoond, en elke
aanroep ervan antwoordt met 404 voordat hij leest wat er is gepost.

**De browser stuurt alleen de naam van de rol.** De server koppelt die aan een vast account
(`demoAccounts` in `src/routes/demo-accounts.server.ts`: Jan, Lev, Marieke) en controleert dat het
account bestaat, bij SHLTR hoort en nog de shell (de omgeving) van de rol heeft
(`shellOf(roles).name`). Daarna logt hij in via better-auth met het demowachtwoord uit de seed (de
demogegevens), zoals het inlogformulier zou doen, zodat de sessie en de organisatie ervan dezelfde
zijn als na het intypen. Niets uit het verzoek kiest het account.

**Bekijk als** logt in met de gekozen rol en beëindigt daarna de oude sessie, in één verzoek.
Mislukt het nieuwe inloggen, dan blijft de oude sessie bestaan.

**`TryIt`** (de knop op deze pagina) post het formulier van de inlogpagina, `demoSignIn`, met zijn
rol. Hij vraagt `demoSignInEnabled()` en `getViewAs()` (die alleen antwoordt voor iemand die in de
demo is ingelogd), en toont niets als het inloggen uit staat, als de bezoeker al in de demo is, of
als hij het niet kan vragen.

- <SourceLink path="src/routes/demo.remote.ts" line={23}><code>demoSignInEnabled</code>, inloggen en Bekijk als</SourceLink>
- <SourceLink path="src/routes/demo-accounts.server.ts">welk account elke rol is</SourceLink>
- <SourceLink path="src/routes/demo-roles.ts">de drie rollen</SourceLink>
- <SourceLink path="src/wiki/parts/try-it.svelte">de knop</SourceLink>

<DocsPointer doc="README.md" section="Demo login" />
