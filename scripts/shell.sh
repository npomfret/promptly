#!/bin/bash
# Open a shell inside the running container

ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose exec promptly sh'
