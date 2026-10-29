---
version: alpha
name: 21st-crm
description: |
  This design system embodies a clean, professional aesthetic tailored for
  enterprise workflow management. The interface prioritizes clarity and
  efficiency through a restrained color palette, crisp typography, and subtle
  depth cues. The visual language emphasizes content-first organization with
  minimal ornamentation—allowing data and interactions to take center stage. The
  system uses soft neutrals and delicate borders to create visual breathing
  room, paired with precise spacing to guide the eye through complex information
  hierarchies. The overall mood is methodical and trustworthy, designed for
  users managing high-stakes business operations.
source:
  url: "https://21st-crm.vercel.app/opportunities"
  pagesAnalyzed: 1
  extractedAt: 2026-10-23
  tokensMeasured: true
colors:
  neutral-1: "#FFFFFF"
  neutral-2: "#989BA2"
typography:
  heading:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.43
    letterSpacing: 0px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: 0px
  button:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: 0px
  caption-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0px
  caption-xs:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0px
rounded:
  none: 0px
  xs: 4px
  sm: 10px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
borderWidths:
  thin: 1px
shadows:
  sm: "rgba(0, 0, 0, 0.05) 0px 1px 2px 0px"
elevationStrategy: single-tier
themes:
  derived: dark   # the other theme is the site's measured palette
  light:
    bg: "#FFFFFF"
    surface: "#F7F7F7"
    surfaceRaised: "#EEEEEE"
    text: "#111111"
    textMuted: "#646464"
    border: "#E2E2E2"
    accent: "#111111"
    accentFg: "#FFFFFF"
    focusRing: "#111111"
    elevation: shadow
  dark:
    bg: "#0F0F10"
    surface: "#1D1D1E"
    surfaceRaised: "#29292A"
    text: "#F5F5F5"
    textMuted: "#9E9E9E"
    border: "#353536"
    accent: "#818181"
    accentFg: "#0B0B0C"
    focusRing: "#636363"
    elevation: "border+surface"
components:
  button-text:
    typography: "{typography.body-sm}"
    textColor: "lab(7.78201 -0.0000149012 0)"
    height: 32px
    padding: "8px 12px 8px 12px"
    rounded: "{rounded.xs}"
    backgroundColor: "lab(94.2 0 0)"
  button-outline:
    typography: "{typography.heading}"
    textColor: "lab(48.496 0 0)"
    border: "1px dashed lab(90.952 0 -0.0000119209)"
    height: 28px
    padding: "0px 12px 0px 12px"
    rounded: "{rounded.xs}"
  button-outline-2:
    typography: "{typography.heading}"
    textColor: "lab(2.75381 0 0)"
    border: "1px solid lab(90.952 0 -0.0000119209)"
    height: 28px
    padding: "0px 12px 0px 12px"
    rounded: "{rounded.xs}"
    backgroundColor: "lab(100 0 0)"
  button-text-2:
    typography: "{typography.body-sm}"
    textColor: "lab(2.75381 0 0)"
    height: 32px
    padding: "8px 12px 8px 12px"
    rounded: "{rounded.xs}"
  button-icon:
    typography: "{typography.heading}"
    textColor: "lab(2.75381 0 0)"
    height: 28px
    rounded: "{rounded.xs}"
  card:
    typography: "{typography.body-md}"
    textColor: "lab(2.75381 0 0)"
    border: "1px solid lab(90.952 0 -0.0000119209)"
    padding: "12px 12px 12px 12px"
    boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px"
    rounded: "{rounded.sm}"
    backgroundColor: "lab(100 0 0)"
  navigation:
    typography: "{typography.body-sm}"
    textColor: "lab(2.75381 0 0)"
    height: 66px
  link:
    typography: "{typography.heading}"
    textColor: "lab(2.75381 0 0)"
    rounded: "{rounded.xs}"
  link-sm:
    typography: "{typography.body-sm}"
    textColor: "lab(48.496 0 0)"
states:
  other-hover:
    target: other
    state: hover
    opacity: 0
  nav-hover:
    target: nav
    state: hover
    opacity: 1
  other-focus:
    target: other
    state: focus
    borderColor: "rgba(0, 0, 0, 0)"
  other-focus-visible:
    target: other
    state: focus-visible
    borderColor: "rgba(0, 0, 0, 0)"
  other-disabled:
    target: other
    state: disabled
    opacity: 0.5
