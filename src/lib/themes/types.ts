import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import type { ButtonSize, ButtonVariant } from "#lib/components/ui/button/index.js";
import type { EmptyMediaVariant } from "#lib/components/ui/empty/index.js";
import type { InputGroupAddonAlign } from "#lib/components/ui/input-group/index.js";
import type {
	SidebarMenuButtonSize,
	SidebarMenuButtonVariant,
} from "#lib/components/ui/sidebar/index.js";

import type { GeneratedSlot } from "./slots.js";

/**
 * Parts whose classes can also differ per prop value, e.g. a button's `variant` and `size`. These
 * need `theme.classes("button", { variant, size })` in the component, added by hand.
 */
interface SlotsWithProps {
	badge: { variant: NonNullable<BadgeVariant> };
	button: { variant: NonNullable<ButtonVariant>; size: NonNullable<ButtonSize> };
	card: { size: "default" | "sm" };
	"empty-icon": { variant: NonNullable<EmptyMediaVariant> };
	"input-group-addon": { align: NonNullable<InputGroupAddonAlign> };
	"sidebar-menu-button": {
		variant: NonNullable<SidebarMenuButtonVariant>;
		size: NonNullable<SidebarMenuButtonSize>;
	};
}

/**
 * The component parts a theme can style, keyed by their `data-slot` (generated from the
 * components, see `slots.ts`), with the props a theme can style per value.
 */
export type ThemeSlots = Omit<Record<GeneratedSlot, Record<never, never>>, keyof SlotsWithProps> &
	SlotsWithProps;

export type Slot = keyof ThemeSlots;

/** The values of a part's styleable props, as passed to `theme.classes()`. */
export type SlotProps<S extends Slot> = { [P in keyof ThemeSlots[S]]?: ThemeSlots[S][P] | null };

/**
 * Tailwind classes for one part: `base`, plus classes per prop value, e.g.
 * `{ base: "…", variant: { ghost: "…" }, size: { sm: "…" } }`. They're merged over the
 * component's own classes (so they win conflicts with them), and a `class` passed to the
 * component is merged over these in turn.
 */
export type SlotStyle<S extends Slot> = { base?: string } & {
	[P in keyof ThemeSlots[S]]?: Partial<Record<ThemeSlots[S][P] & string, string>>;
};

export interface Theme {
	label: string;
	/** CSS custom properties (colours, `--radius`, `--font-body`, …), set on the theme's root. */
	vars?: Record<`--${string}`, string>;
	components?: { [S in Slot]?: SlotStyle<S> };
}

/** Identity function that type-checks a theme file. */
export const defineTheme = (theme: Theme) => theme;
