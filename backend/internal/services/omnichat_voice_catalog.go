package services

// OmniChatVoicePreset is a server-owned allowlist entry. Provider identifiers
// are never accepted from a public catalog or directly from Voicebox.
type OmniChatVoicePreset struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Gender       string `json:"gender"`
	Provider     string `json:"provider"`
	VoiceID      string `json:"voice_id"`
	ModelID      string `json:"model_id"`
	LanguageCode string `json:"language_code"`
}

var omniChatVoicePresets = []OmniChatVoicePreset{
	{ID: "af_heart", Name: "Heart", Gender: "female", Provider: "voicebox", VoiceID: "af_heart", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "af_bella", Name: "Bella", Gender: "female", Provider: "voicebox", VoiceID: "af_bella", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "af_nova", Name: "Nova", Gender: "female", Provider: "voicebox", VoiceID: "af_nova", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "af_sarah", Name: "Sarah", Gender: "female", Provider: "voicebox", VoiceID: "af_sarah", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "af_sky", Name: "Sky", Gender: "female", Provider: "voicebox", VoiceID: "af_sky", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "bf_emma", Name: "Emma", Gender: "female", Provider: "voicebox", VoiceID: "bf_emma", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "am_adam", Name: "Adam", Gender: "male", Provider: "voicebox", VoiceID: "am_adam", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "am_echo", Name: "Echo", Gender: "male", Provider: "voicebox", VoiceID: "am_echo", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "am_eric", Name: "Eric", Gender: "male", Provider: "voicebox", VoiceID: "am_eric", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "am_liam", Name: "Liam", Gender: "male", Provider: "voicebox", VoiceID: "am_liam", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "am_onyx", Name: "Onyx", Gender: "male", Provider: "voicebox", VoiceID: "am_onyx", ModelID: "kokoro", LanguageCode: "en"},
	{ID: "bm_george", Name: "George", Gender: "male", Provider: "voicebox", VoiceID: "bm_george", ModelID: "kokoro", LanguageCode: "en"},
}

func OmniChatVoicePresets() []OmniChatVoicePreset {
	return append([]OmniChatVoicePreset(nil), omniChatVoicePresets...)
}

func FindOmniChatVoicePreset(id string) (OmniChatVoicePreset, bool) {
	for _, preset := range omniChatVoicePresets {
		if preset.ID == id || preset.VoiceID == id {
			return preset, true
		}
	}
	return OmniChatVoicePreset{}, false
}
