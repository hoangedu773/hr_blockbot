---
version: alpha
name: Folio-topaz-delta
description: |
  Folio's design system embodies a modern, sophisticated aesthetic grounded in
  high-contrast minimalism and thoughtful use of space. The visual personality
  is clean and data-centric, prioritizing clarity and usability within a
  dark-dominant color scheme that conveys technical competence and contemporary
  polish. The system balances bold serif display typography with accessible
  sans-serif body copy, creating a visual hierarchy that guides users through
  complex data interfaces with elegance. Decorative gradients—layered radial and
  conic washes in subtle blue tones—provide atmospheric depth without cluttering
  the information landscape. The overall mood is professional yet approachable,
  positioning Folio as an AI-first data tool that feels both powerful and
  intuitive.
source:
  url: "https://folio-topaz-delta.vercel.app/"
  pagesAnalyzed: 3
  extractedAt: 2026-10-23
  tokensMeasured: true
colors:
  primary: "#FAFAFA"
  accent: "#266DF0"
  canvas: "#121212"
  ink: "#FAFAFA"
  body: "#EBEBEB"
  muted: "#9B9B9B"
  faint: "#737373"
  accent-1: "#D4F4DC"
  accent-2: "#B8D0FF"
  accent-3: "#DEEAFF"
  accent-4: "#54D490"
  neutral-1: "#242424"
  neutral-2: "#191919"
  neutral-3: "#EDE5FE"
typography:
  display-xl:
    fontFamily: "Tiempos Headline"
    fontSize: 72px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -1.8px
  display-lg:
    fontFamily: "Tiempos Headline"
    fontSize: 60px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -3px
  display-lg-strong:
    fontFamily: "Tiempos Headline"
    fontSize: 60px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0px
  display-lg-2:
    fontFamily: "Tiempos Headline"
    fontSize: 60px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -1.5px
  display-md:
    fontFamily: "Tiempos Headline"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -1.2px
  heading-lg:
    fontFamily: "Tiempos Headline"
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.11
    letterSpacing: 0px
  heading-md:
    fontFamily: Geist
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0px
  heading-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.56
    letterSpacing: -0.45px
  heading-sm-strong:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.56
    letterSpacing: 0px
  heading-sm-tight:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0px
  heading-xs:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: 0px
  body-xl:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0px
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.56
    letterSpacing: 0px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  body-md-loose:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.63
    letterSpacing: 0px
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.63
    letterSpacing: 0px
  body-xs:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0px
  nav:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: 0px
  button-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0px
  button-md-strong:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0px
  button-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.43
    letterSpacing: 0px
  label:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0px
  caption-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.63
    letterSpacing: 0px
  caption-sm-strong:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: 0px
  caption-xs:
    fontFamily: Geist
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0px
  code-sm:
    fontFamily: "Geist Mono"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0px
  code-xs:
    fontFamily: "Geist Mono"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 2.2px
    textTransform: uppercase
rounded:
  none: 0px
  xs: 6px
  sm: 8px
  md: 12px
  lg: 24px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  xxxl: 40px
  section: 48px
  band: 64px
borderWidths:
  thin: 1px
shadows:
  sm: "rgba(0, 0, 0, 0.05) 0px 1px 2px 0px"
  md: "rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px"
  lg: "rgba(28, 40, 64, 0.06) 0px 2px 6px 0px, rgba(28, 40, 64, 0.08) 0px 6px 20px -2px"
elevationStrategy: layered-micro
themes:
  derived: light   # the other theme is the site's measured palette
  light:
    bg: "#F7FBFF"
    surface: "#EDF1F5"
    surfaceRaised: "#E6E9ED"
    text: "#12161C"
    textMuted: "#686C70"
    border: "#D4D8DB"
    accent: "#1360EF"
    accentFg: "#FFFFFF"
    focusRing: "#266DF0"
    elevation: shadow
  dark:
    bg: "#121212"
    surface: "#111111"
    surfaceRaised: "#242424"
    text: "#FAFAFA"
    textMuted: "#EBEBEB"
    border: "#2E2E2E"
    accent: "#266DF0"
    accentFg: "#FFFFFF"
    focusRing: "#266DF0"
    elevation: "border+surface"
gradients:
  - context: section
    kind: conic
    value: "conic-gradient(rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 70%, rgb(59, 130, 246) 85%, rgb(16, 185, 129) 95%, rgba(0, 0, 0, 0) 100%)"
  - context: section
    kind: radial
    value: "radial-gradient(rgba(37, 99, 235, 0.5) 0%, rgba(37, 99, 235, 0.15) 45%, rgba(0, 0, 0, 0) 75%)"
  - context: hero
    kind: linear
    value: "linear-gradient(45deg, rgb(36, 36, 36) 12.5%, rgba(0, 0, 0, 0) 12.5%, rgba(0, 0, 0, 0) 50%, rgb(36, 36, 36) 50%, rgb(36, 36, 36) 62.5%, rgba(0, 0, 0, 0) 62.5%, rgba(0, 0, 0, 0) 100%)"
  - context: section
    kind: radial
    value: "radial-gradient(rgba(37, 99, 235, 0.4) 0%, rgba(37, 99, 235, 0.1) 45%, rgba(0, 0, 0, 0) 75%)"
  - context: section
    kind: radial
    value: "radial-gradient(rgba(37, 99, 235, 0.3) 0%, rgba(37, 99, 235, 0.1) 45%, rgba(0, 0, 0, 0) 75%)"
