# GroupsApi

All URIs are relative to *http://localhost:8080/api/v1*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**conversationsGroupsPost**](GroupsApi.md#conversationsgroupspost) | **POST** /conversations/groups | Create group |
| [**conversationsIdGroupPatch**](GroupsApi.md#conversationsidgrouppatch) | **PATCH** /conversations/{id}/group | Update group |
| [**conversationsIdInvitesPost**](GroupsApi.md#conversationsidinvitespost) | **POST** /conversations/{id}/invites | Create group invite |
| [**conversationsIdLeavePost**](GroupsApi.md#conversationsidleavepost) | **POST** /conversations/{id}/leave | Leave group |
| [**conversationsIdParticipantsGet**](GroupsApi.md#conversationsidparticipantsget) | **GET** /conversations/{id}/participants | Get group participants |
| [**conversationsIdParticipantsPost**](GroupsApi.md#conversationsidparticipantspost) | **POST** /conversations/{id}/participants | Add group participant |
| [**conversationsIdParticipantsUserIdDelete**](GroupsApi.md#conversationsidparticipantsuseriddelete) | **DELETE** /conversations/{id}/participants/{user_id} | Remove group participant |
| [**conversationsIdParticipantsUserIdPatch**](GroupsApi.md#conversationsidparticipantsuseridpatch) | **PATCH** /conversations/{id}/participants/{user_id} | Update participant role |
| [**conversationsIdSettingsGet**](GroupsApi.md#conversationsidsettingsget) | **GET** /conversations/{id}/settings | Get group settings |
| [**conversationsIdSettingsPatch**](GroupsApi.md#conversationsidsettingspatch) | **PATCH** /conversations/{id}/settings | Update group settings |
| [**conversationsIdTransferOwnershipPost**](GroupsApi.md#conversationsidtransferownershippost) | **POST** /conversations/{id}/transfer-ownership | Transfer group ownership |
| [**groupInvitesIdAcceptPost**](GroupsApi.md#groupinvitesidacceptpost) | **POST** /group-invites/{id}/accept | Accept group invite |
| [**groupInvitesIdDeclineDelete**](GroupsApi.md#groupinvitesiddeclinedelete) | **DELETE** /group-invites/{id}/decline | Decline group invite |
| [**groupsDiscoverGet**](GroupsApi.md#groupsdiscoverget) | **GET** /groups/discover | Discover groups |
| [**usersMeGroupInvitesGet**](GroupsApi.md#usersmegroupinvitesget) | **GET** /users/me/group-invites | Get my group invites |



## conversationsGroupsPost

> { [key: string]: object; } conversationsGroupsPost()

Create group

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsGroupsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  try {
    const data = await api.conversationsGroupsPost();
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
| **201** | Created |  -  |
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdGroupPatch

> { [key: string]: object; } conversationsIdGroupPatch(id)

Update group

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsIdGroupPatchRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdGroupPatchRequest;

  try {
    const data = await api.conversationsIdGroupPatch(body);
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
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdInvitesPost

> { [key: string]: object; } conversationsIdInvitesPost(id)

Create group invite

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsIdInvitesPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdInvitesPostRequest;

  try {
    const data = await api.conversationsIdInvitesPost(body);
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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdLeavePost

> { [key: string]: object; } conversationsIdLeavePost(id)

Leave group

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsIdLeavePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdLeavePostRequest;

  try {
    const data = await api.conversationsIdLeavePost(body);
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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdParticipantsGet

> Array&lt;{ [key: string]: object; }&gt; conversationsIdParticipantsGet(id)

Get group participants

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsIdParticipantsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdParticipantsGetRequest;

  try {
    const data = await api.conversationsIdParticipantsGet(body);
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


## conversationsIdParticipantsPost

> { [key: string]: object; } conversationsIdParticipantsPost(id)

Add group participant

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsIdParticipantsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdParticipantsPostRequest;

  try {
    const data = await api.conversationsIdParticipantsPost(body);
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
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdParticipantsUserIdDelete

> { [key: string]: object; } conversationsIdParticipantsUserIdDelete(id, userId)

Remove group participant

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsIdParticipantsUserIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
    // number | User ID
    userId: 56,
  } satisfies ConversationsIdParticipantsUserIdDeleteRequest;

  try {
    const data = await api.conversationsIdParticipantsUserIdDelete(body);
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


## conversationsIdParticipantsUserIdPatch

> { [key: string]: object; } conversationsIdParticipantsUserIdPatch(id, userId)

Update participant role

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsIdParticipantsUserIdPatchRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
    // number | User ID
    userId: 56,
  } satisfies ConversationsIdParticipantsUserIdPatchRequest;

  try {
    const data = await api.conversationsIdParticipantsUserIdPatch(body);
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


## conversationsIdSettingsGet

> { [key: string]: object; } conversationsIdSettingsGet(id)

Get group settings

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsIdSettingsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdSettingsGetRequest;

  try {
    const data = await api.conversationsIdSettingsGet(body);
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
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdSettingsPatch

> { [key: string]: object; } conversationsIdSettingsPatch(id)

Update group settings

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsIdSettingsPatchRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdSettingsPatchRequest;

  try {
    const data = await api.conversationsIdSettingsPatch(body);
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
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## conversationsIdTransferOwnershipPost

> { [key: string]: object; } conversationsIdTransferOwnershipPost(id)

Transfer group ownership

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { ConversationsIdTransferOwnershipPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Conversation ID
    id: 56,
  } satisfies ConversationsIdTransferOwnershipPostRequest;

  try {
    const data = await api.conversationsIdTransferOwnershipPost(body);
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
| **400** | Bad Request |  -  |
| **401** | Unauthorized |  -  |
| **403** | Forbidden |  -  |
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## groupInvitesIdAcceptPost

> { [key: string]: object; } groupInvitesIdAcceptPost(id)

Accept group invite

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { GroupInvitesIdAcceptPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Invite ID
    id: 56,
  } satisfies GroupInvitesIdAcceptPostRequest;

  try {
    const data = await api.groupInvitesIdAcceptPost(body);
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
| **id** | `number` | Invite ID | [Defaults to `undefined`] |

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


## groupInvitesIdDeclineDelete

> { [key: string]: object; } groupInvitesIdDeclineDelete(id)

Decline group invite

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { GroupInvitesIdDeclineDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // number | Invite ID
    id: 56,
  } satisfies GroupInvitesIdDeclineDeleteRequest;

  try {
    const data = await api.groupInvitesIdDeclineDelete(body);
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
| **id** | `number` | Invite ID | [Defaults to `undefined`] |

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


## groupsDiscoverGet

> Array&lt;{ [key: string]: object; }&gt; groupsDiscoverGet(q, limit)

Discover groups

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { GroupsDiscoverGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  const body = {
    // string | Search query (optional)
    q: q_example,
    // number | Max results (optional)
    limit: 56,
  } satisfies GroupsDiscoverGetRequest;

  try {
    const data = await api.groupsDiscoverGet(body);
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
| **q** | `string` | Search query | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Max results | [Optional] [Defaults to `undefined`] |

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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## usersMeGroupInvitesGet

> Array&lt;{ [key: string]: object; }&gt; usersMeGroupInvitesGet()

Get my group invites

### Example

```ts
import {
  Configuration,
  GroupsApi,
} from '';
import type { UsersMeGroupInvitesGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const config = new Configuration({ 
    // To configure API key authorization: BearerAuth
    apiKey: "YOUR API KEY",
  });
  const api = new GroupsApi(config);

  try {
    const data = await api.usersMeGroupInvitesGet();
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
| **500** | Internal Server Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

