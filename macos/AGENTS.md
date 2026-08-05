# macOS Repository Guidance

- This repository contains the native SwiftUI macOS client.
- Follow `../agent_docs/frontend_design_guidelines.md` and `../agent_docs/swiftui_client_guidelines.md` for shared product design, native interaction, accessibility, parity, and SwiftUI implementation workflow.
- Keep feature views in `iTu/Features` and reusable API, model, persistence, synchronization, and UI responsibilities in the matching `iTu/Shared` module.
- Reuse `iTu/Shared/UI/iTuTheme.swift` and existing shared native controls before adding local visual constants or duplicate styles.
- Do not introduce Flutter or copy the Flutter macOS runner.
- Preserve API-contract and offline/synchronization behavior while using native macOS controls, focus, keyboard, menu, sheet, toolbar, and window conventions.
- Keep generated build products, Xcode user data, and signing credentials out of Git.
- Add focused coverage for new behavior and run the relevant Xcode build and tests, followed by real pointer, keyboard, resizing, and visual QA.