components:
  button-filled:
    typography: "{typography.body-md}"
    textColor: "rgb(23, 23, 23)"
    border: "1px solid rgb(38, 102, 220)"
    height: 28px
    padding: "3px 7px 3px 5px"
    boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(15, 107, 233, 0.12) 0px 2px 4px -2px, rgba(15, 107, 233, 0.08) 0px 3px 6px -2px"
    rounded: "{rounded.sm}"
    backgroundColor: "{colors.accent}"
  button-filled-lg:
    typography: "{typography.button-sm}"
    textColor: "rgb(255, 255, 255)"
    height: 36px
    padding: "8px 16px 8px 16px"
    boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px"
    rounded: "{rounded.xs}"
    backgroundColor: "rgb(23, 23, 23)"
  button-outline:
    typography: "{typography.button-sm}"
    textColor: "rgb(23, 23, 23)"
    border: "1px solid rgb(230, 230, 230)"
    height: 36px
    padding: "8px 16px 8px 16px"
    boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px"
    rounded: "{rounded.xs}"
    backgroundColor: "rgb(255, 255, 255)"
  button-text:
    typography: "{typography.body-md}"
    textColor: "rgb(23, 23, 23)"
    height: 72px
    padding: "12px 8px 16px 8px"
  button-outline-sm:
    typography: "{typography.caption-sm-strong}"
    textColor: "rgb(23, 23, 23)"
    border: "1px solid rgb(230, 230, 230)"
    height: 26px
    padding: "4px 8px 4px 8px"
    rounded: "{rounded.xs}"
  card:
    typography: "{typography.body-md}"
    textColor: "rgb(23, 23, 23)"
    boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(230, 230, 230) 0px 0px 0px 1px, oklab(0 0 0 / 0.05) 0px 4px 6px -1px, oklab(0 0 0 / 0.05) 0px 2px 4px -2px"
    rounded: 16px
    backgroundColor: "oklab(0.999994 0.0000455678 0.0000200868 / 0.5)"
  card-featured:
    typography: "{typography.body-md}"
    textColor: "rgb(23, 23, 23)"
    backgroundColor: "rgb(251, 251, 251)"
  card-lg:
    typography: "{typography.body-md}"
    textColor: "rgb(23, 23, 23)"
    border: "1px solid rgb(230, 230, 230)"
    boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(28, 40, 64, 0.06) 0px 2px 6px 0px, rgba(28, 40, 64, 0.08) 0px 6px 20px -2px"
    rounded: "{rounded.md}"
    backgroundColor: "rgb(255, 255, 255)"
  navigation:
    typography: "{typography.body-md}"
    textColor: "rgb(23, 23, 23)"
    height: 78px
    padding: "0px 8px 0px 8px"
  navigation-2:
    typography: "{typography.body-md}"
    textColor: "{colors.body}"
    height: 78px
    padding: "0px 8px 0px 8px"
  footer:
    typography: "{typography.body-md}"
    textColor: "rgb(23, 23, 23)"
    backgroundColor: "rgb(255, 255, 255)"
  footer-2:
    typography: "{typography.body-md}"
    textColor: "{colors.body}"
    backgroundColor: "{colors.canvas}"
  link:
    typography: "{typography.caption-sm-strong}"
    textColor: "rgb(23, 23, 23)"
    border: "1px solid rgb(230, 230, 230)"
    padding: "6px 14px 6px 14px"
    boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px"
    rounded: "3.35544e+07px"
    backgroundColor: "rgb(255, 255, 255)"
  link-sm:
    typography: "{typography.nav}"
    textColor: "{colors.faint}"
states:
  card-hover:
    target: card
    state: hover
    opacity: 0.8
  other-hover:
    target: other
    state: hover
    opacity: 1
  other-disabled:
    target: other
    state: disabled
    opacity: 0.5
  other-focus-visible:
    target: other
    state: focus-visible
    boxShadow: "rgba(0, 0, 0, 0.1) 0px 4px 12px, rgba(0, 0, 0, 0.2) 0px 0px 0px 2px"
  button-focus-visible:
    target: button
    state: focus-visible
    boxShadow: "rgba(0, 0, 0, 0.4) 0px 0px 0px 2px"
