# @musallam/ffs-audio-video-client

JavaScript/TypeScript client for the Adobe Audio & Video API.

Convert text to speech, transcribe audio/video, generate avatar videos, reframe video, and dub content with lip-sync.

## Installation

```sh
npm install @musallam/ffs-audio-video-client
```

## Authentication

Obtain a Bearer token and API key from the [Adobe Developer Console](https://developer.adobe.com/console).

The package exports a singleton `client` with `baseUrl` pre-configured. Set auth once at app startup:

```ts
import { client } from '@musallam/ffs-audio-video-client';

client.setConfig({
  auth: () => 'YOUR_ACCESS_TOKEN',
  headers: { 'x-api-key': 'YOUR_API_KEY' },
});
```

## Interceptors

Use `client.interceptors` to handle token refresh, logging, or errors:

```ts
import { client } from '@musallam/ffs-audio-video-client';

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
import { createClient, createConfig } from '@musallam/ffs-audio-video-client';
import { generateSpeech, transcribe, generateAvatar } from '@musallam/ffs-audio-video-client';

createClient(
  createConfig({
    baseUrl: 'https://audio-video.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);

const result = await generateSpeech({ body: { text: 'Hello world', voice: 'en-US-1' } });
```

### Class-based

```ts
import { createClient, createConfig, AudioVideoSdk } from '@musallam/ffs-audio-video-client/sdk';

const client = createClient(
  createConfig({
    baseUrl: 'https://audio-video.adobe.io',
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN',
      'x-api-key': 'YOUR_API_KEY',
    },
  })
);
const audioVideo = new AudioVideoSdk(client);

const result = await audioVideo.generateSpeech({ body: { text: 'Hello world', voice: 'en-US-1' } });
```
