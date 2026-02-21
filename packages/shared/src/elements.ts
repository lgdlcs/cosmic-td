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

// Dual element combos are defined in combos.ts

/** Get a random element */
export function randomElement(): Element {
  return ALL_ELEMENTS[Math.floor(Math.random() * ALL_ELEMENTS.length)];
}
