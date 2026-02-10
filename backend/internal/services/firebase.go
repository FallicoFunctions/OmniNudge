package services

import (
	"context"
	"log"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

// FirebaseService handles Firebase Cloud Messaging
type FirebaseService struct {
	client *messaging.Client
}

// NewFirebaseService initializes Firebase Admin SDK
func NewFirebaseService(credentialsPath string) (*FirebaseService, error) {
	ctx := context.Background()

	// Initialize Firebase app with service account
	opt := option.WithCredentialsFile(credentialsPath)
	app, err := firebase.NewApp(ctx, nil, opt)
	if err != nil {
		return nil, err
	}

	// Get messaging client
	client, err := app.Messaging(ctx)
	if err != nil {
		return nil, err
	}

	log.Println("Firebase Cloud Messaging initialized successfully")

	return &FirebaseService{
		client: client,
	}, nil
}

// SendNotification sends a push notification to a specific device
func (s *FirebaseService) SendNotification(ctx context.Context, token, title, body string, data map[string]string) error {
	message := &messaging.Message{
		Token: token,
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Data: data,
	}

	// Send the message
	response, err := s.client.Send(ctx, message)
	if err != nil {
		log.Printf("Failed to send FCM message: %v", err)
		return err
	}

	log.Printf("Successfully sent FCM message: %s", response)
	return nil
}

// SendMulticast sends a push notification to multiple devices
func (s *FirebaseService) SendMulticast(ctx context.Context, tokens []string, title, body string, data map[string]string) (*messaging.BatchResponse, error) {
	message := &messaging.MulticastMessage{
		Tokens: tokens,
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Data: data,
	}

	// Send to multiple devices
	response, err := s.client.SendEachForMulticast(ctx, message)
	if err != nil {
		log.Printf("Failed to send multicast FCM message: %v", err)
		return nil, err
	}

	log.Printf("Successfully sent multicast FCM message. Success: %d, Failure: %d",
		response.SuccessCount, response.FailureCount)

	return response, nil
}

// SendToTopic sends a notification to all devices subscribed to a topic
func (s *FirebaseService) SendToTopic(ctx context.Context, topic, title, body string, data map[string]string) error {
	message := &messaging.Message{
		Topic: topic,
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Data: data,
	}

	response, err := s.client.Send(ctx, message)
	if err != nil {
		log.Printf("Failed to send FCM topic message: %v", err)
		return err
	}

	log.Printf("Successfully sent FCM topic message: %s", response)
	return nil
}

// SubscribeToTopic subscribes device tokens to a topic
func (s *FirebaseService) SubscribeToTopic(ctx context.Context, tokens []string, topic string) error {
	response, err := s.client.SubscribeToTopic(ctx, tokens, topic)
	if err != nil {
		log.Printf("Failed to subscribe to topic: %v", err)
		return err
	}

	log.Printf("Successfully subscribed %d devices to topic %s", response.SuccessCount, topic)
	return nil
}

// UnsubscribeFromTopic unsubscribes device tokens from a topic
func (s *FirebaseService) UnsubscribeFromTopic(ctx context.Context, tokens []string, topic string) error {
	response, err := s.client.UnsubscribeFromTopic(ctx, tokens, topic)
	if err != nil {
		log.Printf("Failed to unsubscribe from topic: %v", err)
		return err
	}

	log.Printf("Successfully unsubscribed %d devices from topic %s", response.SuccessCount, topic)
	return nil
}
