# OmniRave Launch Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a player-facing OmniRave launch flow where `/games/omnirave` has a single Play button and entering the runtime takes players straight into the game without any debug or staging shell.

**Architecture:** Keep the OmniNudge SPA as the discovery layer, keep `omnirave-web` as the dedicated runtime, and fix the integration seams that currently break the experience. The main changes are: simplify the game-detail UI/data model, make launch mode selection automatic in the frontend, allow runtime-to-API loopback origins cleanly in backend CORS, and update browser/runtime regression tests to assert the real in-game experience instead of old debug UI.

**Tech Stack:** React 19, Vite, Vitest, Playwright, Go, Gin

---
