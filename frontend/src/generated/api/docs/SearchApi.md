# SearchApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**searchCommentsGet**](SearchApi.md#searchcommentsget) | **GET** /search/comments | Search comments |
| [**searchHubsGet**](SearchApi.md#searchhubsget) | **GET** /search/hubs | Search hubs |
| [**searchMessagesGet**](SearchApi.md#searchmessagesget) | **GET** /search/messages | Search messages |
| [**searchPostsGet**](SearchApi.md#searchpostsget) | **GET** /search/posts | Search posts |
| [**searchUsersGet**](SearchApi.md#searchusersget) | **GET** /search/users | Search users |



## searchCommentsGet

> { [key: string]: object; } searchCommentsGet(q, limit, offset, cursor)

Search comments

### Example

```ts
import {
  Configuration,
  SearchApi,
} from '';
import type { SearchCommentsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SearchApi();

  const body = {
    // string | Search query
    q: q_example,
    // number | Page size (default 20, max 100) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
    // string | Pagination cursor (optional)
    cursor: cursor_example,
  } satisfies SearchCommentsGetRequest;

  try {
    const data = await api.searchCommentsGet(body);
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
| **q** | `string` | Search query | [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 20, max 100) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |
| **cursor** | `string` | Pagination cursor | [Optional] [Defaults to `undefined`] |

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## searchHubsGet

> { [key: string]: object; } searchHubsGet(q, limit, offset, sort, includeNsfw, cursor)

Search hubs

### Example

```ts
import {
  Configuration,
  SearchApi,
} from '';
import type { SearchHubsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SearchApi();

  const body = {
    // string | Search query
    q: q_example,
    // number | Page size (default 20, max 100) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
    // string | Sort: relevance | new | old (optional)
    sort: sort_example,
    // boolean | Include NSFW hubs (optional)
    includeNsfw: true,
    // string | Pagination cursor (optional)
    cursor: cursor_example,
  } satisfies SearchHubsGetRequest;

  try {
    const data = await api.searchHubsGet(body);
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
| **q** | `string` | Search query | [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 20, max 100) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |
| **sort** | `string` | Sort: relevance | new | old | [Optional] [Defaults to `undefined`] |
| **includeNsfw** | `boolean` | Include NSFW hubs | [Optional] [Defaults to `undefined`] |
| **cursor** | `string` | Pagination cursor | [Optional] [Defaults to `undefined`] |

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## searchMessagesGet

> { [key: string]: object; } searchMessagesGet(q, conversationId, senderId, hasFiles, startDate, endDate, limit, offset, sort)

Search messages

### Example

```ts
import {
  Configuration,
  SearchApi,
} from '';
import type { SearchMessagesGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SearchApi(config);

  const body = {
    // string | Search query (optional)
    q: q_example,
    // number | Filter by conversation ID (optional)
    conversationId: 56,
    // number | Filter by sender ID (optional)
    senderId: 56,
    // boolean | Filter messages with file attachments (optional)
    hasFiles: true,
    // string | Start date (RFC3339) (optional)
    startDate: startDate_example,
    // string | End date (RFC3339) (optional)
    endDate: endDate_example,
    // number | Page size (default 50, max 200) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
    // string | Sort: relevance | newest | oldest (optional)
    sort: sort_example,
  } satisfies SearchMessagesGetRequest;

  try {
    const data = await api.searchMessagesGet(body);
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
| **q** | `string` | Search query | [Optional] [Defaults to `undefined`] |
| **conversationId** | `number` | Filter by conversation ID | [Optional] [Defaults to `undefined`] |
| **senderId** | `number` | Filter by sender ID | [Optional] [Defaults to `undefined`] |
| **hasFiles** | `boolean` | Filter messages with file attachments | [Optional] [Defaults to `undefined`] |
| **startDate** | `string` | Start date (RFC3339) | [Optional] [Defaults to `undefined`] |
| **endDate** | `string` | End date (RFC3339) | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 50, max 200) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |
| **sort** | `string` | Sort: relevance | newest | oldest | [Optional] [Defaults to `undefined`] |

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


## searchPostsGet

> { [key: string]: object; } searchPostsGet(q, limit, offset, sort, includeNsfw, cursor)

Search posts

### Example

```ts
import {
  Configuration,
  SearchApi,
} from '';
import type { SearchPostsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SearchApi();

  const body = {
    // string | Search query
    q: q_example,
    // number | Page size (default 20, max 100) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
    // string | Sort: relevance | new | old (optional)
    sort: sort_example,
    // boolean | Include NSFW content (optional)
    includeNsfw: true,
    // string | Pagination cursor (optional)
    cursor: cursor_example,
  } satisfies SearchPostsGetRequest;

  try {
    const data = await api.searchPostsGet(body);
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
| **q** | `string` | Search query | [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 20, max 100) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |
| **sort** | `string` | Sort: relevance | new | old | [Optional] [Defaults to `undefined`] |
| **includeNsfw** | `boolean` | Include NSFW content | [Optional] [Defaults to `undefined`] |
| **cursor** | `string` | Pagination cursor | [Optional] [Defaults to `undefined`] |

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## searchUsersGet

> { [key: string]: object; } searchUsersGet(q, limit, offset, sort, includeNsfw, cursor)

Search users

### Example

```ts
import {
  Configuration,
  SearchApi,
} from '';
import type { SearchUsersGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SearchApi();

  const body = {
    // string | Search query
    q: q_example,
    // number | Page size (default 20, max 100) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
    // string | Sort: relevance | new | old (optional)
    sort: sort_example,
    // boolean | Include NSFW profiles (optional)
    includeNsfw: true,
    // string | Pagination cursor (optional)
    cursor: cursor_example,
  } satisfies SearchUsersGetRequest;

  try {
    const data = await api.searchUsersGet(body);
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
| **q** | `string` | Search query | [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 20, max 100) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |
| **sort** | `string` | Sort: relevance | new | old | [Optional] [Defaults to `undefined`] |
| **includeNsfw** | `boolean` | Include NSFW profiles | [Optional] [Defaults to `undefined`] |
| **cursor** | `string` | Pagination cursor | [Optional] [Defaults to `undefined`] |

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

