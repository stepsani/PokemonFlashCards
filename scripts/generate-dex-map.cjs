#!/usr/bin/env node

/**
 * Generate POKEAPI_DEX_MAP from deck.json automatically
 * This ensures no Pokémon are missed and dex numbers are always accurate
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

const deck = require('../public/champions-deck.json')

// Fetch from PokeAPI
function fetchPokemon(nameOrId) {
  return new Promise((resolve) => {
    const url = `https://pokeapi.co/api/v2/pokemon/${nameOrId.toLowerCase()}`
    https
      .get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(null)
            return
          }
          try {
            const json = JSON.parse(data)
            resolve(json.id)
          } catch (e) {
            resolve(null)
          }
        })
      })
      .on('error', () => resolve(null))
  })
}

function fetchPokemonSpecies(nameOrId) {
  return new Promise((resolve) => {
    const url = `https://pokeapi.co/api/v2/pokemon-species/${nameOrId.toLowerCase()}`
    https
      .get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(null)
            return
          }
          try {
            const json = JSON.parse(data)
            resolve(json.id)
          } catch (e) {
            resolve(null)
          }
        })
      })
      .on('error', () => resolve(null))
  })
}

async function generateDexMap() {
  // Extract all unique Pokémon IDs from deck
  const pokemonIds = new Set()
  for (const c of deck.cards) {
    if (c.type === 'damage') {
      if (c.attackerInfo?.spriteId) pokemonIds.add(c.attackerInfo.spriteId)
      if (c.defenderInfo?.spriteId) pokemonIds.add(c.defenderInfo.spriteId)
    }
    if (c.type === 'speed') {
      if (c.pokemonA?.spriteId) pokemonIds.add(c.pokemonA.spriteId)
      if (c.pokemonB?.spriteId) pokemonIds.add(c.pokemonB.spriteId)
    }
  }

  console.log(`Found ${pokemonIds.size} unique Pokémon in deck`)
  console.log('Fetching dex numbers from PokeAPI...\n')

  const dexMap = {}
  const sorted = [...pokemonIds].sort()

  for (const id of sorted) {
    // Normalize: strip mega/primal prefix for API lookup
    let lookupId = id.toLowerCase()
    // Pokémon that start with "mega" but aren't mega forms
    const megaPokemon = ['meganium', 'megapod'];
    if (lookupId.startsWith('mega') && !megaPokemon.includes(lookupId)) {
      lookupId = lookupId.slice(4)
    }
    if (lookupId.startsWith('primal')) lookupId = lookupId.slice(6)
    if (lookupId.endsWith('x') || lookupId.endsWith('y')) lookupId = lookupId.slice(0, -1)
    if (lookupId.endsWith('blade') || lookupId.endsWith('shield')) {
      lookupId = lookupId.replace(/blade$/, '').replace(/shield$/, '')
    }

    // Handle regional variants: restore hyphens for PokeAPI lookup
    // e.g., "ninetalesalola" → "ninetales-alola"
    const regionalVariants = ['alola', 'galar', 'hisui', 'paldea']
    for (const variant of regionalVariants) {
      if (lookupId.endsWith(variant)) {
        const baseName = lookupId.slice(0, -variant.length)
        lookupId = `${baseName}-${variant}`
        break
      }
    }

    let dexNum = await fetchPokemon(lookupId)
    
    // Fallback: try hyphenated variants for Pokémon with hyphens in their names
    if (!dexNum) {
      // Specific known hyphenations
      const hyphenPatterns = {
        'kommoo': 'kommo-o',
        'tapukoko': 'tapu-koko',
        'tapulele': 'tapu-lele',
        'tapubulu': 'tapu-bulu',
        'tapufini': 'tapu-fini',
        'jangmoo': 'jangmo-o',
        'hakamoo': 'hakamo-o',
      }
      
      if (hyphenPatterns[lookupId]) {
        const newLookupId = hyphenPatterns[lookupId]
        dexNum = await fetchPokemon(newLookupId)
        if (dexNum) lookupId = newLookupId
      }
    }

    // Fallback to species endpoint for form-only entries (e.g., maushold)
    if (!dexNum) {
      dexNum = await fetchPokemonSpecies(lookupId)
    }
    
    if (dexNum) {
      dexMap[id] = dexNum
      console.log(`✓ ${id.padEnd(20)} → #${dexNum}`)
    } else {
      console.log(`✗ ${id.padEnd(20)} → (not found)`)
    }

    // Rate limit: be nice to PokeAPI
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  // Generate TypeScript code
  const entries = Object.entries(dexMap).sort((a, b) => a[0].localeCompare(b[0]))
  let code = 'export const POKEAPI_DEX_MAP: Record<string, number> = {\n'

  let line = ''
  for (const [id, dex] of entries) {
    const entry = `${id}: ${dex}, `
    if ((line + entry).length > 90) {
      code += '  ' + line.trim() + '\n'
      line = ''
    }
    line += entry
  }
  if (line) {
    code += '  ' + line.trim() + '\n'
  }

  code += '}\n'

  console.log('\n' + '='.repeat(60))
  console.log('Generated TypeScript code:\n')
  console.log(code)
  console.log('='.repeat(60))

  // Save to file for reference
  const outputPath = path.join(__dirname, '../dex-map.generated.ts')
  fs.writeFileSync(outputPath, code)
  console.log(`\nSaved to: ${outputPath}\n`)
}

generateDexMap().catch(console.error)
