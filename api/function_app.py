import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from uuid import uuid4

import azure.functions as func
from azure.core.exceptions import ServiceRequestError
from azure.cosmos import CosmosClient
from azure.cosmos.exceptions import CosmosHttpResponseError

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


def reviews_container():
    """Return the reviews container. Credentials stay in local settings."""
    endpoint = os.environ.get("COSMOS_ENDPOINT", "").strip()
    key = os.environ.get("COSMOS_KEY", "").strip()
    if not endpoint or not key:
        return None
    client = CosmosClient(endpoint, credential=key)
    database = client.get_database_client("sentimentdb")
    return database.get_container_client("reviews")


@app.route(route="health", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def health(req: func.HttpRequest) -> func.HttpResponse:
    """Liveness check."""
    return func.HttpResponse(
        body=json.dumps({"status": "ok"}),
        status_code=200,
        mimetype="application/json",
    )

@app.route(route="reviews", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def list_reviews(req: func.HttpRequest) -> func.HttpResponse:
    """Return saved reviews for the dashboard. Newest submission first."""
    del req
    container = reviews_container()
    if container is None:
        return func.HttpResponse(
            body=json.dumps({"error": "Cosmos settings are missing"}),
            status_code=500,
            mimetype="application/json",
        )

    try:
        items = list(
            container.query_items(
                query="SELECT * FROM c WHERE c.businessId = @businessId",
                parameters=[{"name": "@businessId", "value": "default"}],
                partition_key="default",
            )
        )
    except (CosmosHttpResponseError, ServiceRequestError):
        return func.HttpResponse(
            body=json.dumps({"error": "Saved reviews could not be loaded"}),
            status_code=500,
            mimetype="application/json",
        )

    items.sort(key=lambda item: item.get("submittedAt") or "", reverse=True)
    reviews = [
        {
            "id": item.get("id"),
            "reviewText": item.get("reviewText"),
            "sentiment": item.get("sentiment"),
            "confidence": item.get("confidence"),
            "submittedAt": item.get("submittedAt"),
            "source": item.get("source"),
        }
        for item in items
    ]
    return func.HttpResponse(
        body=json.dumps(reviews),
        status_code=200,
        mimetype="application/json",
    )


@app.route(route="reviews", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def create_review(req: func.HttpRequest) -> func.HttpResponse:
    """Analyze one review and save it in the Cosmos reviews container."""
    try:
        body = req.get_json()
    except ValueError:
        body = None

    review_text = ""
    if isinstance(body, dict):
        review_text = str(body.get("reviewText") or "").strip()

    if not review_text:
        return func.HttpResponse(
            body=json.dumps({"error": "reviewText is required"}),
            status_code=400,
            mimetype="application/json",
        )

    container = reviews_container()
    if container is None:
        return func.HttpResponse(
            body=json.dumps({"error": "Cosmos settings are missing"}),
            status_code=500,
            mimetype="application/json",
        )

    endpoint = os.environ.get("LANGUAGE_ENDPOINT", "").rstrip("/")
    key = os.environ.get("LANGUAGE_KEY", "")
    if not endpoint or not key:
        return func.HttpResponse(
            body=json.dumps({"error": "Language settings are missing"}),
            status_code=500,
            mimetype="application/json",
        )

    payload = {
        "kind": "SentimentAnalysis",
        "analysisInput": {
            "documents": [
                {"id": "1", "language": "en", "text": review_text}
            ]
        },
    }
    request = urllib.request.Request(
        f"{endpoint}/language/:analyze-text?api-version=2023-04-01",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Ocp-Apim-Subscription-Key": key,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return func.HttpResponse(
            body=json.dumps({"error": "Language request failed", "status": error.code}),
            status_code=502,
            mimetype="application/json",
        )

    documents = result.get("results", {}).get("documents", [])
    if not documents:
        return func.HttpResponse(
            body=json.dumps({"error": "Language returned no document"}),
            status_code=502,
            mimetype="application/json",
        )

    document = documents[0]
    scores = document["confidenceScores"]
    confidence = {
        "positive": scores["positive"],
        "neutral": scores["neutral"],
        "negative": scores["negative"],
    }
    submitted_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    item = {
        "id": f"rev_{uuid4().hex}",
        "businessId": "default",
        "reviewText": review_text,
        "externalReviewId": None,
        "sentiment": document["sentiment"],
        "confidence": confidence,
        "originalReviewDate": None,
        "submittedAt": submitted_at,
        "source": "manual",
        "uploadId": None,
        "rowNumber": None,
    }

    try:
        container.create_item(body=item)
    except (CosmosHttpResponseError, ServiceRequestError):
        return func.HttpResponse(
            body=json.dumps({"error": "The review could not be saved"}),
            status_code=500,
            mimetype="application/json",
        )

    analyzed = {
        "id": item["id"],
        "reviewText": review_text,
        "sentiment": item["sentiment"],
        "confidence": confidence,
        "submittedAt": submitted_at,
    }
    return func.HttpResponse(
        body=json.dumps(analyzed),
        status_code=200,
        mimetype="application/json",
    )
