# SavedItemsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**commentsCommentIdSaveDelete**](SavedItemsApi.md#commentscommentidsavedelete) | **DELETE** /comments/{commentId}/save | Unsave post comment |
| [**commentsCommentIdSavePost**](SavedItemsApi.md#commentscommentidsavepost) | **POST** /comments/{commentId}/save | Save post comment |
| [**postsIdHideDelete**](SavedItemsApi.md#postsidhidedelete) | **DELETE** /posts/{id}/hide | Unhide post |
| [**postsIdHidePost**](SavedItemsApi.md#postsidhidepost) | **POST** /posts/{id}/hide | Hide post |
| [**postsIdSaveDelete**](SavedItemsApi.md#postsidsavedelete) | **DELETE** /posts/{id}/save | Unsave post |
| [**postsIdSavePost**](SavedItemsApi.md#postsidsavepost) | **POST** /posts/{id}/save | Save post |
| [**redditApiCommentsCommentIdSaveDelete**](SavedItemsApi.md#redditapicommentscommentidsavedelete) | **DELETE** /reddit/api-comments/{commentId}/save | Unsave Reddit API comment |
| [**redditApiCommentsSavePost**](SavedItemsApi.md#redditapicommentssavepost) | **POST** /reddit/api-comments/save | Save Reddit API comment |
| [**redditPostsSubredditPostIdCommentsCommentIdSaveDelete**](SavedItemsApi.md#redditpostssubredditpostidcommentscommentidsavedelete) | **DELETE** /reddit/posts/{subreddit}/{postId}/comments/{commentId}/save | Unsave Reddit comment |
| [**redditPostsSubredditPostIdCommentsCommentIdSavePost**](SavedItemsApi.md#redditpostssubredditpostidcommentscommentidsavepost) | **POST** /reddit/posts/{subreddit}/{postId}/comments/{commentId}/save | Save Reddit comment |
| [**redditPostsSubredditPostIdHideDelete**](SavedItemsApi.md#redditpostssubredditpostidhidedelete) | **DELETE** /reddit/posts/{subreddit}/{postId}/hide | Unhide Reddit post |
| [**redditPostsSubredditPostIdHidePost**](SavedItemsApi.md#redditpostssubredditpostidhidepost) | **POST** /reddit/posts/{subreddit}/{postId}/hide | Hide Reddit post |
| [**redditPostsSubredditPostIdSaveDelete**](SavedItemsApi.md#redditpostssubredditpostidsavedelete) | **DELETE** /reddit/posts/{subreddit}/{postId}/save | Unsave Reddit post |
| [**redditPostsSubredditPostIdSavePost**](SavedItemsApi.md#redditpostssubredditpostidsavepost) | **POST** /reddit/posts/{subreddit}/{postId}/save | Save Reddit post |
| [**usersMeHiddenGet**](SavedItemsApi.md#usersmehiddenget) | **GET** /users/me/hidden | Get hidden items |
| [**usersMeSavedGet**](SavedItemsApi.md#usersmesavedget) | **GET** /users/me/saved | Get saved items |



## commentsCommentIdSaveDelete

> { [key: string]: object; } commentsCommentIdSaveDelete(commentId)

Unsave post comment

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { CommentsCommentIdSaveDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // number | Comment ID
    commentId: 56,
  } satisfies CommentsCommentIdSaveDeleteRequest;

  try {
    const data = await api.commentsCommentIdSaveDelete(body);
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
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## commentsCommentIdSavePost

> { [key: string]: object; } commentsCommentIdSavePost(commentId)

Save post comment

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { CommentsCommentIdSavePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // number | Comment ID
    commentId: 56,
  } satisfies CommentsCommentIdSavePostRequest;

  try {
    const data = await api.commentsCommentIdSavePost(body);
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
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postsIdHideDelete

> { [key: string]: object; } postsIdHideDelete(id)

Unhide post

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { PostsIdHideDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies PostsIdHideDeleteRequest;

  try {
    const data = await api.postsIdHideDelete(body);
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
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postsIdHidePost

> { [key: string]: object; } postsIdHidePost(id)

Hide post

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { PostsIdHidePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies PostsIdHidePostRequest;

  try {
    const data = await api.postsIdHidePost(body);
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
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postsIdSaveDelete

> { [key: string]: object; } postsIdSaveDelete(id)

Unsave post

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { PostsIdSaveDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies PostsIdSaveDeleteRequest;

  try {
    const data = await api.postsIdSaveDelete(body);
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
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postsIdSavePost

> { [key: string]: object; } postsIdSavePost(id)

Save post

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { PostsIdSavePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // number | Post ID
    id: 56,
  } satisfies PostsIdSavePostRequest;

  try {
    const data = await api.postsIdSavePost(body);
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
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## redditApiCommentsCommentIdSaveDelete

> { [key: string]: object; } redditApiCommentsCommentIdSaveDelete(commentId)

Unsave Reddit API comment

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { RedditApiCommentsCommentIdSaveDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // string | Comment ID
    commentId: commentId_example,
  } satisfies RedditApiCommentsCommentIdSaveDeleteRequest;

  try {
    const data = await api.redditApiCommentsCommentIdSaveDelete(body);
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
| **commentId** | `string` | Comment ID | [Defaults to `undefined`] |

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


## redditApiCommentsSavePost

> { [key: string]: object; } redditApiCommentsSavePost()

Save Reddit API comment

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { RedditApiCommentsSavePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  try {
    const data = await api.redditApiCommentsSavePost();
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


## redditPostsSubredditPostIdCommentsCommentIdSaveDelete

> { [key: string]: object; } redditPostsSubredditPostIdCommentsCommentIdSaveDelete(subreddit, postId, commentId)

Unsave Reddit comment

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { RedditPostsSubredditPostIdCommentsCommentIdSaveDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // string | Subreddit
    subreddit: subreddit_example,
    // string | Post ID
    postId: postId_example,
    // string | Comment ID
    commentId: commentId_example,
  } satisfies RedditPostsSubredditPostIdCommentsCommentIdSaveDeleteRequest;

  try {
    const data = await api.redditPostsSubredditPostIdCommentsCommentIdSaveDelete(body);
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
| **subreddit** | `string` | Subreddit | [Defaults to `undefined`] |
| **postId** | `string` | Post ID | [Defaults to `undefined`] |
| **commentId** | `string` | Comment ID | [Defaults to `undefined`] |

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


## redditPostsSubredditPostIdCommentsCommentIdSavePost

> { [key: string]: object; } redditPostsSubredditPostIdCommentsCommentIdSavePost(subreddit, postId, commentId)

Save Reddit comment

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { RedditPostsSubredditPostIdCommentsCommentIdSavePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // string | Subreddit
    subreddit: subreddit_example,
    // string | Post ID
    postId: postId_example,
    // string | Comment ID
    commentId: commentId_example,
  } satisfies RedditPostsSubredditPostIdCommentsCommentIdSavePostRequest;

  try {
    const data = await api.redditPostsSubredditPostIdCommentsCommentIdSavePost(body);
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
| **subreddit** | `string` | Subreddit | [Defaults to `undefined`] |
| **postId** | `string` | Post ID | [Defaults to `undefined`] |
| **commentId** | `string` | Comment ID | [Defaults to `undefined`] |

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


## redditPostsSubredditPostIdHideDelete

> { [key: string]: object; } redditPostsSubredditPostIdHideDelete(subreddit, postId)

Unhide Reddit post

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { RedditPostsSubredditPostIdHideDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // string | Subreddit
    subreddit: subreddit_example,
    // string | Post ID
    postId: postId_example,
  } satisfies RedditPostsSubredditPostIdHideDeleteRequest;

  try {
    const data = await api.redditPostsSubredditPostIdHideDelete(body);
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
| **subreddit** | `string` | Subreddit | [Defaults to `undefined`] |
| **postId** | `string` | Post ID | [Defaults to `undefined`] |

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


## redditPostsSubredditPostIdHidePost

> { [key: string]: object; } redditPostsSubredditPostIdHidePost(subreddit, postId)

Hide Reddit post

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { RedditPostsSubredditPostIdHidePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // string | Subreddit
    subreddit: subreddit_example,
    // string | Post ID
    postId: postId_example,
  } satisfies RedditPostsSubredditPostIdHidePostRequest;

  try {
    const data = await api.redditPostsSubredditPostIdHidePost(body);
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
| **subreddit** | `string` | Subreddit | [Defaults to `undefined`] |
| **postId** | `string` | Post ID | [Defaults to `undefined`] |

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


## redditPostsSubredditPostIdSaveDelete

> { [key: string]: object; } redditPostsSubredditPostIdSaveDelete(subreddit, postId)

Unsave Reddit post

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { RedditPostsSubredditPostIdSaveDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // string | Subreddit
    subreddit: subreddit_example,
    // string | Post ID
    postId: postId_example,
  } satisfies RedditPostsSubredditPostIdSaveDeleteRequest;

  try {
    const data = await api.redditPostsSubredditPostIdSaveDelete(body);
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
| **subreddit** | `string` | Subreddit | [Defaults to `undefined`] |
| **postId** | `string` | Post ID | [Defaults to `undefined`] |

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


## redditPostsSubredditPostIdSavePost

> { [key: string]: object; } redditPostsSubredditPostIdSavePost(subreddit, postId)

Save Reddit post

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { RedditPostsSubredditPostIdSavePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  const body = {
    // string | Subreddit
    subreddit: subreddit_example,
    // string | Post ID
    postId: postId_example,
  } satisfies RedditPostsSubredditPostIdSavePostRequest;

  try {
    const data = await api.redditPostsSubredditPostIdSavePost(body);
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
| **subreddit** | `string` | Subreddit | [Defaults to `undefined`] |
| **postId** | `string` | Post ID | [Defaults to `undefined`] |

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


## usersMeHiddenGet

> { [key: string]: object; } usersMeHiddenGet()

Get hidden items

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { UsersMeHiddenGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  try {
    const data = await api.usersMeHiddenGet();
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


## usersMeSavedGet

> { [key: string]: object; } usersMeSavedGet()

Get saved items

### Example

```ts
import {
  Configuration,
  SavedItemsApi,
} from '';
import type { UsersMeSavedGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SavedItemsApi(config);

  try {
    const data = await api.usersMeSavedGet();
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

