
# InternalHandlersCreateHubRequest


## Properties

Name | Type
------------ | -------------
`allowImagePosts` | boolean
`allowLinkPosts` | boolean
`allowTextPosts` | boolean
`allowVideoPosts` | boolean
`contentOptions` | string
`denyKeywords` | Array&lt;string&gt;
`description` | string
`name` | string
`nsfw` | boolean
`title` | string
`type` | string

## Example

```typescript
import type { InternalHandlersCreateHubRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "allowImagePosts": null,
  "allowLinkPosts": null,
  "allowTextPosts": null,
  "allowVideoPosts": null,
  "contentOptions": null,
  "denyKeywords": null,
  "description": null,
  "name": null,
  "nsfw": null,
  "title": null,
  "type": null,
} satisfies InternalHandlersCreateHubRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as InternalHandlersCreateHubRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


