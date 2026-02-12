package workers

import (
	"context"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestIsUndefinedTableError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "nil error returns false",
			err:  nil,
			want: false,
		},
		{
			name: "generic error returns false",
			err:  fmt.Errorf("some other error"),
			want: false,
		},
		{
			name: "pgx SQLSTATE 42P01 returns true",
			err:  &pgconn.PgError{Code: "42P01"},
			want: true,
		},
		{
			name: "pgx SQLSTATE 23505 (unique violation) returns false",
			err:  &pgconn.PgError{Code: "23505"},
			want: false,
		},
		{
			name: "pgx SQLSTATE 42703 (undefined column) returns false",
			err:  &pgconn.PgError{Code: "42703"},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isUndefinedTableError(tt.err)
			if got != tt.want {
				t.Errorf("isUndefinedTableError(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

func TestRetentionLock_ReleaseNil(t *testing.T) {
	// Release on a nil lock must not panic
	var lock *RetentionLock
	lock.Release(context.Background())
}

func TestRetentionLock_ReleaseEmpty(t *testing.T) {
	// Release on a lock with nil conn must not panic
	lock := &RetentionLock{conn: nil}
	lock.Release(context.Background())
}
