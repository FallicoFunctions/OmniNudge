# MessagesApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**conversationsIdMessagesGet**](MessagesApi.md#conversationsidmessagesget) | **GET** /conversations/{id}/messages | Get conversation messages |
| [**conversationsIdPinnedMessagesGet**](MessagesApi.md#conversationsidpinnedmessagesget) | **GET** /conversations/{id}/pinned-messages | Get pinned messages |
| [**conversationsIdReadPost**](MessagesApi.md#conversationsidreadpost) | **POST** /conversations/{id}/read | Mark conversation as read |
| [**messagesForwardPost**](MessagesApi.md#messagesforwardpost) | **POST** /messages/forward | Forward message |
| [**messagesIdDelete**](MessagesApi.md#messagesiddelete) | **DELETE** /messages/{id} | Delete message |
| [**messagesIdForwardInfoGet**](MessagesApi.md#messagesidforwardinfoget) | **GET** /messages/{id}/forward-info | Get message forward info |
| [**messagesIdHistoryGet**](MessagesApi.md#messagesidhistoryget) | **GET** /messages/{id}/history | Get message edit history |
| [**messagesIdPatch**](MessagesApi.md#messagesidpatch) | **PATCH** /messages/{id} | Edit message |
| [**messagesIdPinDelete**](MessagesApi.md#messagesidpindelete) | **DELETE** /messages/{id}/pin | Unpin message |
| [**messagesIdPinPost**](MessagesApi.md#messagesidpinpost) | **POST** /messages/{id}/pin | Pin message |
| [**messagesIdReactionsGet**](MessagesApi.md#messagesidreactionsget) | **GET** /messages/{id}/reactions | Get reactions for a message |
| [**messagesIdReactionsPost**](MessagesApi.md#messagesidreactionspost) | **POST** /messages/{id}/reactions | Add a reaction to a message |
| [**messagesIdReactionsReactionIdDelete**](MessagesApi.md#messagesidreactionsreactioniddelete) | **DELETE** /messages/{id}/reactions/{reaction_id} | Remove a reaction from a message |
| [**messagesIdReadPost**](MessagesApi.md#messagesidreadpost) | **POST** /messages/{id}/read | Mark single message as read |
| [**messagesIdThreadGet**](MessagesApi.md#messagesidthreadget) | **GET** /messages/{id}/thread | Get message thread |
| [**messagesIdThreadMutePut**](MessagesApi.md#messagesidthreadmuteput) | **PUT** /messages/{id}/thread/mute | Mute thread |
| [**messagesIdThreadUnmutePut**](MessagesApi.md#messagesidthreadunmuteput) | **PUT** /messages/{id}/thread/unmute | Unmute thread |
| [**messagesPost**](MessagesApi.md#messagespost) | **POST** /messages | Send message |



## conversationsIdMessagesGet

> { [key: string]: object; } conversationsIdMessagesGet(id, limit, before, after)

Get conversation messages

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { ConversationsIdMessagesGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
    // number | Page size (default 50) (optional)
    limit: 56,
    // number | Load messages before this ID (optional)
    before: 56,
    // number | Load messages after this ID (optional)
    after: 56,
  } satisfies ConversationsIdMessagesGetRequest;

  try {
    const data = await api.conversationsIdMessagesGet(body);
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
| **limit** | `number` | Page size (default 50) | [Optional] [Defaults to `undefined`] |
| **before** | `number` | Load messages before this ID | [Optional] [Defaults to `undefined`] |
| **after** | `number` | Load messages after this ID | [Optional] [Defaults to `undefined`] |

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


## conversationsIdPinnedMessagesGet

> { [key: string]: object; } conversationsIdPinnedMessagesGet(id)

Get pinned messages

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { ConversationsIdPinnedMessagesGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdPinnedMessagesGetRequest;

  try {
    const data = await api.conversationsIdPinnedMessagesGet(body);
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


## conversationsIdReadPost

> { [key: string]: object; } conversationsIdReadPost(id)

Mark conversation as read

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { ConversationsIdReadPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdReadPostRequest;

  try {
    const data = await api.conversationsIdReadPost(body);
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


## messagesForwardPost

> GithubComOmninudgeBackendInternalModelsMessage messagesForwardPost()

Forward message

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesForwardPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  try {
    const data = await api.messagesForwardPost();
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

[**GithubComOmninudgeBackendInternalModelsMessage**](GithubComOmninudgeBackendInternalModelsMessage.md)

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


## messagesIdDelete

> { [key: string]: object; } messagesIdDelete(id)

Delete message

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
  } satisfies MessagesIdDeleteRequest;

  try {
    const data = await api.messagesIdDelete(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |

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


## messagesIdForwardInfoGet

> { [key: string]: object; } messagesIdForwardInfoGet(id)

Get message forward info

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdForwardInfoGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
  } satisfies MessagesIdForwardInfoGetRequest;

  try {
    const data = await api.messagesIdForwardInfoGet(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |

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


## messagesIdHistoryGet

> { [key: string]: object; } messagesIdHistoryGet(id)

Get message edit history

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdHistoryGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
  } satisfies MessagesIdHistoryGetRequest;

  try {
    const data = await api.messagesIdHistoryGet(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |

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


## messagesIdPatch

> GithubComOmninudgeBackendInternalModelsMessage messagesIdPatch(id)

Edit message

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdPatchRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
  } satisfies MessagesIdPatchRequest;

  try {
    const data = await api.messagesIdPatch(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |

### Return type

[**GithubComOmninudgeBackendInternalModelsMessage**](GithubComOmninudgeBackendInternalModelsMessage.md)

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


## messagesIdPinDelete

> { [key: string]: object; } messagesIdPinDelete(id)

Unpin message

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdPinDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
  } satisfies MessagesIdPinDeleteRequest;

  try {
    const data = await api.messagesIdPinDelete(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |

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


## messagesIdPinPost

> { [key: string]: object; } messagesIdPinPost(id)

Pin message

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdPinPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
  } satisfies MessagesIdPinPostRequest;

  try {
    const data = await api.messagesIdPinPost(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |

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


## messagesIdReactionsGet

> InternalHandlersGetReactionsResponse messagesIdReactionsGet(id)

Get reactions for a message

Returns aggregated emoji reactions for a message, ordered by

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdReactionsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
  } satisfies MessagesIdReactionsGetRequest;

  try {
    const data = await api.messagesIdReactionsGet(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |

### Return type

[**InternalHandlersGetReactionsResponse**](InternalHandlersGetReactionsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Invalid message ID |  -  |
| **401** | Unauthenticated |  -  |
| **403** | Not a participant |  -  |
| **404** | Message not found |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## messagesIdReactionsPost

> GithubComOmninudgeBackendInternalModelsMessageReaction messagesIdReactionsPost(id, request)

Add a reaction to a message

Adds an emoji reaction to a message. Each user may add at most one

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdReactionsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
    // InternalHandlersAddReactionRequest | Emoji to react with
    request: ...,
  } satisfies MessagesIdReactionsPostRequest;

  try {
    const data = await api.messagesIdReactionsPost(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |
| **request** | [InternalHandlersAddReactionRequest](InternalHandlersAddReactionRequest.md) | Emoji to react with | |

### Return type

[**GithubComOmninudgeBackendInternalModelsMessageReaction**](GithubComOmninudgeBackendInternalModelsMessageReaction.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Created |  -  |
| **400** | Invalid request or emoji |  -  |
| **401** | Unauthenticated |  -  |
| **403** | Not a conversation participant |  -  |
| **404** | Message not found |  -  |
| **409** | Already reacted / too many emoji |  -  |
| **429** | Rate limit exceeded |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## messagesIdReactionsReactionIdDelete

> { [key: string]: string; } messagesIdReactionsReactionIdDelete(id, reactionId)

Remove a reaction from a message

Removes a reaction by its ID. Only the user who added the reaction

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdReactionsReactionIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
    // number | Reaction ID
    reactionId: 56,
  } satisfies MessagesIdReactionsReactionIdDeleteRequest;

  try {
    const data = await api.messagesIdReactionsReactionIdDelete(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |
| **reactionId** | `number` | Reaction ID | [Defaults to `undefined`] |

### Return type

**{ [key: string]: string; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Reaction removed |  -  |
| **400** | Invalid IDs |  -  |
| **401** | Unauthenticated |  -  |
| **403** | Not the reaction owner |  -  |
| **404** | Reaction not found |  -  |
| **429** | Rate limit exceeded |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## messagesIdReadPost

> { [key: string]: object; } messagesIdReadPost(id)

Mark single message as read

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdReadPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
  } satisfies MessagesIdReadPostRequest;

  try {
    const data = await api.messagesIdReadPost(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |

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


## messagesIdThreadGet

> { [key: string]: object; } messagesIdThreadGet(id)

Get message thread

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdThreadGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Root message ID
    id: 56,
  } satisfies MessagesIdThreadGetRequest;

  try {
    const data = await api.messagesIdThreadGet(body);
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
| **id** | `number` | Root message ID | [Defaults to `undefined`] |

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


## messagesIdThreadMutePut

> { [key: string]: object; } messagesIdThreadMutePut(id)

Mute thread

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdThreadMutePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Root message ID
    id: 56,
  } satisfies MessagesIdThreadMutePutRequest;

  try {
    const data = await api.messagesIdThreadMutePut(body);
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
| **id** | `number` | Root message ID | [Defaults to `undefined`] |

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


## messagesIdThreadUnmutePut

> { [key: string]: object; } messagesIdThreadUnmutePut(id)

Unmute thread

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesIdThreadUnmutePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  const body = {
    // number | Root message ID
    id: 56,
  } satisfies MessagesIdThreadUnmutePutRequest;

  try {
    const data = await api.messagesIdThreadUnmutePut(body);
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
| **id** | `number` | Root message ID | [Defaults to `undefined`] |

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


## messagesPost

> GithubComOmninudgeBackendInternalModelsMessage messagesPost()

Send message

### Example

```ts
import {
  Configuration,
  MessagesApi,
} from '';
import type { MessagesPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MessagesApi(config);

  try {
    const data = await api.messagesPost();
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

[**GithubComOmninudgeBackendInternalModelsMessage**](GithubComOmninudgeBackendInternalModelsMessage.md)

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

