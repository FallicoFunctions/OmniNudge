# CallsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**callsIceServersGet**](CallsApi.md#callsiceserversget) | **GET** /calls/ice-servers | Get ICE server configuration for WebRTC |
| [**callsIdAnswerPost**](CallsApi.md#callsidanswerpost) | **POST** /calls/{id}/answer | Answer an incoming call |
| [**callsIdEndPost**](CallsApi.md#callsidendpost) | **POST** /calls/{id}/end | End an active or ringing call |
| [**callsIdRejectPost**](CallsApi.md#callsidrejectpost) | **POST** /calls/{id}/reject | Reject an incoming call |
| [**callsIdScreenShareStartPost**](CallsApi.md#callsidscreensharestartpost) | **POST** /calls/{id}/screen-share/start | Signal that the caller has started screen sharing |
| [**callsIdScreenShareStopPost**](CallsApi.md#callsidscreensharestoppost) | **POST** /calls/{id}/screen-share/stop | Signal that the caller has stopped screen sharing |
| [**callsIdSignalPost**](CallsApi.md#callsidsignalpost) | **POST** /calls/{id}/signal | Relay a WebRTC signaling message |
| [**conversationsIdCallsGet**](CallsApi.md#conversationsidcallsget) | **GET** /conversations/{id}/calls | Get call history for a conversation |
| [**conversationsIdCallsPost**](CallsApi.md#conversationsidcallspost) | **POST** /conversations/{id}/calls | Start a voice or video call |



## callsIceServersGet

> { [key: string]: object; } callsIceServersGet()

Get ICE server configuration for WebRTC

### Example

```ts
import {
  Configuration,
  CallsApi,
} from '';
import type { CallsIceServersGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CallsApi();

  try {
    const data = await api.callsIceServersGet();
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

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## callsIdAnswerPost

> GithubComOmninudgeBackendInternalModelsCall callsIdAnswerPost(id)

Answer an incoming call

### Example

```ts
import {
  Configuration,
  CallsApi,
} from '';
import type { CallsIdAnswerPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CallsApi();

  const body = {
    // number | Call ID
    id: 56,
  } satisfies CallsIdAnswerPostRequest;

  try {
    const data = await api.callsIdAnswerPost(body);
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
| **id** | `number` | Call ID | [Defaults to `undefined`] |

### Return type

[**GithubComOmninudgeBackendInternalModelsCall**](GithubComOmninudgeBackendInternalModelsCall.md)

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
| **403** | Forbidden |  -  |
| **409** | Conflict |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## callsIdEndPost

> GithubComOmninudgeBackendInternalModelsCall callsIdEndPost(id)

End an active or ringing call

### Example

```ts
import {
  Configuration,
  CallsApi,
} from '';
import type { CallsIdEndPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CallsApi();

  const body = {
    // number | Call ID
    id: 56,
  } satisfies CallsIdEndPostRequest;

  try {
    const data = await api.callsIdEndPost(body);
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
| **id** | `number` | Call ID | [Defaults to `undefined`] |

### Return type

[**GithubComOmninudgeBackendInternalModelsCall**](GithubComOmninudgeBackendInternalModelsCall.md)

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
| **403** | Forbidden |  -  |
| **409** | Conflict |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## callsIdRejectPost

> GithubComOmninudgeBackendInternalModelsCall callsIdRejectPost(id)

Reject an incoming call

### Example

```ts
import {
  Configuration,
  CallsApi,
} from '';
import type { CallsIdRejectPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CallsApi();

  const body = {
    // number | Call ID
    id: 56,
  } satisfies CallsIdRejectPostRequest;

  try {
    const data = await api.callsIdRejectPost(body);
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
| **id** | `number` | Call ID | [Defaults to `undefined`] |

### Return type

[**GithubComOmninudgeBackendInternalModelsCall**](GithubComOmninudgeBackendInternalModelsCall.md)

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
| **403** | Forbidden |  -  |
| **409** | Conflict |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## callsIdScreenShareStartPost

> { [key: string]: object; } callsIdScreenShareStartPost(id)

Signal that the caller has started screen sharing

### Example

```ts
import {
  Configuration,
  CallsApi,
} from '';
import type { CallsIdScreenShareStartPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CallsApi();

  const body = {
    // number | Call ID
    id: 56,
  } satisfies CallsIdScreenShareStartPostRequest;

  try {
    const data = await api.callsIdScreenShareStartPost(body);
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
| **id** | `number` | Call ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## callsIdScreenShareStopPost

> { [key: string]: object; } callsIdScreenShareStopPost(id)

Signal that the caller has stopped screen sharing

### Example

```ts
import {
  Configuration,
  CallsApi,
} from '';
import type { CallsIdScreenShareStopPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CallsApi();

  const body = {
    // number | Call ID
    id: 56,
  } satisfies CallsIdScreenShareStopPostRequest;

  try {
    const data = await api.callsIdScreenShareStopPost(body);
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
| **id** | `number` | Call ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## callsIdSignalPost

> { [key: string]: object; } callsIdSignalPost(id, body)

Relay a WebRTC signaling message

### Example

```ts
import {
  Configuration,
  CallsApi,
} from '';
import type { CallsIdSignalPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CallsApi();

  const body = {
    // number | Call ID
    id: 56,
    // InternalHandlersSignalRequest | Signal payload
    body: ...,
  } satisfies CallsIdSignalPostRequest;

  try {
    const data = await api.callsIdSignalPost(body);
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
| **id** | `number` | Call ID | [Defaults to `undefined`] |
| **body** | [InternalHandlersSignalRequest](InternalHandlersSignalRequest.md) | Signal payload | |

### Return type

**{ [key: string]: object; }**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdCallsGet

> { [key: string]: object; } conversationsIdCallsGet(id, limit, before)

Get call history for a conversation

### Example

```ts
import {
  Configuration,
  CallsApi,
} from '';
import type { ConversationsIdCallsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CallsApi();

  const body = {
    // number | Conversation ID
    id: 56,
    // number | Page size (max 50) (optional)
    limit: 56,
    // number | Cursor: call ID to paginate before (optional)
    before: 56,
  } satisfies ConversationsIdCallsGetRequest;

  try {
    const data = await api.conversationsIdCallsGet(body);
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
| **limit** | `number` | Page size (max 50) | [Optional] [Defaults to `20`] |
| **before** | `number` | Cursor: call ID to paginate before | [Optional] [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdCallsPost

> GithubComOmninudgeBackendInternalModelsCall conversationsIdCallsPost(id, body)

Start a voice or video call

### Example

```ts
import {
  Configuration,
  CallsApi,
} from '';
import type { ConversationsIdCallsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CallsApi();

  const body = {
    // number | Conversation ID
    id: 56,
    // InternalHandlersStartCallRequest | Call type
    body: ...,
  } satisfies ConversationsIdCallsPostRequest;

  try {
    const data = await api.conversationsIdCallsPost(body);
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
| **body** | [InternalHandlersStartCallRequest](InternalHandlersStartCallRequest.md) | Call type | |

### Return type

[**GithubComOmninudgeBackendInternalModelsCall**](GithubComOmninudgeBackendInternalModelsCall.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Created |  -  |
| **400** | Bad Request |  -  |
| **403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

