import json

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
