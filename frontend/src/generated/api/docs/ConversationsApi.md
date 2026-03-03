# ConversationsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**conversationsArchiveBatchPost**](ConversationsApi.md#conversationsarchivebatchpost) | **POST** /conversations/archive-batch | Archive conversations in batch |
| [**conversationsArchivedGet**](ConversationsApi.md#conversationsarchivedget) | **GET** /conversations/archived | Get archived conversations |
| [**conversationsGet**](ConversationsApi.md#conversationsget) | **GET** /conversations | Get conversations |
| [**conversationsIdArchivePut**](ConversationsApi.md#conversationsidarchiveput) | **PUT** /conversations/{id}/archive | Archive conversation |
| [**conversationsIdDelete**](ConversationsApi.md#conversationsiddelete) | **DELETE** /conversations/{id} | Delete conversation |
| [**conversationsIdGet**](ConversationsApi.md#conversationsidget) | **GET** /conversations/{id} | Get conversation |
| [**conversationsIdMutePut**](ConversationsApi.md#conversationsidmuteput) | **PUT** /conversations/{id}/mute | Mute conversation |
| [**conversationsIdUnarchivePut**](ConversationsApi.md#conversationsidunarchiveput) | **PUT** /conversations/{id}/unarchive | Unarchive conversation |
| [**conversationsIdUnmutePut**](ConversationsApi.md#conversationsidunmuteput) | **PUT** /conversations/{id}/unmute | Unmute conversation |
| [**conversationsPost**](ConversationsApi.md#conversationspost) | **POST** /conversations | Create conversation |



## conversationsArchiveBatchPost

> { [key: string]: object; } conversationsArchiveBatchPost()

Archive conversations in batch

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '';
import type { ConversationsArchiveBatchPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ConversationsApi(config);

  try {
    const data = await api.conversationsArchiveBatchPost();
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


## conversationsArchivedGet

> { [key: string]: object; } conversationsArchivedGet()

Get archived conversations

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '';
import type { ConversationsArchivedGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ConversationsApi(config);

  try {
    const data = await api.conversationsArchivedGet();
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


## conversationsGet

> { [key: string]: object; } conversationsGet()

Get conversations

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '';
import type { ConversationsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ConversationsApi(config);

  try {
    const data = await api.conversationsGet();
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


## conversationsIdArchivePut

> { [key: string]: object; } conversationsIdArchivePut(id)

Archive conversation

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '';
import type { ConversationsIdArchivePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ConversationsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdArchivePutRequest;

  try {
    const data = await api.conversationsIdArchivePut(body);
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


## conversationsIdDelete

> { [key: string]: object; } conversationsIdDelete(id)

Delete conversation

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '';
import type { ConversationsIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ConversationsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdDeleteRequest;

  try {
    const data = await api.conversationsIdDelete(body);
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


## conversationsIdGet

> GithubComOmninudgeBackendInternalModelsConversation conversationsIdGet(id)

Get conversation

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '';
import type { ConversationsIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ConversationsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdGetRequest;

  try {
    const data = await api.conversationsIdGet(body);
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

[**GithubComOmninudgeBackendInternalModelsConversation**](GithubComOmninudgeBackendInternalModelsConversation.md)

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
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdMutePut

> { [key: string]: object; } conversationsIdMutePut(id)

Mute conversation

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '';
import type { ConversationsIdMutePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ConversationsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdMutePutRequest;

  try {
    const data = await api.conversationsIdMutePut(body);
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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdUnarchivePut

> { [key: string]: object; } conversationsIdUnarchivePut(id)

Unarchive conversation

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '';
import type { ConversationsIdUnarchivePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ConversationsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdUnarchivePutRequest;

  try {
    const data = await api.conversationsIdUnarchivePut(body);
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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdUnmutePut

> { [key: string]: object; } conversationsIdUnmutePut(id)

Unmute conversation

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '';
import type { ConversationsIdUnmutePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ConversationsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdUnmutePutRequest;

  try {
    const data = await api.conversationsIdUnmutePut(body);
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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsPost

> GithubComOmninudgeBackendInternalModelsConversation conversationsPost()

Create conversation

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '';
import type { ConversationsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ConversationsApi(config);

  try {
    const data = await api.conversationsPost();
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

[**GithubComOmninudgeBackendInternalModelsConversation**](GithubComOmninudgeBackendInternalModelsConversation.md)

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

