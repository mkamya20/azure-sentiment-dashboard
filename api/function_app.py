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

MAX_UPLOAD_ROWS = 50
LANGUAGE_BATCH_SIZE = 10
MAX_REVIEW_CHARS = 5120


def json_response(body, status_code):
    return func.HttpResponse(
        body=json.dumps(body),
        status_code=status_code,
        mimetype="application/json",
    )


def cosmos_container(name):
    """Return one Cosmos container. Credentials stay in local settings."""
    endpoint = os.environ.get("COSMOS_ENDPOINT", "").strip()
    key = os.environ.get("COSMOS_KEY", "").strip()
    if not endpoint or not key:
        return None
    client = CosmosClient(endpoint, credential=key)
    database = client.get_database_client("sentimentdb")
    return database.get_container_client(name)


def reviews_container():
    return cosmos_container("reviews")


def language_settings():
    endpoint = os.environ.get("LANGUAGE_ENDPOINT", "").rstrip("/")
    key = os.environ.get("LANGUAGE_KEY", "")
    if not endpoint or not key:
        return None, None
    return endpoint, key


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def optional_text(value, limit):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


def optional_date(value):
    if not isinstance(value, str):
        return None
    text = value.strip()
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return None
    return text


def clean_file_name(value):
    name = str(value or "upload.csv").replace("\\", "/").split("/")[-1].strip()
    return name[:200] or "upload.csv"


def unique_row_number(requested, fallback, used_rows):
    if isinstance(requested, bool):
        number = fallback
    elif isinstance(requested, int) and requested > 0:
        number = requested
    elif isinstance(requested, float) and requested.is_integer() and requested > 0:
        number = int(requested)
    else:
        number = fallback
    while number in used_rows:
        number += 1
    used_rows.add(number)
    return number


def analyze_documents(documents):
    """Analyze up to 10 documents. Returns a map of document id to result."""
    endpoint, key = language_settings()
    payload = {
        "kind": "SentimentAnalysis",
        "analysisInput": {
            "documents": [
                {"id": document["id"], "language": "en", "text": document["text"]}
                for document in documents
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
    with urllib.request.urlopen(request) as response:
        result = json.loads(response.read().decode("utf-8"))

    analyzed = {}
    for document in result.get("results", {}).get("documents", []):
        scores = document.get("confidenceScores") or {}
        if document.get("sentiment") not in ("positive", "negative", "neutral", "mixed"):
            continue
        if not all(is_number(scores.get(name)) for name in ("positive", "neutral", "negative")):
            continue
        analyzed[str(document.get("id"))] = document
    return analyzed


def confidence_scores(document):
    scores = document["confidenceScores"]
    return {
        "positive": scores["positive"],
        "neutral": scores["neutral"],
        "negative": scores["negative"],
    }


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

    endpoint, key = language_settings()
    if not endpoint or not key:
        return func.HttpResponse(
            body=json.dumps({"error": "Language settings are missing"}),
            status_code=500,
            mimetype="application/json",
        )

    try:
        analyzed_documents = analyze_documents([{"id": "1", "text": review_text}])
    except urllib.error.HTTPError as error:
        return func.HttpResponse(
            body=json.dumps({"error": "Language request failed", "status": error.code}),
            status_code=502,
            mimetype="application/json",
        )
    except urllib.error.URLError:
        return func.HttpResponse(
            body=json.dumps({"error": "Language request failed"}),
            status_code=502,
            mimetype="application/json",
        )

    document = analyzed_documents.get("1")
    if document is None:
        return func.HttpResponse(
            body=json.dumps({"error": "Language returned no document"}),
            status_code=502,
            mimetype="application/json",
        )

    confidence = confidence_scores(document)
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


@app.route(route="uploads", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def create_upload(req: func.HttpRequest) -> func.HttpResponse:
    """Analyze CSV rows and save them in Cosmos."""
    try:
        body = req.get_json()
    except ValueError:
        body = None

    reviews = body.get("reviews") if isinstance(body, dict) else None
    if not isinstance(reviews, list) or not reviews:
        return json_response({"error": "reviews are required"}, 400)
    if len(reviews) > MAX_UPLOAD_ROWS:
        return json_response({"error": "Upload at most 50 reviews at a time"}, 400)

    reviews_db = reviews_container()
    uploads_db = cosmos_container("uploads")
    if reviews_db is None or uploads_db is None:
        return json_response({"error": "Cosmos settings are missing"}, 500)

    endpoint, key = language_settings()
    if not endpoint or not key:
        return json_response({"error": "Language settings are missing"}, 500)

    file_name = clean_file_name(body.get("fileName") if isinstance(body, dict) else None)
    submitted_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    upload_id = f"upl_{uuid4().hex}"
    used_rows = set()
    prepared = []
    skipped = 0
    failed = 0

    for index, row in enumerate(reviews):
        if not isinstance(row, dict):
            skipped += 1
            continue
        review_text = str(row.get("reviewText") or "").strip()
        if not review_text:
            skipped += 1
            continue
        row_number = unique_row_number(row.get("rowNumber"), index + 1, used_rows)
        if len(review_text) > MAX_REVIEW_CHARS:
            failed += 1
            continue
        prepared.append(
            {
                "docId": f"doc{len(prepared)}",
                "rowNumber": row_number,
                "reviewText": review_text,
                "externalReviewId": optional_text(row.get("externalReviewId"), 100),
                "originalReviewDate": optional_date(row.get("originalReviewDate")),
            }
        )

    saved = []
    for start in range(0, len(prepared), LANGUAGE_BATCH_SIZE):
        batch = prepared[start : start + LANGUAGE_BATCH_SIZE]
        try:
            analyzed_documents = analyze_documents(
                [{"id": row["docId"], "text": row["reviewText"]} for row in batch]
            )
        except (urllib.error.HTTPError, urllib.error.URLError):
            failed += len(batch)
            continue

        for row in batch:
            document = analyzed_documents.get(row["docId"])
            if document is None:
                failed += 1
                continue
            confidence = confidence_scores(document)
            item = {
                "id": f"{upload_id}_row_{row['rowNumber']}",
                "businessId": "default",
                "reviewText": row["reviewText"],
                "externalReviewId": row["externalReviewId"],
                "sentiment": document["sentiment"],
                "confidence": confidence,
                "originalReviewDate": row["originalReviewDate"],
                "submittedAt": submitted_at,
                "source": "csv",
                "uploadId": upload_id,
                "rowNumber": row["rowNumber"],
            }
            try:
                reviews_db.create_item(body=item)
            except (CosmosHttpResponseError, ServiceRequestError):
                failed += 1
                continue
            saved.append(
                {
                    "id": item["id"],
                    "reviewText": item["reviewText"],
                    "sentiment": item["sentiment"],
                    "confidence": confidence,
                    "submittedAt": submitted_at,
                    "source": "csv",
                    "rowNumber": row["rowNumber"],
                }
            )

    summary = {
        "id": upload_id,
        "businessId": "default",
        "fileName": file_name,
        "uploadedAt": submitted_at,
        "totalRows": len(reviews),
        "successful": len(saved),
        "skipped": skipped,
        "failed": failed,
    }
    try:
        uploads_db.create_item(body=summary)
    except (CosmosHttpResponseError, ServiceRequestError):
        if not saved:
            return json_response({"error": "The upload could not be saved"}, 500)

    return json_response(
        {
            "uploadId": upload_id,
            "fileName": file_name,
            "totalRows": len(reviews),
            "successful": len(saved),
            "skipped": skipped,
            "failed": failed,
            "reviews": saved,
        },
        200,
    )
