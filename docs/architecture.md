# Architecture

This document describes the planned design. None of these integrations are implemented in the repository yet, and this task does not create Azure resources.

The existing resource group is `rg-customer-sentiment`. Later Azure resources for this project are planned to live in that group.

## Planned flow

1. A user opens the React interface, hosted on Azure Static Web Apps.
2. The user submits one review or uploads a CSV file. CSV files are expected to include a `review_text` column.
3. Azure Static Web Apps routes API calls to its integrated Python Azure Functions backend.
4. A function sends the review text to Azure AI Language and uses the prebuilt sentiment analysis feature. The project will not call Azure OpenAI and will not train a model.
5. The function stores the review and its analysis result in Azure Cosmos DB.
6. Dashboard requests read stored results from Cosmos DB so the interface can show review history, charts, trends, and filters.
7. Alert evaluation in the Functions backend checks whether negative feedback has passed a threshold. When it has, the function starts an Azure Logic Apps workflow that sends an email.

## Planned services

| Service | Planned role |
| --- | --- |
| Azure Static Web Apps | Host the React app and its managed Functions backend |
| Azure Functions (Python) | Sentiment calls, CSV processing, Cosmos DB access, dashboard statistics, and alert evaluation |
| Azure AI Language | Prebuilt sentiment classification |
| Azure Cosmos DB | Store reviews and analysis results |
| Azure Logic Apps | Send email when negative feedback exceeds the threshold |
