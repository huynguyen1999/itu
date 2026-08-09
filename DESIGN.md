---
name: iTu Design System
description: The Botanical Sanctuary — a calm, cross-platform teal-and-mint productivity world for web (React/Tailwind) and macOS (SwiftUI)
colors:
  teal-950: "#08211d"
  teal-900: "#0b322c"
  teal-800: "#0f3d37"
  teal-700: "#125149"
  teal-600: "#167f71"
  teal-500: "#1e9a89"
  teal-400: "#3fb6a4"
  mint-50: "#f1faf7"
  mint-100: "#e1f3ee"
  amber-500: "#e19a2e"
  amber-100: "#fbecd2"
  coral-500: "#e2725b"
  coral-100: "#fbe4de"
  gold: "#ad8a3d"
  blue-sync: "#4f8fcf"
  violet-item: "#8b6fc9"
  neutral-bg: "#f5f7f6"
  neutral-surface: "#ffffff"
  neutral-surface-2: "#fbfcfb"
  neutral-ink: "#142420"
  neutral-ink-dim: "#5c6d68"
  neutral-ink-faint: "#93a39d"
  neutral-border: "#e4e9e6"
  neutral-border-soft: "#edf1ef"
typography:
  display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.06em"
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  s: "10px"
  m: "14px"
  l: "18px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.teal-600}"
    textColor: "#f4faf7"
    rounded: "{rounded.s}"
    padding: "10px 16px"
  button-outline:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.teal-700}"
    rounded: "{rounded.s}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.s}"
    padding: "8px 12px"
  card-surface:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.m}"
    padding: "16px 20px"
  input-field:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.s}"
    padding: "10px 14px"
---

# Design System: iTu

## Overview

**Creative North Star: "The Botanical Sanctuary"**

iTu delivers a calm, high-density personal operating system for planning, focus, habits, learning, growth, money, and training. It treats daily work as a quiet sanctuary rather than a loud, distracting task manager. Grounded in deep organic teals, fresh mint highlights, soft paper surfaces, and smooth tactile radii, the interface balances dense information architecture with visual serenity. Ambient radial gradients wash the page in faint mint light, while deep-teal gradient surfaces add a quiet sense of premium depth.

The aesthetic philosophy avoids harsh pure-black borders and hyper-saturated neon accents. Instead, it relies on soft organic boundaries, ambient shadows, and purposeful color signals that draw attention to active focus timers and urgent Eisenhower tasks without cluttering the user's cognitive field. In dark mode the forest deepens (`#071713`) and the primary accent lifts to a lighter mint-teal so actions stay legible on dark surfaces.

**Key Characteristics:**
- Deep organic teal palette with a full 7-step ramp (`--itu-teal-950` → `--itu-teal-400`) and fresh mint highlights
- Warm functional accents: amber (streaks/coins), coral (urgency/destructive), gold (premium glow), sync blue, and reward violet
- Signature gradients: primary actions use a teal→deep-teal gradient with a radial gold glow; page canvases wear an ambient radial wash
- Soft rounded forms (`10px` / `14px` / `18px`) for buttons, cards, and modal dialogs
- Dual-mode adaptation: clean paper light mode (`#f5f7f6`) and deep forest dark mode (`#071713`), with the primary lightening in dark mode
- Three active typefaces: `Manrope` (display/body), `Fraunces` (editorial serif accent), `IBM Plex Mono` (timers, kickers, chips)
- Smooth cubic-bezier transitions (`cubic-bezier(0.16, 1, 0.3, 1)`) with full `prefers-reduced-motion` support
- High-density multi-pane layout with clear typographic contrast and uppercase mono tracking

### Current Surface Map

Both clients expose the same workspace language: Home, Plan, Matrix, Focus, Habits, Statistics, Budget, Gym, Learn, Growth, Trash, Conflicts, Notifications, Profile, and Settings. The web client also exposes Journal as a workspace and keeps legacy journal money/gym URLs as redirects into Budget and Gym. Budget contains overview, transactions, budgets, and calendar views; Gym contains overview, active workouts, exercise library, routines, and workout history.

