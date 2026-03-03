# GroupAdminApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**groupsIdAuditLogGet**](GroupAdminApi.md#groupsidauditlogget) | **GET** /groups/{id}/audit-log | Get group audit log |
| [**groupsIdMembersUserIdBanDelete**](GroupAdminApi.md#groupsidmembersuseridbandelete) | **DELETE** /groups/{id}/members/{user_id}/ban | Unban group member |
| [**groupsIdMembersUserIdBanPost**](GroupAdminApi.md#groupsidmembersuseridbanpost) | **POST** /groups/{id}/members/{user_id}/ban | Ban group member |
| [**groupsIdMembersUserIdMuteDelete**](GroupAdminApi.md#groupsidmembersuseridmutedelete) | **DELETE** /groups/{id}/members/{user_id}/mute | Unmute group member |
| [**groupsIdMembersUserIdMutePost**](GroupAdminApi.md#groupsidmembersuseridmutepost) | **POST** /groups/{id}/members/{user_id}/mute | Mute group member |
| [**groupsIdMessagesMessageIdDelete**](GroupAdminApi.md#groupsidmessagesmessageiddelete) | **DELETE** /groups/{id}/messages/{message_id} | Admin delete message |
| [**groupsIdMyRestrictionGet**](GroupAdminApi.md#groupsidmyrestrictionget) | **GET** /groups/{id}/my-restriction | Get my group restriction |
| [**groupsIdRestrictionsGet**](GroupAdminApi.md#groupsidrestrictionsget) | **GET** /groups/{id}/restrictions | Get group restrictions |
| [**groupsIdSlowModePut**](GroupAdminApi.md#groupsidslowmodeput) | **PUT** /groups/{id}/slow-mode | Set slow mode |



## groupsIdAuditLogGet

> Array&lt;{ [key: string]: object; }&gt; groupsIdAuditLogGet(id, limit, offset)

Get group audit log

### Example

```ts
import {
  Configuration,
  GroupAdminApi,
} from '';
import type { GroupsIdAuditLogGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupAdminApi(config);

  const body = {
    // number | Group ID
    id: 56,
    // number | Max results (optional)
    limit: 56,
    // number | Pagination offset (optional)
    offset: 56,
  } satisfies GroupsIdAuditLogGetRequest;

  try {
    const data = await api.groupsIdAuditLogGet(body);
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
| **id** | `number` | Group ID | [Defaults to `undefined`] |
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
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## groupsIdMembersUserIdBanDelete

> { [key: string]: object; } groupsIdMembersUserIdBanDelete(id, userId)

Unban group member

### Example

```ts
import {
  Configuration,
  GroupAdminApi,
} from '';
import type { GroupsIdMembersUserIdBanDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupAdminApi(config);

  const body = {
    // number | Group ID
    id: 56,
    // number | User ID
    userId: 56,
  } satisfies GroupsIdMembersUserIdBanDeleteRequest;

  try {
    const data = await api.groupsIdMembersUserIdBanDelete(body);
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
| **id** | `number` | Group ID | [Defaults to `undefined`] |
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
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## groupsIdMembersUserIdBanPost

> { [key: string]: object; } groupsIdMembersUserIdBanPost(id, userId)

Ban group member

### Example

```ts
import {
  Configuration,
  GroupAdminApi,
} from '';
import type { GroupsIdMembersUserIdBanPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupAdminApi(config);

  const body = {
    // number | Group ID
    id: 56,
    // number | User ID
    userId: 56,
  } satisfies GroupsIdMembersUserIdBanPostRequest;

  try {
    const data = await api.groupsIdMembersUserIdBanPost(body);
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
| **id** | `number` | Group ID | [Defaults to `undefined`] |
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
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## groupsIdMembersUserIdMuteDelete

> { [key: string]: object; } groupsIdMembersUserIdMuteDelete(id, userId)

Unmute group member

### Example

```ts
import {
  Configuration,
  GroupAdminApi,
} from '';
import type { GroupsIdMembersUserIdMuteDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupAdminApi(config);

  const body = {
    // number | Group ID
    id: 56,
    // number | User ID
    userId: 56,
  } satisfies GroupsIdMembersUserIdMuteDeleteRequest;

  try {
    const data = await api.groupsIdMembersUserIdMuteDelete(body);
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
| **id** | `number` | Group ID | [Defaults to `undefined`] |
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
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## groupsIdMembersUserIdMutePost

> { [key: string]: object; } groupsIdMembersUserIdMutePost(id, userId)

Mute group member

### Example

```ts
import {
  Configuration,
  GroupAdminApi,
} from '';
import type { GroupsIdMembersUserIdMutePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupAdminApi(config);

  const body = {
    // number | Group ID
    id: 56,
    // number | User ID
    userId: 56,
  } satisfies GroupsIdMembersUserIdMutePostRequest;

  try {
    const data = await api.groupsIdMembersUserIdMutePost(body);
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
| **id** | `number` | Group ID | [Defaults to `undefined`] |
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
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## groupsIdMessagesMessageIdDelete

> { [key: string]: object; } groupsIdMessagesMessageIdDelete(id, messageId)

Admin delete message

### Example

```ts
import {
  Configuration,
  GroupAdminApi,
} from '';
import type { GroupsIdMessagesMessageIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupAdminApi(config);

  const body = {
    // number | Group ID
    id: 56,
    // number | Message ID
    messageId: 56,
  } satisfies GroupsIdMessagesMessageIdDeleteRequest;

  try {
    const data = await api.groupsIdMessagesMessageIdDelete(body);
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
| **id** | `number` | Group ID | [Defaults to `undefined`] |
| **messageId** | `number` | Message ID | [Defaults to `undefined`] |

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


## groupsIdMyRestrictionGet

> { [key: string]: object; } groupsIdMyRestrictionGet(id)

Get my group restriction

### Example

```ts
import {
  Configuration,
  GroupAdminApi,
} from '';
import type { GroupsIdMyRestrictionGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupAdminApi(config);

  const body = {
    // number | Group ID
    id: 56,
  } satisfies GroupsIdMyRestrictionGetRequest;

  try {
    const data = await api.groupsIdMyRestrictionGet(body);
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
| **id** | `number` | Group ID | [Defaults to `undefined`] |

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## groupsIdRestrictionsGet

> Array&lt;{ [key: string]: object; }&gt; groupsIdRestrictionsGet(id)

Get group restrictions

### Example

```ts
import {
  Configuration,
  GroupAdminApi,
} from '';
import type { GroupsIdRestrictionsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupAdminApi(config);

  const body = {
    // number | Group ID
    id: 56,
  } satisfies GroupsIdRestrictionsGetRequest;

  try {
    const data = await api.groupsIdRestrictionsGet(body);
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
| **id** | `number` | Group ID | [Defaults to `undefined`] |

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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## groupsIdSlowModePut

> { [key: string]: object; } groupsIdSlowModePut(id)

Set slow mode

### Example

```ts
import {
  Configuration,
  GroupAdminApi,
} from '';
import type { GroupsIdSlowModePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupAdminApi(config);

  const body = {
    // number | Group ID
    id: 56,
  } satisfies GroupsIdSlowModePutRequest;

  try {
    const data = await api.groupsIdSlowModePut(body);
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
| **id** | `number` | Group ID | [Defaults to `undefined`] |

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