breakpoints:
  - width: 375
    containerWidth: 365
    gridColumns: 6
    navLinksVisible: 1
    menuToggleVisible: true
    headingPx: 48
    bodyPx: 16
    sectionPaddingX: 0
  - width: 768
    containerWidth: 758
    gridColumns: 6
    navLinksVisible: 1
    menuToggleVisible: true
    headingPx: 60
    bodyPx: 16
    sectionPaddingX: 0
  - width: 1024
    containerWidth: 1014
    gridColumns: 6
    navLinksVisible: 7
    menuToggleVisible: true
    headingPx: 72
    bodyPx: 16
    sectionPaddingX: 0
  - width: 1280
    containerWidth: 1270
    gridColumns: 6
    navLinksVisible: 7
    menuToggleVisible: true
    headingPx: 72
    bodyPx: 16
    sectionPaddingX: 0
  - width: 1440
    containerWidth: 1430
    gridColumns: 6
    navLinksVisible: 7
    menuToggleVisible: true
    headingPx: 72
    bodyPx: 16
    sectionPaddingX: 0
coverage:
  statesFound: 35
  gradientsFound: 5
  rolesUnassigned: 7
  archetypesUnnamed: 0
  archetypesDetected: 0
  responsiveMeasured: true
  stylesheetsBlocked: false
  semanticRampDeclared: false
---

# Design System Inspired by Folio

## 1. Visual Theme & Atmosphere

Folio's design system embodies a modern, sophisticated aesthetic grounded in high-contrast minimalism and thoughtful use of space. The visual personality is clean and data-centric, prioritizing clarity and usability within a dark-dominant color scheme that conveys technical competence and contemporary polish. The system balances bold serif display typography with accessible sans-serif body copy, creating a visual hierarchy that guides users through complex data interfaces with elegance. Decorative gradients—layered radial and conic washes in subtle blue tones—provide atmospheric depth without cluttering the information landscape. The overall mood is professional yet approachable, positioning Folio as an AI-first data tool that feels both powerful and intuitive.

**Key Characteristics**
- High-contrast, dark-first design with crisp neutral ramp
- Bold serif headings (`{typography.display-xl}` — 72px, weight 700) contrasted with humanist sans-serif body copy
- Pill-shaped primary buttons (`{rounded.full}`) emphasizing action
- Minimal shadows relying on color-blocking for depth
- Decorative accent gradients (blue, green) layered beneath hero and feature sections
- Responsive typography that scales from 48px on mobile to 72px on desktop
- Data-table and list-centric layout patterns

## 2. Color Palette & Roles

### Primary

- **Primary / Brand** (`{colors.primary}` — `#FAFAFA`): Near-white ink used for primary CTA buttons, brand marks, active states, and primary headings. Ensures maximum contrast on dark backgrounds.
- **Brand Accent** (`{colors.accent}` — `#266DF0`): Saturated blue used as the secondary brand hue, appearing in focus states, hover effects, and supportive UI elements. Defines the brand's electronic, data-forward personality.

### Accent Colors

- **Accent (Decorative)** (`{colors.accent-1}` — `#D4F4DC`): Light mint green; no measured UI role. Used as decorative layering in gradient backgrounds.
- **Accent (Decorative)** (`{colors.accent-2}` — `#B8D0FF`): Soft periwinkle; no measured UI role. Used as decorative layering in gradient backgrounds.
- **Accent (Decorative)** (`{colors.accent-3}` — `#DEEAFF`): Pale blue tint; no measured UI role. Used as decorative layering in gradient backgrounds.
- **Accent (Decorative)** (`{colors.accent-4}` — `#54D490`): Vibrant green; no measured UI role. Used as decorative layering in gradient backgrounds.

### Neutral Scale

- **Canvas** (`{colors.canvas}` — `#121212`): Default page background; deep charcoal establishing the dark theme.
- **Body** (`{colors.body}` — `#EBEBEB`): Primary body text color; near-white ensuring readability on canvas.
- **Muted** (`{colors.muted}` — `#9B9B9B`): Secondary text, captions, and de-emphasized copy; approximately 60% opacity gray.
- **Faint** (`{colors.faint}` — `#737373`): Tertiary text and placeholder copy; approximately 45% opacity gray.
- **Neutral (Intermediate)** (`{colors.neutral-1}` — `#242424`): Slightly lighter than canvas; used for subtle surface differentiation.
- **Neutral (Deep)** (`{colors.neutral-2}` — `#191919`): Slightly darker than canvas; reserved for specific depth applications.
- **Neutral (Light)** (`{colors.neutral-3}` — `#EDE5FE`): Very light; no measured role. Treat as decorative or light-mode surface candidate.

### Surface & Borders

Cards and containers use a layered approach: semi-transparent white or full-opacity backgrounds depending on elevation level, with 1px solid borders in `#E6E6E6` (light mode) or transparent (dark mode). Hairline borders (1px) are used sparingly on form inputs and outline buttons.

## 3. Typography Rules

### Font Family

