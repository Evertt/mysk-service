---
title: Tests en guard specs
summary: Vier soorten tests, plus guard specs die de handgeschreven manier weigeren om iets te doen wat de kit al doet.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
</script>

Fieldworks is zo gebouwd dat de verkeerde manier om iets te doen een test laat mislukken, met een
melding die de goede manier noemt. Zo blijft een codebase waar veel mensen, en veel agents,
tegelijk aan werken één codebase.

Wat dat betekent buiten de code:

- **De gegevens van een ander bedrijf blijven van dat bedrijf.** Elk onderdeel wordt getest op het
  afschermen van de records van North voor South, ook als iemand met een id knoeit. Een nieuw
  onderdeel zonder die test is niet af.
- **Wat een rol mag, wordt getest, niet aangenomen.** Wat een monteur mag doen en wat een
  klantcontact ziet, zijn specs, dus een refactor kan het niet stilletjes verruimen.
- **De echte app wordt bestuurd in een echte browser.** Een volledige run bestuurt de kantoorapp, het
  monteursportaal en het klantportaal op een productiebuild.
- **Deze wiki wordt ook getest.** Elke module, elk domein, elke shell (de omgeving van kantoor,
  monteurs of klanten) en elk thema moet door een pagina gedekt zijn, en elke link naar een bestand
  of een andere pagina moet bestaan. Een module die zonder pagina wordt toegevoegd, laat de build
  mislukken.

<HowItWorks />

## De soorten tests

Alle tests staan in mappen `tests/`, nooit naast wat ze testen, en volgen de vorm van de code: die
van de kern in `src/tests/unit/` en `src/tests/e2e/`, die van een module in zijn eigen
`tests/unit/` en `tests/e2e/`. Tests importeren wat ze testen via aliassen
(`#lib/orders/display.ts`).

| Soort          | Bestanden                              | Wat het controleert                                                                            |
| -------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Unit**       | `*.spec.ts`                            | Pure helpers: validatie, opmaak, domeinregels, formulierschema's                               |
| **Serverspec** | `*.spec.ts` in `tests/unit/**/server/` | De servercode van een onderdeel, gedraaid als een tenant (organisatie) op een gevulde database |
| **Component**  | `*.svelte.spec.ts`                     | Een gedeeld component, gerenderd in een browser met `vitest-browser-svelte`                    |
| **End-to-end** | `*.test.ts` in `tests/e2e/`            | De pagina: één ingelogde pagina per bestand, wijzigingen via de UI                             |

De vuistregel: wat de server beslist (zijn regels, zijn queries, wat hij logt, wat hij weigert),
test je in een serverspec, in een fractie van de tijd van een e2e-test, en de e2e-test controleert
dan alleen dat de pagina het toont en verstuurt.

**Serverspecs** gebruiken een harness (een testopstelling) die de servercode van de app draait
zoals een request dat doet, zonder HTTP. `as(actor, work)` draait `work` als de eigenaar van North,
de monteur van South of een klantcontact; `call(getOrder, number)` en
`submit(updateOrder, fields)` draaien SvelteKits eigen validatie, de gate van de set en de handler,
en antwoorden wat de client zou krijgen. Zo is een isolatietest een paar regels: roep een remote
function aan als South met het id van North, en verwacht een 404. Zie
`src/tests/unit/lib/orders/server/tenancy.spec.ts`.

**End-to-end**-tests besturen een productiebuild in Chromium, met één server en één verse, gevulde
database per worker. Inloggen is een sessie die in de database wordt geschreven plus een ondertekend
cookie, dus een test begint als de gebruiker die hij nodig heeft. De volledige run gaat via een
gedeeld slot, omdat parallelle builds elkaar zo vertragen dat ze in timeouts lopen.

## Guard specs

Een guard spec leest de broncode als tekst en weigert de handgeschreven variant van iets waar de kit
één manier voor heeft. De melding noemt het bestand en de regel. Het patroon is klein: zoek de
bestanden, haal het commentaar weg, zoek met een reguliere expressie, en maak een lijst van de
overtreders. Een paar ervan:

| Guard                      | Weigert                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `lists.spec.ts`            | Een tabel of toolbar die met de hand is gebouwd in plaats van uit de definitie van een lijst |
| `hand-written.spec.ts`     | Een uitgeschreven tenant-scope, een transactie in een `*.remote.ts`, een zelfgemaakte lookup |
| `remote-functions.spec.ts` | `query`, `form` en `command` geïmporteerd van ergens anders dan de gated sets                |
| `access.spec.ts`           | Een gelogd type zonder access rule, een feed die de registry overslaat                       |
| `state-colours.spec.ts`    | Een ruwe paletkleur die er in elk thema hetzelfde uit zou zien                               |
| `dialogs.spec.ts`          | `Dialog.Root` buiten de componenten die dialogen beheren                                     |
| `command-toasts.spec.ts`   | Een zelfgemaakte try/catch-toast rond een command                                            |

Een guard met uitzonderingen heeft een allow-list die zegt _waarom_ elke uitzondering blijft.

De wiki heeft twee guards van zichzelf: `coverage.spec.ts` (elke module-id, elk kerndomein, elke
shell en elk thema staat in de `covers` van een pagina, dus een nieuwe mislukt tot een pagina hem
dekt) en `links.spec.ts` (elk pad van een `SourceLink`, elke docs pointer en elke link `/wiki/…` noemt iets wat bestaat). Zie <SourceLink path="src/tests/unit/wiki/coverage.spec.ts">coverage.spec.ts</SourceLink> en <SourceLink path="src/tests/unit/wiki/links.spec.ts">links.spec.ts</SourceLink>.

## Tests uitvoeren

`pnpm test` draait alles en draait elk bestand dat mislukt één keer helemaal opnieuw; een bestand
dat twee keer mislukt, is een echte fout. `pnpm test:unit` draait elke spec zonder e2e, en dat is
het commando na het mergen van een branch, omdat een guard spec mislukt op code die een andere
branch meebracht. Draai voor je commit `pnpm run check`, `pnpm knip` en de tests van wat je hebt
gewijzigd.

<DocsPointer doc="docs/agents/tests.md" />
