<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const badgeVariants = tv({
		base: "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
				secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
				destructive:
					"bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
				outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
				ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
				link: "text-primary underline-offset-4 hover:underline",
				// Tones: a status coloured by what it means (see `BadgeTone`).
				success: "bg-success/10 text-success",
				warning: "bg-warning/15 text-warning",
				info: "bg-info/10 text-info",
				danger: "bg-destructive/10 text-destructive",
				neutral: "bg-muted text-muted-foreground",
				// Colours: a value named after one, e.g. a partner level (see `BadgeColour`).
				bronze: "bg-orange-700/15 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300",
				silver: "bg-slate-400/20 text-slate-700 dark:bg-slate-300/15 dark:text-slate-200",
				gold: "bg-yellow-400/30 text-yellow-800 dark:bg-yellow-300/15 dark:text-yellow-200",
				platinum: "bg-zinc-700 text-zinc-50 dark:bg-zinc-200 dark:text-zinc-900",
				diamond: "bg-cyan-400/20 text-cyan-800 dark:bg-cyan-300/15 dark:text-cyan-200",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

	/**
	 * The variants that colour a value by what it means, for statuses and the like: done or fine,
	 * needing attention, new or planned, critical, and over or out of the picture.
	 */
	export type BadgeTone = "success" | "warning" | "info" | "danger" | "neutral";

	/**
	 * The variants that colour a value by its name rather than its meaning: a partner's level
	 * "Gold" in gold.
	 */
	export type BadgeColour = "bronze" | "silver" | "gold" | "platinum" | "diamond";
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import { useTheme } from "#lib/themes/context.ts";
	import { cn, type WithElementRef } from "#lib/utils.ts";

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = "default",
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();

	const theme = useTheme();
</script>

<svelte:element
	this={href ? "a" : "span"}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), theme.classes("badge", { variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
