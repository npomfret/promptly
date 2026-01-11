#!/bin/bash
# Quick test of the ask API endpoint

echo "Testing ask API..."
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose exec -T promptly wget -qO- --post-data="{\"message\": \"hello\"}" --header="Content-Type: application/json" "http://localhost:3000/ask?projectId=f607f9b885ab"' | python3 -m json.tool
