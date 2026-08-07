package database

import "testing"

func TestPoolIntEnvAllowZeroAcceptsZero(t *testing.T) {
	t.Setenv("TEST_DB_MIN_CONNS", "0")

	if got := testPoolIntEnv("TEST_DB_MIN_CONNS", "DB_MIN_CONNS", 10, true); got != 0 {
		t.Fatalf("testPoolIntEnv() = %d, want 0", got)
	}
}

func TestTestPoolIntEnvPrefersTestOverride(t *testing.T) {
	t.Setenv("TEST_DB_MAX_CONNS", "2")
	t.Setenv("DB_MAX_CONNS", "50")

	if got := testPoolIntEnv("TEST_DB_MAX_CONNS", "DB_MAX_CONNS", 4, false); got != 2 {
		t.Fatalf("testPoolIntEnv() = %d, want test override 2", got)
	}
}

func TestTestPoolIntEnvFallsBackToApplicationOverride(t *testing.T) {
	t.Setenv("DB_MAX_CONNS", "3")

	if got := testPoolIntEnv("TEST_DB_MAX_CONNS", "DB_MAX_CONNS", 4, false); got != 3 {
		t.Fatalf("testPoolIntEnv() = %d, want application override 3", got)
	}
}

func TestTestPoolIntEnvRejectsInvalidValues(t *testing.T) {
	t.Setenv("TEST_DB_MAX_CONNS", "0")

	if got := testPoolIntEnv("TEST_DB_MAX_CONNS", "DB_MAX_CONNS", 4, false); got != 4 {
		t.Fatalf("testPoolIntEnv() = %d, want default 4", got)
	}
}
