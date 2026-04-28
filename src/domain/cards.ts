export type DamageCard = {
  id: string
  type: 'damage'
  attacker: string
  move: string
  defender: string
  attackerInfo?: {
    name: string
    spriteId?: string
    types: string[]
  }
  defenderInfo?: {
    name: string
    spriteId?: string
    types: string[]
  }
  expectedMin: number
  expectedMax: number
  formatNote?: string
}

export type SpeedCard = {
  id: string
  type: 'speed'
  pokemonA: {
    name: string
    baseSpeed: number
  }
  pokemonB: {
    name: string
    baseSpeed: number
  }
  context?: string
}

export type FlashCard = DamageCard | SpeedCard

export type SpeedAnswer = 'A' | 'B' | 'tie'

export function evaluateDamageAnswer(
  card: DamageCard,
  answerPercent: number,
  tolerance = 2,
): boolean {
  return (
    answerPercent >= card.expectedMin - tolerance &&
    answerPercent <= card.expectedMax + tolerance
  )
}

export function evaluateSpeedAnswer(card: SpeedCard, answer: SpeedAnswer): boolean {
  if (card.pokemonA.baseSpeed === card.pokemonB.baseSpeed) {
    return answer === 'tie'
  }
  if (card.pokemonA.baseSpeed > card.pokemonB.baseSpeed) {
    return answer === 'A'
  }
  return answer === 'B'
}

export function getCorrectSpeedAnswer(card: SpeedCard): SpeedAnswer {
  if (card.pokemonA.baseSpeed === card.pokemonB.baseSpeed) {
    return 'tie'
  }
  return card.pokemonA.baseSpeed > card.pokemonB.baseSpeed ? 'A' : 'B'
}
