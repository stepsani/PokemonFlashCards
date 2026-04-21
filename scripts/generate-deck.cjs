/**
 * generate-deck.cjs
 * Builds a card deck from Pokemon Champions Tournaments usage data.
 * Damage is computed with @smogon/calc Gen 9 formula.
 */

'use strict'

const fs = require('fs')
const path = require('path')
const https = require('https')
const { Dex: ShowdownDex } = require('pokemon-showdown')

const { calculate, Move, Pokemon, Field, Generations, toID } = require('@smogon/calc')

const gen9 = Generations.get(9)
const showdownDex = ShowdownDex.forFormat('gen9')
const DOUBLES_FIELD = new Field({ gameType: 'Doubles' })
const PIKALYTICS_USAGE_URL = 'https://www.pikalytics.com/pokedex/championstournaments/'
const PIKALYTICS_AI_USAGE_URL = 'https://www.pikalytics.com/ai/pokedex/championstournaments'
const USAGE_THRESHOLD_PERCENT = 2

const PHYSICAL_MOVE_BY_TYPE = {
  Bug: 'X-Scissor',
  Dark: 'Crunch',
  Dragon: 'Dragon Claw',
  Electric: 'Wild Charge',
  Fairy: 'Play Rough',
  Fighting: 'Close Combat',
  Fire: 'Flare Blitz',
  Flying: 'Brave Bird',
  Ghost: 'Shadow Claw',
  Grass: 'Power Whip',
  Ground: 'Earthquake',
  Ice: 'Icicle Crash',
  Normal: 'Double-Edge',
  Poison: 'Gunk Shot',
  Psychic: 'Zen Headbutt',
  Rock: 'Stone Edge',
  Steel: 'Iron Head',
  Water: 'Liquidation',
}

const SPECIAL_MOVE_BY_TYPE = {
  Bug: 'Bug Buzz',
  Dark: 'Dark Pulse',
  Dragon: 'Draco Meteor',
  Electric: 'Thunderbolt',
  Fairy: 'Moonblast',
  Fighting: 'Focus Blast',
  Fire: 'Heat Wave',
  Flying: 'Hurricane',
  Ghost: 'Shadow Ball',
  Grass: 'Energy Ball',
  Ground: 'Earth Power',
  Ice: 'Ice Beam',
  Normal: 'Hyper Voice',
  Poison: 'Sludge Bomb',
  Psychic: 'Psychic',
  Rock: 'Power Gem',
  Steel: 'Flash Cannon',
  Water: 'Hydro Pump',
}

// Official base stats sourced from Bulbapedia for species not yet in @smogon/calc.
// https://bulbapedia.bulbagarden.net/wiki/Meowstic_(Pok%C3%A9mon)
const CUSTOM_SPECIES_OVERRIDES = {
  'Mega Meowstic': {
    baseStats: { hp: 74, atk: 48, def: 76, spa: 143, spd: 101, spe: 124 },
    types: ['Psychic'],
  },
}

const UNSUITABLE_OFFENSIVE_MOVE_IDS = new Set([
  'foulplay',
  'bodypress',
  'electroball',
  'gyroball',
  'storedpower',
  'powertrip',
  'eruption',
  'waterspout',
  'reversal',
  'flail',
  'lastrespects',
])

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          resolve(body)
        })
      })
      .on('error', reject)
  })
}

function decodeHtml(input) {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&eacute;/g, 'e')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function toCalcSpeciesName(rawName) {
  const cleaned = rawName.replace(/\s+/g, ' ').trim()

  const megaMatch = cleaned.match(/^Mega\s+(.+?)(?:\s+([XY]))?$/i)
  if (megaMatch) {
    const base = megaMatch[1].trim()
    const letter = megaMatch[2]
    if (letter === 'X' || letter === 'Y') {
      return `${base}-Mega-${letter}`
    }
    return `${base}-Mega`
  }
  return cleaned
}

