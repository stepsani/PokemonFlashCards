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
const PIKALYTICS_CHAMPIONS_SPECIES_AI_URL_BASE =
  'https://www.pikalytics.com/ai/pokedex/championstournaments/'
const USAGE_THRESHOLD_PERCENT = 2
const CHAMPIONS_EV_MAX = 32
const CHAMPIONS_TO_CALC_SCALE = 8

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

const VALID_NATURES = new Set([
  'Hardy',
  'Lonely',
  'Brave',
  'Adamant',
  'Naughty',
  'Bold',
  'Docile',
  'Relaxed',
  'Impish',
  'Lax',
  'Timid',
  'Hasty',
  'Serious',
  'Jolly',
  'Naive',
  'Modest',
  'Mild',
  'Quiet',
  'Bashful',
  'Rash',
  'Calm',
  'Gentle',
  'Sassy',
  'Careful',
  'Quirky',
])

const NATURE_ALIASES = {
  Hart: 'Hardy',
  Calme: 'Calm',
  Prudent: 'Careful',
  Malin: 'Impish',
  Assure: 'Bold',
  Presse: 'Hasty',
  Timide: 'Timid',
  Modeste: 'Modest',
  Rigide: 'Adamant',
  Jovial: 'Jolly',
}

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

function normalizeNatureName(input) {
  const raw = decodeHtml(input).trim()
  if (!raw) {
    return 'Hardy'
  }

  const compact = raw.replace(/[^A-Za-z]/g, '')
  const mapped = NATURE_ALIASES[compact] ?? compact
  if (VALID_NATURES.has(mapped)) {
    return mapped
  }

  return 'Hardy'
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

function normalizePikalyticsSlug(name) {
  return encodeURIComponent(name.trim())
}

function parseCommonMovesFromAiMarkdown(markdown) {
  const sectionMatch = markdown.match(/## Common Moves\n([\s\S]*?)(?:\n## |$)/)
  if (!sectionMatch) {
    return []
  }

  const block = sectionMatch[1]
  const moveRegex = /^- \*\*([^*]+)\*\*: ([0-9.]+)%/gm
  const moves = []
  let match
  while ((match = moveRegex.exec(block)) !== null) {
    const name = decodeHtml(match[1]).trim()
    const pct = Number.parseFloat(match[2])
    if (!name || name.toLowerCase() === 'other' || Number.isNaN(pct)) {
      continue
    }
    moves.push({ name, pct })
  }

  return moves
}

function parseChampionsSetFromAiMarkdown(markdown) {
  const setBlockMatch = markdown.match(/\*\*[^\n]+ Set\*\*:\n([\s\S]*?)(?:\n\n|\n###|\n##|$)/)
  if (!setBlockMatch) {
    return null
  }

  const block = setBlockMatch[1]
  const natureMatch = block.match(/- \*\*Nature\*\*:\s*([^\n]+)/i)
  const evsMatch = block.match(/- \*\*EVs\*\*:\s*([^\n]+)/i)
  if (!natureMatch || !evsMatch) {
    return null
  }

  const evs32 = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  const segments = evsMatch[1].split('/').map((v) => v.trim())
  for (const segment of segments) {
    const partMatch = segment.match(/(\d+)\s*(HP|Atk|Def|SpA|SpD|Spe)/i)
    if (!partMatch) {
      continue
    }
    const value = Number.parseInt(partMatch[1], 10)
    const stat = partMatch[2].toLowerCase()
    const key = stat === 'spa' || stat === 'spd' || stat === 'spe' ? stat : stat.slice(0, 3)
    if (!(key in evs32)) {
      continue
    }
    evs32[key] = Math.max(0, Math.min(CHAMPIONS_EV_MAX, value))
  }

  return {
    nature: normalizeNatureName(natureMatch[1]),
    evs32,
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let next = 0

  async function worker() {
    while (true) {
      const idx = next
      next += 1
      if (idx >= items.length) {
        return
      }
      results[idx] = await mapper(items[idx], idx)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

async function buildPikalyticsSetMap(rawNames) {
  const unique = Array.from(new Set(rawNames))
  const profiles = await mapWithConcurrency(unique, 6, async (rawName) => {
    const slug = normalizePikalyticsSlug(rawName)
    const aiUrl = `${PIKALYTICS_CHAMPIONS_SPECIES_AI_URL_BASE}${slug}`

    let aiMarkdown = ''
    try {
      aiMarkdown = await fetchText(aiUrl)
    } catch {
      aiMarkdown = ''
    }

    const moveRows = parseCommonMovesFromAiMarkdown(aiMarkdown)
    const championsSet = parseChampionsSetFromAiMarkdown(aiMarkdown)

    return {
      rawName,
      moves: moveRows,
      championsSet,
    }
  })

  const byName = new Map()
  for (const profile of profiles) {
    byName.set(profile.rawName, profile)
  }
  return byName
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
        derivedFrom: entry.derivedFrom,
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

function formatEvsForCard(evs) {
  return `${evs.hp} HP / ${evs.atk} Atk / ${evs.def} Def / ${evs.spa} SpA / ${evs.spd} SpD / ${evs.spe} Spe`
}

function champions32ToCalcValue(value32) {
  const scaled = Math.max(0, Math.min(CHAMPIONS_EV_MAX, value32)) * CHAMPIONS_TO_CALC_SCALE
  return Math.min(252, scaled)
}

function champions32ToCalcEvs(evs32) {
  return {
    hp: champions32ToCalcValue(evs32.hp),
    atk: champions32ToCalcValue(evs32.atk),
    def: champions32ToCalcValue(evs32.def),
    spa: champions32ToCalcValue(evs32.spa),
    spd: champions32ToCalcValue(evs32.spd),
    spe: champions32ToCalcValue(evs32.spe),
  }
}

const NATURE_BOOST_STAT = {
  Adamant: 'Atk', Brave: 'Atk', Lonely: 'Atk', Naughty: 'Atk',
  Modest: 'SpA', Quiet: 'SpA', Mild: 'SpA', Rash: 'SpA',
  Jolly: 'Spe', Timid: 'Spe', Hasty: 'Spe', Naive: 'Spe',
  Impish: 'Def', Lax: 'Def', Bold: 'Def', Relaxed: 'Def',
  Careful: 'SpD', Sassy: 'SpD', Calm: 'SpD', Gentle: 'SpD',
}

function formatChampionsEvsForCard(evs32, nature) {
  const boosted = NATURE_BOOST_STAT[nature] ?? null
  const ordered = [
    ['HP', evs32.hp],
    ['Atk', evs32.atk],
    ['Def', evs32.def],
    ['SpA', evs32.spa],
    ['SpD', evs32.spd],
    ['Spe', evs32.spe],
  ]

  const parts = ordered
    .filter(([, value]) => value > 0)
    .map(([label, value]) => `${value}${label === boosted ? '+' : ''} ${label}`)

  return parts.length > 0 ? parts.join(' / ') : '0 HP'
}

function formatSpeedCardSetText(nature, evs32) {
  return evs32.spe > 0 ? `${nature}, Max Speed` : nature
}

function getDefaultDamageAttackerSet(entry, preferPhysical) {
  if (preferPhysical) {
    return {
      nature: 'Adamant',
      evs32: { hp: 0, atk: CHAMPIONS_EV_MAX, def: 0, spa: 0, spd: 0, spe: 0 },
      source: 'champions-32-default-attacker',
    }
  }
  return {
    nature: 'Modest',
    evs32: { hp: 0, atk: 0, def: 0, spa: CHAMPIONS_EV_MAX, spd: 0, spe: 0 },
    source: 'champions-32-default-attacker',
  }
}

function getDefaultDamageDefenderSet(entry) {
  const morePhysicalBulk = entry.species.baseStats.def >= entry.species.baseStats.spd
  return {
    nature: morePhysicalBulk ? 'Impish' : 'Calm',
    evs32: {
      hp: CHAMPIONS_EV_MAX,
      atk: 0,
      def: morePhysicalBulk ? CHAMPIONS_EV_MAX : 0,
      spa: 0,
      spd: morePhysicalBulk ? 0 : CHAMPIONS_EV_MAX,
      spe: 0,
    },
    source: 'champions-32-default-defender',
  }
}

function getDamageSetForEntry(entry, setMap, preferPhysical, role) {
  const profile = setMap.get(entry.derivedFrom)
  if (profile && profile.championsSet) {
    return {
      nature: profile.championsSet.nature,
      evs32: profile.championsSet.evs32,
      source: 'champions-ai-set',
    }
  }

  if (role === 'attacker') {
    return getDefaultDamageAttackerSet(entry, preferPhysical)
  }
  return getDefaultDamageDefenderSet(entry)
}

function getSpeedSetForEntry(entry) {
  const isPhysical = entry.species.baseStats.atk >= entry.species.baseStats.spa
  return {
    nature: isPhysical ? 'Jolly' : 'Timid',
    evs32: {
      hp: 0,
      atk: isPhysical ? CHAMPIONS_EV_MAX : 0,
      def: 0,
      spa: isPhysical ? 0 : CHAMPIONS_EV_MAX,
      spd: 0,
      spe: CHAMPIONS_EV_MAX,
    },
    source: 'max-speed-plus-offense',
  }
}

/** Returns the type effectiveness multiplier of moveType against defenderTypes (0.5x, 1x, 2x etc.) */
function getTypeEffectiveness(moveType, defenderTypes) {
  let mult = 1
  for (const defType of defenderTypes) {
    const typeData = showdownDex.types.get(defType)
    if (!typeData || !typeData.damageTaken) continue
    const val = typeData.damageTaken[moveType]
    if (val === 1) mult *= 2      // super effective
    else if (val === 2) mult *= 0.5  // not very effective
    else if (val === 3) mult = 0     // immune
  }
  return mult
}

function choosePikalyticsMoves(entry, profile, isPhysical, maxMoves = 1, defenderTypes = null) {
  if (!profile || !Array.isArray(profile.moves) || profile.moves.length === 0) {
    return []
  }

  // Only consider the top 4 moves by usage
  const topMoves = profile.moves.slice(0, 4)

  const preferred = []
  const acceptable = []
  const stabTypes = new Set(entry.species.types)

  for (const row of topMoves) {
    const move = showdownDex.moves.get(row.name)
    if (!move || !move.exists || move.basePower <= 0) {
      continue
    }
    if (UNSUITABLE_OFFENSIVE_MOVE_IDS.has(move.id)) {
      continue
    }
    if (!canUseMoveInCalc(move.name)) {
      continue
    }

    // Skip moves that are resisted or immune vs the defender
    if (defenderTypes) {
      const eff = getTypeEffectiveness(move.type, defenderTypes)
      if (eff < 1) continue
    }

    const desiredCategory = isPhysical ? 'Physical' : 'Special'
    const isDesiredCategory = move.category === desiredCategory
    const isStab = stabTypes.has(move.type)

    if (isDesiredCategory && isStab) {
      preferred.push(move.name)
    } else {
      acceptable.push(move.name)
    }
  }

  const ordered = [...preferred, ...acceptable]
  return ordered.slice(0, maxMoves)
}

function choosePikalyticsMove(entry, profile, isPhysical) {
  const results = choosePikalyticsMoves(entry, profile, isPhysical, 1)
  return results[0] ?? null
}

function readPokemonSpeedStat(pokemon, fallback) {
  if (pokemon && pokemon.rawStats && Number.isFinite(pokemon.rawStats.spe)) {
    return pokemon.rawStats.spe
  }
  if (pokemon && pokemon.stats && Number.isFinite(pokemon.stats.spe)) {
    return pokemon.stats.spe
  }
  return fallback
}

function buildDamageCards(legalEntries, setMap) {
  const TARGET = 150
  const cards = []
  const usedPairs = new Set()

  const defenders = [...legalEntries]
    .sort((a, b) => b.species.baseStats.hp + b.species.baseStats.def + b.species.baseStats.spd - (a.species.baseStats.hp + a.species.baseStats.def + a.species.baseStats.spd))

  const attackers = [...legalEntries]
    .sort((a, b) => Math.max(b.species.baseStats.atk, b.species.baseStats.spa) - Math.max(a.species.baseStats.atk, a.species.baseStats.spa))

  let cardIdx = 1
  let defCursor = 0

  for (const atkEntry of attackers) {
    if (cards.length >= TARGET) break
    const isPhysical = atkEntry.species.baseStats.atk >= atkEntry.species.baseStats.spa
    const profile = setMap.get(atkEntry.derivedFrom)

    // Try multiple defenders so we can find ones where our moves land neutrally/SE
    for (let defAttempt = 0; defAttempt < defenders.length && cards.length < TARGET; defAttempt++) {
      const defenderEntry = defenders[(defCursor + defAttempt) % defenders.length]
      if (defenderEntry.displayName === atkEntry.displayName) continue

      // Get moves that are neutral or super effective vs this defender
      const moveList = choosePikalyticsMoves(atkEntry, profile, isPhysical, 4, defenderEntry.species.types)
      if (moveList.length === 0) continue

      let addedForThisPair = 0
      for (const moveName of moveList) {
        if (cards.length >= TARGET) break
        const pairKey = `${atkEntry.displayName}|${defenderEntry.displayName}|${moveName}`
        if (usedPairs.has(pairKey)) continue
        usedPairs.add(pairKey)

        const attackerSet = getDamageSetForEntry(atkEntry, setMap, isPhysical, 'attacker')
        const defenderSet = getDamageSetForEntry(defenderEntry, setMap, false, 'defender')
        const attackerCalcEvs = champions32ToCalcEvs(attackerSet.evs32)
        const defenderCalcEvs = champions32ToCalcEvs(defenderSet.evs32)

        try {
          const attacker = mkPokemon(atkEntry.calcName, {
            nature: attackerSet.nature,
            evs: attackerCalcEvs,
            ...(atkEntry.customStats ? { overrides: atkEntry.customStats } : {}),
          })
          const defender = mkPokemon(defenderEntry.calcName, {
            nature: defenderSet.nature,
            evs: defenderCalcEvs,
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
          if (expectedMax <= 0) continue

          cards.push({
            id: `d-regma-${cardIdx}`,
            type: 'damage',
            attacker: `${formatChampionsEvsForCard(attackerSet.evs32, attackerSet.nature)} ${atkEntry.displayName}`,
            move: moveName,
            defender: `${isSpecialMove && isTyranitarTarget ? 'Sand, ' : ''}${formatChampionsEvsForCard(defenderSet.evs32, defenderSet.nature)} ${defenderEntry.displayName}`,
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
            formatNote: `Regulation M-A, Level 50`,
          })
          cardIdx++
          addedForThisPair++
        } catch {
          // skip
        }
      }

      if (addedForThisPair > 0) {
        defCursor = (defCursor + defAttempt + 1) % defenders.length
      }
    }
  }

  return cards
}

function buildSpeedCards(legalEntries, setMap) {
  const TARGET = 100
  const cards = []
  const sorted = [...legalEntries]
    .sort((a, b) => b.species.baseStats.spe - a.species.baseStats.spe)

  // Generate pairs with increasing gap until we hit the target
  let cardIdx = 1
  for (let gap = 1; gap < sorted.length && cards.length < TARGET; gap++) {
    for (let i = 0; i + gap < sorted.length && cards.length < TARGET; i++) {
      const a = sorted[i]
      const b = sorted[i + gap]

      cards.push({
        id: `s-regma-${cardIdx}`,
        type: 'speed',
        pokemonA: {
          name: a.displayName,
          baseSpeed: a.species.baseStats.spe,
        },
        pokemonB: {
          name: b.displayName,
          baseSpeed: b.species.baseStats.spe,
        },
        context: `Regulation M-A, Level 50`,
      })
      cardIdx++
    }
  }

  return cards
}

async function main() {
  const usageMarkdown = await fetchText(PIKALYTICS_AI_USAGE_URL)
  const rawNames = extractUsageSpeciesFromMarkdown(usageMarkdown, USAGE_THRESHOLD_PERCENT)
  const pikalyticsSetMap = await buildPikalyticsSetMap(rawNames)
  const { resolved: legalEntries, unresolved, proxies } = resolveLegalSpecies(rawNames)

  if (legalEntries.length === 0) {
    throw new Error('No legal species resolved from Pikalytics usage source.')
  }

  const damageCards = buildDamageCards(legalEntries, pikalyticsSetMap)
  const speedCards = buildSpeedCards(legalEntries, pikalyticsSetMap)

  const allCards = [...damageCards, ...speedCards]

  if (allCards.length === 0) {
    throw new Error('Card generation produced 0 cards.')
  }

  const bundle = {
    source: 'pokemon-champions',
    sourceVersion: `pikalytics-champions-usage>2+@smogon/calc@${require('@smogon/calc/package.json').version}`,
    generatedAt: new Date().toISOString(),
    notes:
      'Generated from Pikalytics Champions Tournaments usage list (usage > 2%) and Champions AI move usage. Speed cards use max Speed + max attacking stat with best speed nature. Damage cards use Champions 32-point EV model and are converted to Gen9 EVs for @smogon/calc calculations.',
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