**Primary:** Geist (sans-serif)
Fallback stack: `Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

**Secondary:** Tiempos Headline (serif)
Fallback stack: `Tiempos Headline, Georgia, "Times New Roman", serif`

**Monospace:** Geist Mono
Fallback stack: `Geist Mono, "Courier New", monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Display XL | Tiempos Headline | 72px | 700 | 1.0 | -1.8px | Hero headings; maximum impact |
| Display LG (Strong) | Tiempos Headline | 60px | 600 | 1.0 | 0px | Large display; brand statements |
| Display LG (Loose) | Tiempos Headline | 60px | 400 | 1.0 | -3px | Hero/display with tight tracking |
| Display LG (Bold) | Tiempos Headline | 60px | 700 | 1.0 | -1.5px | Display emphasis variant |
| Display MD | Tiempos Headline | 48px | 700 | 1.0 | -1.2px | Secondary heading; feature sections |
| Heading LG | Tiempos Headline | 36px | 600 | 1.11 | 0px | Page section headings |
| Heading SM (Strong) | Geist | 18px | 600 | 1.56 | 0px | Subsection headings; cards |
| Heading SM (Tight) | Geist | 18px | 600 | 1.25 | 0px | Compact heading variant |
| Heading SM (Medium) | Geist | 18px | 500 | 1.56 | -0.45px | Lighter section titles |
| Heading XS | Geist | 14px | 600 | 1.43 | 0px | Form labels; small UI headings |
| Body LG | Geist | 18px | 400 | 1.56 | 0px | Large body; intro paragraphs |
| Body XL | Geist | 20px | 700 | 1.4 | 0px | Emphasized body; call-outs |
| Body MD | Geist | 16px | 400 | 1.5 | 0px | Standard paragraph text |
| Body MD (Loose) | Geist | 16px | 400 | 1.63 | 0px | Body with increased line height |
| Body SM | Geist | 14px | 400 | 1.63 | 0px | Smaller body copy; secondary text |
| Body XS | Geist | 12px | 400 | 1.33 | 0px | Minimal text; UI labels |
| Button MD | Geist | 16px | 500 | 1.5 | 0px | Standard action button text |
| Button MD (Strong) | Geist | 16px | 600 | 1.5 | 0px | Emphasized button variant |
| Button SM | Geist | 14px | 500 | 1.43 | 0px to -0.28px | Small button; depends on variant |
| Button SM (Uppercase) | Geist | 14px | 500 | 1.43 | 0.7px | Small button with text-transform uppercase |
| Label | Geist | 14px | 500 | 1.0 | 0px | Form labels; UI labels |
| Caption SM | Geist | 12px | 400 | 1.63 | 0px | Tertiary text; helper copy |
| Caption SM (Strong) | Geist | 12px | 500 | 1.33 | 0px | Emphasized caption |
| Caption XS | Geist | 10px | 500 | 1.0 | 0px | Minimal caption; timestamps |
| Navigation | Geist | 14px | 400 | 1.43 | 0px | Primary navigation links |
| Code XS | Geist Mono | 11px | 400 | 1.5 | 2.2px | Code tokens; text-transform uppercase |
| Code SM | Geist Mono | 12px | 400 | 1.33 | 0px | Inline code; code blocks |

### Principles

- **Serif for impact:** Display sizes (48px–72px) use Tiempos Headline to anchor pages with editorial weight and sophistication.
- **Negative tracking on large display:** Headings 48px and above employ tight letter-spacing (-1.2px to -3px) to reinforce boldness and visual hierarchy.
- **Humanist sans for utility:** Body, button, and navigation copy use Geist to ensure legibility and approachability.
- **Consistent line heights:** Body copy maintains 1.5–1.63 line height for comfort; display text collapses to 1.0 for dramatic effect.
- **Mono for data:** Geist Mono is reserved for code, tokens, and technical labels; its wider letter-spacing (2.2px on uppercase) emphasizes its technical role.

## 4. Component Stylings

### Buttons

#### Primary Filled (Large)

- **Background:** `{colors.canvas}` (`#121212`)
- **Text Color:** `{colors.primary}` (`#FAFAFA`)
- **Padding:** `8px 16px 8px 16px`
- **Height:** 36px
- **Font:** Geist, `{typography.button-sm}` (14px, weight 500)
- **Border Radius:** `{rounded.xs}` (6px)
- **Border:** None
- **Box Shadow:** `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px`
- **Hover State:** Reduce opacity to 0.8; maintain color

#### Secondary Outline

- **Background:** `{colors.primary}` (`#FAFAFA`)
- **Text Color:** `{colors.canvas}` (`#121212`)
- **Padding:** `8px 16px 8px 16px`
- **Height:** 36px
- **Font:** Geist, `{typography.button-sm}` (14px, weight 500)
- **Border Radius:** `{rounded.xs}` (6px)
- **Border:** 1px solid `#E6E6E6`
- **Box Shadow:** `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`
- **Hover State:** Border color lightens

#### Ghost / Text Button

