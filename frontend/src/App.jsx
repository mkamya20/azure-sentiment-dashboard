import { useCallback, useEffect, useRef, useState } from 'react'
import $ from 'jquery'

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
  Rectangle,
} from 'recharts'

import Papa from 'papaparse'

const SENTIMENT_LABELS = {
  positive: 'Positive',
  negative: 'Negative',
  neutral: 'Neutral',
  mixed: 'Mixed',
}

const NAV_LINKS = [
  ['overview', 'Overview'],
  ['insights', 'Insights'],
  ['submit', 'Submit'],
  ['upload', 'Upload'],
  ['history', 'History'],
]

function savedReview(item) {
  return {
    id: item.id,
    text: item.reviewText,
    sentiment: SENTIMENT_LABELS[item.sentiment] || item.sentiment,
    confidence: item.confidence,
  }
}

function formatScore(value) {
  return `${Math.round(value * 100)}%`
}

function scrollToId(id) {
  const target = document.getElementById(id)
  if (!target) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  $('html, body')
    .stop()
    .animate({ scrollTop: $(target).offset().top - 78 }, reduceMotion ? 0 : 520)
}

export default function App() {
  const [review, setReview] = useState('')
  const [result, setResult] = useState(null)
  const [reviews, setReviews] = useState([])
  const [reviewsError, setReviewsError] = useState('')
  const [selectedSentiment, setSelectedSentiment] = useState('All')
  const [csvReviews, setCsvReviews] = useState([])
  const [csvError, setCsvError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [activeSection, setActiveSection] = useState('overview')
  const [menuOpen, setMenuOpen] = useState(false)

  const reviewsRequest = useRef(0)

  const loadReviews = useCallback(async () => {
    const request = reviewsRequest.current + 1
    reviewsRequest.current = request

    try {
      const response = await fetch('/api/reviews')
      let data = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (request !== reviewsRequest.current) return

      if (!response.ok || !Array.isArray(data)) {
        setReviewsError(data?.error || 'Saved reviews could not be loaded.')
        return
      }

      const saved = data.filter((item) => item.reviewText).map(savedReview)
      setReviews(saved)
      setReviewsError('')
    } catch {
      if (request !== reviewsRequest.current) return
      setReviewsError('Saved reviews could not be loaded. Start the API, then refresh.')
    }
  }, [])

  useEffect(() => {
    loadReviews()
  }, [loadReviews])

  useEffect(() => {
    const sections = NAV_LINKS.map(([id]) => id)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onScroll = () => {
      const y = $(window).scrollTop()
      $('body').toggleClass('nav-scrolled', y > 8)

      let current = sections[0]
      sections.forEach((id) => {
        const section = document.getElementById(id)
        if (section && section.offsetTop - 110 <= y) current = id
      })
      setActiveSection((previous) => (previous === current ? previous : current))
    }

    const onMove = (event) => {
      document.documentElement.style.setProperty('--spot-x', `${event.clientX}px`)
      document.documentElement.style.setProperty('--spot-y', `${event.clientY}px`)
    }

    const onButtonClick = (event) => {
      const button = event.target.closest?.('.btn')
      if (!button || button.disabled || reduceMotion) return
      const ripple = $('<span class="ripple" aria-hidden="true"></span>')
      ripple.css({
        position: 'fixed',
        left: `${event.clientX}px`,
        top: `${event.clientY}px`,
        zIndex: 80,
      })
      $('body').append(ripple)
      window.setTimeout(() => ripple.remove(), 650)
    }

    $(window).on('scroll.dashboard', onScroll)
    $(document).on('mousemove.dashboard', onMove)
    $(document).on('click.dashboard', '.btn', onButtonClick)
    onScroll()

    return () => {
      $(window).off('.dashboard')
      $(document).off('.dashboard')
      $('body').removeClass('nav-scrolled')
    }
  }, [])

  function handleNavClick(event) {
    event.preventDefault()
    const id = event.currentTarget.getAttribute('href').slice(1)
    setMenuOpen(false)
    setActiveSection(id)
    scrollToId(id)
  }

  function focusSentiment(sentiment) {
    setSelectedSentiment(sentiment)
    scrollToId('history')
  }

  // Add a submitted review to the dashboard

async function handleSubmit(event) {
  event.preventDefault()
  const reviewText = review.trim()
  if (!reviewText || submitting) return

  setSubmitting(true)
  setSubmitError('')
  setResult(null)

  try {
    // Send the review to the Azure Functions backend.
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reviewText }),
    })

    // Get the sentiment analysis result.
    const data = await response.json()
    const sentiment = SENTIMENT_LABELS[data?.sentiment]
    const confidence = data?.confidence

    if (
      !response.ok ||
      !sentiment ||
      !confidence ||
      !['positive', 'neutral', 'negative'].every(
        (key) => typeof confidence[key] === 'number'
      )
    ) {
      setSubmitError(data?.error || 'Sentiment analysis failed.')
      return
    }

    // Add the analyzed review to the dashboard.
    const newReview = {
      id: data.id || Date.now(),
      text: data.reviewText || reviewText,
      sentiment,
      confidence,
    }

    reviewsRequest.current += 1
    setReviews((previousReviews) => [newReview, ...previousReviews])
    setResult(newReview)
    setReview('')
  } catch {
    setSubmitError('Could not reach the API. Check that the backend is running.')
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

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,

      complete: (results) => {
        const headers = results.meta.fields || []

        // Find the column containing the customer reviews.
        const reviewColumn = headers.find((header) =>
          ['review_text', 'review', 'text', 'feedback'].includes(
            header.trim().toLowerCase()
          )
        )

        if (!reviewColumn) {
          setCsvError(
            'Your CSV needs a column named review_text, review, text, or feedback.'
          )
          return
        }

        // Extract the reviews from the selected column.
        const loadedReviews = results.data
          .map((row, index) => {
            const text = row[reviewColumn]?.trim()

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
      },

      error: () => {
        setCsvError('There was a problem reading the file.')
      },
    })
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
  const sentimentColors = {
    Positive: '#1f8a4c',
    Negative: '#c44536',
    Neutral: '#3e5f8a',
    Mixed: '#7a4e9a',
  }

  const sentimentData = ['Positive', 'Negative', 'Neutral', 'Mixed'].map(
    (sentiment) => ({
      name: sentiment,
      value: countSentiment(sentiment),
      fill: sentimentColors[sentiment],
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

  const statCards = [
    { key: 'All', label: 'Total', value: totalReviews, hint: 'Reviews in view', accent: '#002d72' },
    { key: 'Positive', label: 'Positive', value: countSentiment('Positive'), hint: `${percentage('Positive')}%`, accent: '#1f8a4c' },
    { key: 'Negative', label: 'Negative', value: countSentiment('Negative'), hint: `${percentage('Negative')}%`, accent: '#c44536' },
    { key: 'Neutral', label: 'Neutral', value: countSentiment('Neutral'), hint: `${percentage('Neutral')}%`, accent: '#3e5f8a' },
    { key: 'Mixed', label: 'Mixed', value: countSentiment('Mixed'), hint: `${percentage('Mixed')}%`, accent: '#7a4e9a' },
  ]

  const chartTooltip = {
    contentStyle: {
      background: '#001833',
      border: '1px solid rgba(247, 105, 0, 0.55)',
      borderRadius: 12,
      color: '#fff',
    },
    itemStyle: { color: '#fff' },
    labelStyle: { color: '#f76900' },
  }

  return (
    <div className="app-shell">
      <header className="navbar">
        <a className="brand" href="#overview" onClick={handleNavClick}>
          
          <span>
            <strong>Customer Sentiment</strong>
            <small>Live dashboard</small>
          </span>
        </a>

        <button
          type="button"
          className="btn nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>

        <nav id="site-nav" className={menuOpen ? 'nav-links is-open' : 'nav-links'}>
          {NAV_LINKS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className={activeSection === id ? 'is-active' : undefined}
              onClick={handleNavClick}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main>
      <section id="overview" className="hero">
      <p className="eyebrow">Azure AI Language</p>
      <h1>Customer Sentiment Dashboard</h1>
      <p className="intro">
        Submit customer reviews, analyze sentiment using Azure AI,
        and review the saved results. A refresh loads the reviews stored in Cosmos DB.
      </p>
      
      <p className="section-kicker alert">Pending reviews: {countSentiment('Pending')}</p>
      </section>

      <section className="stat-grid" aria-label="Sentiment totals">
        {statCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={selectedSentiment === card.key ? 'stat-card is-selected' : 'stat-card'}
            style={{ '--accent': card.accent }}
            onClick={() => focusSentiment(card.key)}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.hint}</small>
          </button>
        ))}
      </section>
      <section id="insights" className="panel">
        <h2>Sentiment Insights</h2>
        <p className="section-kicker">
          Distribution across the reviews currently on the dashboard.
        </p>
        <div className="chart-grid">
          <div className="chart-card">
            <h3>Distribution</h3>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={96}
                    paddingAngle={3}
                    stroke="#fff"
                  />
                  <Tooltip {...chartTooltip} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="chart-card">
            <h3>Review counts</h3>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d5deea" />
                  <XAxis dataKey="name" stroke="#5c6b80" />
                  <YAxis allowDecimals={false} stroke="#5c6b80" />
                  <Tooltip {...chartTooltip} />
                  <Bar
                    dataKey="value"
                    name="Reviews"
                    radius={[8, 8, 0, 0]}
                    shape={(props) => (
                      <Rectangle
                        {...props}
                        radius={[8, 8, 0, 0]}
                        fill={sentimentColors[props.payload.name]}
                      />
                    )}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <div className="workspace">
        <section id="submit" className="panel">
          <h2>Submit a Review</h2>
          <p className="section-kicker">One review is analyzed and saved.</p>
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
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Analyzing...' : 'Submit Review'}
            </button>
          </form>
          {submitError && <p className="alert" role="alert">{submitError}</p>}
        </section>

        <section id="upload" className="panel">
          <h2>Upload Reviews</h2>
          <p className="section-kicker">
            Select a CSV file containing a review, text, or feedback column.
          </p>
          <label className="dropzone">
            <input type="file" accept=".csv" onChange={handleCsvUpload} />
            <strong>Choose a CSV file</strong>
            <span>review_text, review, text, or feedback</span>
          </label>
          {csvError && <p className="alert" role="alert">{csvError}</p>}
          {csvReviews.length > 0 && (
            <div>
              <h3>CSV Preview</h3>
              <p>{csvReviews.length} reviews found. This preview stays in the browser.</p>
              <div className="preview-list">
                {csvReviews.map((item) => (
                  <article key={item.id} className="review-item">
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {result && (
        <section className={`result-banner panel ${result.sentiment.toLowerCase()}`} aria-live="polite">
          <h2>Review Submitted</h2>
          <p>{result.text}</p>
          <p>
            <span className="sentiment-tag">{result.sentiment}</span>
          </p>
          <ConfidenceBars confidence={result.confidence} />
        </section>
      )}

      <section id="history" className="panel">
        <div className="history-head">
          <div>
            <h2>Review History</h2>
            <p className="section-kicker">Saved reviews stay after a refresh.</p>
          </div>
          <div>
            <label htmlFor="sentiment-filter">Filter by sentiment</label>
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
          </div>
        </div>
        {reviewsError && <p className="alert" role="alert">{reviewsError}</p>}
        {filteredReviews.length === 0 && <p>No reviews match this filter.</p>}
        {filteredReviews.map((item) => (
          <article className={`review-item ${item.sentiment.toLowerCase()}`} key={item.id}>
            <p>{item.text}</p>
            <p>
              <span className="sentiment-tag">{item.sentiment}</span>
            </p>
            <ConfidenceBars confidence={item.confidence} />
          </article>
        ))}
      </section>
      </main>
      <footer className="footer">Customer Sentiment Dashboard · Azure AI Language</footer>
    </div>
  )
}

function ConfidenceBars({ confidence }) {
  if (!confidence) return null
  return (
    <div className="confidence">
      {['positive', 'neutral', 'negative'].map((key) => (
        <div className="confidence-row" key={key}>
          <span>{key}</span>
          <span className="bar">
            <i style={{ width: `${Math.round(confidence[key] * 100)}%` }} />
          </span>
          <span>{formatScore(confidence[key])}</span>
        </div>
      ))}
    </div>
  )
}

// continue to update with more implementation as needed (CSV upload and sentiment analysis features)
