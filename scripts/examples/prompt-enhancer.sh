#!/bin/bash

# Store the cookies in some local dir thats not under version control
TMP_DIR="tmp/prompt-enhancer"
COOKIE_FILE="${TMP_DIR}/cookies.txt"
LOG_FILE="${TMP_DIR}/activity.log"

# Create tmp dir if it doesn't exist
mkdir -p "$TMP_DIR"

# Read the JSON input from stdin
JSON_INPUT=$(cat)

# Log the raw JSON input and timestamp
echo "$(date '+%Y-%m-%d %H:%M:%S') - Received input: $JSON_INPUT" >> "$LOG_FILE"

# Extract the prompt from the JSON input
PROMPT=$(echo "$JSON_INPUT" | jq -r '.prompt')

# Check for underscore trigger
if [[ "$PROMPT" == _* || "$PROMPT" == *_ ]]; then
    # Use jq to properly construct JSON payload for the enhancer service
    JSON_PAYLOAD=$(jq -n --arg msg "$PROMPT" '{message: $msg}')

    # Execute the curl command and get the enhancement
    ENHANCEMENT=$(curl -s -X POST http://localhost:3000/enhance?projectId=cec04d6b28ab \
        -H "Content-Type: application/json" \
        -b "$COOKIE_FILE" -c "$COOKIE_FILE" \
        -d "$JSON_PAYLOAD" \
        | jq -r '.response')

    # Output the final JSON with additionalContext
    jq -n --arg context "$ENHANCEMENT" '{"additionalContext": $context}'
else
    # If no underscore, just output the original JSON input
    echo "$JSON_INPUT"
fi
