import { defineTheme } from "./types.ts";

const pill = "rounded-full";
const softGlow = "shadow-lg shadow-primary/10";
const bouncy =
	"transition-[translate,scale,box-shadow,background-color] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]";
const field = `${pill} border-2 border-border bg-card shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/15 dark:bg-card`;
const menuItem = "rounded-xl font-semibold focus:bg-accent focus:text-accent-foreground";
const floating = `rounded-2xl ring-border/70 ${softGlow}`;

/**
 * Light, bright and breezy: sky-tinted air, coral, sunshine and sky accents, the rounded Nunito
 * font, pill shapes, soft coloured glows and controls that bounce when you touch them. Dark mode
 * is a summer night: plum and indigo with glowing coral and sunshine.
 */
export default defineTheme({
	label: "Sorbet",
	vars: {
		"--font-body": '"Nunito Variable", sans-serif',
		"--background": "oklch(0.988 0.012 210)",
		"--foreground": "oklch(0.33 0.07 275)",
		"--card": "oklch(1 0 0)",
		"--card-foreground": "oklch(0.33 0.07 275)",
		"--popover": "oklch(1 0 0)",
		"--popover-foreground": "oklch(0.33 0.07 275)",
		"--primary": "oklch(0.66 0.2 15)",
		"--primary-foreground": "oklch(0.99 0.01 15)",
		"--secondary": "oklch(0.93 0.05 215)",
		"--secondary-foreground": "oklch(0.38 0.1 235)",
		"--muted": "oklch(0.96 0.02 220)",
		"--muted-foreground": "oklch(0.55 0.05 265)",
		"--accent": "oklch(0.95 0.1 100)",
		"--accent-foreground": "oklch(0.42 0.1 75)",
		"--destructive": "oklch(0.62 0.22 25)",
		"--border": "oklch(0.92 0.03 225)",
		"--input": "oklch(0.92 0.03 225)",
		"--ring": "oklch(0.66 0.2 15)",
		"--chart-1": "oklch(0.66 0.2 15)",
		"--chart-2": "oklch(0.75 0.13 220)",
		"--chart-3": "oklch(0.88 0.15 100)",
		"--chart-4": "oklch(0.72 0.15 160)",
		"--chart-5": "oklch(0.7 0.15 300)",
		"--radius": "1rem",
		"--sidebar": "oklch(0.97 0.025 215)",
		"--sidebar-foreground": "oklch(0.33 0.07 275)",
		"--sidebar-primary": "oklch(0.66 0.2 15)",
		"--sidebar-primary-foreground": "oklch(0.99 0.01 15)",
		"--sidebar-accent": "oklch(1 0 0)",
		"--sidebar-accent-foreground": "oklch(0.33 0.07 275)",
		"--sidebar-border": "oklch(0.92 0.03 225)",
		"--sidebar-ring": "oklch(0.66 0.2 15)",
	},
	darkVars: {
		"--background": "oklch(0.2 0.045 285)",
		"--foreground": "oklch(0.95 0.015 285)",
		"--card": "oklch(0.25 0.05 285)",
		"--card-foreground": "oklch(0.95 0.015 285)",
		"--popover": "oklch(0.27 0.05 285)",
		"--popover-foreground": "oklch(0.95 0.015 285)",
		"--primary": "oklch(0.74 0.16 15)",
		"--primary-foreground": "oklch(0.2 0.045 285)",
		"--secondary": "oklch(0.33 0.07 240)",
		"--secondary-foreground": "oklch(0.9 0.06 220)",
		"--muted": "oklch(0.29 0.045 285)",
		"--muted-foreground": "oklch(0.75 0.04 285)",
		"--accent": "oklch(0.38 0.07 90)",
		"--accent-foreground": "oklch(0.95 0.11 100)",
		"--destructive": "oklch(0.7 0.18 22)",
		"--border": "oklch(1 0 0 / 10%)",
		"--input": "oklch(1 0 0 / 14%)",
		"--ring": "oklch(0.74 0.16 15)",
		"--chart-1": "oklch(0.74 0.16 15)",
		"--chart-2": "oklch(0.78 0.11 220)",
		"--chart-3": "oklch(0.9 0.13 100)",
		"--chart-4": "oklch(0.75 0.13 160)",
		"--chart-5": "oklch(0.75 0.13 300)",
		"--sidebar": "oklch(0.17 0.045 285)",
		"--sidebar-foreground": "oklch(0.92 0.015 285)",
		"--sidebar-primary": "oklch(0.74 0.16 15)",
		"--sidebar-primary-foreground": "oklch(0.2 0.045 285)",
		"--sidebar-accent": "oklch(0.27 0.05 285)",
		"--sidebar-accent-foreground": "oklch(0.95 0.015 285)",
		"--sidebar-border": "oklch(1 0 0 / 8%)",
		"--sidebar-ring": "oklch(0.74 0.16 15)",
	},
	components: {
		"app-header": { base: "border-b-0 bg-background/70 backdrop-blur-md" },
		badge: {
			base: `${pill} px-2.5 font-bold`,
			variant: {
				default: "shadow-sm shadow-primary/30",
				secondary: "bg-secondary text-secondary-foreground",
				outline: "border-transparent bg-accent text-accent-foreground",
				ghost: "bg-muted",
			},
		},
		button: {
			base: `${pill} font-bold ${bouncy} hover:-translate-y-0.5 active:not-aria-[haspopup]:translate-y-0 active:not-aria-[haspopup]:scale-95`,
			variant: {
				default:
					"shadow-md shadow-primary/30 hover:bg-primary hover:shadow-lg hover:shadow-primary/40",
				secondary: "hover:bg-secondary hover:shadow-md hover:shadow-secondary",
				// The `dark:` classes override shadcn's own dark-mode backgrounds for these variants.
				outline:
					"border-2 border-border shadow-none hover:border-primary/40 hover:bg-card dark:border-border dark:bg-card dark:hover:bg-card",
				ghost:
					"hover:translate-y-0 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent",
				destructive:
					"bg-destructive text-white hover:bg-destructive dark:bg-destructive dark:hover:bg-destructive",
			},
		},
		card: { base: `rounded-3xl ring-border/60 ${softGlow}` },
		"card-title": { base: "font-extrabold" },
		checkbox: {
			base: "size-[1.125rem] rounded-md border-2 data-checked:border-primary dark:bg-card",
		},
		"command-item": {
			base: "rounded-xl font-semibold data-selected:bg-accent data-selected:text-accent-foreground",
		},
		"data-table": {
			base: `rounded-3xl border-0 bg-card ring-1 ring-border/60 ${softGlow} [--data-table-surface:var(--card)]`,
		},
		"dialog-content": { base: "rounded-3xl" },
		"dropdown-menu-content": { base: floating },
		"dropdown-menu-item": { base: menuItem },
		"dropdown-menu-checkbox-item": { base: menuItem },
		"dropdown-menu-radio-item": { base: menuItem },
		"dropdown-menu-label": { base: "font-extrabold text-primary" },
		"empty-icon": { variant: { icon: "rounded-full bg-accent text-accent-foreground" } },
		input: { base: field },
		"input-group": {
			base: `${field} has-[[data-slot=input-group-control]:focus-visible]:border-primary/50`,
		},
		"popover-content": { base: floating },
		"select-content": { base: floating },
		"select-item": { base: menuItem },
		"select-trigger": { base: `${field} dark:hover:bg-card` },
		"sidebar-inner": {
			base: "bg-linear-to-b from-sidebar via-sidebar to-accent/60 dark:to-primary/15",
		},
		"sidebar-container": { base: "group-data-[side=left]:border-e-0" },
		"sidebar-group-label": { base: "font-extrabold text-primary" },
		"sidebar-menu-button": {
			base: `${pill} font-bold ${bouncy} hover:translate-x-1 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-md data-active:shadow-primary/30`,
		},
		skeleton: { base: pill },
		"table-head": { base: "font-extrabold text-secondary-foreground" },
		"table-header": { base: "bg-secondary/50 [&_tr]:border-b-0" },
		"table-row": {
			base: "border-border/50 hover:bg-accent/50 data-[state=selected]:bg-accent",
		},
		"table-footer": { base: "bg-accent font-extrabold text-accent-foreground" },
		"tooltip-content": { base: `${pill} bg-primary px-3.5 font-bold text-primary-foreground` },
		"tooltip-arrow": { base: "bg-primary fill-primary" },
	},
});