- **Background:** Transparent
- **Text Color:** `{colors.canvas}` (`#121212`)
- **Padding:** `12px 8px 16px 8px`
- **Height:** Auto (min 72px)
- **Font:** Geist, `{typography.body-md}` (16px, weight 400)
- **Border Radius:** `{rounded.none}` (0px)
- **Border:** None
- **Box Shadow:** None
- **Hover State:** Opacity reduces to 0.75

#### Small Outline

- **Background:** Transparent
- **Text Color:** `{colors.canvas}` (`#121212`)
- **Padding:** `4px 8px 4px 8px`
- **Height:** 26px
- **Font:** Geist, `{typography.caption-sm-strong}` (12px, weight 500)
- **Border Radius:** `{rounded.xs}` (6px)
- **Border:** 1px solid `#E6E6E6`
- **Box Shadow:** None
- **Hover State:** Background fills with accent color

### Cards & Containers

#### Default Card

- **Background:** Semi-transparent white — `oklab(0.999994 0.0000455678 0.0000200868 / 0.5)`
- **Text Color:** `{colors.canvas}` (`#121212`)
- **Padding:** 0px (inner content handles padding)
- **Border:** 1px solid transparent
- **Border Radius:** `{rounded.lg}` (24px)
- **Box Shadow:** `rgba(0, 0, 0, 0.05) 0px 4px 6px -1px, rgba(0, 0, 0, 0.05) 0px 2px 4px -2px` (layered micro elevation)
- **Hover State:** Opacity reduces to 0.8

#### Featured Card (Light)

- **Background:** `#FBFBFB`
- **Text Color:** `{colors.canvas}` (`#121212`)
- **Padding:** 0px
- **Border:** None
- **Border Radius:** `{rounded.none}` (0px)
- **Box Shadow:** None
- **Hover State:** None

#### Large Card (High Elevation)

- **Background:** `#FFFFFF`
- **Text Color:** `{colors.canvas}` (`#121212`)
- **Padding:** 0px
- **Border:** 1px solid `#E6E6E6`
- **Border Radius:** `{rounded.md}` (12px)
- **Box Shadow:** `rgba(28, 40, 64, 0.06) 0px 2px 6px 0px, rgba(28, 40, 64, 0.08) 0px 6px 20px -2px`
- **Hover State:** Opacity reduces to 0.8

### Inputs & Forms

#### Text Input (Standard)

- **Background:** Transparent or light surface (from navigation context, dark mode shows transparent)
- **Text Color:** `{colors.canvas}` (`#121212`)
- **Border:** 1px solid `#E6E6E6` or context-aware
- **Border Radius:** `{rounded.xs}` (6px)
- **Padding:** `8px 12px` (inferred from form examples)
- **Font:** Geist, `{typography.body-md}` (16px, weight 400)
- **Hover State:** Background becomes `color-mix(in oklab, var(--color-input)50%, transparent)`
- **Focus State:** Focus ring applied

#### Placeholder Text

- **Color:** `{colors.faint}` (`#737373`)
- **Font:** Geist, `{typography.body-md}` (16px, weight 400)

### Navigation

#### Primary Navigation (Light Mode)

- **Background:** Transparent
- **Text Color:** `{colors.canvas}` (`#121212`)
- **Height:** 78px
- **Padding:** `0px 8px`
- **Border:** None
- **Font:** Geist, `{typography.nav}` (14px, weight 400)

#### Primary Navigation (Dark Mode)

- **Background:** Transparent
- **Text Color:** `{colors.body}` (`#EBEBEB`)
- **Height:** 78px
- **Padding:** `0px 8px`
- **Border:** None
- **Font:** Geist, `{typography.nav}` (14px, weight 400)

#### Navigation Link (Active/Hover)

- **Color:** Transitions to `{colors.accent}` (`#266DF0`)
- **Opacity on Hover:** Reduces to 0.75–0.8 depending on state

### Links

#### Standard Link

- **Background:** `{colors.primary}` (`#FAFAFA`)
- **Text Color:** `{colors.canvas}` (`#121212`)
- **Padding:** `6px 14px`
- **Height:** 30px
- **Border Radius:** `{rounded.full}` (pill; 9999px)
- **Border:** 1px solid `#E6E6E6`
- **Font:** Geist, `{typography.caption-sm-strong}` (12px, weight 500)
- **Box Shadow:** `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`

#### Inline Link (Small)

- **Background:** Transparent
- **Text Color:** `{colors.faint}` (`#737373`)
- **Padding:** 0px
- **Height:** 20px
- **Border Radius:** `{rounded.none}` (0px)
- **Border:** None
- **Font:** Geist, `{typography.nav}` (14px, weight 400)
- **Hover State:** Color transitions to body or accent

## 5. Layout Principles

### Spacing System

Base unit: `{spacing.xs}` = 8px