### Cross-Platform Implementation

iTu ships one visual language across platforms. The token vocabulary is duplicated deliberately so each platform is self-contained: a platform-neutral `--itu-*` CSS custom-property namespace in [`web/src/styles/app.css`](web/src/styles/app.css) for the React/Tailwind client, and the matching `iTuTheme` enum in [`macos/iTu/Shared/UI/iTuTheme.swift`](macos/iTu/Shared/UI/iTuTheme.swift) for the SwiftUI client. The macOS palette mirrors the web tokens **token-for-token** (same hex values, same names), plus `forestRaised` (`#15443C`) and `gold`/`goldSoft` convenience aliases. **Token names and roles are the contract; any LLM generating code for either platform must reference this document's token vocabulary, not invent colors.** Web webfonts map to system fonts on native: `Manrope` → SF Pro, `IBM Plex Mono` → SF Mono (`Design.monospaced`), `Fraunces` → New York serif. Native controls and SF Symbols remain native; parity is semantic and tonal, not pixel-identical.

## Colors

The color system combines organic forest teals, refreshing mint tones, warm amber/coral accents, and a victory-gold glow into a focused, serene productivity environment. Tokens are grouped by role below; each cites its web CSS variable and (where it exists) its macOS `iTuTheme` name.

### Primary
- **Deep Forest Teal** (`#0b322c` / `--itu-teal-900`, macOS `forest`): The grounding anchor color for structural headers, primary brand identity, deep container backgrounds, and the app rail base gradient.
- **Seafoam Mint Accent** (`#167f71` / `--itu-teal-600`, macOS `teal`): The active primary accent for key actionable buttons, focus session banners, progress indicators, and active states. In dark mode this role lightens to `hsl(172 48% 48%)` (≈ `#40a6b5`) for contrast against the forest surface.
- **Fresh Mint Highlight** (`#3fb6a4` / `--itu-teal-400`, macOS `mint`): High-visibility state highlight used for active tab indicators, hover borders, completion checkmarks, and the focus ring (`--ring`).
- **Teal Ramp** (`--itu-teal-950 #08211d`, `-900 #0b322c`, `-800 #0f3d37`, `-700 #125149`, `-600 #167f71`, `-500 #1e9a89`, `-400 #3fb6a4`): Full scale for hover states, gradients, and depth. `teal-950` (`forestDeep`) is the app-rail base; `teal-700` is the active-text teal.

### Secondary
- **Warm Amber** (`#e19a2e` / `--itu-amber-500`, macOS `amber`): Habit streak highlights, medium-priority tasks, XP/coin reward chips, and growth unlocks. Tinted base `--itu-amber-100` `#fbecd2` (light) / `#3b2b14` (dark).
- **Coral Sunset** (`#e2725b` / `--itu-coral-500`, macOS `coral`): High-urgency Eisenhower tasks, destructive actions, overdue habit warnings, and failed-sync states. Tinted base `--itu-coral-100` `#fbe4de` (light) / `#3d211d` (dark).
- **Victory Gold** (`#ad8a3d` / `--itu-glow-gold`, macOS `gold`): Premium radial glow on deep gradient cards and the Growth hero; gold-tinted surfaces (`goldSoft` `#f1e7cf`).
- **Sync Blue** (`#4f8fcf`): Task in-progress, low-priority, offline, and pending-sync states (task rails, status buttons, sync chips).
- **Reward Violet** (`#8b6fc9`, macOS `#8B5CF6`): Item reward chips and item-type ledgers.

