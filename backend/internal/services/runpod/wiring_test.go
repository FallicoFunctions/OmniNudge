package runpod

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/stretchr/testify/require"
)

// everyResultKey is the provider payload with every field this contract knows
// about set to a non-zero value.
//
// It is the input half of the check below. A field added to Result without a
// key here is a field this test cannot see, so adding one is deliberately two
// edits: the key, and the decoder line that reads it.
const everyResultKey = `{"status":"COMPLETED","output":{
  "images":[{"url":"https://example.test/a.png","content_type":"image/png","width":768,"height":1344}],
  "video":{"url":"https://example.test/a.mp4","content_type":"video/mp4","duration":5},
  "image":{"url":"https://example.test/b.png","content_type":"image/png"},
  "seed":4242,
  "description":"a description",
  "actual_prompt":"the prompt the worker rendered",
  "worker_build":"v53",
  "model_id":"SG161222/RealVisXL_V5.0",
  "load_seconds":3.5,
  "inference_seconds":12.25
}}`

// TestEveryFieldOnResultIsDecodedBySomething is the check that would have
// caught model_id on the day it was added.
//
// decodeResultMetadata is hand-written, field by field, so a struct tag on
// Result is decoration: nothing reads it. ModelID was declared, decoded by
// nothing and persisted nowhere, and the commit that added it said it recorded
// which checkpoint rendered a picture. It recorded nothing, it read correctly
// in review, and it was found only because two runs came back byte-identical.
//
// Reflection rather than a list of expected fields, because a list is another
// thing to remember to update -- which is the failure being prevented. Any
// exported field left at its zero value after decoding a payload that sets
// everything is a field nobody wired, and the failure names it.
func TestEveryFieldOnResultIsDecodedBySomething(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(everyResultKey))
	}))
	defer server.Close()

	result, err := NewClient("key", server.URL).Result(context.Background(), "endpoint", "job-1")
	require.NoError(t, err)

	value := reflect.ValueOf(*result)
	for i := 0; i < value.NumField(); i++ {
		field := value.Type().Field(i)
		if !field.IsExported() {
			continue
		}
		require.Falsef(t, value.Field(i).IsZero(),
			"Result.%s is still zero after decoding a payload that sets every key.\n"+
				"Either decodeResultMetadata has no line for it -- a struct tag alone decodes "+
				"nothing here -- or everyResultKey in this file is missing its key.",
			field.Name)
	}
}
