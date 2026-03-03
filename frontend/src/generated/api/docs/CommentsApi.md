# CommentsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**commentsIdGet**](CommentsApi.md#commentsidget) | **GET** /comments/{id} | Get comment |
| [**commentsIdPut**](CommentsApi.md#commentsidput) | **PUT** /comments/{id} | Update comment |
| [**commentsIdRepliesGet**](CommentsApi.md#commentsidrepliesget) | **GET** /comments/{id}/replies | Get comment replies |
| [**commentsIdVotePost**](CommentsApi.md#commentsidvotepost) | **POST** /comments/{id}/vote | Vote on comment |
| [**postsIdCommentsCommentIdPreferencesPost**](CommentsApi.md#postsidcommentscommentidpreferencespost) | **POST** /posts/{id}/comments/{commentId}/preferences | Update comment preferences |
| [**postsIdCommentsGet**](CommentsApi.md#postsidcommentsget) | **GET** /posts/{id}/comments | Get post comments |
| [**postsIdCommentsPost**](CommentsApi.md#postsidcommentspost) | **POST** /posts/{id}/comments | Create comment |



## commentsIdGet

> GithubComOmninudgeBackendInternalModelsPostComment commentsIdGet(id)

Get comment

### Example

```ts
import {
  Configuration,
  CommentsApi,
} from '';
import type { CommentsIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CommentsApi();

  const body = {
    // number | Comment ID
    id: 56,
  } satisfies CommentsIdGetRequest;

  try {
    const data = await api.commentsIdGet(body);
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

[**GithubComOmninudgeBackendInternalModelsPostComment**](GithubComOmninudgeBackendInternalModelsPostComment.md)

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
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## commentsIdPut

> GithubComOmninudgeBackendInternalModelsPostComment commentsIdPut(id, body)

Update comment

### Example

```ts
import {
  Configuration,
  CommentsApi,
} from '';
import type { CommentsIdPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new CommentsApi(config);

  const body = {
    // number | Comment ID
    id: 56,
    // InternalHandlersUpdateCommentRequest | Updated comment
    body: ...,
  } satisfies CommentsIdPutRequest;

  try {
    const data = await api.commentsIdPut(body);
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
| **body** | [InternalHandlersUpdateCommentRequest](InternalHandlersUpdateCommentRequest.md) | Updated comment | |

### Return type

[**GithubComOmninudgeBackendInternalModelsPostComment**](GithubComOmninudgeBackendInternalModelsPostComment.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
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


## commentsIdRepliesGet

> { [key: string]: object; } commentsIdRepliesGet(id, limit, offset)

Get comment replies

### Example

```ts
import {
  Configuration,
  CommentsApi,
} from '';
import type { CommentsIdRepliesGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CommentsApi();

  const body = {
    // number | Comment ID
    id: 56,
    // number | Page size (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
  } satisfies CommentsIdRepliesGetRequest;

  try {
    const data = await api.commentsIdRepliesGet(body);
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
| **limit** | `number` | Page size | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |

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


## commentsIdVotePost

> { [key: string]: object; } commentsIdVotePost(id)

Vote on comment

### Example

```ts
import {
  Configuration,
  CommentsApi,
} from '';
import type { CommentsIdVotePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new CommentsApi(config);

  const body = {
    // number | Comment ID
    id: 56,
  } satisfies CommentsIdVotePostRequest;

  try {
    const data = await api.commentsIdVotePost(body);
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
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postsIdCommentsCommentIdPreferencesPost

> { [key: string]: object; } postsIdCommentsCommentIdPreferencesPost(id, commentId)

Update comment preferences

### Example

```ts
import {
  Configuration,
  CommentsApi,
} from '';
import type { PostsIdCommentsCommentIdPreferencesPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new CommentsApi(config);

  const body = {
    // number | Post ID
    id: 56,
    // number | Comment ID
    commentId: 56,
  } satisfies PostsIdCommentsCommentIdPreferencesPostRequest;

  try {
    const data = await api.postsIdCommentsCommentIdPreferencesPost(body);
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
| **commentId** | `number` | Comment ID | [Defaults to `undefined`] |

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


## postsIdCommentsGet

> { [key: string]: object; } postsIdCommentsGet(id, limit, offset, sort)

Get post comments

### Example

```ts
import {
  Configuration,
  CommentsApi,
} from '';
import type { PostsIdCommentsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CommentsApi();

  const body = {
    // number | Post ID
    id: 56,
    // number | Page size (default 20) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
    // string | Sort: hot | new | top (optional)
    sort: sort_example,
  } satisfies PostsIdCommentsGetRequest;

  try {
    const data = await api.postsIdCommentsGet(body);
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
| **limit** | `number` | Page size (default 20) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |
| **sort** | `string` | Sort: hot | new | top | [Optional] [Defaults to `undefined`] |

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


## postsIdCommentsPost

> GithubComOmninudgeBackendInternalModelsPostComment postsIdCommentsPost(id, body)

Create comment

### Example

```ts
import {
  Configuration,
  CommentsApi,
} from '';
import type { PostsIdCommentsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new CommentsApi(config);

  const body = {
    // number | Post ID
    id: 56,
    // InternalHandlersCreateCommentRequest | Comment
    body: ...,
  } satisfies PostsIdCommentsPostRequest;

  try {
    const data = await api.postsIdCommentsPost(body);
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
| **body** | [InternalHandlersCreateCommentRequest](InternalHandlersCreateCommentRequest.md) | Comment | |

### Return type

[**GithubComOmninudgeBackendInternalModelsPostComment**](GithubComOmninudgeBackendInternalModelsPostComment.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Created |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

