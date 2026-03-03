# UsersApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**usersBlockPost**](UsersApi.md#usersblockpost) | **POST** /users/block | Block user |
| [**usersBlockUsernameDelete**](UsersApi.md#usersblockusernamedelete) | **DELETE** /users/block/{username} | Unblock user |
| [**usersBlockedGet**](UsersApi.md#usersblockedget) | **GET** /users/blocked | Get blocked users |
| [**usersChangePasswordPost**](UsersApi.md#userschangepasswordpost) | **POST** /users/change-password | Change password |
| [**usersEmailPut**](UsersApi.md#usersemailput) | **PUT** /users/email | Update email |
| [**usersIdIdProfileGet**](UsersApi.md#usersididprofileget) | **GET** /users/id/{id}/profile | Get user profile by ID |
| [**usersMeAgentBrowsePost**](UsersApi.md#usersmeagentbrowsepost) | **POST** /users/me/agent/browse | Record agent browse activity |
| [**usersMeAgentPostPost**](UsersApi.md#usersmeagentpostpost) | **POST** /users/me/agent/post | Record agent post activity |
| [**usersMeAgentStatePost**](UsersApi.md#usersmeagentstatepost) | **POST** /users/me/agent/state | Get agent state |
| [**usersMeAvatarPost**](UsersApi.md#usersmeavatarpost) | **POST** /users/me/avatar | Upload avatar |
| [**usersMePingPost**](UsersApi.md#usersmepingpost) | **POST** /users/me/ping | Ping (update last seen) |
| [**usersMeProfileGet**](UsersApi.md#usersmeprofileget) | **GET** /users/me/profile | Get my profile |
| [**usersMeProfilePut**](UsersApi.md#usersmeprofileput) | **PUT** /users/me/profile | Update profile |
| [**usersUsernameCommentsGet**](UsersApi.md#usersusernamecommentsget) | **GET** /users/{username}/comments | Get user comments |
| [**usersUsernameGet**](UsersApi.md#usersusernameget) | **GET** /users/{username} | Get user profile |
| [**usersUsernamePostsGet**](UsersApi.md#usersusernamepostsget) | **GET** /users/{username}/posts | Get user posts |



## usersBlockPost

> { [key: string]: object; } usersBlockPost()

Block user

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersBlockPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersBlockPost();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersBlockUsernameDelete

> { [key: string]: object; } usersBlockUsernameDelete(username)

Unblock user

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersBlockUsernameDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  const body = {
    // string | Username to unblock
    username: username_example,
  } satisfies UsersBlockUsernameDeleteRequest;

  try {
    const data = await api.usersBlockUsernameDelete(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **username** | `string` | Username to unblock | [Defaults to `undefined`] |

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **401** | Unauthorized |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersBlockedGet

> { [key: string]: object; } usersBlockedGet()

Get blocked users

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersBlockedGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersBlockedGet();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersChangePasswordPost

> { [key: string]: object; } usersChangePasswordPost()

Change password

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersChangePasswordPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersChangePasswordPost();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersEmailPut

> { [key: string]: object; } usersEmailPut()

Update email

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersEmailPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersEmailPut();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersIdIdProfileGet

> InternalHandlersUserProfileResponse usersIdIdProfileGet(id)

Get user profile by ID

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersIdIdProfileGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new UsersApi();

  const body = {
    // number | User ID
    id: 56,
  } satisfies UsersIdIdProfileGetRequest;

  try {
    const data = await api.usersIdIdProfileGet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `number` | User ID | [Defaults to `undefined`] |

### Return type

[**InternalHandlersUserProfileResponse**](InternalHandlersUserProfileResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersMeAgentBrowsePost

> { [key: string]: object; } usersMeAgentBrowsePost()

Record agent browse activity

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersMeAgentBrowsePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersMeAgentBrowsePost();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersMeAgentPostPost

> { [key: string]: object; } usersMeAgentPostPost()

Record agent post activity

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersMeAgentPostPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersMeAgentPostPost();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersMeAgentStatePost

> { [key: string]: object; } usersMeAgentStatePost()

Get agent state

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersMeAgentStatePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersMeAgentStatePost();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersMeAvatarPost

> { [key: string]: object; } usersMeAvatarPost()

Upload avatar

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersMeAvatarPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersMeAvatarPost();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersMePingPost

> { [key: string]: object; } usersMePingPost()

Ping (update last seen)

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersMePingPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersMePingPost();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersMeProfileGet

> InternalHandlersUserProfileResponse usersMeProfileGet()

Get my profile

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersMeProfileGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersMeProfileGet();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**InternalHandlersUserProfileResponse**](InternalHandlersUserProfileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersMeProfilePut

> GithubComOmninudgeBackendInternalModelsUser usersMeProfilePut()

Update profile

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersMeProfilePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new UsersApi(config);

  try {
    const data = await api.usersMeProfilePut();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**GithubComOmninudgeBackendInternalModelsUser**](GithubComOmninudgeBackendInternalModelsUser.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersUsernameCommentsGet

> { [key: string]: object; } usersUsernameCommentsGet(username, limit, offset)

Get user comments

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersUsernameCommentsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new UsersApi();

  const body = {
    // string | Username
    username: username_example,
    // number | Page size (default 20) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
  } satisfies UsersUsernameCommentsGetRequest;

  try {
    const data = await api.usersUsernameCommentsGet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **username** | `string` | Username | [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 20) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |

### Return type

**{ [key: string]: object; }**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersUsernameGet

> InternalHandlersUserProfileResponse usersUsernameGet(username)

Get user profile

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersUsernameGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new UsersApi();

  const body = {
    // string | Username
    username: username_example,
  } satisfies UsersUsernameGetRequest;

  try {
    const data = await api.usersUsernameGet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **username** | `string` | Username | [Defaults to `undefined`] |

### Return type

[**InternalHandlersUserProfileResponse**](InternalHandlersUserProfileResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersUsernamePostsGet

> { [key: string]: object; } usersUsernamePostsGet(username, limit, offset)

Get user posts

### Example

```ts
import {
  Configuration,
  UsersApi,
} from '';
import type { UsersUsernamePostsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new UsersApi();

  const body = {
    // string | Username
    username: username_example,
    // number | Page size (default 20) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
  } satisfies UsersUsernamePostsGetRequest;

  try {
    const data = await api.usersUsernamePostsGet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **username** | `string` | Username | [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 20) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |

### Return type

**{ [key: string]: object; }**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

