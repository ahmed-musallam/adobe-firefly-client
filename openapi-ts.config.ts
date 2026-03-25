import { defineConfig } from '@hey-api/openapi-ts';

const packages = [
  { name: 'firefly', spec: 'firefly-api.json', sdkName: 'FireflySDK' },
  { name: 'photoshop', spec: 'photoshop-api.json', sdkName: 'PhotoshopSDK' },
  { name: 'lightroom', spec: 'lightroom-api.json', sdkName: 'LightroomSDK' },
  { name: 'audio-video', spec: 'audio-video-api.json', sdkName: 'AudioVideoSDK' },
  { name: 'indesign', spec: 'indesign-api.json', sdkName: 'InDesignSDK' },
  { name: 'cloud-storage', spec: 'cloud-storage-api.yml', sdkName: 'CloudStorageSDK' },
  { name: 'substance-3d', spec: 'substance-3d-api.yaml', sdkName: 'Substance3DSDK' },
] as const;

export default defineConfig(
  packages.flatMap(({ name, spec, sdkName }) => [
    // Flat tree-shakeable functions
    {
      input: `packages/${name}/spec/${spec}`,
      output: { path: `packages/${name}/src/flat`, postProcess: ['prettier'] },
      plugins: [
        '@hey-api/client-ky',
        '@hey-api/typescript',
        { name: '@hey-api/sdk', operations: { strategy: 'flat' } },
      ],
    },
    // Class-based SDK
    {
      input: `packages/${name}/spec/${spec}`,
      output: { path: `packages/${name}/src/sdk`, postProcess: ['prettier'] },
      plugins: [
        '@hey-api/client-ky',
        '@hey-api/typescript',
        {
          name: '@hey-api/sdk',
          operations: { strategy: 'single', containerName: sdkName },
        },
      ],
    },
  ])
);