**Scale:**
- `{spacing.xxs}` = 4px (minimal gutters, hairline spacing)
- `{spacing.xs}` = 8px (tight spacing, form gutters)
- `{spacing.sm}` = 12px (component internal spacing)
- `{spacing.md}` = 16px (standard component padding, small gaps)
- `{spacing.lg}` = 20px (medium gaps, button groups)
- `{spacing.xl}` = 24px (card padding, section internal space)
- `{spacing.xxl}` = 32px (large gaps between sections)
- `{spacing.xxxl}` = 40px (extra-large spacing, feature blocks)
- `{spacing.section}` = 48px (section padding vertical and horizontal at smaller viewports)
- `{spacing.band}` = 64px (full-width band padding; hero sections)

**Usage Context:**
- Form inputs: `{spacing.md}` (16px) internal padding
- Button groups: `{spacing.lg}` (20px) between buttons
- Card content: `{spacing.xl}` (24px) internal
- Section blocks: `{spacing.section}` (48px) to `{spacing.band}` (64px) for vertical rhythm

### Grid & Container

- **Max Width:** 1270px (measured at 1440px viewport; content column 1430px minus 2×80px edge buffer)
- **Column Strategy:** 6-column grid measured across all breakpoints (375px–1440px)
- **Section Patterns:** Hero sections use full-width backgrounds with centered content (max-width: 1270px). Feature cards stack in single or multi-column layouts depending on breakpoint.
- **Horizontal Padding:** 0px at edge (content spans edge-to-edge); left/right gutters added within containers as needed

### Whitespace Philosophy

Folio employs deliberate asymmetric spacing. Hero sections use large top/bottom padding (`{spacing.band}` — 64px) to create breathing room and visual dominance. Body content regions use `{spacing.section}` (48px) between blocks. Decorative gradients (radial/conic) sit beneath hero regions, providing atmospheric depth without cluttering the functional layer above. Negative space reinforces hierarchy: smaller elements (captions, labels) sit tighter (`{spacing.sm}` — 12px), while page-level sections breathe (`{spacing.xxl}` — 32px to `{spacing.band}` — 64px).

### Border Radius Scale

- `{rounded.none}` = 0px — Featured cards, hero sections, full-width blocks
- `{rounded.xs}` = 6px — Buttons (filled, outline), form inputs, small UI containers
- `{rounded.sm}` = 8px — Minimal use (measured on buttons in detail)
- `{rounded.md}` = 12px — Large cards, elevated surfaces
- `{rounded.lg}` = 24px — Default card; moderate prominence
- `{rounded.full}` = 9999px — Primary action buttons, pill-shaped links, circular badges

**Component Mapping:**
- Primary buttons: `{rounded.full}` (pill)
- Secondary buttons / inputs: `{rounded.xs}` (6px)
- Cards (default): `{rounded.lg}` (24px)
- Cards (large, elevated): `{rounded.md}` (12px)
- Featured/full-width: `{rounded.none}` (0px)

### Border Widths

- **Thin:** 1px — Form inputs, outline buttons, card borders, navigation borders

Borders are used sparingly and primarily to define contained regions (cards, inputs) or secondary CTAs (outline buttons). Dark-mode cards may render with transparent borders for subtle separation.

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow; transparent or color-blocked background | Ghost buttons, hero backgrounds, typography-driven sections |
| Micro (sm) | None (null shadow in system) | Reserved; not visually used |
| Subtle (md) | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | Minimal lift; form inputs, small UI elements |
| Standard (lg) | `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px` | Default cards, buttons, containers |
| Elevated (xl) | `rgba(28, 40, 64, 0.06) 0px 2px 6px 0px, rgba(28, 40, 64, 0.08) 0px 6px 20px -2px` | High-priority cards, modals, overlays |

**Shadow Philosophy:**

Folio employs a **layered-micro** elevation strategy: shadows are built from multiple transparent layers stacked at zero offset, creating barely-perceptible depth rather than dramatic drop shadows. The system prioritizes color-blocking—surfaces are differentiated by background brightness (`#121212` to `#FFFFFF`) rather than shadow intensity. This approach keeps the dark-mode aesthetic clean and modern while maintaining visual hierarchy. High-elevation surfaces (cards, modals) receive marginally more shadow opacity and blur to establish priority.

### Opacity Levels

- **Disabled:** 50% (0.50) — Inactive buttons, form fields
- **Hover Subtle:** 55% (0.55), 60% (0.60), 65% (0.65), 70% (0.70) — Varying hover brightening on interactive elements
- **Transparent Accent:** 25% (0.25) — Decorative gradient overlays

Opacity is used to modulate interactivity rather than create hard state layers. Hover states reduce opacity slightly (0.75–0.8) to provide visual feedback without introducing new colors.

### Z-index / Layering

- **Base Layer:** z-index 1, 2, 3, 4 — Stacked content blocks, default components
- **Dropdown / Overlay:** z-index 10, 20 — Navigation dropdowns, tooltips, modals

The system uses a flat, minimal stacking order. Most interactive content sits at base levels (1–4); only modals and floating overlays rise to 10–20. This keeps visual complexity low and prevents z-index conflicts.

