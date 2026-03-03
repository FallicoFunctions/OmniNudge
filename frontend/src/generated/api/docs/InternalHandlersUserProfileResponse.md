
# InternalHandlersUserProfileResponse


## Properties

Name | Type
------------ | -------------
`avatarUrl` | string
`bio` | string
`createdAt` | string
`id` | number
`karma` | number
`lastSeen` | string
`moderatedHubs` | [Array&lt;InternalHandlersModeratedHubResponse&gt;](InternalHandlersModeratedHubResponse.md)
`publicKey` | string
`statusText` | string
`username` | string

## Example

```typescript
import type { InternalHandlersUserProfileResponse } from ''

// TODO: Update the object below with actual values
const example = {
  "avatarUrl": null,
  "bio": null,
  "createdAt": null,
  "id": null,
  "karma": null,
  "lastSeen": null,
  "moderatedHubs": null,
  "publicKey": null,
  "statusText": null,
  "username": null,
} satisfies InternalHandlersUserProfileResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as InternalHandlersUserProfileResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


