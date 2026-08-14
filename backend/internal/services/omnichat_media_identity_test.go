package services

import (
	"encoding/json"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestResolveOmniChatMediaIdentityProfileDefaultsToReferences(t *testing.T) {
	profile := ResolveOmniChatMediaIdentityProfile(&models.BotPersona{OwnerUserID: intPtr(7)})
	require.Equal(t, models.OmniChatMediaIdentityModeReference, profile.Mode)
	require.Equal(t, models.OmniChatMediaIdentityAdapterIPAdapter, profile.Adapter)
	// A persona needs close portraits for the face adapter and full-length
	// shots for the body adapter; one reference cannot serve both roles.
	require.Equal(t, 6, profile.ReferenceLimit)
	require.Empty(t, profile.LoraModelID)
}

func TestResolveOmniChatMediaIdentityProfileAllowsValidatedLoRAForDefault(t *testing.T) {
	persona := &models.BotPersona{ExtensionsJSON: json.RawMessage(`{"omnichat_media":{"identity_mode":"lora","identity_adapter":"ip_adapter","identity_adapter_scale":0.7,"reference_limit":2,"lora_model_id":"nickf579/sadie-lora","lora_weight_name":"pytorch_lora_weights.safetensors","lora_scale":0.9}}`)}
	profile := ResolveOmniChatMediaIdentityProfile(persona)
	require.Equal(t, models.OmniChatMediaIdentityModeLoRA, profile.Mode)
	require.Equal(t, "nickf579/sadie-lora", profile.LoraModelID)
	require.Equal(t, "pytorch_lora_weights.safetensors", profile.LoraWeightName)
	require.Equal(t, 2, profile.ReferenceLimit)
}

func TestResolveOmniChatMediaIdentityProfileForcesMalformedOrUserLoRAToReferences(t *testing.T) {
	for _, persona := range []*models.BotPersona{
		{ExtensionsJSON: json.RawMessage(`{"omnichat_media":{"identity_mode":"lora","lora_model_id":"../../arbitrary","lora_weight_name":"weights.safetensors"}}`)},
		{OwnerUserID: intPtr(7), ExtensionsJSON: json.RawMessage(`{"omnichat_media":{"identity_mode":"lora","lora_model_id":"nickf579/sadie-lora","lora_weight_name":"weights.safetensors"}}`)},
	} {
		profile := ResolveOmniChatMediaIdentityProfile(persona)
		require.Equal(t, models.OmniChatMediaIdentityModeReference, profile.Mode)
		require.Empty(t, profile.LoraModelID)
	}
}

func TestResolveOmniChatMediaIdentityProfileBoundsReferenceControls(t *testing.T) {
	persona := &models.BotPersona{ExtensionsJSON: json.RawMessage(`{"omnichat_media":{"identity_adapter_scale":99,"reference_limit":99}}`)}
	profile := ResolveOmniChatMediaIdentityProfile(persona)
	require.Equal(t, 0.65, profile.AdapterScale)
	// Out-of-range values fall back to the default rather than being clamped
	// to the ceiling, so an absurd request cannot quietly become the maximum.
	require.Equal(t, 6, profile.ReferenceLimit)
}
