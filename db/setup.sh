#!/bin/bash
# Creates the Cosmos DB database and containers.
# Prerequisite: Cosmos DB account already exists in rg-sentiment-dashboard.
ACCOUNT= sentiment-cosmos-team4b 
RG=rg-sentiment-dashboard

az cosmosdb sql database create \
  --account-name $ACCOUNT --resource-group $RG \
  --name sentimentdb --throughput 400   # remove --throughput if serverless

for c in reviews uploads settings alerts; do
  az cosmosdb sql container create \
    --account-name $ACCOUNT --resource-group $RG \
    --database-name sentimentdb --name $c \
    --partition-key-path "/businessId"
done
