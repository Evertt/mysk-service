<!--
	@component
	The language, theme and mode switchers, together and in that order, wherever a shell offers them:
	icon buttons with their menus (a header's), or with `submenu` items of another dropdown menu, their
	choices beside them, or with `submenu="below"` under them, over the menu (a phone's narrow menu).
	The shell puts them in its row of buttons or its menu's group.
-->
<script lang="ts">
	import LanguageSwitcher from "#lib/i18n/language-switcher.svelte";
	import ModeSwitcher from "#lib/themes/mode-switcher.svelte";
	import ThemeSwitcher from "#lib/themes/theme-switcher.svelte";

	let { submenu = false }: { submenu?: boolean | "below" } = $props();
</script>

<LanguageSwitcher {submenu} />
<ThemeSwitcher {submenu} />
<ModeSwitcher {submenu} />
