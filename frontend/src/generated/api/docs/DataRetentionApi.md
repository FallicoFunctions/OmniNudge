# DataRetentionApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**adminRetentionHistoryGet**](DataRetentionApi.md#adminretentionhistoryget) | **GET** /admin/retention/history | Get retention history |
| [**adminRetentionPolicyDataTypePut**](DataRetentionApi.md#adminretentionpolicydatatypeput) | **PUT** /admin/retention/policy/{data_type} | Update retention policy |
| [**adminRetentionPolicyGet**](DataRetentionApi.md#adminretentionpolicyget) | **GET** /admin/retention/policy | Get retention policies |
| [**adminRetentionStatusGet**](DataRetentionApi.md#adminretentionstatusget) | **GET** /admin/retention/status | Get retention status |



## adminRetentionHistoryGet

> Array&lt;{ [key: string]: object; }&gt; adminRetentionHistoryGet()

Get retention history

### Example

```ts
import {
  Configuration,
  DataRetentionApi,
} from '';
import type { AdminRetentionHistoryGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new DataRetentionApi(config);

  try {
    const data = await api.adminRetentionHistoryGet();
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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminRetentionPolicyDataTypePut

> { [key: string]: object; } adminRetentionPolicyDataTypePut(dataType)

Update retention policy

### Example

```ts
import {
  Configuration,
  DataRetentionApi,
} from '';
import type { AdminRetentionPolicyDataTypePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new DataRetentionApi(config);

  const body = {
    // string | Data type
    dataType: dataType_example,
  } satisfies AdminRetentionPolicyDataTypePutRequest;

  try {
    const data = await api.adminRetentionPolicyDataTypePut(body);
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
| **dataType** | `string` | Data type | [Defaults to `undefined`] |

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


## adminRetentionPolicyGet

> Array&lt;{ [key: string]: object; }&gt; adminRetentionPolicyGet()

Get retention policies

### Example

```ts
import {
  Configuration,
  DataRetentionApi,
} from '';
import type { AdminRetentionPolicyGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new DataRetentionApi(config);

  try {
    const data = await api.adminRetentionPolicyGet();
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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminRetentionStatusGet

> { [key: string]: object; } adminRetentionStatusGet()

Get retention status

### Example

```ts
import {
  Configuration,
  DataRetentionApi,
} from '';
import type { AdminRetentionStatusGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new DataRetentionApi(config);

  try {
    const data = await api.adminRetentionStatusGet();
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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

