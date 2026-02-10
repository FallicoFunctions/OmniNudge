-- Migration 024 Rollback: Remove password reset tokens table
-- Purpose: Rollback password reset functionality
-- Date: 2026-02-08

DROP TABLE IF EXISTS password_resets;
