---
name: advantis-frontend-design
description: Enforce visual consistency for frontend UI in the advantis-agents codebase using the established 6-color design system, shadow hierarchy, and component patterns. Use when building, modifying, or reviewing React components, pages, onboarding flows, cards, panels, overlays, or frontend PRs for design consistency.
---

# Advantis Frontend Design

Enforce the existing Advantis UI aesthetic when creating or modifying
frontend UI.

This is a constraint skill, not a creative exploration skill.

## Apply This Skill

- Match the current design system before introducing new patterns.
- Prefer existing component variants and utilities over ad hoc styling.
- Preserve visual consistency across light and dark mode.
- Keep motion subtle and functional.

## Stack Reference

Use the established UI stack and patterns:

```text
Tailwind CSS v4 + CSS variables
Radix UI primitives (dialog, dropdown, popover, context-menu, switch)
class-variance-authority (cva) for variant patterns
clsx + tailwind-merge via cn() utility
motion (framer-motion) for animations
lucide-react for icons
sonner for toasts
vaul for drawers
cmdk for command palette
shiki for code highlighting
```

## 6-Color System

Derive the palette from these 6 base colors only. Do not introduce new
colors outside this system.

```text
background   oklch(0.98 0.003 265)  -> surfaces
foreground   oklch(0.185 0.01 270)  -> text, icons
accent       oklch(0.62 0.13 293)   -> brand purple, Auto mode
info         oklch(0.75 0.16 70)    -> amber, warnings, Ask mode
success      oklch(0.55 0.17 145)   -> green, connected states
destructive  oklch(0.58 0.24 28)    -> red, errors, failed
```

Dark mode adjusts lightness automatically:

```text
background   oklch(0.2 0.005 270)
foreground   oklch(0.92 0.005 270)
accent       oklch(0.68 0.13 293)
```

### Color Usage Patterns

```text
Solid mix variants   -> bg-foreground-5, text-foreground-50
Alpha transparency   -> bg-foreground/10, text-accent/50
Tinted text          -> --success-text, --destructive-text, --info-text
                       (color-mix toward foreground for contrast)
shadcn compat        -> bg-secondary, text-muted-foreground, border-border
```

Rules:

- Use `foreground-{N}` mix variants (`2, 3, 5, 10, 20...95`) for solid
  backgrounds.
- Use `foreground/{N}` alpha variants for overlays, hovers, and borders.
- Use CSS variables that auto-switch in dark mode. Do not hardcode light or
  dark values.

## Typography

Use system fonts by default. Do not import Google Fonts or custom display
fonts unless explicitly adding a new font option via the `data-font`
attribute pattern.

```text
--font-sans: system-ui, -apple-system, BlinkMacSystemFont...
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular...
--font-serif: (same as mono)
--font-size-base: 15px
```

Optional Inter is allowed only via `data-font="inter"` on the `html`
element.

## Shadow Hierarchy

Use the custom shadow utilities only. Do not use Tailwind `shadow-*`
defaults.

```text
shadow-thin         -> 1px ring only
shadow-minimal      -> ring + 2 blur layers (default for cards)
shadow-middle       -> ring + 3 blur layers
shadow-medium       -> ring + 4 blur layers
shadow-strong       -> ring + 5 blur layers
shadow-hero         -> ring + 6 blur layers (floating)
shadow-tinted       -> colored ring/blur via --shadow-color CSS var
shadow-modal-small  -> popover/dialog shadows
```

Dark mode increases shadow opacity automatically via CSS variables.

## Component Patterns

Follow the existing component styling contracts.

### Buttons (`button.tsx` via `cva`)

```text
default:     bg-foreground text-background (inverted)
destructive: bg-destructive text-background
outline:     border border-foreground/15 bg-background
secondary:   bg-foreground/5 text-foreground
ghost:       hover:bg-foreground/3
link:        underline

Sizes:
default      h-9 px-4
sm           h-8 px-3
lg           h-10 px-8
icon         size-9
```

### Cards

```text
bg-background shadow-minimal rounded-[8px] overflow-hidden
Header: px-4 py-2 with tinted background via color-mix
Content: px-5 py-4 text-sm
Footer: px-4 py-2 border-t border-border/30 bg-muted/20
```

### Panels

```text
h-full flex flex-col min-w-0 overflow-hidden
```

Rules:

- Do not add border radius directly to panels.
- Let the parent container handle clipping and rounding.

### Popovers / Dropdowns

Use the `.popover-styled` class pattern:

```text
bg-background rounded-[8px] no border layered shadow
```

Rules:

- Use Radix primitives for overlays.
- Do not add Radix enter/exit animations (globally disabled).

### TopBar Buttons

```text
h-7 w-7 rounded-[6px] hover:bg-foreground/5
transition-colors duration-100
```

## Layout Rules

```text
--radius: 0rem (base; components override with explicit values)
--spacing: 0.25rem (Tailwind spacing scale)
Rounded corners: 8px for cards/popovers, 6px for small buttons
Borders: border-foreground/15 for outlines, border-border/30 for separators
```

## Z-Index Scale

Use semantic z-index utilities from the theme, not raw numbers.

```text
base: 0
local: 10
sticky: 20
titlebar: 40
panel: 50
dropdown: 100
tooltip: 150
modal: 200
overlay: 300
fullscreen: 350
floating-menu: 400
splash: 600
```

## Animations

Use subtle motion only.

```text
React animations -> motion (framer-motion)
CSS keyframes -> shimmer, spinner-grid, shake, toast-in
Radix enter/exit animations -> disabled globally
Splash -> scale + opacity with exponential-out easing [0.16, 1, 0.3, 1]
```

Rules:

- Prefer opacity and scale transitions.
- Avoid bouncy or playful motion.

## Scenic Mode

When `data-scenic` is set on `html`, panels become glassmorphic:

- Add `backdrop-filter: blur(8px)` on `shadow-middle` and `shadow-strong`
  panels.
- Use gradient border pseudo-elements (white gradient with mask-composite).
- Use semi-transparent backgrounds via `color-mix`.

## Dark Mode

Dark mode is applied via `.dark` on the `html` element.

- Rely on CSS variables so colors and shadows auto-adjust.
- Use `next-themes` for toggling.
- Test both modes before shipping.

## Required Implementation Habits

- Use `cn()` for conditional class merging.
- Use `lucide-react` for icons.
- Use `motion` for React animations.
- Reuse existing CVA variants before creating new ones.
- Preserve semantic z-index utilities (`z-*` names).

## Anti-Patterns

Do not:

- Introduce colors outside the 6-color system.
- Use custom fonts beyond system UI, JetBrains Mono, or the Inter option.
- Add Radix enter/exit animations.
- Use raw z-index numbers.
- Add border radius on panels.
- Use Tailwind `shadow-sm`, `shadow-md`, or similar default shadows.
- Hardcode light/dark values instead of CSS variables.
- Skip `cn()` for conditional class merging.

## Shipping Checklist

Before shipping UI changes, verify:

1. Colors come from the 6-color system only.
2. Shadows use custom shadow utility classes.
3. Light mode and dark mode both look correct.
4. `cn()` is used for conditional classes.
5. Interactive overlays use Radix primitives.
6. React animations use `motion`.
7. Icons come from `lucide-react`.
8. Z-index values use semantic `z-*` utilities.
