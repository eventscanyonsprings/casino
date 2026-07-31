---
name: Modern Keno System
colors:
  surface: '#0c141f'
  surface-dim: '#0c141f'
  surface-bright: '#323a47'
  surface-container-lowest: '#070e1a'
  surface-container-low: '#141c28'
  surface-container: '#18202c'
  surface-container-high: '#222a37'
  surface-container-highest: '#2d3542'
  on-surface: '#dbe3f4'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#dbe3f4'
  inverse-on-surface: '#29313e'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#fff9ef'
  on-secondary: '#3a3000'
  secondary-container: '#ffdb3c'
  on-secondary-container: '#725f00'
  tertiary: '#fff3f1'
  on-tertiary: '#690003'
  tertiary-container: '#ffcec7'
  on-tertiary-container: '#c1000a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#ffe16d'
  secondary-fixed-dim: '#e9c400'
  on-secondary-fixed: '#221b00'
  on-secondary-fixed-variant: '#544600'
  tertiary-fixed: '#ffdad5'
  tertiary-fixed-dim: '#ffb4aa'
  on-tertiary-fixed: '#410001'
  on-tertiary-fixed-variant: '#930005'
  background: '#0c141f'
  on-background: '#dbe3f4'
  surface-variant: '#2d3542'
typography:
  display-number:
    fontFamily: Sora
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  display-number-mobile:
    fontFamily: Sora
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 24px
  headline-lg:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
  headline-sm:
    fontFamily: Sora
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  grid-gap: 4px
  container-padding: 16px
  section-margin: 24px
  touch-target-min: 44px
---

## Brand & Style

This design system is built for a fast-paced, high-clarity mobile gaming experience. It centers on a **Modern Flat** aesthetic that prioritizes immediate data recognition and tactile feedback through color rather than physical simulation. 

The brand personality is precise, energetic, and sophisticated. It avoids the cluttered, neon-soaked tropes of traditional gambling apps in favor of a clean, premium "Fintech-meets-Gaming" atmosphere. The emotional response should be one of focus and excitement, facilitated by a distraction-free environment where the numbers are the hero. 

Key visual principles include:
- **Zero-Depth Flatness:** No gradients or heavy drop shadows; depth is conveyed through layering and line-work.
- **High Information Density:** Optimized for the 80-number Keno grid, ensuring maximum touch-target size on mobile devices.
- **State-Driven Visuals:** Every interaction is met with a high-contrast color shift to provide instant confirmation of selection.

## Colors

The palette is designed for a dark-mode-first mobile environment, using a deep, saturated foundation to allow interactive elements to "glow" without using actual glow effects.

- **Primary (#00F0FF):** An electric cyan used for active selections and primary action buttons. It represents the player's agency.
- **Secondary (#FFD700):** A vibrant gold reserved for winning states, jackpots, and successful matches.
- **Background (#121A26):** A deep slate-navy that provides better legibility and less eye strain than pure black.
- **Surface (#1C2636):** A lighter slate used for the game grid and secondary containers to create subtle tonal separation.
- **Error/Alert (#FF3B30):** A sharp red for destructive actions or insufficient balance notifications.

## Typography

Typography is the backbone of the game's usability. This design system utilizes **Sora** for all numerical data and primary headings due to its unique geometric clarity and wide apertures, which maintain legibility even at small sizes on mobile screens.

- **Numbers:** All Keno grid numbers use `display-number`. The font weight is kept at 700 or higher to ensure the numbers feel "heavy" and significant.
- **UI Labels:** **Hanken Grotesk** is used for secondary information, settings, and descriptions. Its sharp, contemporary feel complements the geometric nature of the grid.
- **Clarity:** Avoid lowercase for labels in the game HUD; use `label-bold` with slight letter spacing to create a professional, authoritative look for "BET," "WIN," and "BALANCE" readouts.

## Layout & Spacing

The layout is strictly mobile-optimized, following a **Fluid Grid** model for the number board and a fixed bottom-dock for controls.

- **The Keno Board:** The 80-number grid uses a `grid-gap` of 4px. This minimal spacing maximizes the size of each number cell, ensuring they meet the `touch-target-min` requirement for accessibility.
- **Margins:** A consistent `container-padding` of 16px is applied to the left and right edges of the screen to prevent interactive elements from hugging the bezel.
- **Control Bar:** The primary actions (Play, Clear, Quick Pick) are housed in a persistent bottom sheet or dock, ensuring they are within the "thumb zone" for one-handed play.
- **Hierarchy:** Use `section-margin` to separate the paytable/results area from the active game board.

## Elevation & Depth

This design system rejects shadows in favor of **Tonal Layering** and **Bold Outlines**. 

- **Surface Levels:** The background is the lowest level. The game board sits on a "Surface" layer (#1C2636).
- **Selection Depth:** Instead of rising off the page, selected numbers are "inverted." A selected cell fills with the Primary color, and the text switches to the dark Background color.
- **Borders:** Use 2px solid borders to define containers. Active or focused states are indicated by changing the border color to the Primary accent, rather than adding a shadow.
- **Dividers:** Use low-contrast 1px lines (#2A374A) to separate list items in the paytable.

## Shapes

The shape language is "Soft-Square." This provides a precise, modern feel that aligns with the technical nature of Keno while feeling slightly more approachable than sharp 90-degree corners.

- **Grid Cells:** Numbers in the grid use `rounded-sm` (0.25rem) to maintain a structural, block-like appearance.
- **Action Buttons:** Main buttons use `rounded-lg` (0.5rem) to distinguish them from the game grid.
- **Status Indicators:** Small indicators (like "Hits" counts) can use full pill-rounding to differentiate them from interactive buttons.

## Components

### Keno Number Cells
The core component. It must clearly communicate four states:
- **Default:** Surface background, subtle border, muted white text.
- **Selected:** Primary color fill, Background color text, no border.
- **Drawn (No Match):** Secondary color border, white text.
- **Match (Win):** Secondary color fill, Background color text, bold weight.

### Action Buttons
Buttons should be full-width or large blocks.
- **Primary (Play):** Primary color fill, bold caps text. No gradient. On press, the color should darken by 10%.
- **Secondary (Quick Pick/Clear):** Ghost style with a 2px Primary color border and Primary color text.

### Paytable Rows
A flat list with high-contrast pairs. The "Match" count on the left and the "Payout" on the right. Highlight the current potential payout row with a subtle Primary color background at 10% opacity.

### Input Fields (Bet Selector)
Use a "Stepper" component with large plus/minus icons. The value in the center should use the `display-number` typography style to emphasize the stake.

### Balance HUD
A fixed header component. The currency symbol should be smaller and slightly more muted than the balance figure itself to keep the focus on the number.