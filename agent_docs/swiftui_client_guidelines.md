# SwiftUI macOS Client Guidelines

These rules supplement `project_guidelines.md` and `frontend_design_guidelines.md` for work under `macos/`.

## Architecture and ownership

- Keep feature surfaces under `macos/iTu/Features` and reusable API, model, persistence, synchronization, and UI responsibilities under the matching `macos/iTu/Shared` module.
- Keep views focused on presentation and interaction. Move reusable state, domain representation, persistence, and synchronization behavior into their existing shared ownership boundaries.
- Preserve the native offline snapshot, mutation persistence, ULID, synchronization coordinator, and API-contract behavior. Do not create a feature-specific network or sync path.
- Maintain behavioral and contract parity with the web/API product, but express it with native macOS interaction patterns.

## Native design system usage

- Treat `macos/iTu/Shared/UI/iTuTheme.swift` as the current source of truth for the established palette, panels, gradients, hover treatment, buttons, and brand treatment.
- Reuse shared modifiers and button styles before creating local equivalents. Add a shared primitive only when multiple native features need the same semantics.
- Use SF Symbols and native SwiftUI/AppKit controls where they fit. Prefer native menus, sheets, alerts, toolbars, sidebars, focus behavior, keyboard shortcuts, and window resizing over web-shaped imitations.
- Keep forest, teal, mint, amber, coral, ink, surface, border, corner, and elevation roles aligned with the shared product language.
- Do not hard-code a visual value repeatedly across views. Promote a stable shared role to the theme rather than copying constants.

## Interaction and accessibility

- Support keyboard traversal and standard macOS focus behavior. Add keyboard shortcuts only when they are discoverable, non-conflicting, and appropriate for repeated actions.
- Use hover and pointer cursor feedback for clickable custom surfaces, but never make hover the only route to required content or behavior.
- Give icon-only controls and status visuals meaningful accessibility labels and values.
- Respect `accessibilityReduceMotion`. Movement and scale effects must degrade to an equally understandable static state.
- Keep controls usable at supported minimum window sizes and verify resizable split views, sidebars, sheets, popovers, and scrolling regions.
- Prefer system text styles when they preserve the intended hierarchy. Fixed font sizes must remain legible and should be limited to deliberate compact metadata or timer displays.
- Verify contrast and semantics in every appearance the native client supports. Do not imply dark-mode support for a surface until it is implemented and checked.

## Client parity and states

- Use the same product terminology and meanings for task, focus, habit, learning, Growth, synchronization, and conflict states as the web client and API contracts.
- Represent local pending work, server acknowledgement, failures, offline state, and semantic conflicts honestly. Do not display an operation as remotely saved before synchronization confirms it.
- Native navigation and layout may differ from the web client when macOS conventions improve clarity, keyboard use, or window adaptability.

## Implementation workflow

1. Inspect the relevant API model, existing native model and shared service, comparable SwiftUI view, and `iTuTheme` primitive.
2. Define acceptance criteria for behavior, parity, offline/sync states, resizing, keyboard use, accessibility, and visual appearance.
3. Implement within the owning feature and extract only proven shared responsibilities.
4. Add focused unit or interaction coverage for state transitions, model mapping, persistence, synchronization, or regression-prone behavior.
5. Run the relevant Xcode build and tests using the existing project scheme and destination documented by the native project.
6. Perform real-app QA with pointer and keyboard input, supported window sizes, reduced motion, sheets or menus, and all affected loading/error/offline/conflict states.

Automated layout checks may protect known constraints, but they do not replace real SwiftUI rendering and interaction inspection.