### Neutral
- **Sanctuary Background** (`#f5f7f6` light / `#071713` dark, macOS `canvas`): Soft off-white paper base in light mode; deep dark teal-black in dark mode. Pages additionally wear the ambient `--itu-page-background` gradient.
- **Surface Container** (`#ffffff` light / `#0a211d` dark, macOS `surface`): Elevates interactive cards, inspector panes, and modal dialogs.
- **Raised Surface** (`#fbfcfb` light / `#0d2a25` dark, macOS `surfaceMuted`): Hover fills, secondary panels, contextual rails, and segmented-control tracks.
- **Deep Ink Text** (`#142420` light / `#ecf7f3` dark, macOS `ink`): High-contrast, soft-black body text.
- **Muted Ink** (`#5c6d68` light / `#a7bbb5` dark, macOS `inkDim`): Secondary labels, meta descriptions, and timestamps.
- **Faint Ink** (`#93a39d` light / `#6f8982` dark, macOS `inkFaint`): Placeholder text, disabled states, and tertiary metadata.
- **Soft Border** (`#e4e9e6` light / `#1a3b34` dark, macOS `border`): Divider lines, card outlines, and input strokes.
- **Subtle Border** (`#edf1ef` light / `#123029` dark, macOS `borderSoft`): Hairline separators between list rows and section rails.

### Cross-Platform Token Map
| Token (this doc) | Web CSS variable | macOS `iTuTheme` | Light | Dark |
|---|---|---|---|---|
| Sanctuary Background | `--itu-bg` | `canvas` | `#f5f7f6` | `#071713` |
| Surface Container | `--itu-surface` | `surface` | `#ffffff` | `#0a211d` |
| Raised Surface | `--itu-surface-2` | `surfaceMuted` | `#fbfcfb` | `#0d2a25` |
| Deep Ink | `--itu-ink` | `ink` | `#142420` | `#ecf7f3` |
| Muted Ink | `--itu-ink-dim` | `inkDim` | `#5c6d68` | `#a7bbb5` |
| Faint Ink | `--itu-ink-faint` | `inkFaint` | `#93a39d` | `#6f8982` |
| Soft Border | `--itu-border` | `border` | `#e4e9e6` | `#1a3b34` |
| Subtle Border | `--itu-border-soft` | `borderSoft` | `#edf1ef` | `#123029` |
| Forest Deep | `--itu-teal-950` | `forestDeep` | `#08211d` | — |
| Deep Forest Teal | `--itu-teal-900` | `forest` | `#0b322c` | — |
| Primary Teal | `--itu-teal-600` | `teal` | `#167f71` | `hsl(172 48% 48%)`* |
| Fresh Mint | `--itu-teal-400` | `mint` | `#3fb6a4` | — |
| Mint Tint | `--itu-mint-50` | `mintTint` | `#f1faf7` | `#102f28` |
| Warm Amber | `--itu-amber-500` | `amber` | `#e19a2e` | — |
| Coral Sunset | `--itu-coral-500` | `coral` | `#e2725b` | — |
| Victory Gold | `--itu-glow-gold` | `gold` | `#ad8a3d` | — |
| Sync Blue | `#4f8fcf` | — | `#4f8fcf` | `#83b8ec` (text) |
| Reward Violet | `#8b6fc9` | `#8B5CF6` | `#8b6fc9` | `#c5afea` (text) |

\* Dark-mode `--primary` and `--ring`; the dark-mode flat primary uses a near-black teal foreground (`hsl(166 64% 9%)`). The gradient primary action button keeps light text (`#f4faf7`) in both modes.

### Named Rules
**The Quiet Teal Rule.** Primary seafoam teal accents are reserved for active focus triggers, primary actions, and key navigation states, occupying ≤15% of any view to prevent visual fatigue.

**The Soft Boundary Rule.** Component separation relies on subtle soft borders (`#e4e9e6` / `#1a3b34`) and ambient card shadows (`--itu-shadow-card`), never stark black outlines.

