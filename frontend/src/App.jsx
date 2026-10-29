import { useCallback, useEffect, useRef, useState } from 'react'

const LOADING = 'loading'
const CONNECTED = 'connected'
const FAILED = 'failed'

// add sample reviews
const sampleReviews = [
  { id: 1, text: 'Excellent service and very helpful staff!', sentiment: 'Positive' },
  { id: 2, text: 'My order arrived late and damaged.', sentiment: 'Negative' },
  { id: 3, text: 'The product arrived yesterday.', sentiment: 'Neutral' },
  { id: 4, text: 'Good quality, but shipping was disappointing.', sentiment: 'Mixed' },
  { id: 5, text: 'I am very happy with my purchase.', sentiment: 'Positive' },
  { id: 6, text: 'Customer support never responded.', sentiment: 'Negative' },
  { id: 7, text: 'The product works as expected.', sentiment: 'Neutral' },
  { id: 8, text: 'Great product and fast delivery!', sentiment: 'Positive' },
]

export default function App() {
  const [state, setState] = useState(LOADING)
  const [review, setReview] = useState('')
  const [result, setResult] = useState(null)
  const [reviews, setReviews] = useState(sampleReviews)
  const requestId = useRef(0)

  // Check whether the backend API is available
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

  // Add a submitted review to the dashboard
  function handleSubmit(event) {
    event.preventDefault()

    if (!review.trim()) return

    const newReview = {
      id: Date.now(),
      text: review.trim(),
      sentiment: 'Pending',
    }
    // Add the new review to the beginning of the list
    setReviews((previousReviews) => [newReview, ...previousReviews])

    // Display a submission confirmation
    setResult({
      text: newReview.text,
      sentiment: newReview.sentiment,
    })
    // Clear the text box
    setReview('')
  }

  // Calculate dashboard statistics
  const totalReviews = reviews.length

  const countSentiment = (sentiment) =>
    reviews.filter((item) => item.sentiment === sentiment).length

  const percentage = (sentiment) =>
    totalReviews === 0
      ? 0
      : Math.round((countSentiment(sentiment) / totalReviews) * 100)

  return (
    <main>
      <h1>Customer Sentiment Dashboard</h1>
      <p className="intro">
        Review customer feedback and monitor sentiment trends.
        Review submission, CSV upload, charts, and history will be added in a later milestone.
        This page checks whether the API is reachable.
      </p>

      {/* Backend connection status */}
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

      {/* Review submission form */}
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

        {/* Submission confirmation */}
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

      {/* Sentiment overview */}
      <section>
        <h2>Sentiment Overview</h2>

        <p>
          <strong>Total Reviews:</strong> {totalReviews}
        </p>

        <div className="sentiment-summary">
          <p>
            <strong>Positive:</strong> {countSentiment('Positive')} (
            {percentage('Positive')}%)
          </p>

          <p>
            <strong>Negative:</strong> {countSentiment('Negative')} (
            {percentage('Negative')}%)
          </p>

          <p>
            <strong>Neutral:</strong> {countSentiment('Neutral')} (
            {percentage('Neutral')}%)
          </p>

          <p>
            <strong>Mixed:</strong> {countSentiment('Mixed')} (
            {percentage('Mixed')}%)
          </p>

          <p>
            <strong>Pending:</strong> {countSentiment('Pending')}
          </p>
        </div>
      </section>

      {/* Review history */}
      <section>
        <h2>Review History</h2>

        {reviews.length === 0 && <p>No reviews have been submitted yet.</p>}

        {reviews.map((item) => (
          <article className="review-item" key={item.id}>
            <p>{item.text}</p>

            <p>
              Sentiment: <strong>{item.sentiment}</strong>
            </p>

            <hr />
          </article>
        ))}
      </section>
    </main>
  )
}
