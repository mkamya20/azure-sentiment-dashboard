import { useCallback, useEffect, useRef, useState } from 'react'

const LOADING = 'loading'
const CONNECTED = 'connected'
const FAILED = 'failed'

export default function App() {
  const [state, setState] = useState(LOADING)
  const [review, setReview] = useState('')
  const [result, setResult] = useState(null)

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

  // test function to handle form submission
  function handleSubmit(event) {
    event.preventDefault()

    if (!review.trim()) return

    // Temporary demonstration result, not real AI analysis.
    setResult({
      text: review.trim(),
      sentiment: 'Pending AI analysis',
    })
  }

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

      <section>
        <h2>Submit a Customer Review</h2>

        <form onSubmit={handleSubmit}>
          <label htmlFor="review">Customer review</label>

          <textarea
            id="review"
            rows="5"
            value={review}
            onChange={(event) => {
              setReview(event.target.value)
              setResult(null)
            }}
            placeholder="Example: The service was excellent, and the staff were very helpful."
            required
          />

          <button type="submit">Submit Review</button>
        </form>

        {result && (
          <section aria-live="polite">
            <h3>Review Submitted</h3>
            <p>{result.text}</p>
            <p>
              Sentiment: <strong>{result.sentiment}</strong>
            </p>
            <p>
              This is a temporary result. Real AI analysis will be connected
              in a later step.
            </p>
          </section>
        )}
      </section>
    </main>
  )
}