breakpoints:
  - width: 375
    containerWidth: 375
    gridColumns: 3
    navLinksVisible: 0
    menuToggleVisible: true
    headingPx: 14
    bodyPx: 16
    sectionPaddingX: 24
  - width: 768
    containerWidth: 768
    gridColumns: 0
    navLinksVisible: 10
    menuToggleVisible: true
    headingPx: 14
    bodyPx: 16
    sectionPaddingX: 24
  - width: 1024
    containerWidth: 1024
    gridColumns: 0
    navLinksVisible: 10
    menuToggleVisible: true
    headingPx: 14
    bodyPx: 16
    sectionPaddingX: 24
  - width: 1280
    containerWidth: 1280
    gridColumns: 0
    navLinksVisible: 10
    menuToggleVisible: true
    headingPx: 14
    bodyPx: 16
    sectionPaddingX: 24
  - width: 1440
    containerWidth: 1440
    gridColumns: 0
    navLinksVisible: 10
    menuToggleVisible: true
    headingPx: 14
    bodyPx: 16
    sectionPaddingX: 24
coverage:
  statesFound: 54
  gradientsFound: 0
  rolesUnassigned: 2
  archetypesUnnamed: 0
  archetypesDetected: 0
  responsiveMeasured: true
  stylesheetsBlocked: false
  semanticRampDeclared: false
---

# Design System Inspired by Modern CRM Platforms

## 1. Visual Theme & Atmosphere

This design system embodies a clean, professional aesthetic tailored for enterprise workflow management. The interface prioritizes clarity and efficiency through a restrained color palette, crisp typography, and subtle depth cues. The visual language emphasizes content-first organization with minimal ornamentation—allowing data and interactions to take center stage. The system uses soft neutrals and delicate borders to create visual breathing room, paired with precise spacing to guide the eye through complex information hierarchies. The overall mood is methodical and trustworthy, designed for users managing high-stakes business operations.

**Key Characteristics**
- Neutral-dominant palette with black text on white surfaces
- Restrained shadow system using only soft, barely-perceptible elevation
- Compact, dense information cards organized in Kanban-style columns
- Consistent `{rounded.sm}` (10px) radii on cards creating cohesive softness
- Typography hierarchy scaled from `{typography.caption-xs}` (11px) to `{typography.body-md}` (16px)
- Interaction states communicated through opacity and background color shifts
- Grid-based layout that adapts gracefully across viewport widths

## 2. Color Palette & Roles

### Primary
- **Neutral Surface** (`{colors.neutral-1}` — `#FFFFFF`): Primary surface for cards, containers, and backgrounds. All main content rests on this color.

### Neutral Scale
- **Neutral Surface Foreground** (`{colors.neutral-2}` — `#989BA2`): Secondary text, disabled states, and auxiliary labels. Used for reduced-emphasis content like timestamps and metadata.

## 3. Typography Rules

### Font Family
**Primary Font:** Inter with fallback stack `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

**Secondary Font:** Same as primary (monolithic system)

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Heading | Inter | 14px | 500 | 1.43 | 0px | Used for card titles and section headings |
| Body MD | Inter | 16px | 400 | 1.5 | 0px | Primary content text, paragraph body |
| Body SM | Inter | 14px | 400 | 1.43 | 0px | Secondary content, links, and navigation |
| Button | Inter | 12px | 500 | 1.33 | 0px | Action labels and CTA text |
| Caption SM | Inter | 12px | 400 | 1.33 | 0px | Secondary labels, timestamps, metadata |
| Caption XS | Inter | 11px | 500 | 1 | 0px | Minimal labels, badge text, dense info |

### Principles
- Line heights remain generous (minimum 1.33) to maintain readability across small font sizes
- No negative letter-spacing applied; tracking is natural and open
- Weight progression is minimal: body uses 400, headings and buttons use 500, creating subtle distinction without heaviness
- All text rests on Inter, ensuring consistent rendering across devices and browsers

## 4. Component Stylings

### Buttons

**Primary (Solid Text)**
- Background: `{colors.neutral-1}` (`#FFFFFF`)
- Text Color: Nearly black (`lab(7.78201 -0.0000149012 0)`)
- Padding: `{spacing.xs}` (`8px`) vertical, `{spacing.sm}` (`12px`) horizontal
- Height: 32px
- Border: None
- Border Radius: `{rounded.xs}` (`4px`)
- Font: `{typography.body-sm}` (`14px`, weight 400)
- Box Shadow: None
- Hover State: Opacity transitions to indicate affordance

