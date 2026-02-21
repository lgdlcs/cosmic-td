// ── Element System ──────────────────────────────────────

export type Element = 'solar' | 'cryo' | 'asteroid' | 'void' | 'photon' | 'bio' | 'nebula';

export const ALL_ELEMENTS: Element[] = ['solar', 'cryo', 'asteroid', 'void', 'photon', 'bio', 'nebula'];

export const ELEMENT_EMOJI: Record<Element, string> = {
  solar: '☀️',
  cryo: '🧊',
  asteroid: '🪨',
  void: '🕳️',
  photon: '⚡',
  bio: '🧬',
  nebula: '🌀',
};

export const ELEMENT_COLOR: Record<Element, string> = {
  solar: '#FF6B00',
  cryo: '#00D4FF',
  asteroid: '#8B7355',
  void: '#7B2FBE',
  photon: '#FFE500',
  bio: '#00FF88',
  nebula: '#FF69B4',
};

export const ELEMENT_COLOR_HEX: Record<Element, number> = {
  solar: 0xFF6B00,
  cryo: 0x00D4FF,
  asteroid: 0x8B7355,
  void: 0x7B2FBE,
  photon: 0xFFE500,
  bio: 0x00FF88,
  nebula: 0xFF69B4,
};

// ── Weakness Table ──────────────────────────────────────

/** Maps element → what it's strong against */
const STRONG_VS: Record<Element, Element> = {
  solar: 'bio',
  cryo: 'solar',
  asteroid: 'photon',
  void: 'cryo',
  photon: 'void',
  bio: 'cryo',
  nebula: 'asteroid',
};

/** Maps element → what it's weak against */
const WEAK_VS: Record<Element, Element> = {
  solar: 'cryo',
  cryo: 'bio',
  asteroid: 'void',
  void: 'photon',
  photon: 'asteroid',
  bio: 'solar',
  nebula: 'bio',
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
  { elements: ['solar', 'cryo'], name: 'Plasma', emoji: '♨️' },
  { elements: ['solar', 'asteroid'], name: 'Magma Core', emoji: '🌋' },
  { elements: ['solar', 'nebula'], name: 'Supernova', emoji: '💥' },
  { elements: ['solar', 'void'], name: 'Dark Star', emoji: '🌑' },
  { elements: ['solar', 'photon'], name: 'Radiance', emoji: '🌞' },
  { elements: ['solar', 'bio'], name: 'Photosynthesis', emoji: '🌱' },
  { elements: ['cryo', 'asteroid'], name: 'Comet', emoji: '☄️' },
  { elements: ['cryo', 'nebula'], name: 'Ice Storm', emoji: '🌊' },
  { elements: ['cryo', 'void'], name: 'Absolute Zero', emoji: '🕳️' },
  { elements: ['cryo', 'photon'], name: 'Prism', emoji: '❄️' },
  { elements: ['cryo', 'bio'], name: 'Cryogenics', emoji: '🧪' },
  { elements: ['asteroid', 'void'], name: 'Singularity', emoji: '⬛' },
  { elements: ['asteroid', 'photon'], name: 'Crystal', emoji: '💎' },
  { elements: ['asteroid', 'bio'], name: 'Terraform', emoji: '🌲' },
  { elements: ['asteroid', 'nebula'], name: 'Dust Cloud', emoji: '🌪️' },
  { elements: ['void', 'photon'], name: 'Eclipse', emoji: '🌓' },
  { elements: ['void', 'bio'], name: 'Entropy', emoji: '🍂' },
  { elements: ['void', 'nebula'], name: 'Dark Matter', emoji: '👤' },
  { elements: ['photon', 'bio'], name: 'Genesis', emoji: '✨' },
  { elements: ['photon', 'nebula'], name: 'Pulsar', emoji: '⚡' },
  { elements: ['bio', 'nebula'], name: 'Spore Cloud', emoji: '🍃' },
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
