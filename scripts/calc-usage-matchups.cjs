'use strict'
const { calculate, Move, Pokemon, Field, Generations } = require('@smogon/calc')
const gen9 = Generations.get(9)
const DOUBLES = new Field({ gameType: 'Doubles' })

function mkAtk(name, nature, evs) {
  return new Pokemon(gen9, name, { level: 50, nature, evs: evs || {}, ivs: {} })
}
function mkDef(name) {
  return new Pokemon(gen9, name, { level: 50, nature: 'Calm', evs: { hp: 252, def: 128, spd: 128 } })
}
function mkDefBulky(name, nature) {
  return new Pokemon(gen9, name, { level: 50, nature: nature || 'Bold', evs: { hp: 252, def: 252 } })
}
function mkDefZero(name) {
  return new Pokemon(gen9, name, { level: 50, nature: 'Hardy', evs: {} })
}

const results = []

function calc(atkName, moveName, defName, atkNature, atkEvs, defPokemon) {
  try {
    const atk = mkAtk(atkName, atkNature, atkEvs)
    const def = defPokemon || mkDef(defName)
    const result = calculate(gen9, atk, def, new Move(gen9, moveName), DOUBLES)
    const [lo, hi] = result.range()
    const hp = def.originalCurHP
    const pctLo = Math.round(lo / hp * 1000) / 10
    const pctHi = Math.round(hi / hp * 1000) / 10
    const statKey = atkEvs.atk ? 'Atk' : 'SpA'
    const nature = atkNature
    console.log(`${nature} 252 ${statKey} ${atkName} ${moveName} vs ${defName}: ${pctLo}-${pctHi}%`)
    results.push({ atkName, moveName, defName, atkNature, atkEvs, defPokemon: defPokemon ? 'custom' : 'standard', pctLo, pctHi })
  } catch(e) {
    console.log(`ERROR: ${atkName} ${moveName} vs ${defName}: ${e.message}`)
  }
}

console.log('=== INCINEROAR (252+ Atk Adamant) ===')
calc('Incineroar', 'Flare Blitz', 'Milotic', 'Adamant', {atk:252}, mkDef('Milotic'))
calc('Incineroar', 'Flare Blitz', 'Corviknight', 'Adamant', {atk:252}, mkDef('Corviknight'))
calc('Incineroar', 'Darkest Lariat', 'Farigiraf', 'Adamant', {atk:252}, mkDef('Farigiraf'))
calc('Incineroar', 'Throat Chop', 'Gardevoir', 'Adamant', {atk:252}, mkDefZero('Gardevoir'))

console.log('\n=== SINISTCHA (252+ SpA Modest) ===')
calc('Sinistcha', 'Matcha Gotcha', 'Incineroar', 'Modest', {spa:252}, mkDef('Incineroar'))
calc('Sinistcha', 'Poltergeist', 'Kingambit', 'Modest', {spa:252}, mkDef('Kingambit'))
calc('Sinistcha', 'Energy Ball', 'Tyranitar', 'Modest', {spa:252}, mkDef('Tyranitar'))

console.log('\n=== ROTOM-WASH (252+ SpA Modest) ===')
calc('Rotom-Wash', 'Hydro Pump', 'Incineroar', 'Modest', {spa:252}, mkDef('Incineroar'))
calc('Rotom-Wash', 'Hydro Pump', 'Garchomp', 'Modest', {spa:252}, mkDef('Garchomp'))
calc('Rotom-Wash', 'Thunderbolt', 'Corviknight', 'Modest', {spa:252}, mkDef('Corviknight'))

console.log('\n=== ARCHALUDON (252+ SpA Modest) ===')
calc('Archaludon', 'Flash Cannon', 'Gardevoir', 'Modest', {spa:252}, mkDefZero('Gardevoir'))
calc('Archaludon', 'Draco Meteor', 'Incineroar', 'Modest', {spa:252}, mkDef('Incineroar'))
calc('Archaludon', 'Electro Shot', 'Sneasler', 'Modest', {spa:252}, mkDefZero('Sneasler'))

