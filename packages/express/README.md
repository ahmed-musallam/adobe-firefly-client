# @musallam/ffs-express-client

JavaScript/TypeScript client for the [Adobe Express API](https://developer.adobe.com/firefly-services/docs/express-api/api/).

List tagged documents, inspect page and element details, generate document variations from tag mappings, and export page renditions as images, video, or PDF.

## Installation

```sh
npm install @musallam/ffs-express-client ky
```

`ky` is a peer dependency (`^1.0.0`); install a compatible 1.x version alongside this package. Releases that bundled `ky` internally are a previous major line—when upgrading, ensure `ky` is listed in your app if your package manager does not add it automatically.

## Authentication

Obtain a Bearer token and API key from the [Adobe Developer Console](https://developer.adobe.com/console).

The package exports a singleton `client` with `baseUrl` pre-configured. Set auth once at app startup:

```ts
import { client } from '@musallam/ffs-express-client';

client.setConfig({
  auth: () => 'YOUR_ACCESS_TOKEN',
  headers: { 'x-api-key': 'YOUR_API_KEY' },
});
```

## Interceptors

Use `client.interceptors` to handle token refresh, logging, or errors:

```ts
import { client } from '@musallam/ffs-express-client';

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
import { createClient, createConfig } from '@musallam/ffs-express-client';
import {
  taggedDocuments,
  taggedDocumentDetails,
  generateVariation,
  exportRendition,
  getJobStatus,
} from '@musallam/ffs-express-client';

createClient(
  createConfig({
    baseUrl: 'https://express-api.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);

// List tagged documents
const { data } = await taggedDocuments({ query: { limit: 10 } });

// Get page and tag details for a document
const { data: details } = await taggedDocumentDetails({
  path: { documentId: data.documents[0].id },
});

// Generate a variation by replacing tagged elements
const { data: job } = await generateVariation({
  body: {
    id: data.documents[0].id,
    variationDetails: {
      tagMappings: {
        HeaderTitle: 'Summer Sale',
        CompanyLogo: 'https://example.com/logo.png',
      },
    },
  },
});

// Poll until complete
const result = await pollExpressJob({ client, jobId: job.jobId });
console.log(result.result.data?.document);
```

### Class-based

```ts
import { createClient, createConfig, ExpressSdk } from '@musallam/ffs-express-client/sdk';

const client = createClient(
  createConfig({
    baseUrl: 'https://express-api.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);
const express = new ExpressSdk(client);

const { data } = await express.taggedDocuments({ query: { limit: 10 } });

const { data: job } = await express.exportRendition({
  body: {
    id: data.documents[0].id,
    pages: '1-3',
    options: { format: 'image/jpeg', size: 1024 },
  },
});
```

### Polling async jobs

Both `generateVariation` and `exportRendition` are asynchronous — they return a `jobId` immediately. Use `pollExpressJob` to wait for completion:

```ts
import { client, pollExpressJob } from '@musallam/ffs-express-client';

const { data: job } = await exportRendition({
  body: {
    id: 'urn:aaid:sc:AP:...',
    pages: '1-',
    options: { format: 'image/png' },
  },
});

const { result } = await pollExpressJob({
  client,
  jobId: job.jobId,
  intervalMs: 2000,
  timeoutMs: 60_000,
});

console.log(result.data?.pageRenditionsResult);
```
