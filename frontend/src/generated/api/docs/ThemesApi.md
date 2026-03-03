# ThemesApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**themesBrowseGet**](ThemesApi.md#themesbrowseget) | **GET** /themes/browse | Browse themes |
| [**themesIdDelete**](ThemesApi.md#themesiddelete) | **DELETE** /themes/{id} | Delete theme |
| [**themesIdGet**](ThemesApi.md#themesidget) | **GET** /themes/{id} | Get theme |
| [**themesIdPut**](ThemesApi.md#themesidput) | **PUT** /themes/{id} | Update theme |
| [**themesMyGet**](ThemesApi.md#themesmyget) | **GET** /themes/my | Get my themes |
| [**themesPost**](ThemesApi.md#themespost) | **POST** /themes | Create theme |
| [**themesPredefinedGet**](ThemesApi.md#themespredefinedget) | **GET** /themes/predefined | Get predefined themes |



## themesBrowseGet

> Array&lt;{ [key: string]: object; }&gt; themesBrowseGet(q, limit, offset)

Browse themes

### Example

```ts
import {
  Configuration,
  ThemesApi,
} from '';
import type { ThemesBrowseGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ThemesApi(config);

  const body = {
    // string | Search query (optional)
    q: q_example,
    // number | Max results (optional)
    limit: 56,
    // number | Pagination offset (optional)
    offset: 56,
  } satisfies ThemesBrowseGetRequest;

  try {
    const data = await api.themesBrowseGet(body);
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
| **limit** | `number` | Max results | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Pagination offset | [Optional] [Defaults to `undefined`] |

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## themesIdDelete

> themesIdDelete(id)

Delete theme

### Example

```ts
import {
  Configuration,
  ThemesApi,
} from '';
import type { ThemesIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ThemesApi(config);

  const body = {
    // number | Theme ID
    id: 56,
  } satisfies ThemesIdDeleteRequest;

  try {
    const data = await api.themesIdDelete(body);
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
| **id** | `number` | Theme ID | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **204** | No Content |  -  |
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## themesIdGet

> { [key: string]: object; } themesIdGet(id)

Get theme

### Example

```ts
import {
  Configuration,
  ThemesApi,
} from '';
import type { ThemesIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ThemesApi(config);

  const body = {
    // number | Theme ID
    id: 56,
  } satisfies ThemesIdGetRequest;

  try {
    const data = await api.themesIdGet(body);
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
| **id** | `number` | Theme ID | [Defaults to `undefined`] |

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


## themesIdPut

> { [key: string]: object; } themesIdPut(id)

Update theme

### Example

```ts
import {
  Configuration,
  ThemesApi,
} from '';
import type { ThemesIdPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ThemesApi(config);

  const body = {
    // number | Theme ID
    id: 56,
  } satisfies ThemesIdPutRequest;

  try {
    const data = await api.themesIdPut(body);
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
| **id** | `number` | Theme ID | [Defaults to `undefined`] |

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


## themesMyGet

> Array&lt;{ [key: string]: object; }&gt; themesMyGet()

Get my themes

### Example

```ts
import {
  Configuration,
  ThemesApi,
} from '';
import type { ThemesMyGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ThemesApi(config);

  try {
    const data = await api.themesMyGet();
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


## themesPost

> { [key: string]: object; } themesPost()

Create theme

### Example

```ts
import {
  Configuration,
  ThemesApi,
} from '';
import type { ThemesPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ThemesApi(config);

  try {
    const data = await api.themesPost();
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
| **201** | Created |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## themesPredefinedGet

> Array&lt;{ [key: string]: object; }&gt; themesPredefinedGet()

Get predefined themes

### Example

```ts
import {
  Configuration,
  ThemesApi,
} from '';
import type { ThemesPredefinedGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ThemesApi();

  try {
    const data = await api.themesPredefinedGet();
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

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

