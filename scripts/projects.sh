#!/bin/bash

# Read PORT from .env file, default to 3000
PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d'=' -f2)
PORT=${PORT:-3000}

# Fetch and display projects
RESPONSE=$(curl -s -f "http://localhost:$PORT/projects" 2>/dev/null)

if [ $? -eq 0 ]; then
  echo "$RESPONSE" | jq -r '.projects[] | "\(.id) - \(.gitUrl) (\(.branch))"'
else
  echo "Error: Server not running on port $PORT"
fi
