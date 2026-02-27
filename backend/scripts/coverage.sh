#!/bin/bash
set -e
cd "$(dirname "$0")/.."
go test ./... -coverprofile=coverage.out -timeout 10m
go tool cover -func=coverage.out | tail -5
go tool cover -html=coverage.out -o coverage.html
echo "Coverage report: coverage.html"
