/**
 * SE Content Hub — Tailwind theme extension
 * Drop into tailwind.config.js (or tailwind.config.ts).
 * Pairs with tokens.css — the CSS vars are the source of truth at runtime,
 * so dark mode "just works" via [data-theme="dark"] on <html>.
 */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg:          'var(--color-bg)',
        'bg-deep':   'var(--color-bg-deep)',
        surface:     'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        line:        'var(--color-line)',
        'line-strong': 'var(--color-line-strong)',
        ink:         'var(--color-ink)',
        'ink-2':     'var(--color-ink-2)',
        muted:       'var(--color-muted)',
        'muted-2':   'var(--color-muted-2)',
        accent:      'var(--color-accent)',
        'accent-deep': 'var(--color-accent-deep)',
        'accent-soft': 'var(--color-accent-soft)',
        forest:      'var(--color-forest)',
        'forest-soft': 'var(--color-forest-soft)',
        gold:        'var(--color-gold)',
        // content-type accents
        'type-deck':  'var(--color-type-deck)',
        'type-video': 'var(--color-type-video)',
        'type-demo':  'var(--color-type-demo)',
        'type-doc':   'var(--color-type-doc)',
        'type-code':  'var(--color-type-code)',
      },
      fontFamily: {
        sans:    ['Manrope', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono:    ['Geist Mono', 'ui-monospace', 'monospace'],
        display: ['Newsreader', 'Georgia', 'serif'],
      },
      fontSize: {
        xs:    ['10.5px', { lineHeight: '1.4' }],
        sm:    ['12px',   { lineHeight: '1.5' }],
        base:  ['13.5px', { lineHeight: '1.55' }],
        lg:    ['15px',   { lineHeight: '1.55' }],
        xl:    ['22px',   { lineHeight: '1.2' }],
        '2xl': ['28px',   { lineHeight: '1.15' }],
        '3xl': ['38px',   { lineHeight: '1.05' }],
        '4xl': ['48px',   { lineHeight: '1.0' }],
      },
      borderRadius: {
        xs:  '4px',
        sm:  '6px',
        md:  '10px',
        lg:  '14px',
        xl:  '20px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop:  'var(--shadow-pop)',
      },
      spacing: {
        // 4px base scale already matches Tailwind defaults
      },
      letterSpacing: {
        display: '-0.018em',
        ui:      '-0.005em',
        mono:    '0.06em',
      },
    },
  },
};
