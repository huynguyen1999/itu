# Web Client Guidelines

These rules supplement `project_guidelines.md` and `frontend_design_guidelines.md` for work under `web/`.

## Architecture and ownership

- Use strict TypeScript, React, Vite, Tailwind CSS v3, and the existing shadcn/ui and Radix composition patterns.
- Keep product-area code under `web/src/features/<feature-name>`. Put behavior in `web/src/shared` only when it has a proven cross-feature responsibility.
- TanStack Query owns server state. React state is for ephemeral interaction and forms; do not introduce another application state library.
- Preserve the offline-first write path. Supported mutations are applied optimistically, persisted through the existing IndexedDB outbox, and synchronized by the shared queue.
- Keep authorization and ownership enforcement in the API. The web client may adapt presentation but must not become the security boundary.

## Design system usage

- Treat the semantic variables and iTu tokens in `web/src/styles/app.css` as the source of truth for color, surface, radius, shadow, easing, and light/dark appearance.
- Reuse primitives in `web/src/shared/ui`, including the established button, card, dialog, input, page-header, navigation, confirmation, and feedback patterns.
- Extend an existing primitive when several consumers need the same behavior. Keep a feature-local component local when its semantics are specific to that feature.
- Avoid hard-coded colors, shadows, or radii when a semantic token exists. Any new shared token must define a stable role and appropriate light/dark values.
- Preserve the existing display/body/monospaced typography roles. Monospaced type is for timers, compact metadata, tabular values, or code rather than general body copy.

## Interaction and responsive behavior

- Use semantic HTML and preserve accessible behavior supplied by Radix or native elements.
- Every icon-only action needs an accessible name. Every form control needs an associated label or equivalent accessible name.
- Preserve visible `focus-visible` treatment and complete keyboard operation. Pointer hover may enhance an interaction but must not be the only way to discover or use it.
- Respect `prefers-reduced-motion` and the existing `motion-safe` or `motion-reduce` conventions.
- Define narrow, intermediate, and wide behavior from content needs. Prevent horizontal overflow, clipped actions, and inaccessible off-screen dialogs.
- Keep loading, error, empty, optimistic, offline, synchronization, and conflict states within the relevant page context whenever possible.

## Implementation workflow

1. Inspect the feature, its nearest comparable screen, relevant shared primitives, design tokens, query keys, and sync integration.
2. Define acceptance criteria for behavior, responsive layout, accessibility, and all affected states.
3. Implement inside the owning feature, extracting shared UI only when reuse is concrete.
4. Add focused Vitest coverage for new behavior and regression risk without testing Tailwind class strings as a substitute for user-visible behavior.
5. Run `yarn typecheck`, `yarn test`, and `yarn build` for completed relevant changes.
6. Verify the real page at supported viewport widths with keyboard navigation, light/dark appearance, reduced motion, and offline/error behavior when affected.

Do not run a production build repeatedly during interactive visual iteration; use `yarn dev` at `http://localhost:5173` and run the full gate for final validation.
