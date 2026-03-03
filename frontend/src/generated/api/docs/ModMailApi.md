# ModMailApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**modMailHubsHubNameGet**](ModMailApi.md#modmailhubshubnameget) | **GET** /mod-mail/hubs/{hub_name} | List hub mod mail |
| [**modMailHubsHubNameRecipientsGet**](ModMailApi.md#modmailhubshubnamerecipientsget) | **GET** /mod-mail/hubs/{hub_name}/recipients | Get mod mail recipients |
| [**modMailIdGet**](ModMailApi.md#modmailidget) | **GET** /mod-mail/{id} | Get mod mail conversation |
| [**modMailIdStatusPatch**](ModMailApi.md#modmailidstatuspatch) | **PATCH** /mod-mail/{id}/status | Update mod mail status |
| [**modMailPost**](ModMailApi.md#modmailpost) | **POST** /mod-mail | Create mod mail |
| [**modMailUserGet**](ModMailApi.md#modmailuserget) | **GET** /mod-mail/user | Get my mod mail |



## modMailHubsHubNameGet

> Array&lt;{ [key: string]: object; }&gt; modMailHubsHubNameGet(hubName)

List hub mod mail

### Example

```ts
import {
  Configuration,
  ModMailApi,
} from '';
import type { ModMailHubsHubNameGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModMailApi(config);

  const body = {
    // string | Hub name
    hubName: hubName_example,
  } satisfies ModMailHubsHubNameGetRequest;

  try {
    const data = await api.modMailHubsHubNameGet(body);
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


## modMailHubsHubNameRecipientsGet

> Array&lt;{ [key: string]: object; }&gt; modMailHubsHubNameRecipientsGet(hubName)

Get mod mail recipients

### Example

```ts
import {
  Configuration,
  ModMailApi,
} from '';
import type { ModMailHubsHubNameRecipientsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModMailApi(config);

  const body = {
    // string | Hub name
    hubName: hubName_example,
  } satisfies ModMailHubsHubNameRecipientsGetRequest;

  try {
    const data = await api.modMailHubsHubNameRecipientsGet(body);
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


## modMailIdGet

> { [key: string]: object; } modMailIdGet(id)

Get mod mail conversation

### Example

```ts
import {
  Configuration,
  ModMailApi,
} from '';
import type { ModMailIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModMailApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ModMailIdGetRequest;

  try {
    const data = await api.modMailIdGet(body);
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
| **id** | `number` | Conversation ID | [Defaults to `undefined`] |

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
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modMailIdStatusPatch

> { [key: string]: object; } modMailIdStatusPatch(id)

Update mod mail status

### Example

```ts
import {
  Configuration,
  ModMailApi,
} from '';
import type { ModMailIdStatusPatchRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModMailApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ModMailIdStatusPatchRequest;

  try {
    const data = await api.modMailIdStatusPatch(body);
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
| **id** | `number` | Conversation ID | [Defaults to `undefined`] |

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


## modMailPost

> { [key: string]: object; } modMailPost()

Create mod mail

### Example

```ts
import {
  Configuration,
  ModMailApi,
} from '';
import type { ModMailPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModMailApi(config);

  try {
    const data = await api.modMailPost();
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
| **201** | Created |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## modMailUserGet

> Array&lt;{ [key: string]: object; }&gt; modMailUserGet()

Get my mod mail

### Example

```ts
import {
  Configuration,
  ModMailApi,
} from '';
import type { ModMailUserGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModMailApi(config);

  try {
    const data = await api.modMailUserGet();
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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

