
# InternalHandlersGetReactionsResponse


## Properties

Name | Type
------------ | -------------
`reactions` | [Array&lt;GithubComOmninudgeBackendInternalModelsReactionSummary&gt;](GithubComOmninudgeBackendInternalModelsReactionSummary.md)
`totalUniqueEmoji` | number
`usersTruncated` | boolean

## Example

```typescript
import type { InternalHandlersGetReactionsResponse } from ''

// TODO: Update the object below with actual values
const example = {
  "reactions": null,
  "totalUniqueEmoji": null,
  "usersTruncated": null,
} satisfies InternalHandlersGetReactionsResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as InternalHandlersGetReactionsResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


