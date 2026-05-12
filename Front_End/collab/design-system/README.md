# SE Content Hub — Design System

A small, self-contained design token bundle. Designed to drop straight into the React + Vite app described in the project brief, with zero build step required.

## What's in here

| File | Purpose |
|---|---|
| `tokens.css` | The source of truth — CSS variables for both light and dark themes, plus a few type-recipe utility classes. **Import this once at the root.** |
| `tokens.json` | The same tokens in DTCG-style JSON. Feed to Style Dictionary, Figma Tokens, or any other tooling. |
| `tailwind.config.js` | Theme extension that proxies to the CSS variables — Tailwind classes get dark-mode behavior for free. |
| `preview.html` | A static visual reference of every token. Open in a browser. |

## Quick start

### 1. Copy the folder into your app

```
src/
├── design-system/
│   ├── tokens.css
│   ├── tokens.json
│   └── tailwind.config.js
├── App.tsx
└── main.tsx
```

### 2. Import the CSS once at your entry point

```ts
// main.tsx
import './design-system/tokens.css';
import './index.css';
```

### 3. Use the tokens

**Plain CSS / inline styles:**
```jsx
<button style={{
  background: 'var(--color-accent)',
  color: 'white',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-md)',
  fontFamily: 'var(--font-sans)',
  boxShadow: 'var(--shadow-card)',
}}>
  Upload content
</button>
```

**Tailwind:**
```jsx
<button className="bg-accent text-white px-3 py-2 rounded-md font-sans shadow-card">
  Upload content
</button>
```

**Type recipes (built-in classes):**
```jsx
<h1 className="display-lg">Everything the team has made</h1>
<span className="label-mono">Library · 12 items</span>
<span className="text-meta">Maya Park · 2 days ago</span>
```

## Theming

Dark mode toggles via a single attribute on `<html>`:

```ts
document.documentElement.setAttribute('data-theme', 'dark');
// or 'light' to switch back
```

Every component reads from CSS variables, so the swap is instant and no React state propagation is needed. Persist the user's choice in `localStorage` and you're done.

## Type system

Three families, three jobs:

- **Manrope** — UI, body, buttons, navigation
- **Newsreader** — display titles, page headers, editorial moments. Uses optical sizing — set `font-variation-settings: "opsz" 60` on big headings (≥32px) for proper display contrast.
- **Geist Mono** — metadata, counts, labels, kbd, technical chrome

Mono labels are uppercased with `0.06em` tracking by convention — see `.label-mono`.

## Color principles

- **Warm paper neutrals**, not cool slate. Pulls the whole UI away from generic SaaS-blue territory.
- **One real accent** (rust `#C2410C`). Use it for the primary CTA in any given view and for AI moments (the chat orb, "embedding generated" toasts). Resist using it twice in the same view.
- **Forest green** is reserved for "published" / success states — not a second accent.
- **Content-type colors** (deck/video/demo/doc/code) only appear on the type posters and type-row dots. They're not for general use.

## Spacing & radii

- Spacing follows a **4px base scale** (1, 2, 3, 4, 5, 6, 8, 10, 12 → 4 to 48px). Tailwind defaults already match.
- Radii: `xs` (4) for tiny pills · `sm` (6) for small buttons · `md` (10) for cards · `lg` (14) for modals · `xl` (20) for hero shapes · `pill` (999) for fully rounded.

## Token reference (light → dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#F7F5F0` | `#14120D` | App background |
| `--color-surface` | `#FFFFFF` | `#1B1813` | Cards, modals |
| `--color-ink` | `#1A1A18` | `#F0EBDF` | Primary text |
| `--color-muted` | `#6B6864` | `#9A9382` | Secondary text |
| `--color-line` | `#E8E4DA` | `#2C281F` | Borders, dividers |
| `--color-accent` | `#C2410C` | `#E8743B` | Primary CTA, AI |
| `--color-forest` | `#1F4E3D` | `#5BAF85` | Published / success |

## What's intentionally not here

- No component library — design lives in your app's components. The tokens are the contract; the components are yours to build against them.
- No icon set — use [Lucide](https://lucide.dev) or roll your own at 1.5px stroke, 18px default.
- No motion system beyond duration/easing tokens.

## License

Internal. Use it however helps the team.
