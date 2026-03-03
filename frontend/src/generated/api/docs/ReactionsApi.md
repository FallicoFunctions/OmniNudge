# ReactionsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**messagesIdReactionsGet**](ReactionsApi.md#messagesidreactionsget) | **GET** /messages/{id}/reactions | Get reactions for a message |
| [**messagesIdReactionsPost**](ReactionsApi.md#messagesidreactionspost) | **POST** /messages/{id}/reactions | Add a reaction to a message |
| [**messagesIdReactionsReactionIdDelete**](ReactionsApi.md#messagesidreactionsreactioniddelete) | **DELETE** /messages/{id}/reactions/{reaction_id} | Remove a reaction from a message |



## messagesIdReactionsGet

> InternalHandlersGetReactionsResponse messagesIdReactionsGet(id)

Get reactions for a message

Returns aggregated emoji reactions for a message, ordered by

### Example

```ts
import {
  Configuration,
  ReactionsApi,
} from '';
import type { MessagesIdReactionsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ReactionsApi(config);

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
  ReactionsApi,
} from '';
import type { MessagesIdReactionsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ReactionsApi(config);

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
  ReactionsApi,
} from '';
import type { MessagesIdReactionsReactionIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ReactionsApi(config);

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

