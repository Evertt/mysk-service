/**
 * What the customer portal's shell puts at the end of every page's app bar (`app-bar.svelte`): its
 * bell, which lives in `src/routes/(customer)` where a module's page can't import it. The layout
 * provides it, each page's `<AppBar>` renders it.
 */
import { createContext, type Snippet } from "svelte";

const [getShellActions, setShellActions, hasShellActions] = createContext<Snippet>();

/** Gives every page's app bar the shell's actions (the bell). */
export const provideAppBarActions = (actions: Snippet) => setShellActions(actions);

/** The shell's actions for an app bar, if a shell gave some (none in a component test). */
export const appBarActions = () => (hasShellActions() ? getShellActions() : undefined);
