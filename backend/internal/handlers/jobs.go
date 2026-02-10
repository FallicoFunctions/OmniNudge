package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/omninudge/backend/internal/queue"
)

// JobsHandler handles job queue status queries
type JobsHandler struct {
	queueClient *queue.QueueClient
}

// NewJobsHandler creates a new jobs handler
func NewJobsHandler(queueClient *queue.QueueClient) *JobsHandler {
	return &JobsHandler{queueClient: queueClient}
}

// GetJobStatus returns the status of a background job
// GET /api/v1/jobs/:queue/:id
func (h *JobsHandler) GetJobStatus(c *gin.Context) {
	queueName := c.Param("queue")
	jobID := c.Param("id")

	if queueName == "" || jobID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "queue and id are required"})
		return
	}

	info, err := h.queueClient.GetJobInfo(queueName, jobID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	// Map Asynq task info to API response
	response := gin.H{
		"id":             info.ID,
		"type":           info.Type,
		"queue":          info.Queue,
		"state":          mapTaskState(info.State),
		"max_retry":      info.MaxRetry,
		"retried":        info.Retried,
		"last_error":     info.LastErr,
		"last_failed_at": info.LastFailedAt,
		"completed_at":   info.CompletedAt,
		"next_process_at": info.NextProcessAt,
	}

	c.JSON(http.StatusOK, response)
}

// mapTaskState converts Asynq TaskState to a simpler string
func mapTaskState(state asynq.TaskState) string {
	stateStr := state.String()
	switch stateStr {
	case "pending":
		return "pending"
	case "active":
		return "processing"
	case "scheduled":
		return "scheduled"
	case "retry":
		return "retrying"
	case "archived":
		return "failed"
	case "completed":
		return "completed"
	default:
		return stateStr
	}
}
