# ModerationApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**modReportsGet**](ModerationApi.md#modreportsget) | **GET** /mod/reports | List moderation reports |
| [**modReportsIdStatusPost**](ModerationApi.md#modreportsidstatuspost) | **POST** /mod/reports/{id}/status | Update report status |
| [**reportsPost**](ModerationApi.md#reportspost) | **POST** /reports | Create moderation report |



## modReportsGet

> Array&lt;GithubComOmninudgeBackendInternalModelsReport&gt; modReportsGet(status, hubId, limit, offset)

List moderation reports

### Example

```ts
import {
  Configuration,
  ModerationApi,
} from '';
import type { ModReportsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationApi(config);

  const body = {
    // string | Filter by status (open, resolved, dismissed) (optional)
    status: status_example,
    // number | Filter by hub ID (optional)
    hubId: 56,
    // number | Max results (optional)
    limit: 56,
    // number | Pagination offset (optional)
    offset: 56,
  } satisfies ModReportsGetRequest;

  try {
    const data = await api.modReportsGet(body);
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
| **status** | `string` | Filter by status (open, resolved, dismissed) | [Optional] [Defaults to `undefined`] |
| **hubId** | `number` | Filter by hub ID | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Max results | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Pagination offset | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;GithubComOmninudgeBackendInternalModelsReport&gt;**](GithubComOmninudgeBackendInternalModelsReport.md)

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


## modReportsIdStatusPost

> { [key: string]: object; } modReportsIdStatusPost(id, body)

Update report status

### Example

```ts
import {
  Configuration,
  ModerationApi,
} from '';
import type { ModReportsIdStatusPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationApi(config);

  const body = {
    // number | Report ID
    id: 56,
    // InternalHandlersUpdateReportStatusRequest | New status
    body: ...,
  } satisfies ModReportsIdStatusPostRequest;

  try {
    const data = await api.modReportsIdStatusPost(body);
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
| **id** | `number` | Report ID | [Defaults to `undefined`] |
| **body** | [InternalHandlersUpdateReportStatusRequest](InternalHandlersUpdateReportStatusRequest.md) | New status | |

### Return type

**{ [key: string]: object; }**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **404** | Not Found |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## reportsPost

> GithubComOmninudgeBackendInternalModelsReport reportsPost(body)

Create moderation report

### Example

```ts
import {
  Configuration,
  ModerationApi,
} from '';
import type { ReportsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new ModerationApi(config);

  const body = {
    // InternalHandlersCreateReportRequest | Report details
    body: ...,
  } satisfies ReportsPostRequest;

  try {
    const data = await api.reportsPost(body);
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
| **body** | [InternalHandlersCreateReportRequest](InternalHandlersCreateReportRequest.md) | Report details | |

### Return type

[**GithubComOmninudgeBackendInternalModelsReport**](GithubComOmninudgeBackendInternalModelsReport.md)

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
| **429** | Too Many Requests |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