## 7. Do's and Don'ts

### Do

- **Use Tiempos Headline for all display (48px+).** Its serif weight and negative letter-spacing (-1.2px to -3px) are brand signatures; never substitute sans-serif at display sizes.
- **Maintain dark-first, high-contrast design.** Dark canvas (`#121212`) paired with near-white text (`#FAFAFA`) is the primary theme. Light surfaces are secondary and accent-only.
- **Apply pill-shaped buttons (`{rounded.full}`) for primary CTAs** to reinforce action and brand recognition.
- **Leverage color-blocking over shadows for depth.** Differentiate surfaces by background tone (`#121212`, `#242424`, `#FFFFFF`) rather than box-shadow intensity.
- **Use decorative gradients (blue/green radial washes) beneath hero and feature sections.** They provide atmospheric depth without cluttering interactive layers.
- **Maintain 1.0 line-height on display text (48px+).** Tighter line-height reinforces typographic drama.
- **Stack spacing in multiples of `{spacing.xs}` (8px).** Rhythm comes from consistent 8px-based increments.
- **Reserve Geist Mono for code, tokens, and technical labels only.** It signals technical content and should not appear in body prose.
- **Use the full 6-column grid consistently across all breakpoints.** Maintain grid alignment from 375px viewport upward.

### Don't

- **Do not use serif typography below 48px.** Body, button, and navigation text must use Geist (sans-serif).
- **Do not round display letter-spacing to 0px.** Negative tracking (-1.2px, -1.8px, -3px) is essential to Folio's typography voice.
- **Do not apply large drop shadows (blur > 20px).** Folio's shadow system is minimal and layered; maintain soft, subtle elevation only.
- **Do not place primary CTAs in outline or ghost styles.** Primary actions are filled, dark (`#121212` background), with white text (`#FAFAFA`).
- **Do not invent semantic colors (error red, success green, warning yellow).** The site provides no explicit error/success/warning palette; avoid false signaling.
- **Do not use the light neutral (`#EDE5FE`) or unassigned accent colors (`#D4F4DC`, `#B8D0FF`, `#DEEAFF`) in interactive UI.** These are decorative gradient layers only.
- **Do not reduce opacity below 50% on interactive elements.** Disabled buttons sit at 0.5 opacity; further reduction makes them inaccessible.
- **Do not stack z-index above 20** without explicit design justification. Keep layering flat and predictable.
- **Do not deviate from the measured column count.** Mobile (375px) is not single-column; it measures 6 columns. Adapt content density, not grid structure.
- **Do not apply rounded corners to full-width hero sections** (`{rounded.none}` — 0px is correct).

## 8. Responsive Behavior

### Breakpoints

| Breakpoint | Width | Content Column | Grid Cols | Nav Links | Key Change | Heading | Body |
|---|---|---|---|---|---|---|---|
| Mobile | 375px | 365px | 6 | 1 | Menu toggle active | 48px (display-md) | 16px |
| Tablet | 768px | 758px | 6 | 1 | Menu toggle active | 60px (display-lg) | 16px |
| Laptop | 1024px | 1014px | 6 | 7 | Nav links visible | 72px (display-xl) | 16px |
| Desktop | 1280px | 1270px | 6 | 7 | No layout change | 72px (display-xl) | 16px |
| Wide | 1440px | 1430px | 6 | 7 | No layout change | 72px (display-xl) | 16px |

**Breakpoint Logic:**
- **Mobile (≤768px):** Menu toggle replaces nav links; largest heading scales to 48px–60px depending on exact viewport.
- **Tablet (769px–1023px):** Menu toggle remains active; heading grows to 60px. Content column reaches 758px.
- **Laptop (1024px+):** Navigation links appear inline; menu toggle may remain. Heading reaches maximum 72px.
- **Desktop (1280px+):** Stable layout; no further responsive changes.

### Touch Targets

Measured data does not specify dedicated touch-target sizes; infer from component heights:
- **Buttons:** Minimum 36px height (observed on primary buttons), 26px on small variants.
- **Links/Pills:** Minimum 30px height.
- **Form Inputs:** Minimum 36px height.
- **Navigation:** 78px header height accommodates touch safely.

Recommend maintaining minimum 44px touch targets for mobile interfaces where possible; current system shows 36px as practical minimum.

### Collapsing Strategy

- **Navigation:** At 768px and below, primary nav collapses into menu toggle (hamburger icon). Links re-appear at 1024px as inline list.
- **Hero Typography:** Display size descends from 72px (1024px+) → 60px (768px) → 48px (375px). Maintains visual hierarchy while optimizing for viewport width.
- **Card Layout:** Cards remain full-width across all breakpoints; content density adjusts via padding and text sizing, not column count.
- **Section Padding:** Horizontal padding stays at 0px edge-to-edge; internal gutters scale with content column width. Vertical spacing (`{spacing.section}` — 48px to `{spacing.band}` — 64px) remains consistent.
- **Data Tables:** Horizontal scroll or stacked layout (measured behavior not extracted); implement based on product requirements.

