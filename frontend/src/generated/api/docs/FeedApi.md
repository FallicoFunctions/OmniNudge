# FeedApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**feedGet**](FeedApi.md#feedget) | **GET** /feed | Get home feed |



## feedGet

> Array&lt;InternalHandlersCombinedFeedItem&gt; feedGet(sort, after, limit)

Get home feed

### Example

```ts
import {
  Configuration,
  FeedApi,
} from '';
import type { FeedGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new FeedApi(config);

  const body = {
    // string | Sort order (hot, new, top) (optional)
    sort: sort_example,
    // string | Pagination cursor (optional)
    after: after_example,
    // number | Max results (optional)
    limit: 56,
  } satisfies FeedGetRequest;

  try {
    const data = await api.feedGet(body);
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
| **sort** | `string` | Sort order (hot, new, top) | [Optional] [Defaults to `undefined`] |
| **after** | `string` | Pagination cursor | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Max results | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;InternalHandlersCombinedFeedItem&gt;**](InternalHandlersCombinedFeedItem.md)

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