**Secondary (Outline)**
- Background: Transparent
- Text Color: Dark text (`lab(48.496 0 0)`)
- Padding: 0px vertical, `{spacing.sm}` (`12px`) horizontal
- Height: 28px
- Border: 1px dashed (`lab(90.952 0 -0.0000119209)`)
- Border Radius: `{rounded.xs}` (`4px`)
- Font: `{typography.button}` (`12px`, weight 500)
- Box Shadow: None

**Tertiary (Ghost)**
- Background: Transparent
- Text Color: Nearly black (`lab(2.75381 0 0)`)
- Padding: 0px vertical, `{spacing.sm}` (`12px`) horizontal
- Height: 28px
- Border: 1px solid (`lab(90.952 0 -0.0000119209)`)
- Border Radius: `{rounded.xs}` (`4px`)
- Font: `{typography.button}` (`12px`, weight 500)
- Box Shadow: None

**Icon Button**
- Background: Transparent
- Text Color: Nearly black (`lab(2.75381 0 0)`)
- Padding: 0px (square icon container)
- Width/Height: 28px
- Border: None
- Border Radius: `{rounded.xs}` (`4px`)
- Font: `{typography.button}` (`12px`, weight 500)

### Cards & Containers

**Default Card**
- Background: `{colors.neutral-1}` (`#FFFFFF`)
- Text Color: Nearly black (`lab(2.75381 0 0)`)
- Padding: `{spacing.sm}` (`12px`) on all sides
- Width: 252px (measured standard width)
- Border: 1px solid (`lab(90.952 0 -0.0000119209)`) — light gray hairline
- Border Radius: `{rounded.sm}` (`10px`)
- Font: `{typography.body-md}` (`16px`, weight 400, line-height 1.5)
- Box Shadow: `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` (soft single-tier elevation)

### Inputs & Forms

**Text Input (implicit from extraction)**
- Background: Inherits card/surface background
- Border: 1px solid light gray (hairline)
- Border Radius: `{rounded.xs}` (`4px`)
- Padding: `{spacing.sm}` (`12px`)
- Font: `{typography.body-md}` (`16px`, weight 400)
- Hover: Background lightens subtly via `color-mix(in oklab, var(--input) 30%, transparent)`
- Focus: No visible ring in basic state; focus-visible applies outline

### Navigation

**Default Navigation Item**
- Background: Transparent
- Text Color: Nearly black (`lab(2.75381 0 0)`)
- Padding: 0px
- Height: 66px
- Font: `{typography.body-sm}` (`14px`, weight 400)
- Border: None
- Hover: Opacity shifts and background applies per interaction state
- Active: Background applies `var(--sidebar-accent)` with foreground text color change

### Links

**Link (Default)**
- Text Color: Nearly black (`lab(2.75381 0 0)`)
- Font: `{typography.body-sm}` (`14px`, weight 500)
- Underline: Not applied by default
- Hover: Text color shifts to `var(--foreground)`

**Link (Small Variant)**
- Text Color: Medium gray (`lab(48.496 0 0)`)
- Font: `{typography.body-sm}` (`14px`, weight 400)
- Line Height: 1.43
- Hover: Underline or color shift applied

## 5. Layout Principles

### Spacing System
Base unit: `{spacing.xxs}` (`4px`)

Full scale:
- `{spacing.xxs}` (`4px`) — micro adjustments, internal padding
- `{spacing.xs}` (`8px`) — button padding, tight component spacing
- `{spacing.sm}` (`12px`) — card padding, standard component margins
- `{spacing.md}` (`16px`) — section spacing, body text padding
- `{spacing.lg}` (`24px`) — major section breaks, outer padding

