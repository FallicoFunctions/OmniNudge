package services

import "testing"

func TestParseClamResponse(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		resp      string
		infected  bool
		signature string
	}{
		{
			name:      "clean",
			resp:      "stream: OK",
			infected:  false,
			signature: "",
		},
		{
			name:      "infected with signature",
			resp:      "stream: Eicar-Test-Signature FOUND",
			infected:  true,
			signature: "Eicar-Test-Signature",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := parseClamResponse(tc.resp)
			if got.Infected != tc.infected {
				t.Fatalf("parseClamResponse(%q) infected=%v want %v", tc.resp, got.Infected, tc.infected)
			}
			if got.Signature != tc.signature {
				t.Fatalf("parseClamResponse(%q) signature=%q want %q", tc.resp, got.Signature, tc.signature)
			}
		})
	}
}