function expandRegulationEntries(rawName) {
  const cleaned = rawName.replace(/\s+/g, ' ').trim()

  // Pikalytics lists Floette-Eternal; map to Floette so calc/sprites remain stable.
  if (cleaned === 'Floette-Eternal') {
    return [
      {
        displayName: 'Floette',
        calcName: 'Floette',
        derivedFrom: 'Floette-Eternal',
      },
    ]
  }

  // Use the canonical mega form for Charizard cards in this project.
  if (cleaned === 'Charizard') {
    return [
      {
        displayName: 'Mega Charizard Y',
        calcName: 'Charizard-Mega-Y',
        derivedFrom: 'Charizard',
      },
    ]
  }

  // Serebii lists Aegislash as one line, but gameplay has both forms.
  if (cleaned === 'Aegislash') {
    return [
      {
        displayName: 'Aegislash (Blade Forme)',
        calcName: 'Aegislash-Blade',
        derivedFrom: 'Aegislash',
      },
      {
        displayName: 'Aegislash (Shield Forme)',
        calcName: 'Aegislash-Shield',
        derivedFrom: 'Aegislash',
      },
    ]
  }

  // Champions includes Mega Meowstic as distinct; use real stats from Bulbapedia
  // since @smogon/calc has no dedicated species entry for it yet.
  if (cleaned === 'Mega Meowstic') {
    return [
      {
        displayName: 'Mega Meowstic',
        calcName: 'Meowstic-F',
        derivedFrom: 'Mega Meowstic',
        customStats: CUSTOM_SPECIES_OVERRIDES['Mega Meowstic'],
      },
    ]
  }

  return [
    {
      displayName: cleaned,
      calcName: toCalcSpeciesName(cleaned),
      derivedFrom: cleaned,
    },
  ]
}

function extractRegulationSpeciesFromHtml(html) {
  const startToken = 'Newly Useable Pok'
  const start = html.indexOf(startToken)
  if (start < 0) {
    throw new Error('Could not find Newly Useable Pokemon section in source page.')
  }

  const section = html.slice(start)
  const regex = /<a href="\/pokedex-champions\/[^"]+\/">([^<]+)<br\s*\/?/gi
  const found = []
  let match
  while ((match = regex.exec(section)) !== null) {
    const englishName = decodeHtml(match[1])
    if (!englishName) {
      continue
    }
    found.push(englishName)
  }

  const unique = Array.from(new Set(found))
  return unique
}

function extractUsageSpeciesFromHtml(html, minPercent) {
  // Pikalytics embeds usage values in commented spans next to each pokemon-name row.
  const regex = /<span class="pokemon-name">([^<]+)<\/span>\s*<!--[^>]*>(\d+\.?\d*)%<\/span>[^>]*-->/g
  const selected = []
  let match
  while ((match = regex.exec(html)) !== null) {
    const englishName = decodeHtml(match[1])
    const usagePercent = Number.parseFloat(match[2])
    if (!englishName || Number.isNaN(usagePercent)) {
      continue
    }
    if (usagePercent > minPercent) {
      selected.push(englishName)
    }
  }

  return Array.from(new Set(selected))
}

function extractUsageSpeciesFromMarkdown(markdown, minPercent) {
  // AI endpoint exposes the full "Top 50 Pokemon by Usage" table in markdown.
  const regex = /^\|\s*\d+\s*\|\s*\*\*([^*]+)\*\*\s*\|\s*([0-9.]+)%\s*\|/gm
  const selected = []
  let match
  while ((match = regex.exec(markdown)) !== null) {
    const englishName = decodeHtml(match[1])
    const usagePercent = Number.parseFloat(match[2])
    if (!englishName || Number.isNaN(usagePercent)) {
      continue
    }
    if (usagePercent > minPercent) {
      selected.push(englishName)
    }
  }

  return Array.from(new Set(selected))
}

