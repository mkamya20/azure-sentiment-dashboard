import { useCallback, useEffect, useRef, useState } from 'react'

const LOADING = 'loading'
const CONNECTED = 'connected'
const FAILED = 'failed'

export default function App() {
  const [state, setState] = useState(LOADING)
  const requestId = useRef(0)

  const checkHealth = useCallback(async () => {
    const currentRequest = requestId.current + 1
    requestId.current = currentRequest
    setState(LOADING)

    try {
      const response = await fetch('/api/health')
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }

      if (currentRequest !== requestId.current) {
        return
      }

      if (response.ok && body?.status === 'ok') {
        setState(CONNECTED)
        return
      }

      setState(FAILED)
    } catch {
      if (currentRequest !== requestId.current) {
        return
      }
      setState(FAILED)
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  return (
    <main>
      <h1>Customer Sentiment Dashboard</h1>
      <p className="intro">
        Review submission, CSV upload, charts, and history will be added in a later milestone.
        This page checks whether the API is reachable.
      </p>

      <section className="status" aria-live="polite">
        {state === LOADING && <p>Checking backend connection…</p>}
        {state === CONNECTED && <p>Backend connected</p>}
        {state === FAILED && (
          <p>Connection failed. Start the API, then try again.</p>
        )}
        {state !== LOADING && (
          <button type="button" onClick={checkHealth}>
            Retry
          </button>
        )}
      </section>
    </main>
  )
}
