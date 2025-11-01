#!/bin/bash

# Read PORT from .env file, default to 3000
PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d'=' -f2)
PORT=${PORT:-3000}

# Send shutdown request to server
curl -s -X POST "http://localhost:$PORT/shutdown" && echo '' || echo "No server running on port $PORT"
