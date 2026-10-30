---
title: Try the demo
summary: Sign in as a planner, an engineer or a customer of the SHLTR demo with one click, and what to try in each.
section: start
order: 3
status: built
covers: []
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
	import DemoSwitchedOff from "#wiki/parts/demo-switched-off.svelte";
</script>

The demo is a made-up company called SHLTR: it installs, services and inspects doors, docks,
stairs and air conditioning. It has customers with sites and units, a year of orders and the coming
weeks planned, and every optional module switched on. Its names and notes are in Dutch, as a Dutch
company's would be, whichever language you use the app in.

Where the demo is switched on (staging, and a developer's own machine), the login page has three
buttons under its form, **Log in as**: Planner, Engineer and Customer. One click signs you in; you
don't type anything. The **Try it** buttons on this page do the same: each signs you in as its
role and opens that role's home. They appear only where the demo is on and you aren't signed in
to it yet. Once you are, switch with **View as** (below).

<DemoSwitchedOff />

## As a planner

You land on the office dashboard as Jan Weggemans, a planner.

<TryIt as="planner" />

Things to try:

1. Open **Orders**. Search, filter by status or type, group, change the columns.
2. Open an order that is **Awaiting acceptance**: a customer reported it. Accept it as a quote, or
   plan it at once with an engineer, a day and a time. Or reject it with a reason.
3. Open an order and change its status, from the list or from the order's form.
4. Open a customer, then one of its sites, a unit, and the unit's service history.
5. Open **Activity**: everything you just did is in the log.

## As an engineer

You land in the engineer portal as Lev Hoekstra, on a phone-shaped page.

<TryIt as="engineer" />

1. Open an order planned for today and **Start job**.
2. Log some hours and add a note.
3. **Complete the job**: sign with your finger or mouse, and sign again as the engineer.

Then switch to the planner (below) and open that order: the sign-off and the note are on it.

## As a customer

You land in the customer portal as Marieke Verhoeven, who works for Riedel B.V.

<TryIt as="customer" />

1. **Report a breakdown** on one of the units. It appears in your orders as waiting to be accepted.
2. Open an order that is done: the sign-off, and the work order where the module is on.
3. Open a unit: its inspection status and its history.

You see only Riedel's records. The other customers' orders and units aren't there, and can't be
reached by changing the address.

## Switching without signing out

Once you're in, the user menu has **View as** with the same three roles, the current one checked.
Pick another and you are signed in as that role and sent to its home. It's the quickest way to
watch one change from both sides: report a breakdown as the customer, accept it as the planner,
and see the customer's order change.

None of the three is an owner or admin. Anyone can open the demo, so none of them can change SHLTR's
members, invitations or settings.

<HowItWorks />

The sign-in is passwordless, so it exists only where the environment says so: `DEMO_SIGN_IN=true`
(staging's variables in `wrangler.jsonc`, or a developer's `.env`). Production doesn't set it. Where
it is off, nothing of it renders, and every call to it answers 404 before reading what was posted.

**The browser sends only the role's name.** The server maps it to a fixed account
(`demoAccounts` in `src/routes/demo-accounts.server.ts`: Jan, Lev, Marieke) and checks that the
account exists, is in SHLTR and still has the role's shell (`shellOf(roles).name`). Then it signs in
through better-auth with the seed's demo password, like the login form would, so the session and
its organization are the same as after typing it. Nothing from the request picks the account.

**View as** signs in as the chosen role and then ends the old session, in one request. If the
new sign-in fails the old session stays.

**`TryIt`** (the button on this page) posts the login page's form, `demoSignIn`, with its role.
It asks `demoSignInEnabled()` and `getViewAs()` (which answers only for someone signed in to the
demo), and renders nothing when the sign-in is off, when the visitor is in the demo already, or
when it can't ask.

- <SourceLink path="src/routes/demo.remote.ts" line={23}><code>demoSignInEnabled</code>, sign-in and View as</SourceLink>
- <SourceLink path="src/routes/demo-accounts.server.ts">which account each role is</SourceLink>
- <SourceLink path="src/routes/demo-roles.ts">the three roles</SourceLink>
- <SourceLink path="src/wiki/parts/try-it.svelte">the button</SourceLink>

<DocsPointer doc="README.md" section="Demo login" />
