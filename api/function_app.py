import json
import os
import urllib.error
import urllib.request
import azure.functions as func

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


@app.route(route="health", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def health(req: func.HttpRequest) -> func.HttpResponse:
    """Liveness check."""
    return func.HttpResponse(
        body=json.dumps({"status": "ok"}),
        status_code=200,
        mimetype="application/json",
    )

@app.route(route="reviews", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def create_review(req: func.HttpRequest) -> func.HttpResponse:
    """Analyze one review with Azure AI Language. Does not save it."""
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
    
    analyzed = {
        "reviewText": review_text,
        "sentiment": document["sentiment"],
        "confidence": {
            "positive": scores["positive"],
            "neutral": scores["neutral"],
            "negative": scores["negative"],
        },
    }
    return func.HttpResponse(
        body=json.dumps(analyzed),
        status_code=200,
        mimetype="application/json",
    )
