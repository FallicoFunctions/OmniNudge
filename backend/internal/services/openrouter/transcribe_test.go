package openrouter

import "testing"

// A conversational model asked for words still wraps them, and on silence it
// announces the silence rather than saying nothing. Both would be spoken back
// to the caller as though they had said them.
func TestCleanTranscriptStripsWhatAModelAddsAnyway(t *testing.T) {
	for raw, want := range map[string]string{
		`  hello Sadie, can you hear me  `: "hello Sadie, can you hear me",
		`"hello Sadie"`:                    "hello Sadie",
		`'hello Sadie'`:                    "hello Sadie",
		"":                                 "",
		"   ":                              "",
	} {
		if got := cleanTranscript(raw); got != want {
			t.Errorf("cleanTranscript(%q) = %q, want %q", raw, got, want)
		}
	}
}

// A description of an absence is not a transcript, and must never be sent to
// her as something the caller said.
func TestCleanTranscriptRefusesADescriptionOfSilence(t *testing.T) {
	for _, raw := range []string{
		"No speech", "(no speech)", "[NO SPEECH]", "silence", "(Silence)",
		"inaudible", "[inaudible]", "unintelligible", "no audible speech",
	} {
		if got := cleanTranscript(raw); got != "" {
			t.Errorf("cleanTranscript(%q) = %q, want empty", raw, got)
		}
	}
}

// Words that merely mention silence are still words somebody said.
func TestCleanTranscriptKeepsRealSpeechAboutSilence(t *testing.T) {
	for _, raw := range []string{
		"the silence was unbearable",
		"no speech is worse than a bad one",
	} {
		if got := cleanTranscript(raw); got != raw {
			t.Errorf("cleanTranscript(%q) = %q, want it kept", raw, got)
		}
	}
}

// Nothing is sent to a provider that cannot answer, and no format is invented.
func TestTranscribeRefusesWhatItCannotSend(t *testing.T) {
	client := NewClient("sk-test", "")
	for name, run := range map[string]func() error{
		"no audio":       func() error { _, err := client.Transcribe(t.Context(), "m", nil, "wav"); return err },
		"no model":       func() error { _, err := client.Transcribe(t.Context(), " ", []byte("x"), "wav"); return err },
		"a bad format":   func() error { _, err := client.Transcribe(t.Context(), "m", []byte("x"), "webm"); return err },
		"no credentials": func() error { _, err := NewClient("", "").Transcribe(t.Context(), "m", []byte("x"), "wav"); return err },
	} {
		if err := run(); err == nil {
			t.Errorf("%s: expected a refusal, got none", name)
		}
	}
}
