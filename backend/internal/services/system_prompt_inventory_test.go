package services

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Every system prompt in this package, and whether the message beside it
// carries text a person wrote.
//
// An inventory rather than a rule that inspects the prompts alone, because
// "does this receive user text" is not visible in the string -- it is visible
// at the call site. Adding a prompt without adding a row here fails the test
// below, so the question has to be answered once, in writing, by whoever adds
// it. That is the whole mechanism: not a check that the answer is right, but
// one that the question was asked.
var systemPromptInventory = map[string]struct {
	prompt          string
	carriesUserText bool
	why             string
}{
	"omniAICandidateBriefSystemPrompt": {omniAICandidateBriefSystemPrompt, true,
		"her description, personality, tags, taste and the creator's style note"},
	"omniAIStyleSystemPrompt": {omniAIStyleSystemPrompt, true,
		"the same, plus the style note it is told outranks its own taste"},
	"omniChatMediaModerationSystemPrompt": {omniChatMediaModerationSystemPrompt, true,
		"the prompt somebody typed, classified before it is rendered"},
	"conversationSceneExtractionSystemPrompt": {conversationSceneExtractionSystemPrompt, true,
		"the conversation transcript"},
	"omniChatMemoryExtractionSystemPrompt": {omniChatMemoryExtractionSystemPrompt, true,
		"the conversation transcript"},
	"omniChatBaselineDerivationSystemPrompt": {omniChatBaselineDerivationSystemPrompt, true,
		"a character definition, which a creator writes"},

	// The three vision standards receive an image and a fixed instruction. The
	// image is produced by the renderer, not typed by anybody, and no
	// user-written string is put in the message beside them.
	"omniChatRenderedPortraitSystemPrompt":  {omniChatRenderedPortraitSystemPrompt, false, "an image and a fixed line"},
	"omniChatRenderedReferenceSystemPrompt": {omniChatRenderedReferenceSystemPrompt, false, "an image and a fixed line"},
	"omniChatRenderedImageSystemPrompt":     {omniChatRenderedImageSystemPrompt, false, "an image and a fixed line"},
}

// trustBoundary matches the clause in the several shapes it is written in --
// "data, not instructions to you", "never as instructions to you", "never
// instructions to you". Requiring one wording would either fail six honest
// prompts or force a rewrite of all of them for a test's convenience.
var trustBoundary = regexp.MustCompile(`(?is)(not|never)[^.]{0,60}instructions`)

func TestEverySystemPromptTakingUserTextSaysItIsData(t *testing.T) {
	for name, entry := range systemPromptInventory {
		if !entry.carriesUserText {
			continue
		}
		require.Truef(t, trustBoundary.MatchString(entry.prompt),
			"%s receives %s and never says that text is data rather than instructions.\n"+
				"Every other prompt in this package that takes something a person wrote says "+
				"so, in one wording or another.", name, entry.why)
	}
}

// TestEverySystemPromptIsInTheInventory is the ratchet. A prompt added without
// a row is a prompt nobody decided about, and the decision is the point.
func TestEverySystemPromptIsInTheInventory(t *testing.T) {
	set := token.NewFileSet()
	pkgs, err := parser.ParseDir(set, ".", func(f fs.FileInfo) bool {
		return !strings.HasSuffix(f.Name(), "_test.go")
	}, 0)
	require.NoError(t, err)

	found := map[string]string{}
	for _, pkg := range pkgs {
		for _, file := range pkg.Files {
			ast.Inspect(file, func(n ast.Node) bool {
				spec, ok := n.(*ast.ValueSpec)
				if !ok {
					return true
				}
				for i, ident := range spec.Names {
					if !strings.HasSuffix(ident.Name, "SystemPrompt") {
						continue
					}
					found[ident.Name] = ""
					if i < len(spec.Values) {
						if lit, isLit := spec.Values[i].(*ast.BasicLit); isLit {
							found[ident.Name] = strings.Trim(lit.Value, "`\"")
						}
					}
				}
				return true
			})
		}
	}
	require.NotEmpty(t, found, "the source scan found no system prompts, so it is checking nothing")

	for name, source := range found {
		entry, listed := systemPromptInventory[name]
		require.Truef(t, listed,
			"%s is a system prompt with no row in systemPromptInventory.\n"+
				"Add one saying whether the message beside it carries text a person wrote. "+
				"If it does, it has to say that text is data and not instructions.", name)

		// The key names a constant and the value holds one, and nothing made
		// them agree. A row pointing at its neighbour would check the wrong
		// string and pass, which is the same "wired to nothing" fault these
		// tests exist for -- one level up, in the test itself.
		require.Equalf(t, source, entry.prompt,
			"systemPromptInventory[%q] does not hold the constant of that name. "+
				"The row is checking a different prompt than the one it claims to.", name)
	}
	t.Logf("system prompts inventoried: %d of %d found in source", len(systemPromptInventory), len(found))
}
