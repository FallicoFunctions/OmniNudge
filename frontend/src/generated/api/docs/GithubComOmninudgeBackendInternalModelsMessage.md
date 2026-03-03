
# GithubComOmninudgeBackendInternalModelsMessage


## Properties

Name | Type
------------ | -------------
`conversationId` | number
`deletedForRecipient` | boolean
`deletedForSender` | boolean
`deliveredAt` | string
`edited` | boolean
`editedAt` | string
`encryptedContent` | string
`encryptionVersion` | string
`hasReactions` | boolean
`id` | number
`isMultiRecipient` | boolean
`mediaEncryptionIv` | string
`mediaEncryptionKey` | string
`mediaFileId` | number
`mediaSize` | number
`mediaType` | string
`mediaUrl` | string
`messageType` | string
`pinned` | boolean
`pinnedAt` | string
`pinnedBy` | number
`readAt` | string
`recipientId` | number
`recipientKeys` | { [key: string]: string; }
`replyCount` | number
`replyTo` | number
`senderEncryptedContent` | string
`senderId` | number
`senderMediaEncryptionKey` | string
`sentAt` | string
`sharedEncryptionIv` | string
`threadRoot` | number

## Example

```typescript
import type { GithubComOmninudgeBackendInternalModelsMessage } from ''

// TODO: Update the object below with actual values
const example = {
  "conversationId": null,
  "deletedForRecipient": null,
  "deletedForSender": null,
  "deliveredAt": null,
  "edited": null,
  "editedAt": null,
  "encryptedContent": null,
  "encryptionVersion": null,
  "hasReactions": null,
  "id": null,
  "isMultiRecipient": null,
  "mediaEncryptionIv": null,
  "mediaEncryptionKey": null,
  "mediaFileId": null,
  "mediaSize": null,
  "mediaType": null,
  "mediaUrl": null,
  "messageType": null,
  "pinned": null,
  "pinnedAt": null,
  "pinnedBy": null,
  "readAt": null,
  "recipientId": null,
  "recipientKeys": null,
  "replyCount": null,
  "replyTo": null,
  "senderEncryptedContent": null,
  "senderId": null,
  "senderMediaEncryptionKey": null,
  "sentAt": null,
  "sharedEncryptionIv": null,
  "threadRoot": null,
} satisfies GithubComOmninudgeBackendInternalModelsMessage

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GithubComOmninudgeBackendInternalModelsMessage
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


