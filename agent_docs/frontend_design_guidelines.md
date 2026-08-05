# Frontend Design Guidelines

## Product character

iTu should feel calm, focused, trustworthy, and information-dense without becoming visually noisy. The interface supports repeated daily use, so hierarchy and legibility take priority over decoration. Web and macOS should express the same product identity while using interaction and layout conventions native to each platform.

## Shared visual language

- Reuse the established forest, teal, mint, amber, coral, neutral ink, surface, and border roles. Do not introduce one-off colors when an existing semantic role fits.
- Use teal for primary action and active state, mint for supportive selection and success surfaces, amber for attention, and coral for destructive or overdue state. Never rely on color alone to communicate status.
- Prefer quiet surfaces, subtle borders, continuous rounded corners, and restrained shadows. Elevation should explain hierarchy, not decorate every container.
- Preserve the existing compact typography hierarchy: strong display headings, readable body text, and monospaced text only for timers, compact metadata, code, or tabular values.
- Reuse the established small, medium, and large corner-radius relationships rather than choosing arbitrary radii per screen.
- Keep spacing systematic. Similar controls, cards, sections, and page shells should use the same spacing relationships across features.

The source implementations remain authoritative for exact values:

- Web: `web/src/styles/app.css` and primitives under `web/src/shared/ui`.
- macOS: `macos/iTu/Shared/UI/iTuTheme.swift` and other controls under `macos/iTu/Shared/UI`.

## Information hierarchy and layout

- Give each screen one clear primary purpose and one visually dominant action when an action is required.
- Organize content as page context, primary work area, supporting information, and secondary actions. Avoid competing headers or several equally prominent call-to-action elements.
- Prefer progressive disclosure for advanced settings, destructive operations, and low-frequency metadata.
- Keep dense productivity views scannable with alignment, whitespace, concise labels, and stable placement rather than excessive card nesting.
- Preserve user context during loading, synchronization, conflict resolution, and recoverable errors. Do not replace usable local content with a full-screen spinner when stale or optimistic content can remain visible.
- Web layouts must adapt across supported viewport sizes. macOS layouts must remain usable when windows are resized and should use native sidebar, toolbar, sheet, menu, and focus behavior where appropriate.

## Interaction states

Every interactive component must define the relevant normal, hover, pressed, focused, selected, disabled, loading, success, empty, error, offline, syncing, and conflict states. Destructive actions require clear wording and confirmation when recovery is not immediate.

- Feedback should appear near the action that caused it.
- Optimistic actions must communicate pending or failed synchronization without pretending that remote persistence has completed.
- Empty states should explain what is absent and offer the next useful action when one exists.
- Motion should clarify state changes or spatial relationships. Keep it brief and restrained; never make animation necessary to understand or operate a feature.

## Accessibility

- Use semantic controls before custom interaction implementations.
- Support keyboard navigation and a visible focus indicator for all web workflows; support keyboard focus, commands, and standard macOS control behavior in SwiftUI.
- Provide accessible names for icon-only actions and meaningful labels or values for status indicators.
- Maintain readable contrast in light and dark appearances and do not encode meaning through color alone.
- Respect reduced-motion preferences. Avoid flashing, continuous decorative motion, and hover-only access to required information.
- Keep pointer and touch targets proportionate to their platform and avoid tightly packed destructive controls.

## Cross-client consistency

- Keep terminology, information priority, status meaning, destructive semantics, and API behavior consistent across web and macOS.
- Behavioral parity does not require pixel-identical layouts. A native macOS control is preferred over a web imitation when both express the same product behavior.
- Shared design changes must identify whether they affect one client or both. If only one client changes, record any intentional parity difference in the relevant roadmap or task artifact.

## Frontend work style

Before implementation:

1. Identify the user outcome, affected states, platform constraints, and acceptance criteria.
2. Inspect the nearest existing screen and shared primitives before creating a component or visual treatment.
3. Decide whether the behavior belongs to a feature or a shared module and whether it affects cross-client parity.

During implementation, build a complete state path in a focused increment. Keep visual values in the existing theme/token surface and keep business or synchronization logic out of presentation components.

Before completion:

- Run the smallest relevant automated checks, followed by the required repository gate when applicable.
- Perform visual and interaction QA for changed states, including keyboard behavior, resizing or responsive layout, light/dark appearance when supported, reduced motion, and offline/error behavior when relevant.
- Report automated and manual verification separately. Screenshots or visual inspection do not replace behavioral tests, and snapshot tests do not replace real interaction QA.
