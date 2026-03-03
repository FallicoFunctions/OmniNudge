# VoiceMessagesApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**messagesIdVoiceGet**](VoiceMessagesApi.md#messagesidvoiceget) | **GET** /messages/{id}/voice | Get voice message |
| [**messagesIdVoicePost**](VoiceMessagesApi.md#messagesidvoicepost) | **POST** /messages/{id}/voice | Upload voice message |
| [**voiceIdDownloadGet**](VoiceMessagesApi.md#voiceiddownloadget) | **GET** /voice/{id}/download | Download voice message |



## messagesIdVoiceGet

> { [key: string]: object; } messagesIdVoiceGet(id)

Get voice message

### Example

```ts
import {
  Configuration,
  VoiceMessagesApi,
} from '';
import type { MessagesIdVoiceGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new VoiceMessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
  } satisfies MessagesIdVoiceGetRequest;

  try {
    const data = await api.messagesIdVoiceGet(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |

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


## messagesIdVoicePost

> { [key: string]: object; } messagesIdVoicePost(id, audio)

Upload voice message

### Example

```ts
import {
  Configuration,
  VoiceMessagesApi,
} from '';
import type { MessagesIdVoicePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new VoiceMessagesApi(config);

  const body = {
    // number | Message ID
    id: 56,
    // Blob | Audio file
    audio: BINARY_DATA_HERE,
  } satisfies MessagesIdVoicePostRequest;

  try {
    const data = await api.messagesIdVoicePost(body);
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
| **id** | `number` | Message ID | [Defaults to `undefined`] |
| **audio** | `Blob` | Audio file | [Defaults to `undefined`] |

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## voiceIdDownloadGet

> voiceIdDownloadGet(id)

Download voice message

### Example

```ts
import {
  Configuration,
  VoiceMessagesApi,
} from '';
import type { VoiceIdDownloadGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new VoiceMessagesApi(config);

  const body = {
    // number | Voice message ID
    id: 56,
  } satisfies VoiceIdDownloadGetRequest;

  try {
    const data = await api.voiceIdDownloadGet(body);
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
| **id** | `number` | Voice message ID | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/octet-stream`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **401** | Unauthorized |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

