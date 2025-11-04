#!/bin/bash

# Store the cookies in some local dir thats not under version control
TMP_DIR="tmp/ask-the-expert"
COOKIE_FILE="${TMP_DIR}/cookies.txt"
LOG_FILE="${TMP_DIR}/activity.log"

# Create tmp dir if it doesn't exist
mkdir -p "$TMP_DIR"

# Read the text input from stdin
PROMPT=$(cat)

# Log the raw input and timestamp
echo "$(date '+%Y-%m-%d %H:%M:%S') - Received input: $PROMPT" >> "$LOG_FILE"

# Use jq to properly construct JSON payload for the ask service
JSON_PAYLOAD=$(jq -n --arg msg "$PROMPT" '{message: $msg}')

# Execute the curl command and get the critical analysis
ANALYSIS=$(curl -s -X POST http://localhost:3000/ask?projectId=cec04d6b28ab \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" -c "$COOKIE_FILE" \
    -d "$JSON_PAYLOAD" \
    | jq -r '.response')

# Log the response
echo "$(date '+%Y-%m-%d %H:%M:%S') - Response received (${#ANALYSIS} chars)" >> "$LOG_FILE"

# Output the analysis
echo "$ANALYSIS"
