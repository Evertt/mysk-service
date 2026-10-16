import { defineTheme } from "./types.ts";

const hardShadow = {
	sm: "shadow-[2px_2px_0_0_var(--foreground)]",
	md: "shadow-[3px_3px_0_0_var(--foreground)]",
	lg: "shadow-[6px_6px_0_0_var(--foreground)]",
};
const outlined = "border-2 border-foreground ring-0";
const floating = `${outlined} ${hardShadow.md}`;
const highlightOnFocus = "font-medium focus:bg-primary focus:text-primary-foreground";

/**
 * Neo-brutalism: cream paper, thick black outlines, hard offset shadows, loud yellow and pink,
 * bold uppercase labels and buttons that physically press in. Most of this lives in the component
 * classes rather than the variables. Dark mode inverts it: cream outlines and shadows on black.
 */
export default defineTheme({
	label: "Brutalist",
	vars: {
		"--font-body": '"Space Grotesk Variable", sans-serif',
		"--background": "oklch(0.97 0.03 95)",
		"--foreground": "oklch(0.17 0 0)",
		"--card": "oklch(1 0 0)",
		"--card-foreground": "oklch(0.17 0 0)",
		"--popover": "oklch(1 0 0)",
		"--popover-foreground": "oklch(0.17 0 0)",
		"--primary": "oklch(0.88 0.18 98)",
		"--primary-foreground": "oklch(0.17 0 0)",
		"--secondary": "oklch(0.83 0.1 220)",
		"--secondary-foreground": "oklch(0.17 0 0)",
		"--muted": "oklch(0.93 0.035 95)",
		"--muted-foreground": "oklch(0.38 0.02 95)",
		"--accent": "oklch(0.78 0.16 350)",
		"--accent-foreground": "oklch(0.17 0 0)",
		"--destructive": "oklch(0.6 0.24 27)",
		"--border": "oklch(0.17 0 0)",
		"--input": "oklch(0.17 0 0)",
		"--ring": "oklch(0.17 0 0)",
		"--radius": "0rem",
		"--sidebar": "oklch(1 0 0)",
		"--sidebar-foreground": "oklch(0.17 0 0)",
		"--sidebar-primary": "oklch(0.17 0 0)",
		"--sidebar-primary-foreground": "oklch(0.88 0.18 98)",
		"--sidebar-accent": "oklch(0.88 0.18 98)",
		"--sidebar-accent-foreground": "oklch(0.17 0 0)",
		"--sidebar-border": "oklch(0.17 0 0)",
		"--sidebar-ring": "oklch(0.17 0 0)",
	},
	darkVars: {
		"--background": "oklch(0.15 0 0)",
		"--foreground": "oklch(0.96 0.03 95)",
		"--card": "oklch(0.21 0 0)",
		"--card-foreground": "oklch(0.96 0.03 95)",
		"--popover": "oklch(0.21 0 0)",
		"--popover-foreground": "oklch(0.96 0.03 95)",
		"--muted": "oklch(0.26 0 0)",
		"--muted-foreground": "oklch(0.78 0.03 95)",
		"--border": "oklch(0.96 0.03 95)",
		"--input": "oklch(0.96 0.03 95)",
		"--ring": "oklch(0.96 0.03 95)",
		"--sidebar": "oklch(0.12 0 0)",
		"--sidebar-foreground": "oklch(0.96 0.03 95)",
		"--sidebar-primary": "oklch(0.88 0.18 98)",
		"--sidebar-primary-foreground": "oklch(0.17 0 0)",
		"--sidebar-border": "oklch(0.96 0.03 95)",
		"--sidebar-ring": "oklch(0.96 0.03 95)",
	},
	components: {
		"app-header": { base: "border-b-2 border-foreground" },
		badge: {
			base: "border-2 border-foreground font-bold tracking-wide uppercase",
			variant: {
				default: "bg-primary text-primary-foreground",
				secondary: "bg-secondary text-secondary-foreground",
				outline: "bg-card",
				ghost: "border-dashed",
				destructive: "bg-destructive text-white dark:bg-destructive",
				// Loud flat fills with black type, in both modes.
				success: "bg-emerald-300 text-black",
				warning: "bg-amber-300 text-black",
				info: "bg-sky-300 text-black",
				danger: "bg-destructive text-white dark:bg-destructive",
				neutral: "border-dashed bg-muted text-foreground",
			},
		},
		button: {
			base: `border-2 border-foreground font-bold tracking-wide uppercase ${hardShadow.md} transition-[translate,box-shadow,background-color] hover:-translate-px hover:shadow-[4px_4px_0_0_var(--foreground)] active:not-aria-[haspopup]:translate-[3px] active:not-aria-[haspopup]:shadow-none`,
			variant: {
				default: "bg-primary hover:bg-primary",
				secondary: "bg-secondary hover:bg-secondary",
				// The `dark:` classes override shadcn's own dark-mode backgrounds for these variants.
				outline: "bg-card hover:bg-accent dark:border-foreground dark:bg-card dark:hover:bg-accent",
				destructive:
					"bg-destructive text-white hover:bg-destructive dark:bg-destructive dark:hover:bg-destructive",
				// Ghost and link buttons sit inside other parts (headers, menus), so they stay flat.
				ghost:
					"border-transparent shadow-none hover:translate-0 hover:bg-primary hover:text-primary-foreground hover:shadow-none active:not-aria-[haspopup]:translate-0 dark:hover:bg-primary",
				link: "border-transparent normal-case shadow-none hover:translate-0 hover:shadow-none",
			},
		},
		card: { base: `${outlined} ${hardShadow.lg}` },
		"card-title": { base: "text-lg font-bold tracking-tight uppercase" },
		checkbox: {
			base: "border-2 border-foreground bg-card data-checked:border-foreground dark:bg-card",
		},
		"command-item": {
			base: "font-medium data-selected:bg-primary data-selected:text-primary-foreground",
		},
		"dropdown-menu-content": { base: floating },
		"dropdown-menu-item": { base: highlightOnFocus },
		"dropdown-menu-checkbox-item": { base: highlightOnFocus },
		"dropdown-menu-radio-item": { base: highlightOnFocus },
		"dropdown-menu-label": { base: "text-xs font-bold tracking-wider uppercase" },
		"dropdown-menu-separator": { base: "h-0.5 bg-foreground" },
		input: { base: `border-2 border-foreground bg-card ${hardShadow.sm} dark:bg-card` },
		"input-group": { base: `border-2 border-foreground bg-card ${hardShadow.sm} dark:bg-card` },
		"popover-content": { base: floating },
		"select-content": { base: floating },
		"select-item": { base: highlightOnFocus },
		"select-trigger": {
			base: `border-2 border-foreground bg-card ${hardShadow.sm} dark:bg-card dark:hover:bg-card`,
		},
		"sidebar-group-label": { base: "font-bold tracking-wider text-sidebar-foreground uppercase" },
		"sidebar-menu-button": {
			base: "font-bold tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground",
		},
		"breadcrumb-link": {
			base: "font-bold underline decoration-2 underline-offset-4 hover:bg-primary",
		},
		"data-table": {
			base: `rounded-none border-0 ${hardShadow.lg} [--data-table-surface:var(--card)]`,
		},
		"dialog-content": { base: `${outlined} ${hardShadow.lg}` },
		separator: { base: "bg-foreground" },
		"sidebar-container": { base: "group-data-[side=left]:border-e-2" },
		"table-container": { base: `${outlined} bg-card` },
		"table-header": { base: "bg-foreground [&_tr]:border-b-0" },
		"table-head": { base: "text-xs font-bold tracking-wider text-background uppercase" },
		"table-row": {
			base: "border-b-2 border-foreground/15 hover:bg-primary/30 data-[state=selected]:bg-primary data-[state=selected]:text-primary-foreground",
		},
		"table-footer": {
			base: "border-t-2 border-foreground bg-primary font-bold text-primary-foreground",
		},
		"tooltip-content": {
			base: "border-2 border-foreground bg-primary font-bold text-primary-foreground uppercase",
		},
		"tooltip-arrow": { base: "hidden" },
	},
});
