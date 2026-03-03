
# GithubComOmninudgeBackendInternalModelsFeatureFlag


## Properties

Name | Type
------------ | -------------
`autoRollback` | boolean
`createdAt` | string
`description` | string
`enabled` | boolean
`environment` | string
`key` | string
`metadata` | { [key: string]: any; }
`percentage` | number
`rollback` | [GithubComOmninudgeBackendInternalModelsRollbackTrigger](GithubComOmninudgeBackendInternalModelsRollbackTrigger.md)
`updatedAt` | string

## Example

```typescript
import type { GithubComOmninudgeBackendInternalModelsFeatureFlag } from ''

// TODO: Update the object below with actual values
const example = {
  "autoRollback": null,
  "createdAt": null,
  "description": null,
  "enabled": null,
  "environment": null,
  "key": null,
  "metadata": null,
  "percentage": null,
  "rollback": null,
  "updatedAt": null,
} satisfies GithubComOmninudgeBackendInternalModelsFeatureFlag

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GithubComOmninudgeBackendInternalModelsFeatureFlag
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


