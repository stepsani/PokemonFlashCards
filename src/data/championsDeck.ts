import type { FlashCard } from '../domain/cards'

export type ChampionsDeckBundle = {
  source: 'pokemon-champions'
  sourceVersion: string
  generatedAt: string
  cards: FlashCard[]
  notes?: string
}

export type DeckLoadResult =
  | { ok: true; bundle: ChampionsDeckBundle }
  | { ok: false; reason: string }

export const REQUIRE_CHAMPIONS_SOURCE =
  (import.meta.env.VITE_REQUIRE_CHAMPIONS_SOURCE ?? 'true') === 'true'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isDamageCard(value: unknown): boolean {
  if (!isObject(value)) {
    return false
  }

  return (
    value.type === 'damage' &&
    typeof value.id === 'string' &&
    typeof value.attacker === 'string' &&
    typeof value.move === 'string' &&
    typeof value.defender === 'string' &&
    typeof value.expectedMin === 'number' &&
    typeof value.expectedMax === 'number'
  )
}

function isSpeedCard(value: unknown): boolean {
  if (!isObject(value)) {
    return false
  }

  if (value.type !== 'speed' || typeof value.id !== 'string') {
    return false
  }

  const pokemonA = value.pokemonA
  const pokemonB = value.pokemonB

  if (!isObject(pokemonA) || !isObject(pokemonB)) {
    return false
  }

  return (
    typeof pokemonA.name === 'string' &&
    (isNumber(pokemonA.baseSpeed) || isNumber(pokemonA.speedStat)) &&
    typeof pokemonB.name === 'string' &&
    (isNumber(pokemonB.baseSpeed) || isNumber(pokemonB.speedStat))
  )
}

function isFlashCard(value: unknown): value is FlashCard {
  return isDamageCard(value) || isSpeedCard(value)
}

function normalizeFlashCard(card: FlashCard): FlashCard {
  if (card.type !== 'speed') {
    return card
  }

  return {
    ...card,
    pokemonA: {
      ...card.pokemonA,
      baseSpeed:
        card.pokemonA.baseSpeed ??
        (card.pokemonA as typeof card.pokemonA & { speedStat?: number }).speedStat ??
        0,
    },
    pokemonB: {
      ...card.pokemonB,
      baseSpeed:
        card.pokemonB.baseSpeed ??
        (card.pokemonB as typeof card.pokemonB & { speedStat?: number }).speedStat ??
        0,
    },
  }
}

export async function loadChampionsDeck(): Promise<DeckLoadResult> {
  let response: Response

  try {
    response = await fetch('/champions-deck.json', { cache: 'no-store' })
  } catch {
    return {
      ok: false,
      reason: 'Could not fetch champions-deck.json from the public folder.',
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: `champions-deck.json returned HTTP ${response.status}.`,
    }
  }

  let parsed: unknown
  try {
    parsed = (await response.json()) as unknown
  } catch {
    return {
      ok: false,
      reason: 'champions-deck.json is not valid JSON.',
    }
  }

  if (!isObject(parsed)) {
    return {
      ok: false,
      reason: 'champions-deck.json root must be a JSON object.',
    }
  }

  if (parsed.source !== 'pokemon-champions') {
    return {
      ok: false,
      reason: 'Deck source must be exactly "pokemon-champions".',
    }
  }

  if (typeof parsed.sourceVersion !== 'string' || !parsed.sourceVersion.trim()) {
    return {
      ok: false,
      reason: 'sourceVersion is required and must be a non-empty string.',
    }
  }

  if (typeof parsed.generatedAt !== 'string' || !parsed.generatedAt.trim()) {
    return {
      ok: false,
      reason: 'generatedAt is required and must be a non-empty string.',
    }
  }

  if (!Array.isArray(parsed.cards)) {
    return {
      ok: false,
      reason: 'cards must be an array of flashcard objects.',
    }
  }

  if (parsed.cards.length === 0) {
    return {
      ok: false,
      reason: 'cards is empty. Provide at least one Champions card.',
    }
  }

  const invalidIndex = parsed.cards.findIndex((card) => !isFlashCard(card))
  if (invalidIndex >= 0) {
    return {
      ok: false,
      reason: `Invalid card schema at index ${invalidIndex}.`,
    }
  }

  return {
    ok: true,
    bundle: {
      source: 'pokemon-champions',
      sourceVersion: parsed.sourceVersion,
      generatedAt: parsed.generatedAt,
      cards: parsed.cards.map((card) => normalizeFlashCard(card)),
      notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
    },
  }
}
