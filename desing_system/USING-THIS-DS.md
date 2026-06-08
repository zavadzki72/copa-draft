# Using "Marccu's Copa" Design System in Claude Code

This bundle is the **token + reference layer** of the Copa design system. It is **not** a
compiled component library — there are no React/Vue packages to `npm install`. The system is
delivered as **CSS custom properties (design tokens)** plus **HTML specimen references** that
show exactly how each component is built. You (and Claude Code) recreate the components in
*your* framework using these tokens and references.

---

## 1. What's in this bundle

```
design_handoff_copa_ds/
├── styles.css              ← root entry point — link/import THIS
├── colors_and_type.css     ← the token layer (palette, type, spacing, radii, shadows, easings, LIGHT theme)
├── DESIGN-SYSTEM.md        ← full design language: voice, color, type, motion, iconography
├── USING-THIS-DS.md        ← this file
└── references/             ← HTML specimens — the source of truth for each component
    ├── comp-language-toggle.html   (PT/EN switcher — 3 variants)
    ├── comp-theme-toggle.html      (sun/moon, dark ↔ light)
    ├── color-theme-light.html      (light theme palette + components)
    ├── comp-buttons.html, comp-card.html, comp-inputs.html,
    ├── comp-nav.html, comp-badges.html
    └── _card.css                   (preview harness styling, ignore for prod)
```

> Open any file in `references/` in a browser to see the live component. Read its `<style>`
> block — that CSS *is* the spec (exact values, hover states, easing).

---

## 2. Drop it into your repo

1. Copy `styles.css` and `colors_and_type.css` into your project (e.g. `src/styles/copa/`).
2. Link or import the **root** stylesheet once, globally:

   **Plain HTML**
   ```html
   <link rel="stylesheet" href="/styles/copa/styles.css">
   ```
   **React / Vite / Next (global)**
   ```js
   import "./styles/copa/styles.css";   // in your root layout / _app / main
   ```
   `styles.css` `@import`s `colors_and_type.css`, which itself pulls the **Archivo** Google
   Font and the Open-Props easings — so one import gives you the whole token layer, the font,
   and the light theme. (Keep both `.css` files together so the relative `@import` resolves.)

3. Tokens are now available as CSS variables everywhere: `var(--green)`, `var(--bg)`,
   `var(--fs-h2)`, `var(--r-pill)`, `var(--ease-elastic-4)`, etc.

---

## 3. Theming (dark is default, light is opt-in)

Dark lives on `:root`. The **complete light theme** is scoped to `[data-theme="light"]`.
Set that attribute on `<html>` (or any wrapper) and every token re-resolves:

```html
<html data-theme="light"> … </html>
```
```js
// toggle
document.documentElement.toggleAttribute("data-theme"); // crude
// or explicit:
const setTheme = t => document.documentElement.setAttribute("data-theme", t); // "light" | (remove for dark)
```

**Rules baked into the light theme** (don't fight them): green fills take **white** text,
accent *text* shifts to deep green `#047A41` for contrast, shadows soften, and **yellow is a
fill only on white — never yellow text on a light surface.**

⚠️ **Motion gotcha (already solved in the references):** transitioning a property whose value
comes from a `var()` token *pins* the old value at the moment the theme flips, in
Chromium-based engines. So: let **theme colors snap** (no transition on `background`/`color`
driven by tokens), and drive any elastic flourish (e.g. a toggle knob) with **`@keyframes`
animations triggered by a local class** — not CSS transitions. See `comp-theme-toggle.html`
for the working pattern.

---

## 4. Token cheat-sheet

| Group | Tokens |
|---|---|
| **Brand** | `--green #00A859` · `--green-bright #2BD97B` · `--green-deep #047A41` · `--yellow #FFDF00` · `--yellow-deep #E5C500` · `--blue #2563EB` · `--blue-bright #4F86FF` |
| **Surfaces (dark)** | `--bg #0D120E` · `--surface-1 #151B16` · `--surface-2 #1E261F` · `--surface-3 #283328` · `--hairline #2A352B` |
| **Text** | `--fg1 #FFFFFF` · `--fg2 #9CA3AF` · `--fg3 #6B7280` · `--on-yellow #0D120E` · `--on-green #08130C` |
| **Status** | `--win` · `--draw` · `--loss` |
| **Type** | `--font-sans`/`--font-mono` (both Archivo) · scale `--fs-display 48px` → `--fs-xs 11px` · weights `--fw-regular…bold` (headings favor **500**) |
| **Radii** | `--r-sm 4px` · `--r-md 8px` · `--r-card 16px` · `--r-pill 50px` |
| **Spacing** | `--sp-1 .5rem` … `--sp-12 8rem` (rem rhythm: .5/1/1.5/2/3/4/8) |
| **Shadow/Glow** | `--shadow-card` · `--shadow-lift` · `--glow-green` · `--glow-yellow` |
| **Easing** | `--ease-pop` · `--ease-smooth` · `--ease-line` · `--ease-elastic-3/4` (Open Props) |

Light-theme overrides for all surface/text/status/shadow tokens live in the
`[data-theme="light"]` block of `colors_and_type.css`.

---

## 5. Signature patterns (so recreations stay on-brand)

- **Wordmark:** `{ copa }` — mono Archivo, green braces around lowercase "copa".
- **Code-token labels:** nav/section anchors written as `:jogos`, `:tabela`, `:craques` —
  mono, green, a leading colon. Use the `.token` class (it adds the `:` via `::before`).
- **Pill buttons:** green primary (near-black text), yellow key-CTA (used *sparingly*), ghost
  outline. Hover lifts `-2px` + green glow. See `comp-buttons.html`.
- **Cards:** 16px radius, near-transparent green hairline border, a 3px gradient top-rail, a
  145° surface gradient; hover lifts `-8px` with a green-tinted shadow + glow. See `comp-card.html`.
- **Flags:** national flags via the [`flag-icons`](https://github.com/lipis/flag-icons) CDN
  (`fi fi-br`, `fi fi-us`). The language toggle uses flag + sigla.
- **Motion is the personality:** elastic easings, quick & springy, never floaty. Respect
  `prefers-reduced-motion`.

---

## 6. Prompts to give Claude Code

Paste something like this in your terminal session, with this folder in the repo:

> "Read `design_handoff_copa_ds/USING-THIS-DS.md` and `DESIGN-SYSTEM.md`, then wire
> `styles.css` into our app globally. Build a **`<LanguageToggle>`** component in our stack
> (React + CSS Modules) that matches `references/comp-language-toggle.html` — the segmented
> PT/EN variant with flag + sigla — using our existing component conventions. Use the CSS
> tokens (`var(--green)`, `var(--r-sm)`, …), not hard-coded hex. Keep the flag-icons CDN."

> "Add a **theme toggle** matching `references/comp-theme-toggle.html`: a sun/moon pill switch
> that sets `data-theme` on `<html>`. Persist the choice in `localStorage`, default to the OS
> `prefers-color-scheme`. Follow the motion gotcha in section 3 — snap theme colors, animate
> the knob with `@keyframes`."

**Tip:** treat the `references/*.html` as the visual contract. Tell Claude Code to match them
pixel-for-pixel but express everything through the tokens and *your* framework's patterns —
never ship the raw HTML.

---

## 7. Fidelity

**High-fidelity.** Every reference has final colors, type, spacing, radii, shadows, hover/
active states, and easing. Recreate them precisely; the only translation is into your
framework's component + styling conventions (and `flag-icons` if your stack doesn't already
bundle flags).
