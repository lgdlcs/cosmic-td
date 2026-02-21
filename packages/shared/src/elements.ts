// ── Element System ──────────────────────────────────────

export type Element = 'fire' | 'water' | 'earth' | 'dark' | 'light' | 'nature' | 'wind';

export const ALL_ELEMENTS: Element[] = ['fire', 'water', 'earth', 'dark', 'light', 'nature', 'wind'];

export const ELEMENT_EMOJI: Record<Element, string> = {
  fire: '🔥',
  water: '💧',
  earth: '🌍',
  dark: '🌑',
  light: '☀️',
  nature: '🌿',
  wind: '💨',
};

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#FF4422',
  water: '#4488FF',
  earth: '#AA8844',
  dark: '#8844AA',
  light: '#FFDD44',
  nature: '#44CC44',
  wind: '#88CCCC',
};

export const ELEMENT_COLOR_HEX: Record<Element, number> = {
  fire: 0xFF4422,
  water: 0x4488FF,
  earth: 0xAA8844,
  dark: 0x8844AA,
  light: 0xFFDD44,
  nature: 0x44CC44,
  wind: 0x88CCCC,
};

// ── Weakness Table ──────────────────────────────────────

/** Maps element → what it's strong against */
const STRONG_VS: Record<Element, Element> = {
  fire: 'nature',
  water: 'fire',
  earth: 'light',
  dark: 'water',
  light: 'dark',
  nature: 'water',
  wind: 'earth',
};

/** Maps element → what it's weak against */
const WEAK_VS: Record<Element, Element> = {
  fire: 'water',
  water: 'nature',
  earth: 'dark',
  dark: 'light',
  light: 'earth',
  nature: 'fire',
  wind: 'nature',
};

export function isStrongAgainst(attacker: Element, defender: Element): boolean {
  return STRONG_VS[attacker] === defender;
}

export function isWeakAgainst(attacker: Element, defender: Element): boolean {
  return WEAK_VS[attacker] === defender;
}

export function getElementMultiplier(towerElement: Element | undefined, mobElement: Element | undefined): number {
  if (!towerElement || !mobElement) return 1.0;
  if (isStrongAgainst(towerElement, mobElement)) return 2.0;
  if (isWeakAgainst(towerElement, mobElement)) return 0.5;
  return 1.0;
}

/** Get effectiveness label */
export function getEffectiveness(towerElement: Element | undefined, mobElement: Element | undefined): 'strong' | 'weak' | 'neutral' {
  if (!towerElement || !mobElement) return 'neutral';
  if (isStrongAgainst(towerElement, mobElement)) return 'strong';
  if (isWeakAgainst(towerElement, mobElement)) return 'weak';
  return 'neutral';
}

// ── Dual Element Combinations ───────────────────────────

export interface ElementCombo {
  elements: [Element, Element];
  name: string;
  emoji: string;
}

export const ELEMENT_COMBOS: ElementCombo[] = [
  { elements: ['fire', 'water'], name: 'Steam', emoji: '♨️' },
  { elements: ['fire', 'earth'], name: 'Magma', emoji: '🌋' },
  { elements: ['fire', 'wind'], name: 'Inferno', emoji: '🔥' },
  { elements: ['fire', 'dark'], name: 'Hellfire', emoji: '👿' },
  { elements: ['fire', 'light'], name: 'Solar', emoji: '🌞' },
  { elements: ['fire', 'nature'], name: 'Wildfire', emoji: '🏕️' },
  { elements: ['water', 'earth'], name: 'Mud', emoji: '🏺' },
  { elements: ['water', 'wind'], name: 'Storm', emoji: '🌊' },
  { elements: ['water', 'dark'], name: 'Abyss', emoji: '🕳️' },
  { elements: ['water', 'light'], name: 'Ice', emoji: '❄️' },
  { elements: ['water', 'nature'], name: 'Bloom', emoji: '🌸' },
  { elements: ['earth', 'dark'], name: 'Void', emoji: '⬛' },
  { elements: ['earth', 'light'], name: 'Crystal', emoji: '💎' },
  { elements: ['earth', 'nature'], name: 'Forest', emoji: '🌲' },
  { elements: ['earth', 'wind'], name: 'Dust', emoji: '🌪️' },
  { elements: ['dark', 'light'], name: 'Eclipse', emoji: '🌓' },
  { elements: ['dark', 'nature'], name: 'Decay', emoji: '🍂' },
  { elements: ['dark', 'wind'], name: 'Shadow', emoji: '👤' },
  { elements: ['light', 'nature'], name: 'Life', emoji: '🌱' },
  { elements: ['light', 'wind'], name: 'Flash', emoji: '⚡' },
  { elements: ['nature', 'wind'], name: 'Gale', emoji: '🍃' },
];

/** Find combo for two elements (order doesn't matter) */
export function getElementCombo(a: Element, b: Element): ElementCombo | undefined {
  return ELEMENT_COMBOS.find(c =>
    (c.elements[0] === a && c.elements[1] === b) ||
    (c.elements[0] === b && c.elements[1] === a)
  );
}

/** Get a random element */
export function randomElement(): Element {
  return ALL_ELEMENTS[Math.floor(Math.random() * ALL_ELEMENTS.length)];
}
