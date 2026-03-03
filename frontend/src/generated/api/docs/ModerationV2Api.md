# ModerationV2Api

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**modCommentsIdApprovePost**](ModerationV2Api.md#modcommentsidapprovepost) | **POST** /mod/comments/{id}/approve | Approve comment |
| [**modCommentsIdRemovePost**](ModerationV2Api.md#modcommentsidremovepost) | **POST** /mod/comments/{id}/remove | Remove comment |
| [**modHubsHubNamePinnedOrderPost**](ModerationV2Api.md#modhubshubnamepinnedorderpost) | **POST** /mod/hubs/{hub_name}/pinned-order | Update pinned post order |
| [**modHubsHubnameBanPost**](ModerationV2Api.md#modhubshubnamebanpost) | **POST** /mod/hubs/{hubname}/ban | Ban user from hub |
| [**modHubsHubnameBanUseridDelete**](ModerationV2Api.md#modhubshubnamebanuseriddelete) | **DELETE** /mod/hubs/{hubname}/ban/{userid} | Unban user from hub |
| [**modHubsHubnameBansGet**](ModerationV2Api.md#modhubshubnamebansget) | **GET** /mod/hubs/{hubname}/bans | List hub bans |
| [**modHubsHubnameLogsGet**](ModerationV2Api.md#modhubshubnamelogsget) | **GET** /mod/hubs/{hubname}/logs | Get moderation log |
| [**modHubsHubnameRemovalReasonsGet**](ModerationV2Api.md#modhubshubnameremovalreasonsget) | **GET** /mod/hubs/{hubname}/removal-reasons | List removal reasons |
| [**modHubsHubnameRemovalReasonsPost**](ModerationV2Api.md#modhubshubnameremovalreasonspost) | **POST** /mod/hubs/{hubname}/removal-reasons | Create removal reason |
| [**modPostsIdApprovePost**](ModerationV2Api.md#modpostsidapprovepost) | **POST** /mod/posts/{id}/approve | Approve post |
| [**modPostsIdLockPost**](ModerationV2Api.md#modpostsidlockpost) | **POST** /mod/posts/{id}/lock | Lock post comments |
| [**modPostsIdPinPost**](ModerationV2Api.md#modpostsidpinpost) | **POST** /mod/posts/{id}/pin | Pin post |
| [**modPostsIdRemovePost**](ModerationV2Api.md#modpostsidremovepost) | **POST** /mod/posts/{id}/remove | Remove post |
| [**modPostsIdUnlockPost**](ModerationV2Api.md#modpostsidunlockpost) | **POST** /mod/posts/{id}/unlock | Unlock post comments |
| [**modPostsIdUnpinPost**](ModerationV2Api.md#modpostsidunpinpost) | **POST** /mod/posts/{id}/unpin | Unpin post |
| [**modRemovalReasonsIdDelete**](ModerationV2Api.md#modremovalreasonsiddelete) | **DELETE** /mod/removal-reasons/{id} | Delete removal reason |
| [**modRemovalReasonsIdPut**](ModerationV2Api.md#modremovalreasonsidput) | **PUT** /mod/removal-reasons/{id} | Update removal reason |



## modCommentsIdApprovePost

> { [key: string]: object; } modCommentsIdApprovePost(id)

Approve comment

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModCommentsIdApprovePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // number | Comment ID
    id: 56,
  } satisfies ModCommentsIdApprovePostRequest;

  try {
    const data = await api.modCommentsIdApprovePost(body);
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
| **id** | `number` | Comment ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modCommentsIdRemovePost

> { [key: string]: object; } modCommentsIdRemovePost(id)

Remove comment

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModCommentsIdRemovePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // number | Comment ID
    id: 56,
  } satisfies ModCommentsIdRemovePostRequest;

  try {
    const data = await api.modCommentsIdRemovePost(body);
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
| **id** | `number` | Comment ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modHubsHubNamePinnedOrderPost

> { [key: string]: object; } modHubsHubNamePinnedOrderPost(hubName)

Update pinned post order

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModHubsHubNamePinnedOrderPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // string | Hub name
    hubName: hubName_example,
  } satisfies ModHubsHubNamePinnedOrderPostRequest;

  try {
    const data = await api.modHubsHubNamePinnedOrderPost(body);
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
| **hubName** | `string` | Hub name | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modHubsHubnameBanPost

> { [key: string]: object; } modHubsHubnameBanPost(hubname)

Ban user from hub

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModHubsHubnameBanPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // string | Hub name
    hubname: hubname_example,
  } satisfies ModHubsHubnameBanPostRequest;

  try {
    const data = await api.modHubsHubnameBanPost(body);
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
| **hubname** | `string` | Hub name | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modHubsHubnameBanUseridDelete

> { [key: string]: object; } modHubsHubnameBanUseridDelete(hubname, userid)

Unban user from hub

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModHubsHubnameBanUseridDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // string | Hub name
    hubname: hubname_example,
    // number | User ID
    userid: 56,
  } satisfies ModHubsHubnameBanUseridDeleteRequest;

  try {
    const data = await api.modHubsHubnameBanUseridDelete(body);
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
| **hubname** | `string` | Hub name | [Defaults to `undefined`] |
| **userid** | `number` | User ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modHubsHubnameBansGet

> Array&lt;GithubComOmninudgeBackendInternalModelsHubBan&gt; modHubsHubnameBansGet(hubname)

List hub bans

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModHubsHubnameBansGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // string | Hub name
    hubname: hubname_example,
  } satisfies ModHubsHubnameBansGetRequest;

  try {
    const data = await api.modHubsHubnameBansGet(body);
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
| **hubname** | `string` | Hub name | [Defaults to `undefined`] |

### Return type

[**Array&lt;GithubComOmninudgeBackendInternalModelsHubBan&gt;**](GithubComOmninudgeBackendInternalModelsHubBan.md)

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modHubsHubnameLogsGet

> Array&lt;GithubComOmninudgeBackendInternalModelsModLog&gt; modHubsHubnameLogsGet(hubname, limit, offset)

Get moderation log

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModHubsHubnameLogsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // string | Hub name
    hubname: hubname_example,
    // number | Max results (optional)
    limit: 56,
    // number | Pagination offset (optional)
    offset: 56,
  } satisfies ModHubsHubnameLogsGetRequest;

  try {
    const data = await api.modHubsHubnameLogsGet(body);
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
| **hubname** | `string` | Hub name | [Defaults to `undefined`] |
| **limit** | `number` | Max results | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Pagination offset | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;GithubComOmninudgeBackendInternalModelsModLog&gt;**](GithubComOmninudgeBackendInternalModelsModLog.md)

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modHubsHubnameRemovalReasonsGet

> Array&lt;GithubComOmninudgeBackendInternalModelsRemovalReason&gt; modHubsHubnameRemovalReasonsGet(hubname)

List removal reasons

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModHubsHubnameRemovalReasonsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // string | Hub name
    hubname: hubname_example,
  } satisfies ModHubsHubnameRemovalReasonsGetRequest;

  try {
    const data = await api.modHubsHubnameRemovalReasonsGet(body);
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
| **hubname** | `string` | Hub name | [Defaults to `undefined`] |

### Return type

[**Array&lt;GithubComOmninudgeBackendInternalModelsRemovalReason&gt;**](GithubComOmninudgeBackendInternalModelsRemovalReason.md)

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


## modHubsHubnameRemovalReasonsPost

> GithubComOmninudgeBackendInternalModelsRemovalReason modHubsHubnameRemovalReasonsPost(hubname)

Create removal reason

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModHubsHubnameRemovalReasonsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // string | Hub name
    hubname: hubname_example,
  } satisfies ModHubsHubnameRemovalReasonsPostRequest;

  try {
    const data = await api.modHubsHubnameRemovalReasonsPost(body);
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
| **hubname** | `string` | Hub name | [Defaults to `undefined`] |

### Return type

[**GithubComOmninudgeBackendInternalModelsRemovalReason**](GithubComOmninudgeBackendInternalModelsRemovalReason.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Created |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modPostsIdApprovePost

> { [key: string]: object; } modPostsIdApprovePost(id)

Approve post

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModPostsIdApprovePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies ModPostsIdApprovePostRequest;

  try {
    const data = await api.modPostsIdApprovePost(body);
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
| **id** | `number` | Post ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modPostsIdLockPost

> { [key: string]: object; } modPostsIdLockPost(id)

Lock post comments

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModPostsIdLockPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies ModPostsIdLockPostRequest;

  try {
    const data = await api.modPostsIdLockPost(body);
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
| **id** | `number` | Post ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modPostsIdPinPost

> { [key: string]: object; } modPostsIdPinPost(id)

Pin post

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModPostsIdPinPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies ModPostsIdPinPostRequest;

  try {
    const data = await api.modPostsIdPinPost(body);
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
| **id** | `number` | Post ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modPostsIdRemovePost

> { [key: string]: object; } modPostsIdRemovePost(id)

Remove post

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModPostsIdRemovePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies ModPostsIdRemovePostRequest;

  try {
    const data = await api.modPostsIdRemovePost(body);
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
| **id** | `number` | Post ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modPostsIdUnlockPost

> { [key: string]: object; } modPostsIdUnlockPost(id)

Unlock post comments

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModPostsIdUnlockPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies ModPostsIdUnlockPostRequest;

  try {
    const data = await api.modPostsIdUnlockPost(body);
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
| **id** | `number` | Post ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modPostsIdUnpinPost

> { [key: string]: object; } modPostsIdUnpinPost(id)

Unpin post

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModPostsIdUnpinPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies ModPostsIdUnpinPostRequest;

  try {
    const data = await api.modPostsIdUnpinPost(body);
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
| **id** | `number` | Post ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modRemovalReasonsIdDelete

> modRemovalReasonsIdDelete(id)

Delete removal reason

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModRemovalReasonsIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // number | Removal reason ID
    id: 56,
  } satisfies ModRemovalReasonsIdDeleteRequest;

  try {
    const data = await api.modRemovalReasonsIdDelete(body);
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
| **id** | `number` | Removal reason ID | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **204** | No Content |  -  |
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modRemovalReasonsIdPut

> GithubComOmninudgeBackendInternalModelsRemovalReason modRemovalReasonsIdPut(id)

Update removal reason

### Example

```ts
import {
  Configuration,
  ModerationV2Api,
} from '';
import type { ModRemovalReasonsIdPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationV2Api(config);

  const body = {
    // number | Removal reason ID
    id: 56,
  } satisfies ModRemovalReasonsIdPutRequest;

  try {
    const data = await api.modRemovalReasonsIdPut(body);
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
| **id** | `number` | Removal reason ID | [Defaults to `undefined`] |

### Return type

[**GithubComOmninudgeBackendInternalModelsRemovalReason**](GithubComOmninudgeBackendInternalModelsRemovalReason.md)

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

