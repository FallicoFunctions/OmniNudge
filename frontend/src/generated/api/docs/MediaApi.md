# MediaApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**conversationsIdMediaGet**](MediaApi.md#conversationsidmediaget) | **GET** /conversations/{id}/media | Get conversation media |
| [**conversationsIdMediaMessageIdIndexGet**](MediaApi.md#conversationsidmediamessageidindexget) | **GET** /conversations/{id}/media/{messageId}/index | Find media index |
| [**filesIdThumbnailGet**](MediaApi.md#filesidthumbnailget) | **GET** /files/{id}/thumbnail | Get file thumbnail |
| [**mediaBatchUploadPost**](MediaApi.md#mediabatchuploadpost) | **POST** /media/batch-upload | Batch upload media |
| [**mediaUploadPost**](MediaApi.md#mediauploadpost) | **POST** /media/upload | Upload media |



## conversationsIdMediaGet

> { [key: string]: object; } conversationsIdMediaGet(id, mediaType, limit, beforeId)

Get conversation media

### Example

```ts
import {
  Configuration,
  MediaApi,
} from '';
import type { ConversationsIdMediaGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MediaApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
    // string | Filter by type (image, video, audio) (optional)
    mediaType: mediaType_example,
    // number | Max results (optional)
    limit: 56,
    // number | Cursor (optional)
    beforeId: 56,
  } satisfies ConversationsIdMediaGetRequest;

  try {
    const data = await api.conversationsIdMediaGet(body);
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
| **mediaType** | `string` | Filter by type (image, video, audio) | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Max results | [Optional] [Defaults to `undefined`] |
| **beforeId** | `number` | Cursor | [Optional] [Defaults to `undefined`] |

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


## conversationsIdMediaMessageIdIndexGet

> { [key: string]: object; } conversationsIdMediaMessageIdIndexGet(id, messageId, mediaType)

Find media index

### Example

```ts
import {
  Configuration,
  MediaApi,
} from '';
import type { ConversationsIdMediaMessageIdIndexGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MediaApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
    // number | Message ID
    messageId: 56,
    // string | Media type filter (optional)
    mediaType: mediaType_example,
  } satisfies ConversationsIdMediaMessageIdIndexGetRequest;

  try {
    const data = await api.conversationsIdMediaMessageIdIndexGet(body);
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
| **messageId** | `number` | Message ID | [Defaults to `undefined`] |
| **mediaType** | `string` | Media type filter | [Optional] [Defaults to `undefined`] |

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
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## filesIdThumbnailGet

> filesIdThumbnailGet(id)

Get file thumbnail

### Example

```ts
import {
  Configuration,
  MediaApi,
} from '';
import type { FilesIdThumbnailGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MediaApi(config);

  const body = {
    // number | File ID
    id: 56,
  } satisfies FilesIdThumbnailGetRequest;

  try {
    const data = await api.filesIdThumbnailGet(body);
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
| **id** | `number` | File ID | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `image/jpeg`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **401** | Unauthorized |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## mediaBatchUploadPost

> Array&lt;GithubComOmninudgeBackendInternalModelsMediaFile&gt; mediaBatchUploadPost()

Batch upload media

### Example

```ts
import {
  Configuration,
  MediaApi,
} from '';
import type { MediaBatchUploadPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MediaApi(config);

  try {
    const data = await api.mediaBatchUploadPost();
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

[**Array&lt;GithubComOmninudgeBackendInternalModelsMediaFile&gt;**](GithubComOmninudgeBackendInternalModelsMediaFile.md)

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


## mediaUploadPost

> GithubComOmninudgeBackendInternalModelsMediaFile mediaUploadPost(file)

Upload media

### Example

```ts
import {
  Configuration,
  MediaApi,
} from '';
import type { MediaUploadPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new MediaApi(config);

  const body = {
    // Blob | Media file
    file: BINARY_DATA_HERE,
  } satisfies MediaUploadPostRequest;

  try {
    const data = await api.mediaUploadPost(body);
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
| **file** | `Blob` | Media file | [Defaults to `undefined`] |

### Return type

[**GithubComOmninudgeBackendInternalModelsMediaFile**](GithubComOmninudgeBackendInternalModelsMediaFile.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Created |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **413** | Request Entity Too Large |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

