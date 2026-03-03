
# GithubComOmninudgeBackendInternalServicesRegisterRequest


## Properties

Name | Type
------------ | -------------
`acceptPrivacyPolicy` | boolean
`acceptTerms` | boolean
`email` | string
`password` | string
`turnstileToken` | string
`username` | string

## Example

```typescript
import type { GithubComOmninudgeBackendInternalServicesRegisterRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "acceptPrivacyPolicy": null,
  "acceptTerms": null,
  "email": null,
  "password": null,
  "turnstileToken": null,
  "username": null,
} satisfies GithubComOmninudgeBackendInternalServicesRegisterRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GithubComOmninudgeBackendInternalServicesRegisterRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


