import { defineTheme } from "./types.ts";

/**
 * Crisp and practical, after the SHLTR client mockup: white cards with thin slate borders and no
 * shadows on a cool grey page, a teal brand for actions, the active page and highlights, tinted
 * status badges, the system font and 8px corners. Section cards have a header band with a teal bar
 * before their title. Light and dark.
 */
export default defineTheme({
	label: "Lagoon",
	vars: {
		"--font-body": "ui-sans-serif, system-ui, sans-serif",
		// Tailwind's slate and teal scales, as the mockup uses them.
		"--background": "oklch(0.975 0.003 264)",
		"--foreground": "oklch(0.208 0.042 265.755)",
		"--card": "oklch(1 0 0)",
		"--card-foreground": "oklch(0.208 0.042 265.755)",
		"--popover": "oklch(1 0 0)",
		"--popover-foreground": "oklch(0.208 0.042 265.755)",
		"--primary": "oklch(0.6 0.118 184.704)",
		"--primary-foreground": "oklch(1 0 0)",
		"--secondary": "oklch(0.968 0.007 247.896)",
		"--secondary-foreground": "oklch(0.279 0.041 260.031)",
		"--muted": "oklch(0.968 0.007 247.896)",
		"--muted-foreground": "oklch(0.554 0.046 257.417)",
		"--accent": "oklch(0.984 0.014 180.72)",
		"--accent-foreground": "oklch(0.511 0.096 186.391)",
		"--destructive": "oklch(0.586 0.253 17.585)",
		"--border": "oklch(0.929 0.013 255.508)",
		"--input": "oklch(0.929 0.013 255.508)",
		"--ring": "oklch(0.777 0.152 181.912)",
		"--chart-1": "oklch(0.685 0.169 237.323)",
		"--chart-2": "oklch(0.673 0.182 276.935)",
		"--chart-3": "oklch(0.769 0.188 70.08)",
		"--chart-4": "oklch(0.696 0.17 162.48)",
		"--chart-5": "oklch(0.437 0.078 188.216)",
		"--radius": "0.625rem",
		"--sidebar": "oklch(1 0 0)",
		"--sidebar-foreground": "oklch(0.446 0.043 257.281)",
		"--sidebar-primary": "oklch(0.704 0.14 182.503)",
		"--sidebar-primary-foreground": "oklch(1 0 0)",
		"--sidebar-accent": "oklch(0.975 0.005 248)",
		"--sidebar-accent-foreground": "oklch(0.208 0.042 265.755)",
		"--sidebar-border": "oklch(0.929 0.013 255.508)",
		"--sidebar-ring": "oklch(0.777 0.152 181.912)",
	},
	darkVars: {
		"--background": "oklch(0.129 0.042 264.695)",
		"--foreground": "oklch(0.968 0.007 247.896)",
		"--card": "oklch(0.18 0.04 265)",
		"--card-foreground": "oklch(0.968 0.007 247.896)",
		"--popover": "oklch(0.208 0.042 265.755)",
		"--popover-foreground": "oklch(0.968 0.007 247.896)",
		"--primary": "oklch(0.704 0.14 182.503)",
		"--primary-foreground": "oklch(0.129 0.042 264.695)",
		"--secondary": "oklch(0.279 0.041 260.031)",
		"--secondary-foreground": "oklch(0.929 0.013 255.508)",
		"--muted": "oklch(0.24 0.04 262)",
		"--muted-foreground": "oklch(0.704 0.04 256.788)",
		"--accent": "oklch(0.704 0.14 182.503 / 14%)",
		"--accent-foreground": "oklch(0.855 0.138 181.071)",
		"--destructive": "oklch(0.712 0.194 13.428)",
		"--border": "oklch(1 0 0 / 10%)",
		"--input": "oklch(1 0 0 / 14%)",
		"--ring": "oklch(0.6 0.118 184.704)",
		"--chart-1": "oklch(0.746 0.16 232.661)",
		"--chart-2": "oklch(0.785 0.115 274.713)",
		"--chart-3": "oklch(0.828 0.189 84.429)",
		"--chart-4": "oklch(0.765 0.177 163.223)",
		"--chart-5": "oklch(0.6 0.118 184.704)",
		"--sidebar": "oklch(0.18 0.04 265)",
		"--sidebar-foreground": "oklch(0.869 0.022 252.894)",
		"--sidebar-primary": "oklch(0.704 0.14 182.503)",
		"--sidebar-primary-foreground": "oklch(0.129 0.042 264.695)",
		"--sidebar-accent": "oklch(1 0 0 / 6%)",
		"--sidebar-accent-foreground": "oklch(0.984 0.003 247.858)",
		"--sidebar-border": "oklch(1 0 0 / 8%)",
		"--sidebar-ring": "oklch(0.6 0.118 184.704)",
	},
	components: {
		"app-header": { base: "border-border bg-card" },
		// Small, square-ish and tinted, a hue per variant: teal, sky, white, rose and grey.
		badge: {
			base: "rounded-[0.25rem] border px-2 text-[0.6875rem] font-medium",
			variant: {
				default:
					"border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-300",
				secondary:
					"border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",
				outline: "border-border bg-card text-secondary-foreground",
				destructive:
					"border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300",
				ghost: "bg-muted text-muted-foreground",
			},
		},
		button: {
			variant: {
				default: "shadow-sm hover:bg-[color-mix(in_oklch,var(--primary),black_14%)]",
				outline: "bg-card shadow-sm dark:bg-card dark:hover:bg-muted",
			},
			size: { default: "px-3.5", sm: "px-3", lg: "px-4" },
		},
		// Thin borders instead of shadows. A card with a header and content is a section: its
		// header is a band, divided from the content, and its title is set off by a teal bar.
		card: {
			base: "rounded-md shadow-none ring-border [--card-spacing:--spacing(5)] has-[>[data-slot=card-header]+[data-slot=card-content]]:pt-3.5",
		},
		"card-header": {
			base: "group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:border-b group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:pb-3.5",
		},
		"card-title": {
			base: "font-semibold group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:text-sm group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:before:mr-2 group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:before:inline-block group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:before:h-3.5 group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:before:w-0.5 group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:before:rounded-full group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:before:bg-primary group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:before:align-[-0.125em] group-has-[>[data-slot=card-header]+[data-slot=card-content]]/card:before:content-['']",
		},
		"card-description": { base: "text-xs" },
		checkbox: { base: "rounded-[0.25rem]" },
		"data-table": { base: "rounded-md bg-card [--data-table-surface:var(--card)]" },
		"dialog-content": { base: "rounded-lg" },
		input: {
			base: "bg-muted/60 shadow-none focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/25 dark:bg-input/20",
		},
		"input-group": {
			base: "bg-muted/60 shadow-none has-[[data-slot=input-group-control]:focus-visible]:bg-card dark:bg-input/20",
		},
		"select-trigger": { base: "bg-card shadow-none" },
		textarea: {
			base: "bg-muted/60 shadow-none focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/25 dark:bg-input/20",
		},
		"sidebar-container": { base: "border-sidebar-border" },
		"sidebar-group-label": {
			base: "text-[0.6875rem] tracking-wider text-muted-foreground uppercase",
		},
		"sidebar-menu-button": {
			base: "data-active:bg-accent data-active:text-accent-foreground",
			size: { default: "h-9 gap-3 px-3" },
		},
		"table-header": { base: "bg-muted/70" },
		"table-head": { base: "h-9 text-xs text-muted-foreground" },
		"table-row": {
			base: "border-border/70 hover:bg-muted/50 data-[state=selected]:bg-accent",
		},
		"table-footer": { base: "bg-muted/70 font-medium" },
	},
});
