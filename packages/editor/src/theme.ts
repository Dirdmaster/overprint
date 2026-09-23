import theme from './theme.css?inline'

// Shadow-root styles cannot rely on document-level @property registration.
// Initialize Tailwind's non-inherited properties inside each editor instead.
const defaults = [...theme.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]+)\}/g)]
  .map(
    ([, name, rule]) =>
      `${name}:${rule.match(/initial-value:([^;}]+)/)?.[1] || 'initial'}`,
  )
  .join(';')
export const styles =
  `@layer properties{*,::before,::after,::backdrop{${defaults}}}` +
  theme
    .replace(
      /--(canvas|surface|soft|ink|muted|line|accent|on-accent|grid):/g,
      '--overprint-default-$1:',
    )
    .replaceAll(':root', ':host')
    .replaceAll('html[data-theme=dark]', ':host([data-theme=dark])')
    .replaceAll('html[data-theme=system]', ':host([data-theme=system])')

export const themeTokens =
  ':host{' +
  [
    'canvas',
    'surface',
    'soft',
    'ink',
    'muted',
    'line',
    'accent',
    'on-accent',
    'grid',
  ]
    .map(
      (name) =>
        `--${name}:var(--overprint-${name},var(--overprint-default-${name}))`,
    )
    .join(';') +
  '}'
