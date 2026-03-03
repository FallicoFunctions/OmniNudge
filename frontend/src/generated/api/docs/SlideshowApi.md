# SlideshowApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**conversationsIdSlideshowGet**](SlideshowApi.md#conversationsidslideshowget) | **GET** /conversations/{id}/slideshow | Get slideshow |
| [**conversationsIdSlideshowPost**](SlideshowApi.md#conversationsidslideshowpost) | **POST** /conversations/{id}/slideshow | Start slideshow |
| [**slideshowsIdAutoAdvancePut**](SlideshowApi.md#slideshowsidautoadvanceput) | **PUT** /slideshows/{id}/auto-advance | Update auto-advance |
| [**slideshowsIdDelete**](SlideshowApi.md#slideshowsiddelete) | **DELETE** /slideshows/{id} | Stop slideshow |
| [**slideshowsIdNavigatePost**](SlideshowApi.md#slideshowsidnavigatepost) | **POST** /slideshows/{id}/navigate | Navigate slideshow |
| [**slideshowsIdTransferControlPost**](SlideshowApi.md#slideshowsidtransfercontrolpost) | **POST** /slideshows/{id}/transfer-control | Transfer slideshow control |



## conversationsIdSlideshowGet

> { [key: string]: object; } conversationsIdSlideshowGet(id)

Get slideshow

### Example

```ts
import {
  Configuration,
  SlideshowApi,
} from '';
import type { ConversationsIdSlideshowGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SlideshowApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdSlideshowGetRequest;

  try {
    const data = await api.conversationsIdSlideshowGet(body);
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
| **401** | Unauthorized |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdSlideshowPost

> { [key: string]: object; } conversationsIdSlideshowPost(id)

Start slideshow

### Example

```ts
import {
  Configuration,
  SlideshowApi,
} from '';
import type { ConversationsIdSlideshowPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SlideshowApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdSlideshowPostRequest;

  try {
    const data = await api.conversationsIdSlideshowPost(body);
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
| **201** | Created |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## slideshowsIdAutoAdvancePut

> { [key: string]: object; } slideshowsIdAutoAdvancePut(id)

Update auto-advance

### Example

```ts
import {
  Configuration,
  SlideshowApi,
} from '';
import type { SlideshowsIdAutoAdvancePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SlideshowApi(config);

  const body = {
    // number | Slideshow ID
    id: 56,
  } satisfies SlideshowsIdAutoAdvancePutRequest;

  try {
    const data = await api.slideshowsIdAutoAdvancePut(body);
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
| **id** | `number` | Slideshow ID | [Defaults to `undefined`] |

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


## slideshowsIdDelete

> { [key: string]: object; } slideshowsIdDelete(id)

Stop slideshow

### Example

```ts
import {
  Configuration,
  SlideshowApi,
} from '';
import type { SlideshowsIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SlideshowApi(config);

  const body = {
    // number | Slideshow ID
    id: 56,
  } satisfies SlideshowsIdDeleteRequest;

  try {
    const data = await api.slideshowsIdDelete(body);
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
| **id** | `number` | Slideshow ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## slideshowsIdNavigatePost

> { [key: string]: object; } slideshowsIdNavigatePost(id)

Navigate slideshow

### Example

```ts
import {
  Configuration,
  SlideshowApi,
} from '';
import type { SlideshowsIdNavigatePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SlideshowApi(config);

  const body = {
    // number | Slideshow ID
    id: 56,
  } satisfies SlideshowsIdNavigatePostRequest;

  try {
    const data = await api.slideshowsIdNavigatePost(body);
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
| **id** | `number` | Slideshow ID | [Defaults to `undefined`] |

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


## slideshowsIdTransferControlPost

> { [key: string]: object; } slideshowsIdTransferControlPost(id)

Transfer slideshow control

### Example

```ts
import {
  Configuration,
  SlideshowApi,
} from '';
import type { SlideshowsIdTransferControlPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SlideshowApi(config);

  const body = {
    // number | Slideshow ID
    id: 56,
  } satisfies SlideshowsIdTransferControlPostRequest;

  try {
    const data = await api.slideshowsIdTransferControlPost(body);
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
| **id** | `number` | Slideshow ID | [Defaults to `undefined`] |

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

