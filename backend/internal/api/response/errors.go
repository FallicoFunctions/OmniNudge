package response

// ErrorResponse is the standard error payload returned by all API endpoints.
type ErrorResponse struct {
	// Error is retained for backward compatibility with existing clients that
	// still read `error` instead of `message`.
	Error     string `json:"error,omitempty"`
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}
