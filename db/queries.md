# Cosmos DB Queries

All queries run against the `reviews` container unless noted. In code, pass
`businessId` as a parameter and set the partition key to `"default"`.

## Sentiment counts (dashboard breakdown)
```sql
SELECT c.sentiment, COUNT(1) AS total
FROM c
WHERE c.businessId = @businessId
GROUP BY c.sentiment
```

## Latest 20 reviews (alert evaluation)
```sql
SELECT TOP 20 c.sentiment, c.submittedAt
FROM c
WHERE c.businessId = @businessId
ORDER BY c.submittedAt DESC
```

## Review history with filters
```sql
SELECT * FROM c
WHERE c.businessId = @businessId
  AND c.sentiment = @sentiment
  AND c.originalReviewDate >= @startDate
  AND c.originalReviewDate <= @endDate
```

## Reviews from one upload
```sql
SELECT * FROM c
WHERE c.businessId = @businessId AND c.uploadId = @uploadId
```

## Most recent alert (`alerts` container, cooldown check)
```sql
SELECT TOP 1 * FROM c
WHERE c.businessId = @businessId
ORDER BY c.triggeredAt DESC
```
