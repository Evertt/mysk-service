import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import type { ButtonSize, ButtonVariant } from "#lib/components/ui/button/index.js";
import type {
	SidebarMenuButtonSize,
	SidebarMenuButtonVariant,
} from "#lib/components/ui/sidebar/index.js";

type NoProps = Record<never, never>;

/**
 * The component parts a theme can style, keyed by their `data-slot`, with the props a theme can
 * style per value (e.g. a button's `variant` and `size`).
 */
export interface ThemeSlots {
	badge: { variant: NonNullable<BadgeVariant> };
	button: { variant: NonNullable<ButtonVariant>; size: NonNullable<ButtonSize> };
	card: { size: "default" | "sm" };
	"sidebar-menu-button": {
		variant: NonNullable<SidebarMenuButtonVariant>;
		size: NonNullable<SidebarMenuButtonSize>;
	};
	"card-action": NoProps;
	"card-content": NoProps;
	"card-description": NoProps;
	"card-footer": NoProps;
	"card-header": NoProps;
	"card-title": NoProps;
	checkbox: NoProps;
	"command-item": NoProps;
	"dropdown-menu-checkbox-item": NoProps;
	"dropdown-menu-content": NoProps;
	"dropdown-menu-item": NoProps;
	"dropdown-menu-label": NoProps;
	"dropdown-menu-radio-item": NoProps;
	"dropdown-menu-separator": NoProps;
	input: NoProps;
	"input-group": NoProps;
	"popover-content": NoProps;
	"select-content": NoProps;
	"select-item": NoProps;
	"select-trigger": NoProps;
	"sidebar-group-label": NoProps;
	table: NoProps;
	"table-body": NoProps;
	"table-caption": NoProps;
	"table-cell": NoProps;
	"table-container": NoProps;
	"table-footer": NoProps;
	"table-head": NoProps;
	"table-header": NoProps;
	"table-row": NoProps;
}

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