function resolveLegalSpecies(rawNames) {
  const resolved = []
  const unresolved = []
  const seen = new Set()
  const proxies = []

  for (const rawName of rawNames) {
    const expanded = expandRegulationEntries(rawName)
    for (const entry of expanded) {
      const baseSpecies = gen9.species.get(toID(entry.calcName))
      if (!baseSpecies) {
        unresolved.push(entry.displayName)
        continue
      }

      const dedupeKey = `${entry.displayName}|${entry.calcName}`
      if (seen.has(dedupeKey)) {
        continue
      }
      seen.add(dedupeKey)

      // Merge custom stats over the base species so sorting/selection uses real values.
      const species = entry.customStats
        ? Object.assign({}, baseSpecies, {
            baseStats: entry.customStats.baseStats,
            types: entry.customStats.types,
          })
        : baseSpecies

      if (entry.customStats) {
        proxies.push({
          displayName: entry.displayName,
          calcName: entry.calcName,
          note: `Using @smogon/calc base species '${entry.calcName}' with Bulbapedia custom base stats: ${JSON.stringify(entry.customStats.baseStats)}`,
        })
      }

      resolved.push({
        displayName: entry.displayName,
        calcName: entry.calcName,
        species,
        customStats: entry.customStats,
      })
    }
  }

  return { resolved, unresolved, proxies }
}

function mkPokemon(name, opts = {}) {
  return new Pokemon(gen9, name, {
    level: 50,
    nature: opts.nature ?? 'Hardy',
    evs: opts.evs ?? {},
    ivs: opts.ivs ?? {},
    item: opts.item,
    ...(opts.overrides ? { overrides: opts.overrides } : {}),
  })
}

function toSpriteId(name) {
  return toID(name).replace(/bladeforme/g, 'blade').replace(/shieldforme/g, 'shield')
}

function canUseMoveInCalc(moveName) {
  const move = new Move(gen9, moveName)
  return typeof move.bp === 'number' && move.bp > 0
}

function getLearnsetMoveIds(calcName) {
  const species = showdownDex.species.get(calcName)
  if (!species || !species.exists) {
    return new Set()
  }

  const idsToCheck = [species.id]
  if (species.baseSpecies) {
    idsToCheck.push(toID(species.baseSpecies))
  }

  const legal = new Set()
  for (const id of idsToCheck) {
    const learnsetData = showdownDex.species.getLearnsetData(id)
    if (!learnsetData || !learnsetData.learnset) {
      continue
    }
    for (const moveId of Object.keys(learnsetData.learnset)) {
      legal.add(moveId)
    }
  }

  return legal
}

function chooseOffensiveMove(entry, isPhysical) {
  const primaryType = entry.species.types[0]
  const map = isPhysical ? PHYSICAL_MOVE_BY_TYPE : SPECIAL_MOVE_BY_TYPE
  const fallback = map[primaryType] ?? (isPhysical ? 'Double-Edge' : 'Hyper Voice')
  const legalMoveIds = getLearnsetMoveIds(entry.calcName)

  if (legalMoveIds.size === 0) {
    return canUseMoveInCalc(fallback) ? fallback : null
  }

  const preferred = map[primaryType]
  if (preferred && legalMoveIds.has(toID(preferred)) && canUseMoveInCalc(preferred)) {
    return preferred
  }

  const category = isPhysical ? 'Physical' : 'Special'
  const stabTypes = new Set(entry.species.types)
  const candidates = []
  for (const moveId of legalMoveIds) {
    const move = showdownDex.moves.get(moveId)
    if (!move || !move.exists || move.category !== category || move.basePower <= 0) {
      continue
    }
    if (UNSUITABLE_OFFENSIVE_MOVE_IDS.has(move.id)) {
      continue
    }
    if (!stabTypes.has(move.type)) {
      continue
    }
    if (!canUseMoveInCalc(move.name)) {
      continue
    }

    candidates.push(move)
  }

  candidates.sort((a, b) => {
    if (b.basePower !== a.basePower) {
      return b.basePower - a.basePower
    }
    const aAcc = typeof a.accuracy === 'number' ? a.accuracy : 101
    const bAcc = typeof b.accuracy === 'number' ? b.accuracy : 101
    return bAcc - aAcc
  })

  if (candidates.length > 0) {
    return candidates[0].name
  }

  const nonStabCandidates = []
  for (const moveId of legalMoveIds) {
    const move = showdownDex.moves.get(moveId)
    if (!move || !move.exists || move.category !== category || move.basePower <= 0) {
      continue
    }
    if (UNSUITABLE_OFFENSIVE_MOVE_IDS.has(move.id)) {
      continue
    }
    if (!canUseMoveInCalc(move.name)) {
      continue
    }
    nonStabCandidates.push(move)
  }

  nonStabCandidates.sort((a, b) => {
    if (b.basePower !== a.basePower) {
      return b.basePower - a.basePower
    }
    const aAcc = typeof a.accuracy === 'number' ? a.accuracy : 101
    const bAcc = typeof b.accuracy === 'number' ? b.accuracy : 101
    return bAcc - aAcc
  })

  if (nonStabCandidates.length > 0) {
    return nonStabCandidates[0].name
  }

  return null
}