**The Lifted Accent Rule.** In dark mode the primary accent lifts from deep teal (`#167f71`) to a lighter mint-teal (`hsl(172 48% 48%)`) so actions remain legible on the forest surface; flat primary fills invert their foreground to a near-black teal.

## Typography

**Display & Body Font:** `Manrope` (with system fallbacks `system-ui, -apple-system, sans-serif`)
**Serif Editorial Accent:** `Fraunces` (with fallback `Georgia, serif`) — headlines in Today, Dashboard, and Growth surfaces
**Monospace Code / Key Metrics:** `IBM Plex Mono` (with fallbacks `SF Mono, ui-monospace, monospace`)

**Character:** Clean, highly legible geometric sans-serif for daily scanning paired with crisp monospace numerals for timers and metrics, with a restrained serif editorial voice for milestone and feature headlines. `Inter` and `Space Grotesk` are loaded in [`web/index.html`](web/index.html) but are **not** part of the active type system; use the three families above.

### Hierarchy
- **Display** (weight `800`, size `clamp(2.25rem, 5vw, 4.5rem)`, line-height `0.95`, tracking `-0.06em`): Habit journal hero, major milestone numbers, focus countdown moments. The CSS writes `850`; Manrope's heaviest loaded weight is `800`.
- **Headline** (weight `700`, size `1.75rem` / 28px, line-height `1.1`, tracking `-0.02em`): Page-level titles — Task pane headers, Today page headers, workspace titles.
- **Title** (weight `600`, size `1.125rem` / 18px, line-height `1.3`, tracking `-0.02em`): Section headings, card titles, and feature entry points. Large card headers (`CardTitle`) may use `1.5rem` / 24px.
- **Body** (weight `400`, size `0.875rem` / 14px, line-height `1.5`): Standard task notes, card descriptions, and habit journal entries. Max line length target 65–75ch.
- **Label / Eyebrow** (weight `700`, size `0.6875rem` / 11px, mono, letter-spacing `0.08em`, uppercase): Section eyebrows, kickers, status chips, and metadata tags. Kickers render in `--itu-teal-600` (light) / `--itu-teal-400` (dark).

### Cross-Platform Type Map
On web the families above are webfonts; on macOS they map to system faces by role: `Manrope` → SF Pro, `IBM Plex Mono` → SF Mono (`.monospaced`), `Fraunces` → New York. **Keep the role, swap the face** — do not bundle webfonts into native builds.

### Named Rules
**The Mono Discipline Rule.** `IBM Plex Mono` is reserved for numbers, timers, kickers, chips, and metadata. It is never used for body prose, which always uses `Manrope`.

## Layout

The layout uses a responsive multi-pane structure optimized for density, rapid scanning, and side-by-side context retention.

- **Web containers**: Max content width `1240px` on Home/Today; `1152px` (`max-w-6xl`) for general pages; feature-specific workspaces use full-bleed canvases. Responsive padding is `1rem` mobile and `2rem` desktop.
- **Web primary navigation rail**: Deep-teal gradient left rail, `236px` by default, draggable from `72px` to `320px` and persisted per user. Under `md` it becomes a compact header plus a fixed bottom bar showing five items and a More menu.
- **macOS primary navigation rail**: Fixed `222px` deep-teal gradient rail with grouped sections: Productivity, Tracking, Learning & Growth, and System. Native SF Symbols, hover/selection fills, and unread badges carry the interaction language.
- **macOS planning rail**: Fixed `228px` contextual rail. It is always visible at `≥1100pt`, user-toggleable from `860–1099pt`, and hidden below `860pt`.
- **Section / Contextual Rails**: `240px` contextual rails (`--itu-surface-2`) for planning lists/tags and Learn navigation; the Learn workspace uses `var(--itu-learn-sidebar-width, 240px)`.
- **Task Workspace**: `grid-template-columns: var(--itu-sidebar-width, 232px) minmax(420px, 1fr)` with a persistent right detail inspector (`lg:block`).
- **Spacing Rhythm**: 4px micro-gaps, 8px element padding, 16px component gaps, 24px section margins, and 32px page headers.
- **Density Model**: High-density compact rows in lists (`min-height 68px` task items) with generous internal padding (`10px 12px`) inside detail cards.
- **Responsive behavior**: Web uses Tailwind `sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1400` plus custom rail/layout queries. Below `1024px`, contextual rails compress to horizontal navigation; below `768px`, the bottom tab bar uses `48px`-class targets. macOS uses width-driven `860pt` and `1100pt` layout modes rather than web breakpoints.

