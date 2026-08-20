export const AUTH_STORAGE_KEY = 'hivelog-auth-v1'

/** Demo accounts for local testing only — not real security. */
export const TEST_USERS = [
  {
    username: 'test',
    password: 'test123',
    displayName: 'Test Beekeeper',
  },
  {
    username: 'demo',
    password: 'demo',
    displayName: 'Demo User',
  },
]

export function loadSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (!session?.username) return null
    return session
  } catch {
    return null
  }
}

export function persistSession(session) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function login(username, password) {
  const user = String(username || '')
    .trim()
    .toLowerCase()
  const pass = String(password || '')

  const match = TEST_USERS.find(
    (u) => u.username === user && u.password === pass,
  )

  if (!match) {
    return { ok: false, message: 'Invalid username or password.' }
  }

  const session = {
    username: match.username,
    displayName: match.displayName,
    loggedInAt: new Date().toISOString(),
  }
  persistSession(session)
  return { ok: true, session }
}

export function logout() {
  clearSession()
}
