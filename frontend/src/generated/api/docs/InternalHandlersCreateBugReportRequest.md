
# InternalHandlersCreateBugReportRequest


## Properties

Name | Type
------------ | -------------
`category` | string
`context` | { [key: string]: any; }
`description` | string
`feedbackCategory` | string
`feedbackType` | string
`pageUrl` | string
`rating` | number
`screenshotUrl` | string

## Example

```typescript
import type { InternalHandlersCreateBugReportRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "category": null,
  "context": null,
  "description": null,
  "feedbackCategory": null,
  "feedbackType": null,
  "pageUrl": null,
  "rating": null,
  "screenshotUrl": null,
} satisfies InternalHandlersCreateBugReportRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as InternalHandlersCreateBugReportRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