## Elevation & Depth

iTu uses a soft, ambient elevation model combined with tonal background shifts (`--itu-bg` → `--itu-surface` → `--itu-surface-2`) rather than heavy structural drop shadows. Shadow palettes are defined per theme.

### Shadow Vocabulary
- **Card Ambient** (`--itu-shadow-card`): light `0 1px 2px rgb(11 50 44 / 0.04), 0 1px 1px rgb(11 50 44 / 0.03)`; dark `0 1px 2px rgb(0 0 0 / 0.3), 0 1px 1px rgb(0 0 0 / 0.22)`. Applied to resting cards, list items, task rows, and habit check-in rows.
- **Popover Ambient** (`--itu-shadow-pop`): light `0 12px 28px rgb(8 33 29 / 0.14), 0 2px 8px rgb(8 33 29 / 0.06)`; dark `0 16px 34px rgb(0 0 0 / 0.45), 0 3px 10px rgb(0 0 0 / 0.3)`. Applied to dropdown menus, dialogs, date picker popovers, and floating focus timer controls.
- **Primary Action Lift** (`.itu-primary-action`): layered teal shadow with an inner top highlight — `0 1px 2px rgb(8 33 29 / 0.18), 0 8px 20px rgb(8 33 29 / 0.12), inset 0 1px 0 rgb(255 255 255 / 0.14)`, brightening on hover.

### Named Rules
**The Tonal Depth Rule.** Depth is primarily established by background lightness shifts (`--itu-bg` → `--itu-surface` → `--itu-surface-2`) rather than stacking shadow layers.

## Shapes

Forms are characterized by smooth, friendly curvature with a fixed three-tier radius scale. On macOS, the same tiers are rendered with `.continuous` corner style.

- **Small Radius (`10px` / `var(--itu-radius-s)`)**: Buttons, input fields, badges, status chips, nav links, and segmented-control tracks.
- **Medium Radius (`14px` / `var(--itu-radius-m)`)**: Task cards, habit rows, summary cards, kanban columns, and study review prompt containers.
- **Large Radius (`18px` / `var(--itu-radius-l)`)**: Modal containers, focus timer hero panels, growth account summaries, and premium cards.
- **Pill Radius (`999px`)**: Option chips, task/reward chips, status pills, and count badges.
- **shadcn bridge**: Tailwind `rounded-lg/md/sm` derive from `--radius: 0.75rem` (12px) base — `sm 8px`, `md 10px`, `lg 12px`. Prefer the `--itu-radius-*` tokens in shared components.

### Named Rules
**The Three-Tier Rule.** Radii stay within the `s` (10px), `m` (14px), and `l` (18px) scale. Arbitrary pixel radii outside this scale are not introduced; only the pill (`999px`) is exempt.

## Components

Each shared component lives in [`web/src/shared/ui/`](web/src/shared/ui) with a macOS SwiftUI counterpart. Lead with a character line, then shape, color, states, and behavior.

