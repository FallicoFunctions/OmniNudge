# FeatureFlagsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**adminFeatureFlagsGet**](FeatureFlagsApi.md#adminfeatureflagsget) | **GET** /admin/feature-flags | List feature flags |
| [**adminFeatureFlagsKeyAuditGet**](FeatureFlagsApi.md#adminfeatureflagskeyauditget) | **GET** /admin/feature-flags/{key}/audit | Get flag audit log |
| [**adminFeatureFlagsKeyDelete**](FeatureFlagsApi.md#adminfeatureflagskeydelete) | **DELETE** /admin/feature-flags/{key} | Delete feature flag |
| [**adminFeatureFlagsKeyGet**](FeatureFlagsApi.md#adminfeatureflagskeyget) | **GET** /admin/feature-flags/{key} | Get feature flag |
| [**adminFeatureFlagsKeyOverridesPost**](FeatureFlagsApi.md#adminfeatureflagskeyoverridespost) | **POST** /admin/feature-flags/{key}/overrides | Set flag override |
| [**adminFeatureFlagsKeyOverridesUserIDDelete**](FeatureFlagsApi.md#adminfeatureflagskeyoverridesuseriddelete) | **DELETE** /admin/feature-flags/{key}/overrides/{userID} | Remove flag override |
| [**adminFeatureFlagsKeyPut**](FeatureFlagsApi.md#adminfeatureflagskeyput) | **PUT** /admin/feature-flags/{key} | Update feature flag |
| [**adminFeatureFlagsPost**](FeatureFlagsApi.md#adminfeatureflagspost) | **POST** /admin/feature-flags | Create feature flag |
| [**featureFlagsGet**](FeatureFlagsApi.md#featureflagsget) | **GET** /feature-flags | Get my feature flags |



## adminFeatureFlagsGet

> Array&lt;GithubComOmninudgeBackendInternalModelsFeatureFlag&gt; adminFeatureFlagsGet()

List feature flags

### Example

```ts
import {
  Configuration,
  FeatureFlagsApi,
} from '';
import type { AdminFeatureFlagsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FeatureFlagsApi(config);

  try {
    const data = await api.adminFeatureFlagsGet();
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

[**Array&lt;GithubComOmninudgeBackendInternalModelsFeatureFlag&gt;**](GithubComOmninudgeBackendInternalModelsFeatureFlag.md)

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


## adminFeatureFlagsKeyAuditGet

> Array&lt;{ [key: string]: object; }&gt; adminFeatureFlagsKeyAuditGet(key)

Get flag audit log

### Example

```ts
import {
  Configuration,
  FeatureFlagsApi,
} from '';
import type { AdminFeatureFlagsKeyAuditGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FeatureFlagsApi(config);

  const body = {
    // string | Flag key
    key: key_example,
  } satisfies AdminFeatureFlagsKeyAuditGetRequest;

  try {
    const data = await api.adminFeatureFlagsKeyAuditGet(body);
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
| **key** | `string` | Flag key | [Defaults to `undefined`] |

### Return type

**Array<{ [key: string]: object; }>**

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


## adminFeatureFlagsKeyDelete

> adminFeatureFlagsKeyDelete(key)

Delete feature flag

### Example

```ts
import {
  Configuration,
  FeatureFlagsApi,
} from '';
import type { AdminFeatureFlagsKeyDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FeatureFlagsApi(config);

  const body = {
    // string | Flag key
    key: key_example,
  } satisfies AdminFeatureFlagsKeyDeleteRequest;

  try {
    const data = await api.adminFeatureFlagsKeyDelete(body);
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
| **key** | `string` | Flag key | [Defaults to `undefined`] |

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminFeatureFlagsKeyGet

> GithubComOmninudgeBackendInternalModelsFeatureFlag adminFeatureFlagsKeyGet(key)

Get feature flag

### Example

```ts
import {
  Configuration,
  FeatureFlagsApi,
} from '';
import type { AdminFeatureFlagsKeyGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FeatureFlagsApi(config);

  const body = {
    // string | Flag key
    key: key_example,
  } satisfies AdminFeatureFlagsKeyGetRequest;

  try {
    const data = await api.adminFeatureFlagsKeyGet(body);
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
| **key** | `string` | Flag key | [Defaults to `undefined`] |

### Return type

[**GithubComOmninudgeBackendInternalModelsFeatureFlag**](GithubComOmninudgeBackendInternalModelsFeatureFlag.md)

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


## adminFeatureFlagsKeyOverridesPost

> { [key: string]: object; } adminFeatureFlagsKeyOverridesPost(key)

Set flag override

### Example

```ts
import {
  Configuration,
  FeatureFlagsApi,
} from '';
import type { AdminFeatureFlagsKeyOverridesPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FeatureFlagsApi(config);

  const body = {
    // string | Flag key
    key: key_example,
  } satisfies AdminFeatureFlagsKeyOverridesPostRequest;

  try {
    const data = await api.adminFeatureFlagsKeyOverridesPost(body);
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
| **key** | `string` | Flag key | [Defaults to `undefined`] |

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


## adminFeatureFlagsKeyOverridesUserIDDelete

> adminFeatureFlagsKeyOverridesUserIDDelete(key, userID)

Remove flag override

### Example

```ts
import {
  Configuration,
  FeatureFlagsApi,
} from '';
import type { AdminFeatureFlagsKeyOverridesUserIDDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FeatureFlagsApi(config);

  const body = {
    // string | Flag key
    key: key_example,
    // number | User ID
    userID: 56,
  } satisfies AdminFeatureFlagsKeyOverridesUserIDDeleteRequest;

  try {
    const data = await api.adminFeatureFlagsKeyOverridesUserIDDelete(body);
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
| **key** | `string` | Flag key | [Defaults to `undefined`] |
| **userID** | `number` | User ID | [Defaults to `undefined`] |

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminFeatureFlagsKeyPut

> GithubComOmninudgeBackendInternalModelsFeatureFlag adminFeatureFlagsKeyPut(key)

Update feature flag

### Example

```ts
import {
  Configuration,
  FeatureFlagsApi,
} from '';
import type { AdminFeatureFlagsKeyPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FeatureFlagsApi(config);

  const body = {
    // string | Flag key
    key: key_example,
  } satisfies AdminFeatureFlagsKeyPutRequest;

  try {
    const data = await api.adminFeatureFlagsKeyPut(body);
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
| **key** | `string` | Flag key | [Defaults to `undefined`] |

### Return type

[**GithubComOmninudgeBackendInternalModelsFeatureFlag**](GithubComOmninudgeBackendInternalModelsFeatureFlag.md)

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


## adminFeatureFlagsPost

> GithubComOmninudgeBackendInternalModelsFeatureFlag adminFeatureFlagsPost()

Create feature flag

### Example

```ts
import {
  Configuration,
  FeatureFlagsApi,
} from '';
import type { AdminFeatureFlagsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FeatureFlagsApi(config);

  try {
    const data = await api.adminFeatureFlagsPost();
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

[**GithubComOmninudgeBackendInternalModelsFeatureFlag**](GithubComOmninudgeBackendInternalModelsFeatureFlag.md)

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## featureFlagsGet

> { [key: string]: object; } featureFlagsGet(keys)

Get my feature flags

### Example

```ts
import {
  Configuration,
  FeatureFlagsApi,
} from '';
import type { FeatureFlagsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FeatureFlagsApi(config);

  const body = {
    // string | Comma-separated flag keys (optional)
    keys: keys_example,
  } satisfies FeatureFlagsGetRequest;

  try {
    const data = await api.featureFlagsGet(body);
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
| **keys** | `string` | Comma-separated flag keys | [Optional] [Defaults to `undefined`] |

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

