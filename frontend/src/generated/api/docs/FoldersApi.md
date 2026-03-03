# FoldersApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**conversationsConversationIdFoldersGet**](FoldersApi.md#conversationsconversationidfoldersget) | **GET** /conversations/{conversation_id}/folders | Get conversation folders |
| [**foldersGet**](FoldersApi.md#foldersget) | **GET** /folders | List folders |
| [**foldersIdConversationsConversationIdDelete**](FoldersApi.md#foldersidconversationsconversationiddelete) | **DELETE** /folders/{id}/conversations/{conversation_id} | Remove conversation from folder |
| [**foldersIdConversationsGet**](FoldersApi.md#foldersidconversationsget) | **GET** /folders/{id}/conversations | Get folder conversations |
| [**foldersIdConversationsPost**](FoldersApi.md#foldersidconversationspost) | **POST** /folders/{id}/conversations | Add conversation to folder |
| [**foldersIdDelete**](FoldersApi.md#foldersiddelete) | **DELETE** /folders/{id} | Delete folder |
| [**foldersIdPut**](FoldersApi.md#foldersidput) | **PUT** /folders/{id} | Update folder |
| [**foldersPost**](FoldersApi.md#folderspost) | **POST** /folders | Create folder |
| [**foldersReorderPut**](FoldersApi.md#foldersreorderput) | **PUT** /folders/reorder | Reorder folders |



## conversationsConversationIdFoldersGet

> Array&lt;{ [key: string]: object; }&gt; conversationsConversationIdFoldersGet(conversationId)

Get conversation folders

### Example

```ts
import {
  Configuration,
  FoldersApi,
} from '';
import type { ConversationsConversationIdFoldersGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FoldersApi(config);

  const body = {
    // number | Conversation ID
    conversationId: 56,
  } satisfies ConversationsConversationIdFoldersGetRequest;

  try {
    const data = await api.conversationsConversationIdFoldersGet(body);
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
| **conversationId** | `number` | Conversation ID | [Defaults to `undefined`] |

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


## foldersGet

> Array&lt;{ [key: string]: object; }&gt; foldersGet()

List folders

### Example

```ts
import {
  Configuration,
  FoldersApi,
} from '';
import type { FoldersGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FoldersApi(config);

  try {
    const data = await api.foldersGet();
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


## foldersIdConversationsConversationIdDelete

> foldersIdConversationsConversationIdDelete(id, conversationId)

Remove conversation from folder

### Example

```ts
import {
  Configuration,
  FoldersApi,
} from '';
import type { FoldersIdConversationsConversationIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FoldersApi(config);

  const body = {
    // number | Folder ID
    id: 56,
    // number | Conversation ID
    conversationId: 56,
  } satisfies FoldersIdConversationsConversationIdDeleteRequest;

  try {
    const data = await api.foldersIdConversationsConversationIdDelete(body);
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
| **id** | `number` | Folder ID | [Defaults to `undefined`] |
| **conversationId** | `number` | Conversation ID | [Defaults to `undefined`] |

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
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## foldersIdConversationsGet

> Array&lt;{ [key: string]: object; }&gt; foldersIdConversationsGet(id)

Get folder conversations

### Example

```ts
import {
  Configuration,
  FoldersApi,
} from '';
import type { FoldersIdConversationsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FoldersApi(config);

  const body = {
    // number | Folder ID
    id: 56,
  } satisfies FoldersIdConversationsGetRequest;

  try {
    const data = await api.foldersIdConversationsGet(body);
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
| **id** | `number` | Folder ID | [Defaults to `undefined`] |

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
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## foldersIdConversationsPost

> { [key: string]: object; } foldersIdConversationsPost(id)

Add conversation to folder

### Example

```ts
import {
  Configuration,
  FoldersApi,
} from '';
import type { FoldersIdConversationsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FoldersApi(config);

  const body = {
    // number | Folder ID
    id: 56,
  } satisfies FoldersIdConversationsPostRequest;

  try {
    const data = await api.foldersIdConversationsPost(body);
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
| **id** | `number` | Folder ID | [Defaults to `undefined`] |

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


## foldersIdDelete

> foldersIdDelete(id)

Delete folder

### Example

```ts
import {
  Configuration,
  FoldersApi,
} from '';
import type { FoldersIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FoldersApi(config);

  const body = {
    // number | Folder ID
    id: 56,
  } satisfies FoldersIdDeleteRequest;

  try {
    const data = await api.foldersIdDelete(body);
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
| **id** | `number` | Folder ID | [Defaults to `undefined`] |

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
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## foldersIdPut

> { [key: string]: object; } foldersIdPut(id)

Update folder

### Example

```ts
import {
  Configuration,
  FoldersApi,
} from '';
import type { FoldersIdPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FoldersApi(config);

  const body = {
    // number | Folder ID
    id: 56,
  } satisfies FoldersIdPutRequest;

  try {
    const data = await api.foldersIdPut(body);
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
| **id** | `number` | Folder ID | [Defaults to `undefined`] |

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


## foldersPost

> { [key: string]: object; } foldersPost()

Create folder

### Example

```ts
import {
  Configuration,
  FoldersApi,
} from '';
import type { FoldersPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FoldersApi(config);

  try {
    const data = await api.foldersPost();
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


## foldersReorderPut

> { [key: string]: object; } foldersReorderPut()

Reorder folders

### Example

```ts
import {
  Configuration,
  FoldersApi,
} from '';
import type { FoldersReorderPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FoldersApi(config);

  try {
    const data = await api.foldersReorderPut();
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

