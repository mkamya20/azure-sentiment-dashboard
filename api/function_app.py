import json
import os

import azure.functions as func
from azure.ai.textanalytics import TextAnalyticsClient
from azure.core.credentials import AzureKeyCredential

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


@app.route(route="health", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def health(req: func.HttpRequest) -> func.HttpResponse:
    """Liveness check."""
    return func.HttpResponse(
        body=json.dumps({"status": "ok"}),
        status_code=200,
        mimetype="application/json",
    )

@app.route(route="analyze", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def analyze(req: func.HttpRequest) -> func.HttpResponse:
    """Analyze the sentiment of a customer review."""

    try:
        # Get the review from the website.
        req_body = req.get_json()
        review_text = req_body.get("text", "").strip()

        if not review_text:
            return func.HttpResponse(
                json.dumps({"error": "Please provide a review."}),
                status_code=400,
                mimetype="application/json",
            )

        # Get the Azure AI Language credentials.
        key = os.environ["LANGUAGE_KEY"]
        endpoint = os.environ["LANGUAGE_ENDPOINT"]

        # Connect to Azure AI Language.
        client = TextAnalyticsClient(
            endpoint=endpoint,
            credential=AzureKeyCredential(key),
        )

        # Send the review for sentiment analysis.
        response = client.analyze_sentiment(
            documents=[review_text],
            show_opinion_mining=False,
        )

        result = response[0]

        if result.is_error:
            return func.HttpResponse(
                json.dumps({"error": result.error.message}),
                status_code=500,
                mimetype="application/json",
            )

        # Return the sentiment and confidence scores.
        return func.HttpResponse(
            json.dumps({
                "sentiment": result.sentiment.capitalize(),
                "confidenceScores": {
                    "positive": result.confidence_scores.positive,
                    "neutral": result.confidence_scores.neutral,
                    "negative": result.confidence_scores.negative,
                },
            }),
            status_code=200,
            mimetype="application/json",
        )

    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid request. Please send valid JSON."}),
            status_code=400,
            mimetype="application/json",
        )

    except Exception:
        return func.HttpResponse(
            json.dumps({"error": "Sentiment analysis failed. Check your Azure configuration."}),
            status_code=500,
            mimetype="application/json",
        )
