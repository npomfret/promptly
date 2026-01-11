#!/bin/bash
# API Test Script for Promptly
# Usage: ./test-api.sh

BASE_URL="https://promptly.snowmonkey.co.uk"
PROJECT_ID="278869a26fc5"

echo "Testing Promptly API at $BASE_URL"
echo "Project ID: $PROJECT_ID"
echo "================================"

# Test 1: Health check
echo -e "\n[1] Health Check..."
RESP=$(curl -s "$BASE_URL/health")
if echo "$RESP" | grep -q 'status.*ok'; then
    echo "    ✓ Server is healthy"
else
    echo "    ✗ Health check failed: $RESP"
    exit 1
fi

# Test 2: Ask endpoint - say hello
echo -e "\n[2] Ask API - sending 'hello'..."
RESP=$(curl -s -X POST "$BASE_URL/api/ask-message" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "projectId=$PROJECT_ID&message=hello")

if echo "$RESP" | grep -q 'class="message model"'; then
    echo "    ✓ Got response from AI"
    # Extract just the text content (first paragraph)
    echo "$RESP" | sed -n 's/.*<p>\([^<]*\)<\/p>.*/\1/p' | head -1
else
    echo "    ✗ Failed: $RESP"
    exit 1
fi

echo -e "\n================================"
echo "All tests passed!"