**Usage Context:**
- Component internals: `{spacing.xs}` to `{spacing.sm}`
- Card-to-card gaps: `{spacing.sm}` to `{spacing.md}`
- Section edges and container padding: `{spacing.md}` to `{spacing.lg}`

### Grid & Container
- Max width at largest breakpoint (1440px): 1440px full viewport
- Column strategy: Single-column on mobile (375px), flexible 3-column card grid at desktop (1024px+)
- Kanban-style layout with 5 opportunity stages displayed as vertical columns
- Container padding maintained at `{spacing.lg}` (`24px`) consistently across breakpoints

### Whitespace Philosophy
Spacing is used generously to separate concerns and reduce cognitive load. Cards maintain consistent internal padding of `{spacing.sm}` (`12px`), and inter-card gaps follow the same rhythm. The system favors breathing room over information density, allowing the eye to naturally segment related data blocks.

### Border Radius Scale
- `{rounded.none}` (`0px`) — Applied to navigation containers and flat layout elements
- `{rounded.xs}` (`4px`) — Buttons, inputs, overlays, and small interactive components
- `{rounded.sm}` (`10px`) — Cards, primary containers, and main content surfaces
- `{rounded.full}` (`9999px`) — Avatar containers and profile images

### Border Widths
- **Thin:** 1px — Applied to button outlines, card borders, and input fields. Used as the primary stroke width throughout the system for subtle visual definition without heaviness.

## 6. Depth & Elevation

### Elevation Treatment

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow | Background surfaces, text layers, disabled states |
| Subtle | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | Cards, floating containers, popovers |

**Shadow Philosophy:**
The system employs a single-tier elevation strategy using color-blocking as the primary depth cue. The sole shadow value is barely perceptible—a soft 1px lift with 5% black opacity applied only to cards and contained surfaces. This creates visual separation without creating a layered, floating aesthetic. Depth is primarily communicated through background color shifts and border application rather than aggressive shadows.

### Opacity Levels
- **Default:** 1 (full opacity)
- **Hover:** Opacity shifts and background color mixing applied via `color-mix()` functions to soften interactive states
- **Disabled:** `opacity: 0.5` or `opacity: 1` depending on component type
- **Overlay/Focus:** Full opacity with background color change rather than opacity reduction

### Z-index / Layering
- **Dropdown:** z-index `10`
- **Dropdown (Secondary):** z-index `20`
- **Modal/Overlay:** z-index `50`

## 7. Do's and Don'ts

### Do
- Use `{rounded.sm}` (`10px`) on all card containers for visual cohesion
- Maintain `{spacing.sm}` (`12px`) padding inside cards for consistent internal rhythm
- Apply the single soft shadow (`rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`) to floating or elevated surfaces
- Use `{typography.body-md}` (`16px`) for primary content to ensure legibility
- Apply `{spacing.lg}` (`24px`) to section edges and outer container padding
- Combine border and background color changes on hover instead of relying on shadow shifts
- Keep button heights at 28–32px and maintain consistent padding of `{spacing.xs}` horizontal
- Use nearly black text (`lab(2.75381 0 0)`) on white surfaces for strong contrast

### Don't
- Do not apply shadows other than the single-tier `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` value
- Do not mix border radii; use either `{rounded.xs}` for interactive elements or `{rounded.sm}` for containers
- Do not reduce padding below `{spacing.xs}` (`8px`) in component internals
- Do not apply negative letter-spacing or aggressive tracking changes
- Do not introduce new colors outside the neutral palette without explicit brand guidance
- Do not use line-heights below 1.33 for text smaller than `{typography.body-md}`
- Do not stack multiple shadows for depth; rely on color and border changes
- Do not exceed `{spacing.lg}` (`24px`) for routine component spacing

## 8. Responsive Behavior

### Breakpoints

| Viewport | Width | Key Changes | Grid | Nav Links |
|---|---|---|---|---|
| Mobile | 375px | Full-width cards, stacked layout | 3 columns (card flow) | 0 visible; menu toggle active |
| Tablet | 768px | Cards adapt to wider container | 3-column Kanban preserved | 10 visible |
| Desktop | 1024px | Full Kanban layout stabilizes | 5 columns (stages) + scrollable | 10 visible |
| Large Desktop | 1280px | No layout changes | 5 columns maintained | 10 visible |
| Extra Large | 1440px | Maximum content width applied | 5 columns maintained | 10 visible |

