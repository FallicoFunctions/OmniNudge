package response

// ErrorResponse is the standard error payload returned by all API endpoints.
type ErrorResponse struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}
