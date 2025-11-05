#!/bin/bash
# View application logs from cloud server

ssh root@promptly.snowmonkey.co.uk 'cd /opt/promptly && docker-compose logs -f'
