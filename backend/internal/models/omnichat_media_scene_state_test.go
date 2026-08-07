package models

import "testing"

func TestMergeConversationContinuityIntoMediaSceneFillsOnlyMissingFacts(t *testing.T) {
	scene := &OmniChatSceneState{Location: "cafe", OtherCharacters: []string{"Alex"}}
	mergeConversationContinuityIntoMediaScene(scene, OmniChatConversationSceneState{
		Location: "dungeon",
		Event:    OmniChatSceneEvent{Action: "walks toward the user"},
		Actors: []OmniChatSceneActor{
			{Kind: OmniChatSceneActorNPC, Label: "A guard"},
		},
	})

	if scene.Location != "cafe" {
		t.Fatalf("legacy location was overwritten: %q", scene.Location)
	}
	if scene.Activity != "walks toward the user" {
		t.Fatalf("continuity activity was not applied: %q", scene.Activity)
	}
	if len(scene.OtherCharacters) != 1 || scene.OtherCharacters[0] != "Alex" {
		t.Fatalf("legacy characters were overwritten: %#v", scene.OtherCharacters)
	}
}

func TestMergeConversationContinuityIntoMediaSceneAddsNPCLabels(t *testing.T) {
	scene := &OmniChatSceneState{}
	mergeConversationContinuityIntoMediaScene(scene, OmniChatConversationSceneState{
		Location: "park",
		Event:    OmniChatSceneEvent{Action: "smiles"},
		Actors: []OmniChatSceneActor{
			{Kind: OmniChatSceneActorUser, Label: "You"},
			{Kind: OmniChatSceneActorPersona, Label: "Ari"},
			{Kind: OmniChatSceneActorNPC, Label: "A passerby"},
		},
	})

	if scene.Location != "park" || scene.Activity != "smiles" {
		t.Fatalf("continuity facts were not applied: %#v", scene)
	}
	if len(scene.OtherCharacters) != 1 || scene.OtherCharacters[0] != "A passerby" {
		t.Fatalf("NPC labels were not applied: %#v", scene.OtherCharacters)
	}
}
