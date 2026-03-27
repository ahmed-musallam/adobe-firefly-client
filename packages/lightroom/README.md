# @musallam/ffs-lightroom-client

JavaScript/TypeScript client for the [Adobe Lightroom API](https://developer.adobe.com/firefly-services/docs/lightroom/).

Apply auto tone corrections, manual edits, and XMP presets to images programmatically.

## Installation

```sh
npm install @musallam/ffs-lightroom-client ky
```

`ky` is a peer dependency (`^1.0.0`); install a compatible 1.x version alongside this package. Releases that bundled `ky` internally are a previous major line—when upgrading, ensure `ky` is listed in your app if your package manager does not add it automatically.

## Authentication

Obtain a Bearer token and API key from the [Adobe Developer Console](https://developer.adobe.com/console).

The package exports a singleton `client` with `baseUrl` pre-configured. Set auth once at app startup:

```ts
import { client } from '@musallam/ffs-lightroom-client';

client.setConfig({
  auth: () => 'YOUR_ACCESS_TOKEN',
  headers: { 'x-api-key': 'YOUR_API_KEY' },
});
```

## Interceptors

Use `client.interceptors` to handle token refresh, logging, or errors:

```ts
import { client } from '@musallam/ffs-lightroom-client';

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
import { createClient, createConfig } from '@musallam/ffs-lightroom-client';
import { applyAutoTone, applyEdits, applyPreset } from '@musallam/ffs-lightroom-client';

createClient(
  createConfig({
    baseUrl: 'https://image.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);

const result = await applyAutoTone({
  body: { inputs: { source: { href: 'https://...', storage: 'external' } } },
});
```

### Class-based

```ts
import { createClient, createConfig, LightroomSdk } from '@musallam/ffs-lightroom-client/sdk';

const client = createClient(
  createConfig({
    baseUrl: 'https://image.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);
const lightroom = new LightroomSdk(client);

const result = await lightroom.applyAutoTone({
  body: { inputs: { source: { href: 'https://...', storage: 'external' } } },
});
```
