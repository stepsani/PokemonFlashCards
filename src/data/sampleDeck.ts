import type { FlashCard } from '../domain/cards'

export const sampleDeck: FlashCard[] = [
  {
    id: 'd-1',
    type: 'damage',
    attacker: 'Flutter Mane (Modest, 252 SpA, Choice Specs)',
    move: 'Moonblast',
    defender: 'Urshifu-Rapid-Strike (4 HP)',
    expectedMin: 89.3,
    expectedMax: 106.1,
    formatNote: 'Level 50, no weather, no screens',
  },
  {
    id: 'd-2',
    type: 'damage',
    attacker: 'Rillaboom (Adamant, 252 Atk, Assault Vest)',
    move: 'Grassy Glide (Grassy Terrain)',
    defender: 'Landorus-Therian (4 HP)',
    expectedMin: 64.8,
    expectedMax: 77.9,
    formatNote: 'Level 50, Intimidate not applied',
  },
  {
    id: 'd-3',
    type: 'damage',
    attacker: 'Heatran (Modest, 252 SpA)',
    move: 'Heat Wave',
    defender: 'Amoonguss (236 HP / 116 SpD, Sitrus Berry)',
    expectedMin: 44.2,
    expectedMax: 53.8,
    formatNote: 'Doubles spread move modifier applied',
  },
  {
    id: 's-1',
    type: 'speed',
    pokemonA: {
      name: 'Garchomp',
      baseSpeed: 102,
    },
    pokemonB: {
      name: 'Urshifu-Rapid-Strike',
      baseSpeed: 97,
    },
    context: 'Level 50, no Tailwind, no speed boosts',
  },
  {
    id: 's-2',
    type: 'speed',
    pokemonA: {
      name: 'Amoonguss',
      baseSpeed: 30,
    },
    pokemonB: {
      name: 'Torkoal',
      baseSpeed: 20,
    },
    context: 'Trick Room turn: lower speed moves first',
  },
  {
    id: 's-3',
    type: 'speed',
    pokemonA: {
      name: 'Iron Bundle',
      baseSpeed: 136,
    },
    pokemonB: {
      name: 'Flutter Mane',
      baseSpeed: 135,
    },
    context: 'Level 50, no Choice Scarf, no Booster Energy speed boost',
  },
]
