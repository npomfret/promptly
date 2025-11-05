#!/bin/bash
# Check application status on cloud server

echo "=== Container Status ==="
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose ps'
echo ""
echo "=== Health Check ==="
ssh root@promptly.snowmonkey.co.uk 'curl -s http://localhost:3000/health | python3 -m json.tool'
echo ""
echo "=== Recent Logs ==="
ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose logs --tail=20'
