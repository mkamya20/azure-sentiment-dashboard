# Cosmos DB Schema

**Database:** `sentimentdb`
**API:** Azure Cosmos DB for NoSQL
**Region:** East US 2
**Partition key (all containers):** `/businessId` (value is `"default"` for now, since the app supports one business)

> Do not put keys, connection strings, or real customer data in this repository.

## Containers

| Container  | Purpose |
|------------|---------|
| `reviews`  | One document per analyzed review |
| `uploads`  | One document per CSV upload, with processing summary |
| `settings` | Alert configuration |
| `alerts`   | History of alerts sent |

## `reviews`

```json
{
  "id": "upl_20261108_row_12",
  "businessId": "default",
  "reviewText": "Shipping was slow but the product is great.",
  "externalReviewId": "R-1042",
  "sentiment": "mixed",
  "confidence": { "positive": 0.48, "neutral": 0.05, "negative": 0.47 },
  "originalReviewDate": "2026-10-30",
  "submittedAt": "2026-11-08T14:22:05Z",
  "source": "csv",
  "uploadId": "upl_20261108",
  "rowNumber": 12
}
```

| Field | Type | Notes |
|-------|------|-------|
| id | string | Unique. For CSV rows use `uploadId` + row number so retries don't create duplicates |
| businessId | string | Partition key. Always `"default"` for now |
| reviewText | string | The feedback text |
| externalReviewId | string or null | Optional review ID from the CSV |
| sentiment | string | `positive`, `negative`, `neutral`, or `mixed` |
| confidence | object | Scores for positive, neutral, negative (0 to 1) |
| originalReviewDate | string or null | Date the customer wrote the review (YYYY-MM-DD). Optional |
| submittedAt | string | When it was submitted to our app (ISO 8601, UTC) |
| source | string | `manual` or `csv` |
| uploadId | string or null | Links to the `uploads` container. Null for manual entries |
| rowNumber | number or null | Row in the CSV. Used as a tiebreaker for ordering |

## `uploads`

```json
{
  "id": "upl_20261108",
  "businessId": "default",
  "fileName": "october_reviews.csv",
  "uploadedAt": "2026-11-08T14:20:00Z",
  "totalRows": 50,
  "successful": 47,
  "skipped": 2,
  "failed": 1
}
```

## `settings`

```json
{
  "id": "alert-settings",
  "businessId": "default",
  "negativeThreshold": 0.4,
  "windowSize": 20,
  "cooldownHours": 24,
  "alertEmail": "team-email@example.com"
}
```

| Field | Notes |
|-------|-------|
| negativeThreshold | Alert when the negative share of the latest window is above this (0.4 = 40%) |
| windowSize | Number of most recent reviews to evaluate. Minimum of 20 analyzed reviews needed |
| cooldownHours | Minimum time between alert emails |
| alertEmail | Where warnings are sent |

## `alerts`

```json
{
  "id": "alert_20261108_143000",
  "businessId": "default",
  "triggeredAt": "2026-11-08T14:30:00Z",
  "negativePercentage": 0.45,
  "windowSize": 20,
  "threshold": 0.4,
  "emailSent": true
}
```

## Open decisions (team to answer)

1. Does `mixed` count toward the negative percentage for alerts?
2. Does the trend chart use `originalReviewDate` or `submittedAt`? (Suggestion: original date when present, otherwise submission date.)
3. Tiebreaker for reviews saved at the same moment: use `rowNumber`?
4. Cooldown length: is 24 hours right?
