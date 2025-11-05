#!/bin/bash
# Deploy application to cloud server

set -e
cd "$(dirname "$0")/.."
./deploy.sh
