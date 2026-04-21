# Pokemon Flashcards (VGC)

A responsive web flashcard simulator for competitive Pokemon VGC practice.

## MVP Features

- Two question types:
  - Damage estimate cards: predict damage percentage range.
  - Speed comparison cards: decide which Pokemon is faster (or tie).
- Local progress tracking with no account system.
- Anonymous local user id per browser/device.
- Mobile + desktop responsive layout.
- Extension-ready structure for future deck builder support.

## Champions Data Requirement

This app now enforces a Champions source contract by default:

- File required: `public/champions-deck.json`
- Source must be exactly: `pokemon-champions`
- If the file is missing/invalid/empty, training is blocked in the UI.

Expected top-level shape:

```json
{
  "source": "pokemon-champions",
  "sourceVersion": "string",
  "generatedAt": "ISO timestamp string",
  "notes": "optional",
  "cards": [
    {
      "id": "d-1",
      "type": "damage",
      "attacker": "...",
      "move": "...",
      "defender": "...",
      "expectedMin": 45.2,
      "expectedMax": 53.7,
      "formatNote": "optional"
    },
    {
      "id": "s-1",
      "type": "speed",
      "pokemonA": { "name": "...", "nature": "...", "speedStat": 150 },
      "pokemonB": { "name": "...", "nature": "...", "speedStat": 149 },
      "context": "optional"
    }
  ]
}
```

Development override (not recommended for production):

- Set `VITE_REQUIRE_CHAMPIONS_SOURCE=false` to allow sample-data fallback.

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS integration via `@tailwindcss/vite` (custom CSS is also used)
- ESLint + TypeScript build checks

## Project Structure

- `src/domain`: card models and answer evaluation logic.
- `src/data`: starter sample deck.
- `src/data/championsDeck.ts`: strict Champions deck loader and schema validation.
- `src/features/progress`: local storage for user id and progress.
- `src/features/cards`: reserved for future card-system expansion.
- `src/components` and `src/pages`: reserved for upcoming UI decomposition.

## Run Locally

```bash
npm install
npm run dev
```

Dev server default URL: `http://localhost:5173`.

## Validate

```bash
npm run build
npm run lint
```

## Next Milestones

1. Replace sample cards with real calculation-backed generation using Smogon data/calc packages.
2. Add per-deck progress and spaced repetition scheduling.
3. Build local custom deck creator (JSON export/import first, cloud sharing later).
