# @musallam/ffs-substance-3d-client

JavaScript/TypeScript client for the Adobe Substance 3D API.

Assemble 3D scenes, generate composites, convert between 3D file formats, and render with basic or advanced options.

## Installation

```sh
npm install @musallam/ffs-substance-3d-client ky
```

`ky` is a peer dependency (`^1.0.0`); install a compatible 1.x version alongside this package. Releases that bundled `ky` internally are a previous major line—when upgrading, ensure `ky` is listed in your app if your package manager does not add it automatically.

## Authentication

Obtain a Bearer token and API key from the [Adobe Developer Console](https://developer.adobe.com/console).

The package exports a singleton `client` with `baseUrl` pre-configured. Set auth once at app startup:

```ts
import { client } from '@musallam/ffs-substance-3d-client';

client.setConfig({
  auth: () => 'YOUR_ACCESS_TOKEN',
  headers: { 'x-api-key': 'YOUR_API_KEY' },
});
```

## Interceptors

Use `client.interceptors` to handle token refresh, logging, or errors:

```ts
import { client } from '@musallam/ffs-substance-3d-client';

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
import { createClient, createConfig } from '@musallam/ffs-substance-3d-client';
import {
  v1CompositesCompose,
  v1ScenesAssemble,
  v1ScenesConvert,
} from '@musallam/ffs-substance-3d-client';

createClient(
  createConfig({
    baseUrl: 'https://substance3d.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);

const result = await v1ScenesAssemble({
  body: { assets: [{ href: 'https://...', storage: 'external' }] },
});
```

### Class-based

```ts
import { createClient, createConfig, Substance3Dsdk } from '@musallam/ffs-substance-3d-client/sdk';

const client = createClient(
  createConfig({
    baseUrl: 'https://substance3d.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);
const substance = new Substance3Dsdk(client);

const result = await substance.v1ScenesAssemble({
  body: { assets: [{ href: 'https://...', storage: 'external' }] },
});
```
