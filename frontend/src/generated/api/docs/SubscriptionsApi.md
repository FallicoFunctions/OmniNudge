# SubscriptionsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**hubsNameSubscribePost**](SubscriptionsApi.md#hubsnamesubscribepost) | **POST** /hubs/{name}/subscribe | Subscribe to hub |
| [**hubsNameSubscriptionGet**](SubscriptionsApi.md#hubsnamesubscriptionget) | **GET** /hubs/{name}/subscription | Check hub subscription |
| [**hubsNameUnsubscribeDelete**](SubscriptionsApi.md#hubsnameunsubscribedelete) | **DELETE** /hubs/{name}/unsubscribe | Unsubscribe from hub |
| [**subredditsNameSubscribePost**](SubscriptionsApi.md#subredditsnamesubscribepost) | **POST** /subreddits/{name}/subscribe | Subscribe to subreddit |
| [**subredditsNameSubscriptionGet**](SubscriptionsApi.md#subredditsnamesubscriptionget) | **GET** /subreddits/{name}/subscription | Check subreddit subscription |
| [**subredditsNameUnsubscribeDelete**](SubscriptionsApi.md#subredditsnameunsubscribedelete) | **DELETE** /subreddits/{name}/unsubscribe | Unsubscribe from subreddit |
| [**usersMeSubscriptionsHubsGet**](SubscriptionsApi.md#usersmesubscriptionshubsget) | **GET** /users/me/subscriptions/hubs | Get hub subscriptions |
| [**usersMeSubscriptionsSubredditsGet**](SubscriptionsApi.md#usersmesubscriptionssubredditsget) | **GET** /users/me/subscriptions/subreddits | Get subreddit subscriptions |



## hubsNameSubscribePost

> { [key: string]: object; } hubsNameSubscribePost(name)

Subscribe to hub

### Example

```ts
import {
  Configuration,
  SubscriptionsApi,
} from '';
import type { HubsNameSubscribePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SubscriptionsApi(config);

  const body = {
    // string | Hub name
    name: name_example,
  } satisfies HubsNameSubscribePostRequest;

  try {
    const data = await api.hubsNameSubscribePost(body);
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
| **401** | Unauthorized |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## hubsNameSubscriptionGet

> { [key: string]: object; } hubsNameSubscriptionGet(name)

Check hub subscription

### Example

```ts
import {
  Configuration,
  SubscriptionsApi,
} from '';
import type { HubsNameSubscriptionGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SubscriptionsApi(config);

  const body = {
    // string | Hub name
    name: name_example,
  } satisfies HubsNameSubscriptionGetRequest;

  try {
    const data = await api.hubsNameSubscriptionGet(body);
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
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## hubsNameUnsubscribeDelete

> { [key: string]: object; } hubsNameUnsubscribeDelete(name)

Unsubscribe from hub

### Example

```ts
import {
  Configuration,
  SubscriptionsApi,
} from '';
import type { HubsNameUnsubscribeDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SubscriptionsApi(config);

  const body = {
    // string | Hub name
    name: name_example,
  } satisfies HubsNameUnsubscribeDeleteRequest;

  try {
    const data = await api.hubsNameUnsubscribeDelete(body);
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
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## subredditsNameSubscribePost

> { [key: string]: object; } subredditsNameSubscribePost(name)

Subscribe to subreddit

### Example

```ts
import {
  Configuration,
  SubscriptionsApi,
} from '';
import type { SubredditsNameSubscribePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SubscriptionsApi(config);

  const body = {
    // string | Subreddit name
    name: name_example,
  } satisfies SubredditsNameSubscribePostRequest;

  try {
    const data = await api.subredditsNameSubscribePost(body);
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


## subredditsNameSubscriptionGet

> { [key: string]: object; } subredditsNameSubscriptionGet(name)

Check subreddit subscription

### Example

```ts
import {
  Configuration,
  SubscriptionsApi,
} from '';
import type { SubredditsNameSubscriptionGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SubscriptionsApi(config);

  const body = {
    // string | Subreddit name
    name: name_example,
  } satisfies SubredditsNameSubscriptionGetRequest;

  try {
    const data = await api.subredditsNameSubscriptionGet(body);
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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## subredditsNameUnsubscribeDelete

> { [key: string]: object; } subredditsNameUnsubscribeDelete(name)

Unsubscribe from subreddit

### Example

```ts
import {
  Configuration,
  SubscriptionsApi,
} from '';
import type { SubredditsNameUnsubscribeDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SubscriptionsApi(config);

  const body = {
    // string | Subreddit name
    name: name_example,
  } satisfies SubredditsNameUnsubscribeDeleteRequest;

  try {
    const data = await api.subredditsNameUnsubscribeDelete(body);
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


## usersMeSubscriptionsHubsGet

> Array&lt;{ [key: string]: object; }&gt; usersMeSubscriptionsHubsGet()

Get hub subscriptions

### Example

```ts
import {
  Configuration,
  SubscriptionsApi,
} from '';
import type { UsersMeSubscriptionsHubsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SubscriptionsApi(config);

  try {
    const data = await api.usersMeSubscriptionsHubsGet();
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


## usersMeSubscriptionsSubredditsGet

> Array&lt;{ [key: string]: object; }&gt; usersMeSubscriptionsSubredditsGet()

Get subreddit subscriptions

### Example

```ts
import {
  Configuration,
  SubscriptionsApi,
} from '';
import type { UsersMeSubscriptionsSubredditsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SubscriptionsApi(config);

  try {
    const data = await api.usersMeSubscriptionsSubredditsGet();
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

