package utils

import (
	"fmt"
	"regexp"
)

// ValidMessageTypes lists all valid message types
var ValidMessageTypes = []string{"text", "image", "video", "audio", "file"}

// ValidSortOptions lists all valid sort options
var ValidSortOptions = []string{"hot", "new", "top", "controversial"}

// ValidTimeRanges lists all valid time ranges for top sorting
var ValidTimeRanges = []string{"hour", "day", "week", "month", "year", "all"}

// HubNamePattern is the regex for valid hub/subreddit names
var HubNamePattern = regexp.MustCompile(`^[a-z0-9_]+$`)

// ValidateMessageType checks if a message type is valid
func ValidateMessageType(messageType string) error {
	for _, valid := range ValidMessageTypes {
		if messageType == valid {
			return nil
		}
	}
	return fmt.Errorf("invalid message type: must be one of %v", ValidMessageTypes)
}

// ValidateSortOption checks if a sort option is valid
func ValidateSortOption(sort string) error {
	for _, valid := range ValidSortOptions {
		if sort == valid {
			return nil
		}
	}
	return fmt.Errorf("invalid sort option: must be one of %v", ValidSortOptions)
}

// ValidateTimeRange checks if a time range is valid
func ValidateTimeRange(timeRange string) error {
	for _, valid := range ValidTimeRanges {
		if timeRange == valid {
			return nil
		}
	}
	return fmt.Errorf("invalid time range: must be one of %v", ValidTimeRanges)
}

// ValidateHubName checks if a hub/subreddit name is valid
func ValidateHubName(name string) error {
	if len(name) < 3 {
		return fmt.Errorf("name must be at least 3 characters")
	}
	if len(name) > 50 {
		return fmt.Errorf("name must be at most 50 characters")
	}
	if !HubNamePattern.MatchString(name) {
		return fmt.Errorf("name must contain only lowercase letters, numbers, and underscores")
	}
	return nil
}

// ValidateUsername checks if a username is valid
func ValidateUsername(username string) error {
	if len(username) < 3 {
		return fmt.Errorf("username must be at least 3 characters")
	}
	if len(username) > 20 {
		return fmt.Errorf("username must be at most 20 characters")
	}
	// Allow alphanumeric, underscore, and hyphen
	usernamePattern := regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	if !usernamePattern.MatchString(username) {
		return fmt.Errorf("username must contain only letters, numbers, underscores, and hyphens")
	}
	return nil
}

// ValidateStringLength checks if a string is within min and max length
func ValidateStringLength(value string, fieldName string, min, max int) error {
	length := len(value)
	if length < min {
		return fmt.Errorf("%s must be at least %d characters", fieldName, min)
	}
	if length > max {
		return fmt.Errorf("%s must be at most %d characters", fieldName, max)
	}
	return nil
}

// ValidateRequired checks if a value is not empty
func ValidateRequired(value string, fieldName string) error {
	if value == "" {
		return fmt.Errorf("%s is required", fieldName)
	}
	return nil
}

// IsInSlice checks if a string is in a slice
func IsInSlice(slice []string, value string) bool {
	for _, item := range slice {
		if item == value {
			return true
		}
	}
	return false
}
