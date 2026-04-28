import { useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import type { FlashCard, SpeedAnswer } from './domain/cards'
import {
  evaluateDamageAnswer,
  evaluateSpeedAnswer,
  getCorrectSpeedAnswer,
} from './domain/cards'
import { sampleDeck } from './data/sampleDeck'
import {
  loadChampionsDeck,
  REQUIRE_CHAMPIONS_SOURCE,
} from './data/championsDeck'
import {
  getOrCreateUserId,
  getInitialProgress,
  loadProgress,
  saveProgress,
  type ProgressStats,
} from './features/progress/storage'
import { POKEAPI_DEX_MAP } from '../dex-map.generated'
import './App.css'

function getRandomCard(cards: FlashCard[]): FlashCard | null {
  if (cards.length === 0) {
    return null
  }

  const idx = Math.floor(Math.random() * cards.length)
  return cards[idx]
}

function toId(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function extractAttackerName(attackerLabel: string): string {
  return attackerLabel.replace(/^\d+\+\s+(Atk|SpA)\s+/, '').trim()
}

function extractDefenderName(defenderLabel: string): string {
  return defenderLabel
    .replace(/^\d+\s+HP\s*\/\s*\d+\s+Def\s*\/\s*\d+\s+SpD\s+/, '')
    .trim()
}

function toSpriteId(name: string): string {
  let id = toId(name)
  id = id.replace(/bladeforme/g, 'blade')
  id = id.replace(/shieldforme/g, 'shield')
  return id
}

// Custom mega sprites from KingOfThe-X-Roads (sta.sh)
const CUSTOM_MEGA_SPRITES: Record<string, string> = {
  megavenusaur: 'https://sta.sh/01c338zx59rs',
  megacharizardx: 'https://sta.sh/01e81jaz68co', // Was marked as "X", using Y variant listed
  megacharizardy: 'https://sta.sh/023ixy1atmy7',
  megablastoise: 'https://sta.sh/0nt66lkbimo',
  megabeedrill: 'https://sta.sh/0gnmi95qri3',
  megapidgeot: 'https://sta.sh/0291jtq1qj3j',
  megaraichux: 'https://sta.sh/03id19f0dha',
  megaraichuy: 'https://sta.sh/0jh8zuwod40',
  megaclefable: 'https://sta.sh/0240t65mdy5q',
  megavictreebel: 'https://sta.sh/017vx9ix18dp',
  megaslowbro: 'https://sta.sh/026qequidtz0',
  megagengar: 'https://sta.sh/0218qvo5oa1w',
  megastarmie: 'https://sta.sh/0q86yi1plxd',
  megakangaskhan: 'https://sta.sh/01ull0dwxrlf',
  megapinsir: 'https://sta.sh/0rkurhgr93',
  megaaero: 'https://sta.sh/0229o8v2dt8i',
  megadragonite: 'https://sta.sh/07pz4tshy5m',
  megamewtwox: 'https://sta.sh/016qox29a0wa',
  megamewtwoy: 'https://sta.sh/014dy5zxhtru',
  megameganium: 'https://sta.sh/027t31j8bgpv',
  megaferaligatr: 'https://sta.sh/06dpi8ane3f',
  megaampharos: 'https://sta.sh/0589cjpeecl',
  megaheracross: 'https://sta.sh/01dnuczj2i6n',
  megaskarmory: 'https://sta.sh/01bgbc3ocp7s',
  megatyranitar: 'https://sta.sh/01c3qqjnk4zq',
  megagardevoir: 'https://sta.sh/0t2w0q6fcnl',
  megasableye: 'https://sta.sh/0207cmhksllx',
  megamawile: 'https://sta.sh/025tfx783uc9',
  megaaggron: 'https://sta.sh/0tx71sx6yvl',
  megamedicham: 'https://sta.sh/01utjffnwhfr',
  megamanectric: 'https://sta.sh/06vnt4ldw80',
  megacamerupt: 'https://sta.sh/02glym334djt',
  megabanette: 'https://sta.sh/0zwbeewop1f',
  megaabsol: 'https://sta.sh/01ow734l32ni',
  megasalamence: 'https://sta.sh/01kowetkaoj5',
  megametagross: 'https://sta.sh/0ed2zyy3pv5',
  megalatias: 'https://sta.sh/0n7fwo1l9lu',
  megalatios: 'https://sta.sh/010yjsvdvy3t',
  primalkyogre: 'https://sta.sh/01umn64ovg4h',
  primalgroudon: 'https://sta.sh/02e389w2ceeu',
  megarayquaza: 'https://sta.sh/023c3y5ja4wj',
  megastaraptor: 'https://sta.sh/01rqe22xxvz6',
  megalopunny: 'https://sta.sh/0kbo44ugwrv',
  megalucario: 'https://sta.sh/0155hqtvl7dx',
  megaabomasnow: 'https://sta.sh/01bqw164w9nv',
  megafroslass: 'https://sta.sh/0o8ocs8aqqm',
  megaheatran: 'https://sta.sh/0c4linf1xqz',
  megadarkrai: 'https://sta.sh/01h5azjj09n7',
  megaemboar: 'https://sta.sh/027viw9zgee1',
  megaexcadrill: 'https://sta.sh/01nu87uai83c',
  megaudino: 'https://sta.sh/01pymuw9rs27',
  megascolipede: 'https://sta.sh/0hg0zbmiejn',
  megascrafty: 'https://sta.sh/0k9nvv3w4qu',
  megaeelektross: 'https://sta.sh/0bv72jvzbti',
  megachandelure: 'https://sta.sh/0ul657hrrvi',
  megachesnaught: 'https://sta.sh/06ukxltdqp7',
  megadelphox: 'https://sta.sh/0bnk1s12pnj',
  megagreninja: 'https://sta.sh/02ewxfssgnmu',
  megapyroar: 'https://sta.sh/0sip8hx4suu',
  megameowstic: 'https://sta.sh/0okmapkjdss',
  megamalamar: 'https://sta.sh/03eeyt9d6ub',
  megabarbaracle: 'https://sta.sh/0671c16snw1',
  megadragalage: 'https://sta.sh/0149s7aiwmcc',
  megahawlucha: 'https://sta.sh/022yges71v59',
  megazygarde: 'https://sta.sh/01rfb2hpbxzv',
  megadrampa: 'https://sta.sh/02br48nvop5y',
  megamagearna: 'https://sta.sh/0o4dcr2uhe2',
  megascovillain: 'https://sta.sh/018xavpvm97j',
  megaglimmora: 'https://sta.sh/0tarczop0xr',
  megabaxcalibur: 'https://sta.sh/01ibiy8c48h4',
}

function toCustomMegaSpriteUrl(showdownId: string): string | null {
  return CUSTOM_MEGA_SPRITES[showdownId] ?? null
}

function toPokeAPIDex(showdownId: string): number | null {
  const raw = showdownId.toLowerCase()
  // Direct lookup first (covers all explicit entries including mega/primal forms)
  if (POKEAPI_DEX_MAP[raw] !== undefined) return POKEAPI_DEX_MAP[raw]
  // Fallback: strip mega/primal prefix and form suffixes, then look up base species
  let id = raw
  if (id.startsWith('mega')) id = id.slice(4)
  if (id.startsWith('primal')) id = id.slice(6)
  if (id.endsWith('x') || id.endsWith('y')) id = id.slice(0, -1)
  return POKEAPI_DEX_MAP[id] ?? null
}

function toPokeAPISpriteUrl(dex: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`
}

const TYPE_ICON_BY_TYPE: Record<string, string> = {
  Normal: 'https://play.pokemonshowdown.com/sprites/types/Normal.png',
  Fire: 'https://play.pokemonshowdown.com/sprites/types/Fire.png',
  Water: 'https://play.pokemonshowdown.com/sprites/types/Water.png',
  Electric: 'https://play.pokemonshowdown.com/sprites/types/Electric.png',
  Grass: 'https://play.pokemonshowdown.com/sprites/types/Grass.png',
  Ice: 'https://play.pokemonshowdown.com/sprites/types/Ice.png',
  Fighting: 'https://play.pokemonshowdown.com/sprites/types/Fighting.png',
  Poison: 'https://play.pokemonshowdown.com/sprites/types/Poison.png',
  Ground: 'https://play.pokemonshowdown.com/sprites/types/Ground.png',
  Flying: 'https://play.pokemonshowdown.com/sprites/types/Flying.png',
  Psychic: 'https://play.pokemonshowdown.com/sprites/types/Psychic.png',
  Bug: 'https://play.pokemonshowdown.com/sprites/types/Bug.png',
  Rock: 'https://play.pokemonshowdown.com/sprites/types/Rock.png',
  Ghost: 'https://play.pokemonshowdown.com/sprites/types/Ghost.png',
  Dragon: 'https://play.pokemonshowdown.com/sprites/types/Dragon.png',
  Dark: 'https://play.pokemonshowdown.com/sprites/types/Dark.png',
  Steel: 'https://play.pokemonshowdown.com/sprites/types/Steel.png',
  Fairy: 'https://play.pokemonshowdown.com/sprites/types/Fairy.png',
}

const TYPE_BY_MOVE: Record<string, string> = {
  'X-Scissor': 'Bug',
  Crunch: 'Dark',
  'Dragon Claw': 'Dragon',
  'Wild Charge': 'Electric',
  'Play Rough': 'Fairy',
  'Close Combat': 'Fighting',
  'Flare Blitz': 'Fire',
  'Brave Bird': 'Flying',
  'Shadow Claw': 'Ghost',
  'Power Whip': 'Grass',
  Earthquake: 'Ground',
  'Icicle Crash': 'Ice',
  'Double-Edge': 'Normal',
  'Gunk Shot': 'Poison',
  'Zen Headbutt': 'Psychic',
  'Stone Edge': 'Rock',
  'Iron Head': 'Steel',
  Liquidation: 'Water',
  'Bug Buzz': 'Bug',
  'Dark Pulse': 'Dark',
  'Draco Meteor': 'Dragon',
  Thunderbolt: 'Electric',
  Moonblast: 'Fairy',
  'Focus Blast': 'Fighting',
  'Heat Wave': 'Fire',
  Hurricane: 'Flying',
  'Shadow Ball': 'Ghost',
  'Energy Ball': 'Grass',
  'Earth Power': 'Ground',
  'Ice Beam': 'Ice',
  'Hyper Voice': 'Normal',
  'Sludge Bomb': 'Poison',
  Psychic: 'Psychic',
  'Power Gem': 'Rock',
  'Flash Cannon': 'Steel',
  'Hydro Pump': 'Water',
  'Kowtow Cleave': 'Dark',
}

function DamagePokemonRow({
  name,
  leftLabel,
  spriteId,
  types,
}: {
  name: string
  leftLabel: string
  spriteId?: string
  types: string[]
}) {
  return (
    <div className="damage-mon-row">
      <p>
        {leftLabel} {name}
      </p>
      <div className="damage-mon-visuals">
        <SpriteWithFallback
          key={`damage-sprite-${name}-${spriteId ?? ''}`}
          name={name}
          spriteId={spriteId}
          spriteClassName="poke-sprite"
          badgeClassName="sprite-fallback-badge"
        />
        <div className="type-icons">
          {types.map((type) => (
            <img
              key={type}
              className="type-icon"
              src={TYPE_ICON_BY_TYPE[type]}
              alt={`${type} type`}
              loading="lazy"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SpriteWithFallback({
  name,
  spriteId,
  spriteClassName,
  badgeClassName,
  showBadge = true,
}: {
  name: string
  spriteId?: string
  spriteClassName: string
  badgeClassName: string
  showBadge?: boolean
}) {
  const resolvedSpriteId = spriteId ?? toSpriteId(name)
  const isMega = resolvedSpriteId.startsWith('mega') || resolvedSpriteId.startsWith('primal')

  const customMegaUrl = toCustomMegaSpriteUrl(resolvedSpriteId)
  const dex = toPokeAPIDex(resolvedSpriteId)
  const pokeapiUrl = dex ? toPokeAPISpriteUrl(dex) : null
  const placeholderSpriteUrl =
    'https://play.pokemonshowdown.com/sprites/itemicons/poke-ball.png'

  // Primary URL: custom mega if available, otherwise PokeAPI, otherwise placeholder
  const primaryUrl = customMegaUrl || pokeapiUrl || placeholderSpriteUrl

  // Start in the stage that matches which URL is actually being loaded as primary
  const initialStage: 'primary' | 'custom' | 'pokeapi' | 'placeholder' =
    customMegaUrl ? 'primary' : pokeapiUrl ? 'pokeapi' : 'placeholder'
  const [spriteStage, setSpriteStage] = useState<'primary' | 'custom' | 'pokeapi' | 'placeholder'>(initialStage)

  function handleSpriteError(event: SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget
    
    if (customMegaUrl && img.src === customMegaUrl) {
      // Custom mega failed, try PokeAPI
      if (pokeapiUrl) {
        img.src = pokeapiUrl
        setSpriteStage('pokeapi')
      } else {
        img.src = placeholderSpriteUrl
        setSpriteStage('placeholder')
      }
      return
    }

    if (pokeapiUrl && img.src === pokeapiUrl) {
      // PokeAPI failed, try placeholder
      img.src = placeholderSpriteUrl
      setSpriteStage('placeholder')
      return
    }

    if (img.src === placeholderSpriteUrl) {
      // Placeholder already loaded, no more fallbacks
      return
    }
  }

  return (
    <div className="sprite-fallback-wrap">
      <img
        className={spriteClassName}
        src={primaryUrl}
        alt={`${name} sprite`}
        loading="lazy"
        onError={handleSpriteError}
      />
      {showBadge && spriteStage === 'pokeapi' && isMega && (
        <span className={badgeClassName}>Mega</span>
      )}
      {showBadge && spriteStage === 'placeholder' && (
        <span className={badgeClassName}>sprite unavailable</span>
      )}
    </div>
  )
}

function SpeedBattleSlot({
  label,
  name,
  orientation,
}: {
  label: 'A' | 'B'
  name: string
  orientation: 'player' | 'opponent'
}) {
  return (
    <div className={`speed-slot ${orientation}`}>
      <div className="speed-hud">
        <span>{label}</span>
        <strong>{name}</strong>
      </div>
      <div className="speed-sprite-row">
        <SpriteWithFallback
          key={`speed-sprite-${label}-${name}`}
          name={name}
          spriteClassName={`battle-sprite ${orientation}`}
          badgeClassName="speed-fallback-badge"
          showBadge
        />
      </div>
    </div>
  )
}

function App() {
  const [userId] = useState<string>(getOrCreateUserId)
  const [progress, setProgress] = useState<ProgressStats>(loadProgress)
  const [deck, setDeck] = useState<FlashCard[]>(
    REQUIRE_CHAMPIONS_SOURCE ? [] : sampleDeck,
  )
  const [activeCard, setActiveCard] = useState<FlashCard | null>(() =>
    REQUIRE_CHAMPIONS_SOURCE ? null : getRandomCard(sampleDeck),
  )
  const [deckStatus, setDeckStatus] = useState<'loading' | 'ready' | 'error'>(
    REQUIRE_CHAMPIONS_SOURCE ? 'loading' : 'ready',
  )
  const [dataSourceLabel, setDataSourceLabel] = useState(
    REQUIRE_CHAMPIONS_SOURCE ? 'Loading Champions source...' : 'Local sample data',
  )
  const [deckError, setDeckError] = useState<string | null>(null)
  const [damageAnswer, setDamageAnswer] = useState('')
  const [speedAnswer, setSpeedAnswer] = useState<SpeedAnswer | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)

  useEffect(() => {
    let canceled = false

    const loadDeck = async () => {
      const result = await loadChampionsDeck()
      if (canceled) {
        return
      }

      if (result.ok) {
        setDeck(result.bundle.cards)
        setActiveCard(getRandomCard(result.bundle.cards))
        setDataSourceLabel(`Pokemon Champions (${result.bundle.sourceVersion})`)
        setDeckStatus('ready')
        setDeckError(null)
        return
      }

      if (REQUIRE_CHAMPIONS_SOURCE) {
        setDeck([])
        setActiveCard(null)
        setDeckStatus('error')
        setDataSourceLabel('Champions source not loaded')
        setDeckError(result.reason)
        return
      }

      setDeck(sampleDeck)
      setActiveCard(getRandomCard(sampleDeck))
      setDeckStatus('ready')
      setDataSourceLabel('Local sample fallback')
      setDeckError(result.reason)
    }

    void loadDeck()

    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    saveProgress(progress)
  }, [progress])

  const accuracy = useMemo(() => {
    if (progress.total === 0) {
      return 0
    }
    return Math.round((progress.correct / progress.total) * 100)
  }, [progress.correct, progress.total])

  function resetAnswerState() {
    setDamageAnswer('')
    setSpeedAnswer(null)
    setFeedback(null)
    setAnswered(false)
  }

  function goToNextCard() {
    setActiveCard(getRandomCard(deck))
    resetAnswerState()
  }

  function submitSpeedAnswer(answer: SpeedAnswer) {
    if (!activeCard || activeCard.type !== 'speed' || answered) {
      return
    }

    setSpeedAnswer(answer)

    const isCorrect = evaluateSpeedAnswer(activeCard, answer)
    const correct = getCorrectSpeedAnswer(activeCard)
    const correctText =
      correct === 'tie'
        ? 'It is a Speed tie'
        : correct === 'A'
          ? `${activeCard.pokemonA.name} is faster`
          : `${activeCard.pokemonB.name} is faster`
    setFeedback(isCorrect ? `Correct. ${correctText}.` : `Not quite. ${correctText}.`)

    setAnswered(true)
    setProgress((prev) => {
      const nextTotal = prev.total + 1
      const nextCorrect = prev.correct + (isCorrect ? 1 : 0)
      const nextStreak = isCorrect ? prev.streak + 1 : 0
      return {
        ...prev,
        total: nextTotal,
        correct: nextCorrect,
        streak: nextStreak,
        bestStreak: Math.max(prev.bestStreak, nextStreak),
        damageAttempts: prev.damageAttempts,
        speedAttempts: prev.speedAttempts + 1,
        lastCardId: activeCard.id,
        updatedAt: new Date().toISOString(),
      }
    })
  }

  function submitAnswer() {
    if (!activeCard || answered) {
      return
    }

    let isCorrect = false

    if (activeCard.type === 'damage') {
      const parsed = Number.parseFloat(damageAnswer)
      if (Number.isNaN(parsed)) {
        setFeedback('Enter a valid damage percent, for example 67.5')
        return
      }

      isCorrect = evaluateDamageAnswer(activeCard, parsed)
      setFeedback(
        isCorrect
          ? `Correct. Expected around ${activeCard.expectedMin.toFixed(1)}% to ${activeCard.expectedMax.toFixed(1)}%`
          : `Not quite. Correct range is ${activeCard.expectedMin.toFixed(1)}% to ${activeCard.expectedMax.toFixed(1)}%`,
      )
    } else {
      setFeedback('Choose A, B, or tie to reveal the answer.')
      return
    }

    setAnswered(true)
    setProgress((prev) => {
      const nextTotal = prev.total + 1
      const nextCorrect = prev.correct + (isCorrect ? 1 : 0)
      const nextStreak = isCorrect ? prev.streak + 1 : 0
      return {
        ...prev,
        total: nextTotal,
        correct: nextCorrect,
        streak: nextStreak,
        bestStreak: Math.max(prev.bestStreak, nextStreak),
        damageAttempts: prev.damageAttempts + 1,
        speedAttempts: prev.speedAttempts,
        lastCardId: activeCard.id,
        updatedAt: new Date().toISOString(),
      }
    })
  }

  function resetProgress() {
    setProgress(getInitialProgress())
    resetAnswerState()
    setActiveCard(getRandomCard(deck))
  }

  if (!activeCard) {
    return (
      <main className="app-shell">
        <header className="hero">
          <p className="eyebrow">Competitive Pokemon VGC</p>
          <h1>Flashcard Dojo</h1>
          <p className="subtitle">
            Champions data mode is active. A valid champions-deck.json is required
            before training starts.
          </p>
        </header>

        <section className="card-panel blocked">
          <p className="card-type">Data Source Gate</p>
          <h3>
            {deckStatus === 'loading'
              ? 'Loading Champions deck...'
              : 'No valid Pokemon Champions deck found'}
          </h3>
          {deckError && <p className="meta">Validation error: {deckError}</p>}
          <p className="meta">
            Replace public/champions-deck.json with official Pokemon Champions
            export data that follows the schema.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Competitive Pokemon VGC</p>
        <h1>Flashcard Dojo</h1>
        <p className="subtitle">
          Train damage ranges and speed control reads with account-free local
          progress.
        </p>
        <p className="source-badge">Data Source: {dataSourceLabel}</p>
      </header>

      <section className="stats-grid">
        <article>
          <h2>Anonymous User</h2>
          <p className="mono">{userId || 'creating...'}</p>
        </article>
        <article>
          <h2>Session Accuracy</h2>
          <p className="big">{accuracy}%</p>
        </article>
        <article>
          <h2>Streak</h2>
          <p className="big">{progress.streak}</p>
        </article>
        <article>
          <h2>Best Streak</h2>
          <p className="big">{progress.bestStreak}</p>
        </article>
      </section>

      <section className="card-panel">
        <p className="card-type">
          {activeCard.type === 'damage'
            ? 'Damage Percent Card'
            : 'Speed Comparison Card'}
        </p>

        <div className={`tcg-flip-scene ${answered ? 'is-flipped' : ''}`}>
          <div className="tcg-flip-card">
            <article className="tcg-face tcg-front">
              {activeCard.type === 'damage' ? (
                <>
                  <div className="tcg-artwork">
                    {(() => {
                      const attackerName =
                        activeCard.attackerInfo?.name ??
                        extractAttackerName(activeCard.attacker)
                      const defenderName =
                        activeCard.defenderInfo?.name ??
                        extractDefenderName(activeCard.defender)
                      const moveType = TYPE_BY_MOVE[activeCard.move]
                      const attackerTypes =
                        activeCard.attackerInfo?.types ?? (moveType ? [moveType] : [])
                      const defenderTypes = activeCard.defenderInfo?.types ?? []

                      return (
                        <>
                          <DamagePokemonRow
                            key={`atk-${activeCard.id}-${attackerName}-${activeCard.attackerInfo?.spriteId ?? ''}`}
                            name={attackerName}
                            leftLabel={activeCard.attacker.replace(attackerName, '').trim()}
                            spriteId={activeCard.attackerInfo?.spriteId}
                            types={attackerTypes}
                          />
                          <DamagePokemonRow
                            key={`def-${activeCard.id}-${defenderName}-${activeCard.defenderInfo?.spriteId ?? ''}`}
                            name={defenderName}
                            leftLabel={activeCard.defender.replace(defenderName, '').trim()}
                            spriteId={activeCard.defenderInfo?.spriteId}
                            types={defenderTypes}
                          />
                        </>
                      )
                    })()}
                  </div>
                  <div className="tcg-effect-box">
                    <h3>
                      What percent damage does{' '}
                      <span className="move-inline">
                        <strong>{activeCard.move}</strong>
                        {TYPE_BY_MOVE[activeCard.move] && (
                          <img
                            className="type-icon"
                            src={TYPE_ICON_BY_TYPE[TYPE_BY_MOVE[activeCard.move]]}
                            alt={`${TYPE_BY_MOVE[activeCard.move]} type`}
                            loading="lazy"
                          />
                        )}
                      </span>{' '}
                      from{' '}
                      <strong>
                        {activeCard.attackerInfo?.name ??
                          extractAttackerName(activeCard.attacker)}
                      </strong>{' '}
                      do to{' '}
                      <strong>
                        {activeCard.defenderInfo?.name ??
                          extractDefenderName(activeCard.defender)}
                      </strong>
                      ?
                    </h3>
                    <p className="meta">{activeCard.formatNote}</p>

                    <label htmlFor="damage-answer">Your estimate (%)</label>
                    <input
                      id="damage-answer"
                      type="number"
                      inputMode="decimal"
                      value={damageAnswer}
                      onChange={(event) => setDamageAnswer(event.target.value)}
                      placeholder="e.g. 72.5"
                      disabled={answered}
                    />
                  </div>
                </>
              ) : (
                <>
                  <h3>Who has the higher base Speed?</h3>
                  <p className="meta">{activeCard.context}</p>

                  <div className="speed-battlefield">
                    <SpeedBattleSlot
                      label="A"
                      name={activeCard.pokemonA.name}
                      orientation="player"
                    />
                    <SpeedBattleSlot
                      label="B"
                      name={activeCard.pokemonB.name}
                      orientation="opponent"
                    />
                  </div>

                  <div className="speed-options">
                    <button
                      type="button"
                      className={speedAnswer === 'A' ? 'selected' : ''}
                      onClick={() => submitSpeedAnswer('A')}
                      disabled={answered}
                    >
                      Choose A (player side)
                    </button>
                    <button
                      type="button"
                      className={speedAnswer === 'B' ? 'selected' : ''}
                      onClick={() => submitSpeedAnswer('B')}
                      disabled={answered}
                    >
                      Choose B (opponent side)
                    </button>
                    <button
                      type="button"
                      className={speedAnswer === 'tie' ? 'selected' : ''}
                      onClick={() => submitSpeedAnswer('tie')}
                      disabled={answered}
                    >
                      Speed tie
                    </button>
                  </div>
                </>
              )}
            </article>

            <article className="tcg-face tcg-back">
              <p className="answer-ribbon">Answer Reveal</p>
              {activeCard.type === 'damage' ? (
                <>
                  <h3>
                    <strong>{activeCard.expectedMin.toFixed(1)}%</strong> to{' '}
                    <strong>{activeCard.expectedMax.toFixed(1)}%</strong>
                  </h3>
                  <p className="meta">
                    Your estimate:{' '}
                    <strong>
                      {damageAnswer.trim() ? `${damageAnswer.trim()}%` : 'not provided'}
                    </strong>
                  </p>
                  {feedback && <p className="feedback in-card">{feedback}</p>}
                </>
              ) : (
                <>
                  <h3>{feedback ?? 'Answer submitted.'}</h3>
                  <p className="meta">
                    A <strong>{activeCard.pokemonA.name}</strong>: Base Spe{' '}
                    <strong>{activeCard.pokemonA.baseSpeed}</strong>
                  </p>
                  <p className="meta">
                    B <strong>{activeCard.pokemonB.name}</strong>: Base Spe{' '}
                    <strong>{activeCard.pokemonB.baseSpeed}</strong>
                  </p>
                </>
              )}
            </article>
          </div>
        </div>

        <div className="actions">
          {activeCard.type === 'damage' && (
            <button type="button" onClick={submitAnswer} disabled={answered}>
              Submit
            </button>
          )}
          <button type="button" onClick={goToNextCard}>
            Next Card
          </button>
          <button type="button" className="ghost" onClick={resetProgress}>
            Reset Progress
          </button>
        </div>

        {feedback && !answered && <p className="feedback">{feedback}</p>}
      </section>

      <footer className="summary">
        <p>Total Attempts: {progress.total}</p>
        <p>Damage Cards: {progress.damageAttempts}</p>
        <p>Speed Cards: {progress.speedAttempts}</p>
        <p>Loaded Cards: {deck.length}</p>
        <p>Deck Builder: planned for next milestone</p>
      </footer>
    </main>
  )
}

export default App
