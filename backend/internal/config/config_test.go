package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGetEnvAsPositiveIntFallsBackForInvalidValues(t *testing.T) {
	for _, value := range []string{"0", "-1", "not-a-number"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("TEST_POSITIVE_INT", value)
			require.Equal(t, 7, getEnvAsPositiveInt("TEST_POSITIVE_INT", 7))
		})
	}
	t.Setenv("TEST_POSITIVE_INT", "12")
	require.Equal(t, 12, getEnvAsPositiveInt("TEST_POSITIVE_INT", 7))
}

func TestGetEnvAsPositiveInt64FallsBackForInvalidValues(t *testing.T) {
	for _, value := range []string{"0", "-1", "not-a-number"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("TEST_POSITIVE_INT64", value)
			require.EqualValues(t, 1024, getEnvAsPositiveInt64("TEST_POSITIVE_INT64", 1024))
		})
	}
	t.Setenv("TEST_POSITIVE_INT64", "2048")
	require.EqualValues(t, 2048, getEnvAsPositiveInt64("TEST_POSITIVE_INT64", 1024))
}
