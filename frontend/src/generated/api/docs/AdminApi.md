# AdminApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**adminAnalyticsDashboardGet**](AdminApi.md#adminanalyticsdashboardget) | **GET** /admin/analytics/dashboard | Get analytics dashboard |
| [**adminAnalyticsRefreshPost**](AdminApi.md#adminanalyticsrefreshpost) | **POST** /admin/analytics/refresh | Refresh analytics views |
| [**adminBanHistoryGet**](AdminApi.md#adminbanhistoryget) | **GET** /admin/ban-history | Get all ban history |
| [**adminBugReportsGet**](AdminApi.md#adminbugreportsget) | **GET** /admin/bug-reports | List bug reports |
| [**adminBugReportsIdPut**](AdminApi.md#adminbugreportsidput) | **PUT** /admin/bug-reports/{id} | Update bug report |
| [**adminHubsHubIdModeratorsGet**](AdminApi.md#adminhubshubidmoderatorsget) | **GET** /admin/hubs/{hub_id}/moderators | Get hub moderators |
| [**adminHubsHubIdModeratorsUserIdDelete**](AdminApi.md#adminhubshubidmoderatorsuseriddelete) | **DELETE** /admin/hubs/{hub_id}/moderators/{user_id} | Remove hub moderator |
| [**adminHubsNameModeratorsPost**](AdminApi.md#adminhubsnamemoderatorspost) | **POST** /admin/hubs/{name}/moderators | Add hub moderator |
| [**adminKnownBugsIdDelete**](AdminApi.md#adminknownbugsiddelete) | **DELETE** /admin/known-bugs/{id} | Delete known bug |
| [**adminKnownBugsIdPut**](AdminApi.md#adminknownbugsidput) | **PUT** /admin/known-bugs/{id} | Update known bug |
| [**adminKnownBugsPost**](AdminApi.md#adminknownbugspost) | **POST** /admin/known-bugs | Create known bug |
| [**adminStatsGet**](AdminApi.md#adminstatsget) | **GET** /admin/stats | Get site statistics |
| [**adminUsersGet**](AdminApi.md#adminusersget) | **GET** /admin/users | List users |
| [**adminUsersIdBanHistoryGet**](AdminApi.md#adminusersidbanhistoryget) | **GET** /admin/users/{id}/ban-history | Get user ban history |
| [**adminUsersIdBanPost**](AdminApi.md#adminusersidbanpost) | **POST** /admin/users/{id}/ban | Ban user |
| [**adminUsersIdDeletePost**](AdminApi.md#adminusersiddeletepost) | **POST** /admin/users/{id}/delete | Soft delete user |
| [**adminUsersIdRolePost**](AdminApi.md#adminusersidrolepost) | **POST** /admin/users/{id}/role | Change user role |
| [**adminUsersIdShadowBanPost**](AdminApi.md#adminusersidshadowbanpost) | **POST** /admin/users/{id}/shadow-ban | Shadow ban user |
| [**adminUsersIdUnbanPost**](AdminApi.md#adminusersidunbanpost) | **POST** /admin/users/{id}/unban | Unban user |



## adminAnalyticsDashboardGet

> { [key: string]: object; } adminAnalyticsDashboardGet()

Get analytics dashboard

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminAnalyticsDashboardGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  try {
    const data = await api.adminAnalyticsDashboardGet();
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
| **200** | OK |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminAnalyticsRefreshPost

> { [key: string]: object; } adminAnalyticsRefreshPost()

Refresh analytics views

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminAnalyticsRefreshPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  try {
    const data = await api.adminAnalyticsRefreshPost();
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
| **200** | OK |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminBanHistoryGet

> { [key: string]: object; } adminBanHistoryGet(limit, offset, cursor)

Get all ban history

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminBanHistoryGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | Page size (default 50, max 200) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
    // string | Cursor for pagination (optional)
    cursor: cursor_example,
  } satisfies AdminBanHistoryGetRequest;

  try {
    const data = await api.adminBanHistoryGet(body);
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
| **limit** | `number` | Page size (default 50, max 200) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |
| **cursor** | `string` | Cursor for pagination | [Optional] [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminBugReportsGet

> { [key: string]: object; } adminBugReportsGet(status, feedbackType, feedbackCategory, limit, offset, cursor)

List bug reports

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminBugReportsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // string | Filter by status (optional)
    status: status_example,
    // string | Filter by feedback type (optional)
    feedbackType: feedbackType_example,
    // string | Filter by category (optional)
    feedbackCategory: feedbackCategory_example,
    // number | Page size (default 50) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
    // string | Pagination cursor (optional)
    cursor: cursor_example,
  } satisfies AdminBugReportsGetRequest;

  try {
    const data = await api.adminBugReportsGet(body);
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
| **feedbackType** | `string` | Filter by feedback type | [Optional] [Defaults to `undefined`] |
| **feedbackCategory** | `string` | Filter by category | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Page size (default 50) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |
| **cursor** | `string` | Pagination cursor | [Optional] [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminBugReportsIdPut

> { [key: string]: object; } adminBugReportsIdPut(id, body)

Update bug report

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminBugReportsIdPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | Bug report ID
    id: 56,
    // InternalHandlersUpdateBugReportRequest | Update request
    body: ...,
  } satisfies AdminBugReportsIdPutRequest;

  try {
    const data = await api.adminBugReportsIdPut(body);
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
| **id** | `number` | Bug report ID | [Defaults to `undefined`] |
| **body** | [InternalHandlersUpdateBugReportRequest](InternalHandlersUpdateBugReportRequest.md) | Update request | |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminHubsHubIdModeratorsGet

> { [key: string]: object; } adminHubsHubIdModeratorsGet(hubId)

Get hub moderators

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminHubsHubIdModeratorsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | Hub ID
    hubId: 56,
  } satisfies AdminHubsHubIdModeratorsGetRequest;

  try {
    const data = await api.adminHubsHubIdModeratorsGet(body);
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
| **hubId** | `number` | Hub ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminHubsHubIdModeratorsUserIdDelete

> { [key: string]: object; } adminHubsHubIdModeratorsUserIdDelete(hubId, userId)

Remove hub moderator

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminHubsHubIdModeratorsUserIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | Hub ID
    hubId: 56,
    // number | User ID
    userId: 56,
  } satisfies AdminHubsHubIdModeratorsUserIdDeleteRequest;

  try {
    const data = await api.adminHubsHubIdModeratorsUserIdDelete(body);
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
| **hubId** | `number` | Hub ID | [Defaults to `undefined`] |
| **userId** | `number` | User ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminHubsNameModeratorsPost

> { [key: string]: object; } adminHubsNameModeratorsPost(name)

Add hub moderator

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminHubsNameModeratorsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // string | Hub name
    name: name_example,
  } satisfies AdminHubsNameModeratorsPostRequest;

  try {
    const data = await api.adminHubsNameModeratorsPost(body);
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
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminKnownBugsIdDelete

> { [key: string]: object; } adminKnownBugsIdDelete(id)

Delete known bug

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminKnownBugsIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | Known bug ID
    id: 56,
  } satisfies AdminKnownBugsIdDeleteRequest;

  try {
    const data = await api.adminKnownBugsIdDelete(body);
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
| **id** | `number` | Known bug ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminKnownBugsIdPut

> { [key: string]: object; } adminKnownBugsIdPut(id, body)

Update known bug

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminKnownBugsIdPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | Known bug ID
    id: 56,
    // InternalHandlersUpdateKnownBugRequest | Update request
    body: ...,
  } satisfies AdminKnownBugsIdPutRequest;

  try {
    const data = await api.adminKnownBugsIdPut(body);
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
| **id** | `number` | Known bug ID | [Defaults to `undefined`] |
| **body** | [InternalHandlersUpdateKnownBugRequest](InternalHandlersUpdateKnownBugRequest.md) | Update request | |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminKnownBugsPost

> GithubComOmninudgeBackendInternalModelsKnownBug adminKnownBugsPost(body)

Create known bug

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminKnownBugsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // InternalHandlersCreateKnownBugRequest | Known bug
    body: ...,
  } satisfies AdminKnownBugsPostRequest;

  try {
    const data = await api.adminKnownBugsPost(body);
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
| **body** | [InternalHandlersCreateKnownBugRequest](InternalHandlersCreateKnownBugRequest.md) | Known bug | |

### Return type

[**GithubComOmninudgeBackendInternalModelsKnownBug**](GithubComOmninudgeBackendInternalModelsKnownBug.md)

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminStatsGet

> { [key: string]: object; } adminStatsGet()

Get site statistics

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminStatsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  try {
    const data = await api.adminStatsGet();
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
| **200** | OK |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminUsersGet

> { [key: string]: object; } adminUsersGet(limit, offset, search)

List users

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminUsersGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | Page size (default 20) (optional)
    limit: 56,
    // number | Offset (optional)
    offset: 56,
    // string | Search by username or email (optional)
    search: search_example,
  } satisfies AdminUsersGetRequest;

  try {
    const data = await api.adminUsersGet(body);
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
| **limit** | `number` | Page size (default 20) | [Optional] [Defaults to `undefined`] |
| **offset** | `number` | Offset | [Optional] [Defaults to `undefined`] |
| **search** | `string` | Search by username or email | [Optional] [Defaults to `undefined`] |

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


## adminUsersIdBanHistoryGet

> { [key: string]: object; } adminUsersIdBanHistoryGet(id)

Get user ban history

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminUsersIdBanHistoryGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | User ID
    id: 56,
  } satisfies AdminUsersIdBanHistoryGetRequest;

  try {
    const data = await api.adminUsersIdBanHistoryGet(body);
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
| **id** | `number` | User ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminUsersIdBanPost

> { [key: string]: object; } adminUsersIdBanPost(id)

Ban user

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminUsersIdBanPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | User ID
    id: 56,
  } satisfies AdminUsersIdBanPostRequest;

  try {
    const data = await api.adminUsersIdBanPost(body);
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
| **id** | `number` | User ID | [Defaults to `undefined`] |

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


## adminUsersIdDeletePost

> { [key: string]: object; } adminUsersIdDeletePost(id)

Soft delete user

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminUsersIdDeletePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | User ID
    id: 56,
  } satisfies AdminUsersIdDeletePostRequest;

  try {
    const data = await api.adminUsersIdDeletePost(body);
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
| **id** | `number` | User ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminUsersIdRolePost

> { [key: string]: object; } adminUsersIdRolePost(id)

Change user role

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminUsersIdRolePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | User ID
    id: 56,
  } satisfies AdminUsersIdRolePostRequest;

  try {
    const data = await api.adminUsersIdRolePost(body);
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
| **id** | `number` | User ID | [Defaults to `undefined`] |

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


## adminUsersIdShadowBanPost

> { [key: string]: object; } adminUsersIdShadowBanPost(id)

Shadow ban user

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminUsersIdShadowBanPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | User ID
    id: 56,
  } satisfies AdminUsersIdShadowBanPostRequest;

  try {
    const data = await api.adminUsersIdShadowBanPost(body);
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
| **id** | `number` | User ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminUsersIdUnbanPost

> { [key: string]: object; } adminUsersIdUnbanPost(id)

Unban user

### Example

```ts
import {
  Configuration,
  AdminApi,
} from '';
import type { AdminUsersIdUnbanPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new AdminApi(config);

  const body = {
    // number | User ID
    id: 56,
  } satisfies AdminUsersIdUnbanPostRequest;

  try {
    const data = await api.adminUsersIdUnbanPost(body);
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
| **id** | `number` | User ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