**Key Observations:**
- Layout remains stable at 1024px and above; primary breakpoint is 375px → 768px for card reflow
- Navigation links do not collapse below mobile width; sidebar navigation with toggle is primary pattern
- Typography sizes remain constant across all breakpoints (no scaling)
- Section padding remains `{spacing.lg}` (`24px`) consistently

### Touch Targets
- Minimum interactive element size: 28px × 28px (icon buttons)
- Standard button height: 28–32px
- Navigation items: 66px height ensures adequate touch spacing
- Link click areas should be padded with at least `{spacing.xs}` (`8px`) on all sides

### Collapsing Strategy
- At 375px (mobile), the sidebar collapses behind a menu toggle; main content expands to full width
- Cards remain 252px wide on mobile but reflow into a single or dual-column grid depending on viewport
- Navigation switches to hamburger menu below the collapse point; main navigation items hidden
- No horizontal scrolling is introduced; cards wrap and stack vertically as needed

## 9. Agent Prompt Guide

### Quick Color Reference
- **White Surface:** `{colors.neutral-1}` (`#FFFFFF`) — primary background for cards, containers, and page
- **Text on White:** Nearly black (`lab(2.75381 0 0)`) — default body and heading text
- **Secondary Text:** `{colors.neutral-2}` (`#989BA2`) — timestamps, metadata, reduced-emphasis labels
- **Borders & Hairlines:** Light gray (`lab(90.952 0 -0.0000119209)`) — card borders, input strokes

### Iteration Guide
1. **Start with card containers:** Always apply `{rounded.sm}` (`10px`), 1px border, white background, and `{spacing.sm}` (`12px`) padding
2. **Button defaults:** Use 28–32px height, `{spacing.xs}` to `{spacing.sm}` horizontal padding, `{rounded.xs}` (`4px`) radius
3. **Typography hierarchy:** Body text defaults to `{typography.body-md}` (`16px`, weight 400); headings and labels scale down to `{typography.heading}` (`14px`, weight 500)
4. **Spacing rule:** Apply `{spacing.md}` (`16px`) between major sections, `{spacing.sm}` (`12px`) between cards
5. **Elevation:** Only use `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` shadow for subtle card lift; never introduce additional shadow tiers
6. **Hover/Focus states:** Use background color mixing and opacity shifts rather than shadow changes
7. **Responsive:** Ensure sidebar toggles at mobile; grid reflows but padding remains constant at `{spacing.lg}` (`24px`)

## 10. Known Gaps

- **Semantic color ramp absent:** The site does not declare or expose error, success, warning, or info state colors. No semantic palette is provided; design decisions requiring status colors must await brand guidance.
- **Interaction states partial:** Hover, focus, and active states were extracted from stylesheets but reference CSS variables (`var(--primary)`, `var(--destructive)`, etc.) whose resolved values are not available. Designers must define or confirm these color references.
- **Dark mode or theme variants:** No dark-mode styles were measured or extracted. If the brand ships a dark theme, this document covers the light theme only.
- **Gradients and decorative treatments:** No gradient fills, mesh backgrounds, or ornamental effects were detected in the component layer.
- **Animation and micro-interactions:** Transition durations, easing functions, and animated state changes were not captured. Hover/focus visual feedback relies on color and background shifts only.
- **Typography for display/hero scales:** Only 6 typography roles were extracted; larger display sizes (24px+, 28px+) are not present in the measured page.
- **Surfaces behind authentication:** The page analyzed was a logged-in workspace view. Sign-up, login, and unauthenticated flows were not visited and their design is unmeasured.
- **Neutral color roles unconfirmed:** The two extracted neutrals (`#FFFFFF` and `#989BA2`) are described by function (surface, text) but their semantic intent in the brand system is inferred from context, not declared.
- **Component coverage:** Only buttons, cards, inputs, navigation, and links were fully extracted. Other components (tables, modals, drawers, tooltips, date pickers, etc.) are not documented here.