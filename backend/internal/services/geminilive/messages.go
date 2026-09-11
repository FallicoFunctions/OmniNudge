package geminilive

import "encoding/json"

// Wire shapes for BidiGenerateContent. Only the fields a call uses are named;
// anything else the server sends is ignored rather than rejected, because the
// preview adds fields without notice.

type clientMessage struct {
	Setup         *setupMessage         `json:"setup,omitempty"`
	RealtimeInput *realtimeInputMessage `json:"realtimeInput,omitempty"`
	ToolResponse  *toolResponseMessage  `json:"toolResponse,omitempty"`
}

type setupMessage struct {
	Model                    string                `json:"model"`
	GenerationConfig         generationConfig      `json:"generationConfig"`
	SystemInstruction        *content              `json:"systemInstruction,omitempty"`
	Tools                    []toolSet             `json:"tools,omitempty"`
	InputAudioTranscription  *struct{}             `json:"inputAudioTranscription,omitempty"`
	OutputAudioTranscription *struct{}             `json:"outputAudioTranscription,omitempty"`
	ContextWindowCompression *contextCompression   `json:"contextWindowCompression,omitempty"`
	SessionResumption        *sessionResumptionCfg `json:"sessionResumption,omitempty"`
}

type generationConfig struct {
	ResponseModalities []string      `json:"responseModalities"`
	SpeechConfig       *speechConfig `json:"speechConfig,omitempty"`
}

type speechConfig struct {
	VoiceConfig voiceConfig `json:"voiceConfig"`
}

type voiceConfig struct {
	PrebuiltVoiceConfig prebuiltVoice `json:"prebuiltVoiceConfig"`
}

type prebuiltVoice struct {
	VoiceName string `json:"voiceName"`
}

type content struct {
	Parts []textPart `json:"parts"`
}

type textPart struct {
	Text string `json:"text"`
}

type toolSet struct {
	FunctionDeclarations []FunctionDeclaration `json:"functionDeclarations"`
}

// FunctionDeclaration is a tool the model may call mid-conversation.
// Parameters is an OpenAPI-style schema object.
type FunctionDeclaration struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters,omitempty"`
}

type contextCompression struct {
	SlidingWindow struct{} `json:"slidingWindow"`
}

type sessionResumptionCfg struct {
	Handle string `json:"handle,omitempty"`
}

type realtimeInputMessage struct {
	Audio          *blob  `json:"audio,omitempty"`
	Text           string `json:"text,omitempty"`
	AudioStreamEnd bool   `json:"audioStreamEnd,omitempty"`
}

type blob struct {
	MimeType string `json:"mimeType"`
	Data     []byte `json:"data"`
}

type toolResponseMessage struct {
	FunctionResponses []functionResponse `json:"functionResponses"`
}

type functionResponse struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Response any    `json:"response"`
}

type serverMessage struct {
	SetupComplete           *json.RawMessage         `json:"setupComplete"`
	ServerContent           *serverContent           `json:"serverContent"`
	ToolCall                *toolCall                `json:"toolCall"`
	ToolCallCancellation    *toolCallCancellation    `json:"toolCallCancellation"`
	GoAway                  *goAway                  `json:"goAway"`
	SessionResumptionUpdate *sessionResumptionUpdate `json:"sessionResumptionUpdate"`
	UsageMetadata           *Usage                   `json:"usageMetadata"`
	Error                   *json.RawMessage         `json:"error"`
}

type serverContent struct {
	ModelTurn *struct {
		Parts []struct {
			InlineData *blob `json:"inlineData"`
		} `json:"parts"`
	} `json:"modelTurn"`
	TurnComplete        bool           `json:"turnComplete"`
	Interrupted         bool           `json:"interrupted"`
	InputTranscription  *transcription `json:"inputTranscription"`
	OutputTranscription *transcription `json:"outputTranscription"`
}

type transcription struct {
	Text string `json:"text"`
}

type toolCall struct {
	FunctionCalls []FunctionCall `json:"functionCalls"`
}

// FunctionCall is the model asking to run one declared tool.
type FunctionCall struct {
	ID   string          `json:"id"`
	Name string          `json:"name"`
	Args json.RawMessage `json:"args"`
}

type toolCallCancellation struct {
	IDs []string `json:"ids"`
}

type goAway struct {
	TimeLeft string `json:"timeLeft"`
}

type sessionResumptionUpdate struct {
	NewHandle string `json:"newHandle"`
	Resumable bool   `json:"resumable"`
}

// Usage is the token count the server reports. A call is billed per minute,
// so this is for the cost log, not for charging anybody.
type Usage struct {
	PromptTokenCount   int `json:"promptTokenCount"`
	ResponseTokenCount int `json:"responseTokenCount"`
	TotalTokenCount    int `json:"totalTokenCount"`
}
