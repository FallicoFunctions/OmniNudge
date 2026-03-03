# BugReportsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**bugReportsKnownGet**](BugReportsApi.md#bugreportsknownget) | **GET** /bug-reports/known | Get known bugs |
| [**bugReportsPost**](BugReportsApi.md#bugreportspost) | **POST** /bug-reports | Submit bug report |



## bugReportsKnownGet

> { [key: string]: object; } bugReportsKnownGet(status)

Get known bugs

### Example

```ts
import {
  Configuration,
  BugReportsApi,
} from '';
import type { BugReportsKnownGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new BugReportsApi();

  const body = {
    // string | Filter by status (optional)
    status: status_example,
  } satisfies BugReportsKnownGetRequest;

  try {
    const data = await api.bugReportsKnownGet(body);
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
| **status** | `string` | Filter by status | [Optional] [Defaults to `undefined`] |

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


## bugReportsPost

> GithubComOmninudgeBackendInternalModelsBugReport bugReportsPost(body)

Submit bug report

### Example

```ts
import {
  Configuration,
  BugReportsApi,
} from '';
import type { BugReportsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new BugReportsApi();

  const body = {
    // InternalHandlersCreateBugReportRequest | Bug report
    body: ...,
  } satisfies BugReportsPostRequest;

  try {
    const data = await api.bugReportsPost(body);
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
| **body** | [InternalHandlersCreateBugReportRequest](InternalHandlersCreateBugReportRequest.md) | Bug report | |

### Return type

[**GithubComOmninudgeBackendInternalModelsBugReport**](GithubComOmninudgeBackendInternalModelsBugReport.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Created |  -  |
| **400** | Bad Request |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

