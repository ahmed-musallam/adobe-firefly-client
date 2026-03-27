# @musallam/ffs-cloud-storage-client

JavaScript/TypeScript client for the Adobe Creative Cloud Storage & Collaboration API.

Manage Creative Cloud projects, folders, and files — including uploads, permissions, and image renditions.

## Installation

```sh
npm install @musallam/ffs-cloud-storage-client ky
```

`ky` is a peer dependency (`^1.0.0`); install a compatible 1.x version alongside this package. Releases that bundled `ky` internally are a previous major line—when upgrading, ensure `ky` is listed in your app if your package manager does not add it automatically.

## Authentication

Obtain a Bearer token and API key from the [Adobe Developer Console](https://developer.adobe.com/console).

The package exports a singleton `client` with `baseUrl` pre-configured. Set auth once at app startup:

```ts
import { client } from '@musallam/ffs-cloud-storage-client';

client.setConfig({
  auth: () => 'YOUR_ACCESS_TOKEN',
  headers: { 'x-api-key': 'YOUR_API_KEY' },
});
```

## Interceptors

Use `client.interceptors` to handle token refresh, logging, or errors:

```ts
import { client } from '@musallam/ffs-cloud-storage-client';

// Refresh token before each request
client.interceptors.request.use((request) => {
  request.headers.set('Authorization', `Bearer ${getAccessToken()}`);
  return request;
});

// Log responses
client.interceptors.response.use((response) => {
  console.log(`${response.status} ${response.url}`);
  return response;
});

// Eject when no longer needed
const id = client.interceptors.request.use(myInterceptor);
client.interceptors.request.eject(id);
```

## Usage

### Flat (tree-shakeable)

```ts
import { createClient, createConfig } from '@musallam/ffs-cloud-storage-client';
import { getProjects, createProject, getFile } from '@musallam/ffs-cloud-storage-client';

createClient(
  createConfig({
    baseUrl: 'https://cc-storage.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);

const projects = await getProjects();
```

### Class-based

```ts
import {
  createClient,
  createConfig,
  CloudStorageSdk,
} from '@musallam/ffs-cloud-storage-client/sdk';

const client = createClient(
  createConfig({
    baseUrl: 'https://cc-storage.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);
const storage = new CloudStorageSdk(client);

const projects = await storage.getProjects();
```