## 9. Agent Prompt Guide

### Quick Color Reference

- **Primary CTA Fill & Ink:** Near-white / `#FAFAFA` — brand accent for buttons and headings
- **Brand Accent (Secondary):** Blue / `#266DF0` — hover states, focus rings, secondary actions
- **Page Background:** Deep charcoal / `#121212` — `{colors.canvas}`
- **Body Text:** Light gray / `#EBEBEB` — `{colors.body}`
- **Secondary Text:** Medium gray / `#9B9B9B` — `{colors.muted}`
- **Tertiary / Placeholder:** Dark gray / `#737373` — `{colors.faint}`
- **Decorative Accents:** Mint green, periwinkle, pale blue, vibrant green — used in radial/conic gradients only; never in interactive UI

### Iteration Guide

1. **Typography is two-font.** Tiempos Headline (serif) for display (48px+); Geist (sans) for body, buttons, nav. Never mix serif into body sizes.

2. **Display text uses negative letter-spacing.** Apply -1.2px to -3px tracking on headings 48px and above. This is not a stylistic choice; it is core to the system.

3. **Buttons are pill-shaped primaries (`{rounded.full}`) and 6px corners on secondary/outline variants.** Never use 12px or 24px on interactive buttons.

4. **Dark canvas with high-contrast text.** Background is always `#121212`; text is `#FAFAFA` or `#EBEBEB`. Light surfaces are secondary accent cards only.

5. **Shadows are minimal and layered.** Use the provided shadow values exactly (md, lg, xl); do not invent new blur radii or offsets.

6. **Spacing is 8px-based.** All gaps, padding, and margins are multiples of `{spacing.xs}` (8px). No odd increments.

7. **Cards use `{rounded.lg}` (24px) by default; elevated cards use `{rounded.md}` (12px).** Featured/full-width blocks use `{rounded.none}` (0px).

8. **Opacity modulates interactivity, not color.** Hover states reduce opacity (0.75–0.8) or apply background tints; do not introduce new hues.

9. **Decorative gradients (blue/green washes) belong below hero sections, not on interactive layers.** They provide atmosphere, not UI function.

10. **Grid is 6 columns across all breakpoints (375px–1440px).** Responsive behavior comes from heading size and nav collapse, not column-count changes.

## 10. Known Gaps

- **No semantic color ramp.** The site does not expose error, success, warning, or info colors in its markup. No status palette was extracted. Implement status states using opacity, borders, or icon signals only.

- **Seven unassigned accent colors.** Colors `{colors.accent-1}` (`#D4F4DC`), `{colors.accent-2}` (`#B8D0FF`), `{colors.accent-3}` (`#DEEAFF`), `{colors.accent-4}` (`#54D490`), `{colors.neutral-1}` (`#242424`), `{colors.neutral-2}` (`#191919`), and `{colors.neutral-3}` (`#EDE5FE`) were measured but have no measured UI roles. They appear in decorative gradients or form structural variants. Do not repurpose them for interactive UI without explicit design guidance.

- **Interaction states are partial.** Focus states, active states, and disabled states were extracted from stylesheets but may not cover all component variants. Form inputs, checkboxes, radio buttons, and composite widgets (date pickers, dropdowns) were not captured. Implement missing states following the opacity and color-mix patterns observed (e.g., disabled = 0.5 opacity; hover = reduce opacity 0.75–0.8 or apply background tint).

- **Dark mode / light mode not measured.** The extraction observed both light-background pages and dark-background pages within the same site. No explicit light/dark theme toggle or CSS media query was recorded. One theme appears to be derived (calculated) rather than authored. Treat this document as describing the primary, measured theme (dark-first); implement light mode as a derived inverse if needed, but do not rely on this document for light-mode specifics.

- **Component animation / transition data absent.** No transition durations, easing functions, or animation keyframes were extracted. Implement standard motion curves (ease-in-out, 200–300ms) for interactive state changes unless otherwise specified.

- **Surfaces behind authentication not visited.** The design system is described from public pages only. Authenticated dashboards, account settings, and restricted features may use variant component patterns. Those patterns are outside the scope of this extraction.

- **Border-width data is minimal.** Only 1px (thin) was explicitly measured. If thicker borders are needed, infer from design intent: 2px for emphasis, 0px for flush designs. No extract supports borders > 1px.

- **Data table and complex list patterns not defined.** The site includes stock analysis tables and report builders. Their internal cell styling, row hover effects, and header pinning behavior were not systematically extracted. Implement table components using the card (`{rounded.xs}`) and button styles as foundation, and fill gaps with accessibility best practices.

---

**System Version:** 1.0  
**Extracted from:** https://folio-topaz-delta.vercel.app/  
**Analysis Scope:** 3 public pages (hero, pricing, contact)  
**Last Updated:** 2025