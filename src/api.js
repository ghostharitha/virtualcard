const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '')

export async function api(path, { method = 'GET', data, token } = {}) {
  if (!baseUrl) throw new Error('Set EXPO_PUBLIC_API_URL in .env and restart the app.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(data !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: 'Bearer ' + token }),
      },
      ...(data !== undefined && { body: JSON.stringify(data) }),
      signal: controller.signal,
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(result.error || 'The server could not complete this action.')
      error.status = response.status
      throw error
    }
    return result
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The connection timed out. Try again.')
    if (error instanceof TypeError) throw new Error('Could not reach the server. Check your connection.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
