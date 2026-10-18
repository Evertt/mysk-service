# Code Review Criteria

Oct 18, 2026 · @Evert van Brussel

Judge codebase on 8 qualities below. Per finding: quality, file:line, severity, fix.

Terms: _module_ = this codebase's plugin (feature registered with host). _Unit_ = any code unit (file, class, function, component, composable).

## 1. Readable

Intent clear to new reader, fast.

- Sub-qualities: clear intent, self-documenting, idiomatic, low cognitive load, least surprise, consistent, conventional.
- One concept = one name across codebase. Names from domain language, not implementation.
- One abstraction level per function: orchestration or detail, not both.
- Call site readable without opening callee. No bare flag args (`save(x, true, false)`), no magic values.
- Count jumps needed to follow one behavior. Pass-through layers, needless indirection = cost.
- Stale or lying comments = defect, worse than none.
- Flag noise: narrating comments, redundant defensive checks, wrappers adding nothing.

## 2. Well structured

Responsibilities split on sensible lines, clear boundaries.

- Sub-qualities: well decomposed, cohesive, loosely coupled, encapsulated, composable, separation of concerns.
- Deep units: small interface, real work behind it (aka Ousterhout's deep modules). Shallow pass-through units = smell.
- Split by what changes together (feature, domain), not only by technical type. Typical feature change touching many folders = wrong split.
- Information hiding: each design decision (data shape, API format, storage) known in one place. Same knowledge in several units = leak.
- Dependencies point one way. Domain logic free of UI and framework. No import cycles.
- Framework at edges: business logic outside components and stores, testable without framework.
- Don't split one concept: tightly coupled code spread over files worse than one larger file.
- Simple = not entangled, not fewest lines. Judge complexity system-wide, not per change.

## 3. Correct

Does what it should. Invalid usage hard to express, valid usage friction-free.

- Sub-qualities: well typed, type safe, null safe, validated, secure, honest.
- Type precision = actual knowledge.
- Inputs broad: accept widest type the function uses.
- Outputs narrow: most precise true type.
- Parse external data (API, forms, storage, URL) once at boundary, typed after.
- Illegal states unrepresentable: discriminated unions over flags + optional fields.
- Unions handled exhaustively (`never` check in default branch).
- No `any`. Casts and non-null `!` = smell: type too narrow or type guard missing. Casts only inside named guards.
- Async: no races, stale responses ignored, no unhandled rejections, cleanup on unmount.
- Errors handled explicitly, never swallowed.
- Input validated. No injection, no XSS, no secrets in code.

## 4. Predictable

Behavior follows from visible code. No hidden state.

- Sub-qualities: pure, immutable, deterministic, idempotent, single source of truth.
- Side effects at edges, core logic pure.
- Derived state computed, never stored and synced (`computed` over watch-and-assign).
- Watchers and event listeners mutating shared state = hidden control flow. Flag.
- No mutating arguments or shared objects.
- Time, randomness, environment read via injected source, not inline `Date.now()`.
- Fail fast on broken invariants.
- No implicit ordering dependencies.

## 5. Lean

Nothing that needn't exist.

- Sub-qualities: DRY, YAGNI, concise, minimal surface, minimal dependencies.
- No dead code, commented-out code, unused exports, unused dependencies, expired feature flags.
- DRY for knowledge, not coincidental similarity. Similar code changing for different reasons stays separate. Abstract at third repeat.
- YAGNI: parameter, option or generic with one caller or one value = flag.
- Dependency weight: big library for one trivial use = flag. Hand-rolled code for solved problem (dates, validation) = also flag.
- Over-DRY hurting readability = defect.

## 6. Easy to change

Changes local, safe, cheap.

- Sub-qualities: maintainable, extensible, refactorable, testable, well tested.
- Small blast radius: typical change touches few files.
- Tests check behavior through public interface. Tests breaking on refactor without behavior change = brittle.
- Mock only at system edges (network, time, storage). Heavy internal mocking = design smell.
- Logic testable without mounting components.
- Types do refactor work: renaming a field surfaces every usage at compile time. Stringly-typed keys hide usages.
- Change-prone values (URLs, limits, copy) in one place, not scattered.

## 7. Operable

Behaves well at runtime.

- Sub-qualities: observable, debuggable, performant, resilient.
- Errors logged once, with context, where handled. No log-and-rethrow at every layer.
- Every async view has loading, empty and error states.
- Performance: needless re-renders, N+1 requests, request waterfalls, unbounded lists without pagination or virtualization.
- Leaks: listeners, intervals, subscriptions not cleaned up.
- One failing request or widget degrades its part, not whole page.

## 8. Stable contract

Host/module API explicit, minimal, evolves additively.

- Modules reach host only via declared extension points. No host-internal imports.
- Minimal, capability-based surface: scoped API, not whole app.
- Add or remove module = module folder + one registration line.
- Contract fully typed. Module config validated at registration.
- Explicit lifecycle: register, init, mount, teardown.
- Module dependencies declared. No reliance on load order.
- Fault isolation: module crash ≠ app crash. Errors name module.
- Prefer additive changes over signature changes. (Though in the current phase you may actually still propose and perform sweeping changes to the contract based on learning what the modules really need.)
- Each module must earn its overhead. Flag trivial features that needn't be modules.
