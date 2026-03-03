# SettingsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**settingsGet**](SettingsApi.md#settingsget) | **GET** /settings | Get user settings |
| [**settingsPut**](SettingsApi.md#settingsput) | **PUT** /settings | Update user settings |



## settingsGet

> GithubComOmninudgeBackendInternalModelsUserSettings settingsGet()

Get user settings

### Example

```ts
import {
  Configuration,
  SettingsApi,
} from '';
import type { SettingsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SettingsApi(config);

  try {
    const data = await api.settingsGet();
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

[**GithubComOmninudgeBackendInternalModelsUserSettings**](GithubComOmninudgeBackendInternalModelsUserSettings.md)

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


## settingsPut

> GithubComOmninudgeBackendInternalModelsUserSettings settingsPut()

Update user settings

### Example

```ts
import {
  Configuration,
  SettingsApi,
} from '';
import type { SettingsPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new SettingsApi(config);

  try {
    const data = await api.settingsPut();
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

[**GithubComOmninudgeBackendInternalModelsUserSettings**](GithubComOmninudgeBackendInternalModelsUserSettings.md)

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

