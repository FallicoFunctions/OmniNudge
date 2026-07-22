package main

import "testing"

func TestWorkerConcurrencyFromEnv(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want int
	}{
		{name: "empty uses default", raw: "", want: defaultWorkerConcurrency},
		{name: "valid value", raw: "24", want: 24},
		{name: "whitespace is accepted", raw: " 24 ", want: 24},
		{name: "non numeric uses default", raw: "24workers", want: defaultWorkerConcurrency},
		{name: "zero uses default", raw: "0", want: defaultWorkerConcurrency},
		{name: "negative uses default", raw: "-1", want: defaultWorkerConcurrency},
		{name: "excessive value is capped", raw: "1000000", want: maxWorkerConcurrency},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := workerConcurrencyFromEnv(test.raw); got != test.want {
				t.Fatalf("workerConcurrencyFromEnv(%q) = %d, want %d", test.raw, got, test.want)
			}
		})
	}
}
