/**
 * Visual language for the Naruto Trump 52 reskin, ported verbatim (colors,
 * fonts, gradients) from the Claude Design mock `Naruto Trump 52.dc.html`.
 * Scoped to this game only — the rest of the platform keeps its green
 * `--color-*` tokens (see index.css); this game brings its own ember/gold
 * palette instead, exactly like the mock does.
 */

export const NARUTO = {
  bg: '#14100f',
  panel: '#241d1a',
  panelBorder: '#3b2f29',
  cream: '#f6f1e4',
  card: '#f6f1e4',
  ink: '#17141b',
  gold: '#f5c518',
  orange: '#ff8a2b',
  red: '#d8232a',
  muted: '#a89a91',
  faint: '#948579',
  win: '#7ce4a4',
  lose: '#ff6b5e',
  draw: '#ffb347',
} as const;

export const NARUTO_FONT = {
  display: "'Archivo Black', system-ui, sans-serif",
  condensed: "'Barlow Condensed', system-ui, sans-serif",
  body: "'Barlow', system-ui, sans-serif",
} as const;

/** The mock's page-level backdrop: two ember glows over a noise-striped near-black. */
export const NARUTO_PAGE_BACKGROUND =
  'radial-gradient(90% 55% at 50% -8%, rgba(242,118,46,.34) 0%, rgba(20,16,15,0) 62%), ' +
  'radial-gradient(70% 50% at 92% 108%, rgba(216,35,42,.24) 0%, rgba(20,16,15,0) 70%), ' +
  'repeating-linear-gradient(115deg, rgba(255,255,255,.022) 0 2px, rgba(255,255,255,0) 2px 11px), ' +
  `${NARUTO.bg}`;

/**
 * Offsets for the faint pile of cards stacked behind the top card — port of
 * the mock's `stack(n)` helper. Caps at 4 layers so a full 26-card hand
 * doesn't pile up forever.
 */
export function cardStackLayers(remaining: number): { key: number; transform: string }[] {
  const layers = Math.max(0, Math.min(4, Math.ceil((remaining - 1) / 6)));
  const out: { key: number; transform: string }[] = [];
  for (let i = layers; i >= 1; i--) {
    out.push({ key: i, transform: `translate(${i * -3}px,${i * 4}px) rotate(${i * -0.35}deg)` });
  }
  return out;
}
