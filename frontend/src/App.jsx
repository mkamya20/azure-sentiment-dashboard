import { useCallback, useEffect, useRef, useState } from 'react'

import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const LOADING = 'loading'
const CONNECTED = 'connected'
const FAILED = 'failed'

const SENTIMENT_LABELS = {
  positive: 'Positive',
  negative: 'Negative',
  neutral: 'Neutral',
  mixed: 'Mixed',
}

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
  const [selectedSentiment, setSelectedSentiment] = useState('All')
  const [csvReviews, setCsvReviews] = useState([])
  const [csvError, setCsvError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
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

  // Send one review to Azure AI Language through the backend.
  async function handleSubmit(event) {
    event.preventDefault()

    const reviewText = review.trim()
    if (!reviewText || submitting) return

    setSubmitting(true)
    setSubmitError('')
    setResult(null)

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewText }),
      })

      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }

      const label = SENTIMENT_LABELS[body?.sentiment]
      const confidence = body?.confidence
      const scoresAreNumbers =
        confidence &&
        ['positive', 'neutral', 'negative'].every(
          (key) => typeof confidence[key] === 'number'
        )

      if (!response.ok || !label || !scoresAreNumbers) {
        setSubmitError(
          body?.error || `Analysis failed (HTTP ${response.status}).`
        )
        return
      }

      const analyzedReview = {
        id: Date.now(),
        text: body.reviewText || reviewText,
        sentiment: label,
        confidence: {
          positive: confidence.positive,
          neutral: confidence.neutral,
          negative: confidence.negative,
        },
      }

      setReviews((previousReviews) => [analyzedReview, ...previousReviews])
      setResult(analyzedReview)
      setReview('')
    } catch {
      setSubmitError('Could not reach the API. Start the backend, then try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Read customer reviews from a CSV file
  function handleCsvUpload(event) {
    const file = event.target.files[0]

    setCsvReviews([])
    setCsvError('')

    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('Please select a CSV file.')
      return
    }

    const reader = new FileReader()

    reader.onload = (e) => {
      const content = e.target.result
      const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')

      if (lines.length < 2) {
        setCsvError('The CSV file must contain a header and at least one review.')
        return
      }

      const headers = lines[0]
        .split(',')
        .map((header) => header.trim().replace(/^"|"$/g, '').toLowerCase())

      const reviewColumn = headers.findIndex(
        (header) => header === 'review' || header === 'text' || header === 'feedback'
      )

      if (reviewColumn === -1) {
        setCsvError('Your CSV needs a column named review, text, or feedback.')
        return
      }

      const loadedReviews = lines
        .slice(1)
        .map((line, index) => {
          const values = line.split(',')
          const text = values[reviewColumn]?.trim().replace(/^"|"$/g, '')

          return text
            ? { id: `${file.name}-${index}`, text }
            : null
        })
        .filter(Boolean)

      if (loadedReviews.length === 0) {
        setCsvError('No customer reviews were found in the file.')
        return
      }

      setCsvReviews(loadedReviews)
    }

    reader.onerror = () => {
      setCsvError('There was a problem reading the file.')
    }

    reader.readAsText(file)
  }
  // Calculate dashboard statistics
  const totalReviews = reviews.length

  const countSentiment = (sentiment) =>
    reviews.filter((item) => item.sentiment === sentiment).length

  const percentage = (sentiment) =>
    totalReviews === 0
      ? 0
      : Math.round((countSentiment(sentiment) / totalReviews) * 100)

  // Prepare the data for the charts
  const sentimentData = ['Positive', 'Negative', 'Neutral', 'Mixed'].map(
    (sentiment) => ({
      name: sentiment,
      value: countSentiment(sentiment),
    })
  )

  const barData = sentimentData

  // Filter reviews based on the selected sentiment
  const filteredReviews =
    selectedSentiment === 'All'
      ? reviews
      : reviews.filter(
          (item) => item.sentiment === selectedSentiment
        )

  return (
    <main>
      <h1>Customer Sentiment Dashboard</h1>
      <p className="intro">
        Review customer feedback and monitor sentiment trends.
        A submitted review is analyzed by the API and kept in this browser until you refresh the page.
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
              setSubmitError('')
            }}
            placeholder="Example: The service was excellent, and the staff were very helpful."
            required
          />

          <button type="submit" disabled={submitting}>
            {submitting ? 'Analyzing...' : 'Submit Review'}
          </button>
        </form>

        {submitting && <p>Analyzing...</p>}
        {submitError && <p role="alert">{submitError}</p>}

          {/* CSV upload */}
          <section>
            <h2>Upload Customer Reviews</h2>

            <p>Select a CSV file containing a review, text, or feedback column.</p>

            <input
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
            />

            {csvError && <p role="alert">{csvError}</p>}

            {csvReviews.length > 0 && (
              <div>
                <h3>CSV Preview</h3>

                <p>Reviews found: {csvReviews.length}</p>

                {csvReviews.map((item) => (
                  <article key={item.id} className="review-item">
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

        {/* Submission confirmation */}
        {result && (
          <section aria-live="polite">
            <h3>Review Submitted</h3>
            <p>{result.text}</p>
            <p>
              Sentiment: <strong>{result.sentiment}</strong>
            </p>
            <p>
              Confidence: positive {result.confidence.positive}, neutral{' '}
              {result.confidence.neutral}, negative {result.confidence.negative}
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

          {/* Pie chart */}
          <h3>Sentiment Distribution</h3>

          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sentimentData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                />

                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

        {/* Bar chart */}
        <h3>Review Counts by Sentiment</h3>

        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name="Number of Reviews" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Review history */}
      <section>
        <h2>Review History</h2>

        <label htmlFor="sentiment-filter">Filter by sentiment:</label>

        <select
          id="sentiment-filter"
          value={selectedSentiment}
          onChange={(event) => setSelectedSentiment(event.target.value)}
        >
          <option value="All">All Reviews</option>
          <option value="Positive">Positive</option>
          <option value="Negative">Negative</option>
          <option value="Neutral">Neutral</option>
          <option value="Mixed">Mixed</option>
          <option value="Pending">Pending</option>
        </select>

        {filteredReviews.length === 0 && (
          <p>No reviews match this filter.</p>
        )}

        {filteredReviews.map((item) => (
          <article className="review-item" key={item.id}>
            <p>{item.text}</p>

            <p>
              Sentiment: <strong>{item.sentiment}</strong>
            </p>
            {item.confidence && (
              <p>
                Confidence: positive {item.confidence.positive}, neutral{' '}
                {item.confidence.neutral}, negative {item.confidence.negative}
              </p>
            )}

            <hr />
          </article>
        ))}
      </section>
    </main>
  )
}

// continue to update with more implementation as needed
