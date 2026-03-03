# AnalyticsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**analyticsIdentifyPost**](AnalyticsApi.md#analyticsidentifypost) | **POST** /analytics/identify | Identify analytics user |
| [**analyticsSessionEndPost**](AnalyticsApi.md#analyticssessionendpost) | **POST** /analytics/session/end | End analytics session |
| [**analyticsSessionStartPost**](AnalyticsApi.md#analyticssessionstartpost) | **POST** /analytics/session/start | Start analytics session |
| [**analyticsTrackPost**](AnalyticsApi.md#analyticstrackpost) | **POST** /analytics/track | Track analytics event |



## analyticsIdentifyPost

> { [key: string]: object; } analyticsIdentifyPost()

Identify analytics user

### Example

```ts
import {
  Configuration,
  AnalyticsApi,
} from '';
import type { AnalyticsIdentifyPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AnalyticsApi();

  try {
    const data = await api.analyticsIdentifyPost();
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
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## analyticsSessionEndPost

> { [key: string]: object; } analyticsSessionEndPost()

End analytics session

### Example

```ts
import {
  Configuration,
  AnalyticsApi,
} from '';
import type { AnalyticsSessionEndPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AnalyticsApi();

  try {
    const data = await api.analyticsSessionEndPost();
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
| **400** | Bad Request |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## analyticsSessionStartPost

> { [key: string]: object; } analyticsSessionStartPost()

Start analytics session

### Example

```ts
import {
  Configuration,
  AnalyticsApi,
} from '';
import type { AnalyticsSessionStartPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AnalyticsApi();

  try {
    const data = await api.analyticsSessionStartPost();
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
| **400** | Bad Request |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## analyticsTrackPost

> { [key: string]: object; } analyticsTrackPost()

Track analytics event

### Example

```ts
import {
  Configuration,
  AnalyticsApi,
} from '';
import type { AnalyticsTrackPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AnalyticsApi();

  try {
    const data = await api.analyticsTrackPost();
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
| **400** | Bad Request |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

