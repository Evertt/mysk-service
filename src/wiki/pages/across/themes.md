---
title: Themes
summary: Six looks for the whole app, each in light and dark, picked in the header and remembered in a cookie.
section: across
order: 7
status: built
covers: [theme:neutral, theme:harbor, theme:lagoon, theme:blueprint, theme:brutalist, theme:sorbet]
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import ThemeGallery from "#wiki/widgets/theme-gallery/theme-gallery.svelte";
</script>

Fieldworks can look like six different products. Everyone picks a theme and a mode in the header
(and on the sign-in page): the theme switcher, and the mode switcher with Light, Dark and System,
which follows your device's setting. The choice is kept in a cookie for a year, so it is the same on
your next visit and, since the server reads the cookie, there is no flash of the wrong colours while
the page loads. Try them on this wiki: the switchers in this page's header change it too.

- **Neutral** is shadcn-svelte as installed, with no changes.
- **Harbor** is calm and professional: cool slate, a deep teal for actions, a warm sand accent, IBM
  Plex Sans and gently rounded corners.
- **Lagoon** is the default. It is crisp and practical, after the SHLTR client mockup: white cards
  with thin slate borders and no shadows on a cool grey page, a teal brand, tinted status badges,
  the system font and 8px corners on its cards, buttons and fields (its `--radius` is 0.625rem;
  those use the `md` radius, 0.8 of it).
- **Blueprint** is drafting paper and navy ink with monospace type, square corners and dashed
  construction lines. Dark mode is an actual blueprint: pale lines on deep blue.
- **Brutalist** is neo-brutalism: cream paper, thick black outlines, hard offset shadows, loud
  yellow and pink, uppercase labels and buttons that press in.
- **Sorbet** is light and breezy: sky-tinted air, coral and sunshine accents, rounded Nunito type,
  pill shapes and controls that bounce when touched. Dark mode is a summer night.

Each card below is the real kit (buttons, badges, an input, a switch) in that theme, light and dark
side by side:

<ThemeGallery />

A theme changes how things look, never what they mean. A status is coloured by its meaning (done,
needs attention, new, critical) with the same tone tokens in every theme, so "Completed" reads as
good news whether the page is a blueprint or a sorbet.

<HowItWorks />

A theme is one file in `src/lib/themes/`, registered in <SourceLink path="src/lib/themes/index.ts" line={13} symbol="themes">index.ts</SourceLink>. The gallery above and
the switchers are built from that list (`themeNames`), so a registered theme appears in both. A
wiki guard spec also fails until a page's `covers` names the new theme.

A file has two kinds of styling:

- **CSS variables**: colours, `--radius` and `--font-body`, with the ones that change in dark mode
  in `darkVars`. They are written into one stylesheet scoped by `[data-theme="<name>"]`, with dark
  under the `.dark` class, which is why any element can preview a theme, as the gallery does.
- **Classes per component part**: Tailwind classes keyed by a part's `data-slot` (`button`,
  `card`, `badge`, and per prop value, such as a button's `variant` and `size`). A component asks
  `useTheme().classes("button", { variant, size })` and merges the result over its own classes. This
  is how Brutalist gets its shadows and Sorbet its pills without a component knowing about either.
  See <SourceLink path="src/lib/themes/context.ts" line={21}>useTheme</SourceLink> and <SourceLink path="src/lib/themes/types.ts">the Theme type</SourceLink>.

The pieces that apply it:

1. `handleTheme` in `hooks.server.ts` reads the `theme` and `mode` cookies and puts `data-theme` and
   `data-mode` (and the `dark` class) on `<html>` in the first byte of the response. This is why the
   wiki's pages are rendered on the server and not prerendered.
2. `<ThemeProvider>` hands the theme's classes to every component through context and keeps the
   attributes in step when you switch.
3. `setTheme` and `setMode` are `forAnyone` commands: they set the cookie and touch no tenant data,
   which is why they are public on purpose.

After adding or updating a shadcn-svelte component, run `pnpm themes:sync` so the themes can style
its parts. A raw palette colour such as `text-emerald-600` is refused by a guard
(`state-colours.spec.ts`), because it would look the same in every theme.

<DocsPointer doc="docs/agents/kit.md" section="Colours and themes" />