function buildDamageCards(legalEntries) {
  const cards = []
  const defenders = [...legalEntries]
    .sort((a, b) => b.species.baseStats.hp + b.species.baseStats.def + b.species.baseStats.spd - (a.species.baseStats.hp + a.species.baseStats.def + a.species.baseStats.spd))
    .slice(0, 24)

  const attackers = [...legalEntries]
    .sort((a, b) => Math.max(b.species.baseStats.atk, b.species.baseStats.spa) - Math.max(a.species.baseStats.atk, a.species.baseStats.spa))
    .slice(0, 60)

  let idx = 1
  for (const atkEntry of attackers) {
    const defenderEntry = defenders[idx % defenders.length]
    if (!defenderEntry || atkEntry.displayName === defenderEntry.displayName) {
      idx += 1
      continue
    }

    const isPhysical = atkEntry.species.baseStats.atk >= atkEntry.species.baseStats.spa
    const atkNature = isPhysical ? 'Adamant' : 'Modest'
    const atkEvs = isPhysical ? { atk: 252 } : { spa: 252 }
    const defNature = defenderEntry.species.baseStats.def >= defenderEntry.species.baseStats.spd ? 'Impish' : 'Calm'
    const defEvs = { hp: 252, def: 128, spd: 128 }
    const moveName = chooseOffensiveMove(atkEntry, isPhysical)
    if (!moveName) {
      idx += 1
      continue
    }

    try {
      const attacker = mkPokemon(atkEntry.calcName, {
        nature: atkNature,
        evs: atkEvs,
        ...(atkEntry.customStats ? { overrides: atkEntry.customStats } : {}),
      })
      const defender = mkPokemon(defenderEntry.calcName, {
        nature: defNature,
        evs: defEvs,
        ...(defenderEntry.customStats ? { overrides: defenderEntry.customStats } : {}),
      })
      const move = new Move(gen9, moveName)
      const isSpecialMove = move.category === 'Special'
      const isTyranitarTarget =
        defenderEntry.displayName === 'Tyranitar' || defenderEntry.displayName === 'Mega Tyranitar'
      const field =
        isSpecialMove && isTyranitarTarget
          ? new Field({ gameType: 'Doubles', weather: 'Sand' })
          : DOUBLES_FIELD

      const result = calculate(gen9, attacker, defender, move, field)
      const [lo, hi] = result.range()
      const hp = defender.originalCurHP
      const expectedMin = Math.round((lo / hp) * 1000) / 10
      const expectedMax = Math.round((hi / hp) * 1000) / 10
      if (expectedMax <= 0) {
        idx += 1
        continue
      }

      cards.push({
        id: `d-regma-${idx}`,
        type: 'damage',
        attacker: `${isPhysical ? '252+ Atk' : '252+ SpA'} ${atkEntry.displayName}`,
        move: moveName,
        defender: `${isSpecialMove && isTyranitarTarget ? 'Sand, ' : ''}252 HP / 128 Def / 128 SpD ${defenderEntry.displayName}`,
        attackerInfo: {
          name: atkEntry.displayName,
          spriteId: toSpriteId(atkEntry.displayName),
          types: atkEntry.species.types,
        },
        defenderInfo: {
          name: defenderEntry.displayName,
          spriteId: toSpriteId(defenderEntry.displayName),
          types: defenderEntry.species.types,
        },
        expectedMin,
        expectedMax,
        formatNote:
          isSpecialMove && isTyranitarTarget
            ? 'Regulation M-A legal pool, Level 50 Doubles baseline setup, Sand active'
            : 'Regulation M-A legal pool, Level 50 Doubles baseline setup',
      })
      idx += 1
    } catch {
      idx += 1
    }
  }

  return cards
}

