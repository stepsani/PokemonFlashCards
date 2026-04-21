export type ProgressStats = {
  total: number
  correct: number
  streak: number
  bestStreak: number
  damageAttempts: number
  speedAttempts: number
  lastCardId: string | null
  updatedAt: string
}

const USER_KEY = 'vgc-flashcards-user-id'
const PROGRESS_KEY = 'vgc-flashcards-progress-v1'

export function getOrCreateUserId(): string {
  const existing = localStorage.getItem(USER_KEY)
  if (existing) {
    return existing
  }

  const randomPart = Math.random().toString(36).slice(2, 10)
  const created = `anon-${Date.now().toString(36)}-${randomPart}`
  localStorage.setItem(USER_KEY, created)
  return created
}

export function getInitialProgress(): ProgressStats {
  return {
    total: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    damageAttempts: 0,
    speedAttempts: 0,
    lastCardId: null,
    updatedAt: new Date().toISOString(),
  }
}

export function loadProgress(): ProgressStats {
  const raw = localStorage.getItem(PROGRESS_KEY)
  if (!raw) {
    return getInitialProgress()
  }

  try {
    const parsed = JSON.parse(raw) as ProgressStats
    return {
      ...getInitialProgress(),
      ...parsed,
    }
  } catch {
    return getInitialProgress()
  }
}

export function saveProgress(next: ProgressStats): void {
  localStorage.setItem(
    PROGRESS_KEY,
    JSON.stringify({
      ...next,
      updatedAt: new Date().toISOString(),
    }),
  )
}