### Buttons ([`button.tsx`](web/src/shared/ui/button.tsx))
- **Shape:** Soft rounded `10px` radius (`--itu-radius-s`), `text-sm font-semibold`, `150ms` ease transitions, min-height `44px` on touch devices.
- **Primary (default):** Gradient surface `.itu-primary-action` — teal→deep-teal `linear-gradient(145deg, #218f7e, #12685d 52%, #0b443c)` with a radial gold highlight at the top-right, light text `#f4faf7`, layered lift shadow. Hover brightens (`filter: brightness(1.08)`), active nudges down 1px.
- **Destructive:** `--destructive` background, white text.
- **Outline:** Surface background, `--itu-border` stroke, teal-700 text; hover shifts border to `--itu-teal-400`, background to `--itu-mint-50`.
- **Secondary:** `--secondary` (mint-tinted) background, teal-700 text.
- **Ghost:** Transparent; hover background `--itu-surface-2`.
- **Link:** `--primary` text, underline on hover.
- **Sizes:** default `h-10 px-4`, `sm h-9 px-3`, `lg h-11 px-8`, `icon h-10 w-10`.

### Inputs & Fields ([`input.tsx`](web/src/shared/ui/input.tsx))
- **Style:** Surface background, `--itu-border` stroke, `10px` radius, `h-10`, padding `0 12px`; placeholder in `--itu-ink-faint`.
- **Focus:** Border shifts to `--itu-teal-500` with a `ring-2 ring-ring` (`--ring`), offset 2px. Textareas and selects follow the same stroke/radius language.

### Cards / Containers ([`card.tsx`](web/src/shared/ui/card.tsx))
- **Corner Style:** `14px` radius (`--itu-radius-m`).
- **Background:** `--itu-surface` (light) / `--itu-surface` dark; content on the ambient page background.
- **Border:** `1px solid var(--itu-border)`.
- **Shadow:** Ambient card shadow (`--itu-shadow-card`); hover raises background to `--itu-surface-2`.
- **Deep Gradient Card** (`.itu-gradient-card`): `--itu-gradient-deep` (`linear-gradient(165deg, #0d3831, #0a2b26)`) with a radial gold glow (`--itu-glow-gold`), light text `#edf3f0` — used for hero/summary surfaces.

### Dialogs ([`dialog.tsx`](web/src/shared/ui/dialog.tsx))
- **Style:** Radix `DialogContent` with `max-w-lg`, `18px` radius (`--itu-radius-l`), `--itu-shadow-pop`, dark overlay `bg-black/80`, fade + zoom + slide entry animation.
- **Viewport constraint:** All dialogs enforce `max-h-[85vh] overflow-y-auto` at the shared component level. The close button (absolute `right-4 top-4`) stays reachable without scrolling.
- **Override rule:** Individual modals may override defaults via `className` (Tailwind merge handles conflicts), only when a genuinely taller surface is required. Never disable overflow without keeping the close button reachable.

### Navigation
- **App Rail** (`.itu-app-rail`): Deep-teal gradient (`linear-gradient(180deg, var(--itu-teal-900), var(--itu-teal-950))`), light text `#dceae6`. Links are `40px` min-height, `10px` radius; active state is a mint-tinted fill (`rgb(63 182 164 / 0.16)`) with white text and a `--itu-teal-400` icon. Group labels render in `IBM Plex Mono` uppercase.
- **Section Rail / Secondary Rail** (`.itu-section-rail`): `240px`, `--itu-surface-2` background; active rows are `--itu-mint-100` with `--itu-teal-700` text; hover is `--itu-mint-50`.
- **Mobile:** Below `1024px` contextual rails become horizontal pill-scroll rails; below `768px` a fixed bottom tab bar (5 items + More) with `44px` targets.
- **Web navigation behavior:** Primary workspace items can be reordered by drag and drop on desktop; the persisted order is reflected in the mobile five-item bar and More menu. Sync status, notifications, theme, profile, and settings live in the rail footer or compact header.
- **macOS navigation behavior:** The primary rail remains visible at all supported widths; planning context appears in the adjacent rail only when the window is wide enough. Focus status is also exposed through the menu bar and a popover, preserving quick-glance access outside the main window.

