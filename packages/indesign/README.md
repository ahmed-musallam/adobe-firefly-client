# @musallam/ffs-indesign-client

JavaScript/TypeScript client for the [Adobe InDesign API](https://developer.adobe.com/firefly-services/docs/indesign/).

Automate document generation with data merge, create renditions from INDD files, convert PDFs to InDesign, and run custom scripts.

## Installation

```sh
npm install @musallam/ffs-indesign-client ky
```

`ky` is a peer dependency (`^1.0.0`); install a compatible 1.x version alongside this package. Releases that bundled `ky` internally are a previous major line—when upgrading, ensure `ky` is listed in your app if your package manager does not add it automatically.

## Authentication

Obtain a Bearer token and API key from the [Adobe Developer Console](https://developer.adobe.com/console).

The package exports a singleton `client` with `baseUrl` pre-configured. Set auth once at app startup:

```ts
import { client } from '@musallam/ffs-indesign-client';

client.setConfig({
  auth: () => 'YOUR_ACCESS_TOKEN',
  headers: { 'x-api-key': 'YOUR_API_KEY' },
});
```

## Interceptors

Use `client.interceptors` to handle token refresh, logging, or errors:

```ts
import { client } from '@musallam/ffs-indesign-client';

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
import { createClient, createConfig } from '@musallam/ffs-indesign-client';
import { dataMerge, renditionJob, convertPdfToInDesign } from '@musallam/ffs-indesign-client';

createClient(
  createConfig({
    baseUrl: 'https://indesign.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);

const result = await dataMerge({
  body: { assets: [{ href: 'https://...', storage: 'external' }] },
});
```

### Class-based

```ts
import { createClient, createConfig, InDesignSdk } from '@musallam/ffs-indesign-client/sdk';

const client = createClient(
  createConfig({
    baseUrl: 'https://indesign.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);
const indesign = new InDesignSdk(client);

const result = await indesign.dataMerge({
  body: { assets: [{ href: 'https://...', storage: 'external' }] },
});
```