function buildSpeedCards(legalEntries) {
  const cards = []
  const fast = [...legalEntries]
    .sort((a, b) => b.species.baseStats.spe - a.species.baseStats.spe)
    .slice(0, 80)

  for (let i = 0; i + 1 < fast.length; i += 2) {
    const a = fast[i]
    const b = fast[i + 1]

    const aNature = i % 4 === 0 ? 'Timid' : 'Jolly'
    const bNature = i % 4 === 0 ? 'Timid' : 'Jolly'

    cards.push({
      id: `s-regma-${Math.floor(i / 2) + 1}`,
      type: 'speed',
      pokemonA: {
        name: a.displayName,
        nature: `${aNature}, 252 Spe`,
        baseSpeed: a.species.baseStats.spe,
      },
      pokemonB: {
        name: b.displayName,
        nature: `${bNature}, 252 Spe`,
        baseSpeed: b.species.baseStats.spe,
      },
      context: 'Regulation M-A legal pool, Level 50, no Tailwind or speed boosts',
    })
  }

  return cards
}

async function main() {
  const usageMarkdown = await fetchText(PIKALYTICS_AI_USAGE_URL)
  const rawNames = extractUsageSpeciesFromMarkdown(usageMarkdown, USAGE_THRESHOLD_PERCENT)
  const { resolved: legalEntries, unresolved, proxies } = resolveLegalSpecies(rawNames)

  if (legalEntries.length === 0) {
    throw new Error('No legal species resolved from Pikalytics usage source.')
  }

  const damageCards = buildDamageCards(legalEntries)
  const speedCards = buildSpeedCards(legalEntries)

  const allCards = [...damageCards, ...speedCards]

  if (allCards.length === 0) {
    throw new Error('Card generation produced 0 cards.')
  }

  const bundle = {
    source: 'pokemon-champions',
    sourceVersion: `pikalytics-champions-usage>2+@smogon/calc@${require('@smogon/calc/package.json').version}`,
    generatedAt: new Date().toISOString(),
    notes:
      'Generated from Pikalytics Champions Tournaments usage list (usage > 2%) and computed with @smogon/calc Gen 9 formulas. Includes only species successfully resolved by calculator data.',
    cards: allCards,
    metadata: {
      source: 'Pikalytics Champions Tournaments',
      sourceUrl: PIKALYTICS_USAGE_URL,
      sourceTableUrl: PIKALYTICS_AI_USAGE_URL,
      usageThresholdPercent: USAGE_THRESHOLD_PERCENT,
      sourceEntriesAboveThreshold: rawNames.length,
      legalSpeciesResolved: legalEntries.length,
      unresolvedEntries: unresolved.slice(0, 50),
      unresolvedCount: unresolved.length,
      customStatEntries: proxies,
    },
  }

  const outPath = path.resolve(__dirname, '../public/champions-deck.json')
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2))

  console.log(`Pikalytics (AI table) species entries above ${USAGE_THRESHOLD_PERCENT}%: ${rawNames.length}`)
  console.log(`Resolved legal species from usage pool: ${legalEntries.length}`)
  console.log(`Unresolved entries: ${unresolved.length}`)
  console.log(`Proxy entries: ${proxies.length}`)
  console.log(`Generated ${allCards.length} cards → ${outPath}`)
  console.log(`  Damage cards: ${damageCards.length}`)
  console.log(`  Speed cards:  ${speedCards.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
