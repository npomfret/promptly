#!/bin/bash
# API Test Script for Promptly
# Usage: ./test-api.sh [AUTH_TOKEN]

BASE_URL="https://promptly.snowmonkey.co.uk"
PROJECT_ID="278869a26fc5"
AUTH_TOKEN="$1"

echo "Testing Promptly API at $BASE_URL"
echo "Project ID: $PROJECT_ID"
echo "================================"

# Test 1: Health check
echo -e "\n[1] Health Check..."
RESP=$(curl -s "$BASE_URL/health")
if echo "$RESP" | grep -q '"status":"ok"'; then
    echo "    ✓ Server is healthy"
    echo "    $RESP"
else
    echo "    ✗ Health check failed"
    echo "    $RESP"
    exit 1
fi

# Test 2: Ask endpoint - say hello
echo -e "\n[2] Ask API - sending 'hello'..."
if [ -z "$AUTH_TOKEN" ]; then
    echo "    ⚠ No auth token provided, skipping authenticated tests"
    echo "    Usage: ./test-api.sh YOUR_AUTH_TOKEN"
    exit 0
fi

RESP=$(curl -s -X POST "$BASE_URL/api/ask-message" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "projectId=$PROJECT_ID&message=hello")

if echo "$RESP" | grep -q "error"; then
    echo "    ✗ Error: $RESP"
else
    echo "    ✓ Response received:"
    echo "$RESP"
fi

echo -e "\n================================"
echo "API tests complete"
