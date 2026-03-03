# PostsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**postsFeedGet**](PostsApi.md#postsfeedget) | **GET** /posts/feed | Get posts feed |
| [**postsIdGet**](PostsApi.md#postsidget) | **GET** /posts/{id} | Get post |
| [**postsIdPut**](PostsApi.md#postsidput) | **PUT** /posts/{id} | Update post |
| [**postsIdVotePost**](PostsApi.md#postsidvotepost) | **POST** /posts/{id}/vote | Vote on post |
| [**postsPost**](PostsApi.md#postspost) | **POST** /posts | Create post |
| [**postsUserUsernameGet**](PostsApi.md#postsuserusernameget) | **GET** /posts/user/:username | Get user posts (internal) |
| [**subredditsNamePostsGet**](PostsApi.md#subredditsnamepostsget) | **GET** /subreddits/{name}/posts | Get subreddit posts |



## postsFeedGet

> { [key: string]: object; } postsFeedGet(hub, sort, limit, offset)

Get posts feed

### Example

```ts
import {
  Configuration,
  PostsApi,
} from '';
import type { PostsFeedGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PostsApi();

  const body = {
    // string | Hub name (optional)
    hub: hub_example,
    // string | Sort: hot | new | top (optional)
    sort: sort_example,
    // number | Page size (default 20) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
  } satisfies PostsFeedGetRequest;

  try {
    const data = await api.postsFeedGet(body);
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
| **hub** | `string` | Hub name | [Optional] [Defaults to `undefined`] |
| **sort** | `string` | Sort: hot | new | top | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 20) | [Optional] [Defaults to `undefined`] |
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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postsIdGet

> GithubComOmninudgeBackendInternalModelsPlatformPost postsIdGet(id)

Get post

### Example

```ts
import {
  Configuration,
  PostsApi,
} from '';
import type { PostsIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PostsApi();

  const body = {
    // number | Post ID
    id: 56,
  } satisfies PostsIdGetRequest;

  try {
    const data = await api.postsIdGet(body);
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

### Return type

[**GithubComOmninudgeBackendInternalModelsPlatformPost**](GithubComOmninudgeBackendInternalModelsPlatformPost.md)

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


## postsIdPut

> GithubComOmninudgeBackendInternalModelsPlatformPost postsIdPut(id)

Update post

### Example

```ts
import {
  Configuration,
  PostsApi,
} from '';
import type { PostsIdPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new PostsApi(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies PostsIdPutRequest;

  try {
    const data = await api.postsIdPut(body);
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

### Return type

[**GithubComOmninudgeBackendInternalModelsPlatformPost**](GithubComOmninudgeBackendInternalModelsPlatformPost.md)

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


## postsIdVotePost

> { [key: string]: object; } postsIdVotePost(id)

Vote on post

### Example

```ts
import {
  Configuration,
  PostsApi,
} from '';
import type { PostsIdVotePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new PostsApi(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies PostsIdVotePostRequest;

  try {
    const data = await api.postsIdVotePost(body);
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


## postsPost

> GithubComOmninudgeBackendInternalModelsPlatformPost postsPost()

Create post

### Example

```ts
import {
  Configuration,
  PostsApi,
} from '';
import type { PostsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new PostsApi(config);

  try {
    const data = await api.postsPost();
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

[**GithubComOmninudgeBackendInternalModelsPlatformPost**](GithubComOmninudgeBackendInternalModelsPlatformPost.md)

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


## postsUserUsernameGet

> { [key: string]: object; } postsUserUsernameGet()

Get user posts (internal)

### Example

```ts
import {
  Configuration,
  PostsApi,
} from '';
import type { PostsUserUsernameGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PostsApi();

  try {
    const data = await api.postsUserUsernameGet();
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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## subredditsNamePostsGet

> { [key: string]: object; } subredditsNamePostsGet(name, limit, offset)

Get subreddit posts

### Example

```ts
import {
  Configuration,
  PostsApi,
} from '';
import type { SubredditsNamePostsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PostsApi();

  const body = {
    // string | Subreddit name
    name: name_example,
    // number | Page size (default 20) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
  } satisfies SubredditsNamePostsGetRequest;

  try {
    const data = await api.subredditsNamePostsGet(body);
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
| **name** | `string` | Subreddit name | [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 20) | [Optional] [Defaults to `undefined`] |
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

