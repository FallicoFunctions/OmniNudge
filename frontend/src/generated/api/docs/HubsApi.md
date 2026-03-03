# HubsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**hubsAgentTargetsGet**](HubsApi.md#hubsagenttargetsget) | **GET** /hubs/agent-targets | Get agent hub targets |
| [**hubsGet**](HubsApi.md#hubsget) | **GET** /hubs | List hubs |
| [**hubsHAllGet**](HubsApi.md#hubshallget) | **GET** /hubs/h/all | Get all hubs feed |
| [**hubsHPopularGet**](HubsApi.md#hubshpopularget) | **GET** /hubs/h/popular | Get popular hub feed |
| [**hubsNameCrosspostPost**](HubsApi.md#hubsnamecrosspostpost) | **POST** /hubs/{name}/crosspost | Crosspost to hub |
| [**hubsNameGet**](HubsApi.md#hubsnameget) | **GET** /hubs/{name} | Get hub |
| [**hubsNameNsfwPut**](HubsApi.md#hubsnamensfwput) | **PUT** /hubs/{name}/nsfw | Update hub NSFW flag |
| [**hubsNamePostsGet**](HubsApi.md#hubsnamepostsget) | **GET** /hubs/{name}/posts | Get hub posts |
| [**hubsPost**](HubsApi.md#hubspost) | **POST** /hubs | Create hub |
| [**hubsSearchGet**](HubsApi.md#hubssearchget) | **GET** /hubs/search | Search hubs autocomplete |
| [**hubsTrendingGet**](HubsApi.md#hubstrendingget) | **GET** /hubs/trending | Get trending hubs |
| [**subredditsNameCrosspostPost**](HubsApi.md#subredditsnamecrosspostpost) | **POST** /subreddits/{name}/crosspost | Crosspost to subreddit |
| [**usersMeHubsGet**](HubsApi.md#usersmehubsget) | **GET** /users/me/hubs | Get my hubs |



## hubsAgentTargetsGet

> { [key: string]: object; } hubsAgentTargetsGet()

Get agent hub targets

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsAgentTargetsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new HubsApi(config);

  try {
    const data = await api.hubsAgentTargetsGet();
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


## hubsGet

> { [key: string]: object; } hubsGet(limit, offset)

List hubs

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new HubsApi();

  const body = {
    // number | Page size (default 20) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
  } satisfies HubsGetRequest;

  try {
    const data = await api.hubsGet(body);
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


## hubsHAllGet

> { [key: string]: object; } hubsHAllGet(sort, limit, cursor)

Get all hubs feed

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsHAllGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new HubsApi();

  const body = {
    // string | Sort: hot | new | top (optional)
    sort: sort_example,
    // number | Page size (default 25) (optional)
    limit: 56,
    // string | Pagination cursor (optional)
    cursor: cursor_example,
  } satisfies HubsHAllGetRequest;

  try {
    const data = await api.hubsHAllGet(body);
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
| **sort** | `string` | Sort: hot | new | top | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 25) | [Optional] [Defaults to `undefined`] |
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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## hubsHPopularGet

> { [key: string]: object; } hubsHPopularGet(sort, limit, cursor)

Get popular hub feed

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsHPopularGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new HubsApi();

  const body = {
    // string | Sort: hot | new | top (optional)
    sort: sort_example,
    // number | Page size (default 20) (optional)
    limit: 56,
    // string | Pagination cursor (optional)
    cursor: cursor_example,
  } satisfies HubsHPopularGetRequest;

  try {
    const data = await api.hubsHPopularGet(body);
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
| **sort** | `string` | Sort: hot | new | top | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 20) | [Optional] [Defaults to `undefined`] |
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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## hubsNameCrosspostPost

> GithubComOmninudgeBackendInternalModelsPlatformPost hubsNameCrosspostPost(name, body)

Crosspost to hub

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsNameCrosspostPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new HubsApi(config);

  const body = {
    // string | Hub name
    name: name_example,
    // InternalHandlersCrosspostRequest | Crosspost details
    body: ...,
  } satisfies HubsNameCrosspostPostRequest;

  try {
    const data = await api.hubsNameCrosspostPost(body);
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
| **name** | `string` | Hub name | [Defaults to `undefined`] |
| **body** | [InternalHandlersCrosspostRequest](InternalHandlersCrosspostRequest.md) | Crosspost details | |

### Return type

[**GithubComOmninudgeBackendInternalModelsPlatformPost**](GithubComOmninudgeBackendInternalModelsPlatformPost.md)

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## hubsNameGet

> GithubComOmninudgeBackendInternalModelsHub hubsNameGet(name)

Get hub

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsNameGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new HubsApi();

  const body = {
    // string | Hub name
    name: name_example,
  } satisfies HubsNameGetRequest;

  try {
    const data = await api.hubsNameGet(body);
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
| **name** | `string` | Hub name | [Defaults to `undefined`] |

### Return type

[**GithubComOmninudgeBackendInternalModelsHub**](GithubComOmninudgeBackendInternalModelsHub.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## hubsNameNsfwPut

> { [key: string]: object; } hubsNameNsfwPut(name)

Update hub NSFW flag

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsNameNsfwPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new HubsApi(config);

  const body = {
    // string | Hub name
    name: name_example,
  } satisfies HubsNameNsfwPutRequest;

  try {
    const data = await api.hubsNameNsfwPut(body);
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
| **name** | `string` | Hub name | [Defaults to `undefined`] |

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


## hubsNamePostsGet

> { [key: string]: object; } hubsNamePostsGet(name, sort, limit, offset, cursor)

Get hub posts

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsNamePostsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new HubsApi();

  const body = {
    // string | Hub name
    name: name_example,
    // string | Sort: hot | new | top | rising (optional)
    sort: sort_example,
    // number | Page size (default 20) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
    // string | Pagination cursor (optional)
    cursor: cursor_example,
  } satisfies HubsNamePostsGetRequest;

  try {
    const data = await api.hubsNamePostsGet(body);
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
| **name** | `string` | Hub name | [Defaults to `undefined`] |
| **sort** | `string` | Sort: hot | new | top | rising | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 20) | [Optional] [Defaults to `undefined`] |
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
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## hubsPost

> GithubComOmninudgeBackendInternalModelsHub hubsPost(body)

Create hub

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new HubsApi(config);

  const body = {
    // InternalHandlersCreateHubRequest | Hub details
    body: ...,
  } satisfies HubsPostRequest;

  try {
    const data = await api.hubsPost(body);
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
| **body** | [InternalHandlersCreateHubRequest](InternalHandlersCreateHubRequest.md) | Hub details | |

### Return type

[**GithubComOmninudgeBackendInternalModelsHub**](GithubComOmninudgeBackendInternalModelsHub.md)

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
| **409** | Conflict |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## hubsSearchGet

> { [key: string]: object; } hubsSearchGet(q, limit)

Search hubs autocomplete

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsSearchGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new HubsApi();

  const body = {
    // string | Search query
    q: q_example,
    // number | Max results (default 10) (optional)
    limit: 56,
  } satisfies HubsSearchGetRequest;

  try {
    const data = await api.hubsSearchGet(body);
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
| **limit** | `number` | Max results (default 10) | [Optional] [Defaults to `undefined`] |

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


## hubsTrendingGet

> { [key: string]: object; } hubsTrendingGet(limit)

Get trending hubs

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { HubsTrendingGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new HubsApi();

  const body = {
    // number | Max results (default 10, max 50) (optional)
    limit: 56,
  } satisfies HubsTrendingGetRequest;

  try {
    const data = await api.hubsTrendingGet(body);
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
| **limit** | `number` | Max results (default 10, max 50) | [Optional] [Defaults to `undefined`] |

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


## subredditsNameCrosspostPost

> GithubComOmninudgeBackendInternalModelsPlatformPost subredditsNameCrosspostPost(name, body)

Crosspost to subreddit

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { SubredditsNameCrosspostPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new HubsApi(config);

  const body = {
    // string | Subreddit name
    name: name_example,
    // InternalHandlersCrosspostRequest | Crosspost details
    body: ...,
  } satisfies SubredditsNameCrosspostPostRequest;

  try {
    const data = await api.subredditsNameCrosspostPost(body);
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
| **body** | [InternalHandlersCrosspostRequest](InternalHandlersCrosspostRequest.md) | Crosspost details | |

### Return type

[**GithubComOmninudgeBackendInternalModelsPlatformPost**](GithubComOmninudgeBackendInternalModelsPlatformPost.md)

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersMeHubsGet

> { [key: string]: object; } usersMeHubsGet()

Get my hubs

### Example

```ts
import {
  Configuration,
  HubsApi,
} from '';
import type { UsersMeHubsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new HubsApi(config);

  try {
    const data = await api.usersMeHubsGet();
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