### Task Items (`.itu-task-item`)
- **Style:** `min-height 68px`, `3-column` grid (`30px | content | actions`), transparent resting state with a hairline bottom border.
- **Priority Rail:** A 4px left rail signals state — low `#5b8bd9`, medium `--itu-amber-500`, high `--itu-coral-500`, done `--itu-teal-500`, offline/pending `#4f8fcf`.
- **States:** Hover/focus raises to `--itu-surface-2` with `14px` radius + card shadow; selected blends `--itu-mint-50` with a teal ring; done strikes through in `--itu-ink-faint`.
- **Status Button:** 30px circular check; in-progress pulses a blue play icon (`1.8s`), done fills teal.
- **Density variant:** `density-matrix` compresses to `min-height 58px` and 9–11px chips for the Eisenhower matrix.

### Chips
- **Task Chips / Reward Chips** (`.itu-task-chip`, `.itu-reward-chip`): Pill (`999px`) badges, `IBM Plex Mono` 11px weight 600, `28px` min-height, color-coded by meaning — priority (coral/amber/blue), XP (teal `--itu-mint-100` fill), coins (amber `--itu-amber-100` fill), items (violet `#8b6fc9`). Dark mode shifts text hues (`#ff9c90`, `#f4bd62`, `#83b8ec`, `#c5afea`) for contrast.

### Focus Session Banner
- **Style:** Flex row, background `rgba(22, 127, 113, 0.055)`, border `1px solid rgba(22, 127, 113, 0.2)`, radius `12px`, padding `16px`; icon square `44px`, radius `8px`, background `--itu-teal-600`, light text.

### Signature Components
- **Focus Timer Dial** ([`FocusPage.tsx`](web/src/features/focus/FocusPage.tsx)): A 280px SVG dial with 60 tick marks (major ticks `--itu-ink-faint`, minor `--itu-border`) and a gradient progress ring; the timer numeral renders in `IBM Plex Mono` (`52px`, `tabular-nums`). The surface refuses crowded panels for a spacious, meditative single-task scene.
- **Growth Hero & Ledger** ([`GrowthPage.tsx`](web/src/features/growth/GrowthPage.tsx)): `--itu-radius-l` hero with a faint repeating-linear-gradient texture and ambient gold/teal radial glow (`growth-shell::before`); a `3-column` account summary (`112px | 112px | 1fr`) with a gold-tinted coin stat; ledger rows with XP/coin/item chips.
- **Habit Heatmap** (`.habit-heatmap`): 14-column grid of rounded cells — muted (rest), primary (completed), destructive (failed), amber `#d7a830` (skipped).

## Do's and Don'ts

### Do:
- **Do** maintain strict color contrast using soft paper backgrounds (`#f5f7f6`) and deep forest teals (`#0b322c`).
- **Do** use `Manrope` for all body and display UI, `IBM Plex Mono` for numerical values like timers, dates, and XP rewards, and `Fraunces` only for editorial/serif accent headlines.
- **Do** apply smooth cubic-bezier transitions (`cubic-bezier(0.16, 1, 0.3, 1)`) for hover and focus state changes.
- **Do** use the `10px` / `14px` / `18px` radius tiers consistently across buttons, cards, and modal dialogs.
- **Do** reference the shared `--itu-*` tokens (or macOS `iTuTheme` names) for every color, radius, and shadow rather than hardcoding new values.

### Don't:
- **Don't** use stark black `#000000` borders or high-contrast drop shadows.
- **Don't** apply primary teal accents to more than 15% of any screen layout.
- **Don't** introduce arbitrary pixel radii outside the `s` (10px), `m` (14px), and `l` (18px) design token scale.
- **Don't** mix unrelated serif font families into standard task lists or workspace controls; reserve `Fraunces` for editorial accents.
- **Don't** invent new colors outside the token vocabulary — both platforms must stay token-faithful so the cross-platform contract holds.