console.log('\n=== VENUSAUR (252+ SpA Modest) ===')
calc('Venusaur', 'Sludge Bomb', 'Sneasler', 'Modest', {spa:252}, mkDefZero('Sneasler'))
calc('Venusaur', 'Sludge Bomb', 'Gardevoir', 'Modest', {spa:252}, mkDefZero('Gardevoir'))
calc('Venusaur', 'Energy Ball', 'Tyranitar', 'Modest', {spa:252}, mkDef('Tyranitar'))

console.log('\n=== GARDEVOIR (252+ SpA Modest) ===')
calc('Gardevoir', 'Moonblast', 'Kingambit', 'Modest', {spa:252}, mkDef('Kingambit'))
calc('Gardevoir', 'Moonblast', 'Incineroar', 'Modest', {spa:252}, mkDef('Incineroar'))
calc('Gardevoir', 'Psychic', 'Sneasler', 'Modest', {spa:252}, mkDefZero('Sneasler'))

console.log('\n=== MILOTIC (252+ SpA Modest) ===')
calc('Milotic', 'Hydro Pump', 'Incineroar', 'Modest', {spa:252}, mkDef('Incineroar'))
calc('Milotic', 'Hydro Pump', 'Excadrill', 'Modest', {spa:252}, mkDef('Excadrill'))
calc('Milotic', 'Scald', 'Tyranitar', 'Modest', {spa:252}, mkDef('Tyranitar'))

console.log('\n=== CORVIKNIGHT (252+ Atk Adamant) ===')
calc('Corviknight', 'Iron Head', 'Gardevoir', 'Adamant', {atk:252}, mkDefZero('Gardevoir'))
calc('Corviknight', 'Brave Bird', 'Sneasler', 'Adamant', {atk:252}, mkDefZero('Sneasler'))
calc('Corviknight', 'Body Press', 'Kingambit', 'Adamant', {atk:252}, mkDefBulky('Corviknight'))

console.log('\n=== PELIPPER (252+ SpA Modest) ===')
calc('Pelipper', 'Hurricane', 'Sneasler', 'Modest', {spa:252}, mkDefZero('Sneasler'))
calc('Pelipper', 'Hydro Pump', 'Tyranitar', 'Modest', {spa:252}, mkDef('Tyranitar'))
calc('Pelipper', 'Hurricane', 'Incineroar', 'Modest', {spa:252}, mkDef('Incineroar'))

console.log('\n=== BASCULEGION (252+ Atk Adamant) ===')
calc('Basculegion', 'Wave Crash', 'Incineroar', 'Adamant', {atk:252}, mkDef('Incineroar'))
calc('Basculegion', 'Wave Crash', 'Tyranitar', 'Adamant', {atk:252}, mkDef('Tyranitar'))
calc('Basculegion', 'Aqua Jet', 'Excadrill', 'Adamant', {atk:252}, mkDef('Excadrill'))

console.log('\n=== FARIGIRAF (252+ SpA Modest) ===')
calc('Farigiraf', 'Psychic', 'Sneasler', 'Modest', {spa:252}, mkDefZero('Sneasler'))
calc('Farigiraf', 'Hyper Voice', 'Incineroar', 'Modest', {spa:252}, mkDef('Incineroar'))
calc('Farigiraf', 'Psychic', 'Incineroar', 'Modest', {spa:252}, mkDef('Incineroar'))

console.log('\n=== FLOETTE (252+ SpA Modest) ===')
calc('Floette', 'Moonblast', 'Garchomp', 'Modest', {spa:252}, mkDef('Garchomp'))
calc('Floette', 'Moonblast', 'Kingambit', 'Modest', {spa:252}, mkDef('Kingambit'))
