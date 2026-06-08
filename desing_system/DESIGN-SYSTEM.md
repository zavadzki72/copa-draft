# Marccu's Copa — Design System

**World Cup edition** of Marccus Zavadzki's personal brand. Same DNA as the main `marccusz.com` portfolio — dark dev-aesthetic, the Archivo typeface, pill buttons, code-token labels, and elastic easing — recolored from its signature purple to **Brazil's national palette**: vibrant green primary, yellow highlights, blue support. Built for football / World Cup themed sites and pages: fixtures, standings, group draws, player profiles. *Festive but clean — football energy without the generic-sports-template look.*

---

## Sources

This system was derived from Marccus's personal portfolio codebase:

- **GitHub:** [`zavadzki72/Marccusz`](https://github.com/zavadzki72/Marccusz) — a single-page personal portfolio (`index.html` + `assets/index.css`, `index.js`, `locale.js`). The components, spacing rhythm, and elastic micro-animations here are lifted directly from it; the purple palette was replaced wholesale with the Brazil colors.
- Related personal repos worth a look for tone/content: [`zavadzki72/TricolorSonda`](https://github.com/zavadzki72/TricolorSonda) (football transfer-market monitor), [`zavadzki72/embaixadinha`](https://github.com/zavadzki72/embaixadinha) (keepie-uppie game).

*The reader may not have access to these — but if you do, explore `Marccusz/assets/index.css` for the original component CSS and easing definitions, and `locale.js` for the PT/EN copy voice.*

> **Note:** the source site is bilingual (PT-BR default, EN toggle) and Marccus is Brazilian. Copy in this Copa edition leans **Portuguese-first** to match the World Cup / Seleção theme.

---

## Content Fundamentals

**Voice.** Warm, personal, first-person, a little playful. The portfolio opens with "👋 Saudações!" and describes its author as someone who loves *"churrasco, música, futebol"*. Carry that energy: enthusiastic but not shouty.

**Casing.** Sentence case everywhere for prose and headings. UPPERCASE is reserved for tiny eyebrow labels and badges (e.g. `AO VIVO`, `GRUPO G`) with letter-spacing. Never title-case full sentences.

**Code-token labels.** The system's signature verbal motif: navigation and section labels are written as leading-colon code tokens — `:home`, `:perfil`, `:carreira` in the original; `:jogos`, `:tabela`, `:grupos`, `:craques` in the Copa edition. Use them for nav and section anchors, set in the mono-ish Archivo and colored green. Don't overuse — they're navigation/labels, not body copy.

**Person.** "I / me" when speaking as Marccus (about-me, blog). "You" sparingly when addressing the visitor. For a football product, prefer neutral/observational match copy ("Brasil avança às oitavas").

**Emoji.** Used, but sparingly and only as a friendly accent — the hand-wave 👋 in the greeting is the canonical example. One emoji per moment, never decorative rows of them. A football ⚽ is acceptable in the Copa edition in the same restrained spirit.

**Language.** Portuguese-first for the Copa theme (`Ver jogos`, `Comprar ingressos`, `Seleção`, `Ao vivo`, `Em breve`). Mirror the original's PT/EN bilingual structure if you build a real toggle.

**Examples of tone (from source, translated):** *"Hi! My name is Marccus, but you can call me 'Marcão'…"* · *"Preparing some coffee to convert into new projects"* (the "coming soon" card). Light, human, self-aware.

---

## Visual Foundations

**Overall vibe.** Dark-mode developer portfolio meets matchday. Near-black canvas, restrained surfaces, one confident accent (green) doing most of the work, with yellow as a rare exclamation mark. Generous whitespace and big section padding give it a calm, premium feel rather than a cluttered scoreboard.

**Color.** Background is a near-black with a subtle green tint (`#0D120E`); cards sit on `#151B16`, raised elements on `#1E261F`. Green (`#00A859`, hover `#2BD97B`) is the workhorse accent — buttons, links, active states, the live-pulse. **Yellow (`#FFDF00`) is used sparingly** for key CTAs and highlights so it always pops; on yellow fills text is near-black (`#0D120E`), and **yellow text only ever appears on dark surfaces, never on white**. Blue (`#2563EB`/`#4F86FF`) is a quiet support color for links/info.

**Theming (dark ↔ light).** Dark is the default `:root`. A **complete light theme** ships under `[data-theme="light"]` — set that attribute on `<html>`, `<body>`, or any wrapper and every token re-resolves for white surfaces (bg `#F4F7F4`, cards pure white, softened shadows). The Brazil DNA is preserved but re-tuned: green fills take **white** text, **accent text shifts to deep green** (`#047A41`) for AA contrast on white, and — per the system rule — **yellow stays a fill only on light, never yellow text on white**. Pair it with the **`Theme toggle`** component (sun/moon pill switch + icon button, elastic knob) and the **`Language toggle`** (PT/EN, flag + sigla; segmented, compact-dropdown, and flag-only variants).

**Typography.** Archivo throughout (Google Fonts, 400/500/600/700). Headings tend toward weight **500** (not bold) for an understated, modern look — display sizes up to 48px. Body is 16px at line-height 1.6 in muted gray (`#9CA3AF`). The same family doubles as the "mono" voice for code-tokens.

**Spacing & layout.** A rem-based rhythm (0.5 / 1 / 1.5 / 2 / 3 rem) with very large section padding (up to 8rem) and a `max-width: 1200px` centered content column. Layouts are grid- and flex-based with explicit `gap`. The header is **fixed**, full-width, translucent (`backdrop-filter: blur`) with a hairline bottom border.

**Backgrounds.** Flat dark fills — *no* busy hero images or photographic full-bleeds behind text. Subtle depth comes from layered `linear-gradient(145deg, …)` on cards and a faint green radial glow that fades in on hover (`radial-gradient(circle at 50% 0%, rgba(0,168,89,.15), transparent)`). No repeating textures, no noise/grain.

**Borders & cards.** Cards are the hero component: 16px radius, a near-transparent green hairline border (`rgba(0,168,89,.18)`), a 3px gradient rail along the top edge, and a soft 145° surface gradient fill. Smaller elements use 4–8px radii. Hairlines are `#2A352B`.

**Shadows.** Light at rest (`0 5px 15px rgba(0,0,0,.2)`). On hover, cards **lift -8px** and gain a green-tinted shadow + glow (`0 20px 40px rgba(0,168,89,.15), 0 0 60px rgba(0,168,89,.05)`). Buttons lift -2px with a tighter green glow.

**Animation & easing.** This is the system's personality. Micro-animations use **elastic** curves: Open Props `--ease-elastic-3/4` (theme toggle), a tooltip pop on `cubic-bezier(0.25,1.15,0.35,1.15)`, a soft settle on `cubic-bezier(0,0.99,0.44,0.99)`, and a nav underline that sweeps in on `cubic-bezier(0.86,0,0.07,1)`. Section content fades + slides in on scroll (`translateX(-10rem) → 0`, opacity 0→1, 1s). The live-match dot pulses. Animations are quick and springy, never slow or floaty; respect `prefers-reduced-motion`.

**Hover / press states.** Hover = lift + brighten (green → green-bright) + glow; links shift +4px horizontally with their arrow. Filter/nav items grow a gradient underline. There's no aggressive shrink-on-press; interactions feel buoyant (the elastic easing does the work).

**Transparency & blur.** Used deliberately: the fixed header blurs what scrolls under it; accent fills are frequently low-alpha tints of green/yellow/blue over dark (e.g. badges at `rgba(0,168,89,.15)`) rather than solid blocks. This keeps the palette cohesive and lets one hue read at many intensities.

**Imagery vibe.** When photography appears (player/team shots), keep it punchy and warm to match the festive theme; framed inside the rounded cards with a hairline border. Most surfaces, though, are typographic + token-driven, not image-heavy.

---

## Iconography

The source portfolio uses **inline SVG icons**, not an icon font or emoji-as-icon system:

- **Brand/social glyphs** are Bootstrap Icons SVGs (LinkedIn, GitHub, Instagram, PDF) inlined directly in markup, filled with the accent color (`fill: var(--green)` in this edition).
- **Decorative/utility icons** (clock, arrow, info circle) are small Material-style filled SVGs (24×24 viewBox), single-color, filled with the accent.
- **Tech/skill logos** are full-color brand SVGs (C#, .NET, JS, SQL Server, PostgreSQL).
- **Flags** come from the [`flag-icons`](https://github.com/lipis/flag-icons) CDN (`fi fi-br`, `fi fi-us`) — used in the language switcher and ideal for the Copa edition's team flags.

**Guidance for this system:** prefer **inline single-color filled SVGs** at 24px, tinted with `currentColor`/accent. For football UI, use `flag-icons` from CDN for national flags. Use emoji only as the rare friendly accent (👋, ⚽) described in Content Fundamentals — never as functional icons. The brand mark itself is the **`{ copa }` code-bracket wordmark** (mono Archivo, green braces around a lowercase "copa") — keeping the dev-portfolio code-bracket DNA while staying specific to the Copa edition.

> **Substitution flag:** the source's icons are hand-inlined SVGs scattered through the HTML rather than a packaged set. The UI kit below uses inline SVGs in the same single-color filled style, plus the `flag-icons` CDN for flags. If you want a fuller icon set, [Lucide](https://lucide.dev) (matching thin/clean style) is a good CDN-available match — flagged here as an addition, not something present in the original.

---

## Fonts

**Archivo** is loaded from Google Fonts (`@import` in `colors_and_type.css`) — no font files needed, no substitution. Weights 400/500/600/700.

---

## Index — what's in this folder

| File / folder | What it is |
|---|---|
| `README.md` | This document — context, content & visual foundations, iconography. |
| `colors_and_type.css` | The token layer: CSS custom properties for the Brazil palette, surfaces, text, type scale, radii, spacing, shadows, and easing. **Import this first.** |
| `SKILL.md` | Agent-Skills-compatible entry point for using this system. |
| `assets/` | Brand assets — original source logos & favicon. The Copa brand mark is the CSS-rendered **`{ copa }`** wordmark (see the Logo specimen / `kit.css .brand`), not a bitmap. |
| `preview/` | Design-system specimen cards (colors, type, spacing, components, brand) shown in the Design System tab. |
| `ui_kits/copa/` | **Copa tracker** UI kit — a World Cup fixtures/standings site recreation. `index.html` is an interactive click-through; JSX files are the modular components. |

### UI Kits
- **`ui_kits/copa/`** — *Copa tracker*: matchday landing with live fixtures, group standings, a featured-match hero, and code-token navigation. The flagship application of the system.
