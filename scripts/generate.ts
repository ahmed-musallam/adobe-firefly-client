import { createClient } from '@hey-api/openapi-ts';
import { packages } from './packages.ts';
import { generateMcpTools } from './mcp-tools.ts';

// generate OpenAPI-TS clients
await createClient(
  packages.flatMap(({ name, specPath, sdkName }) => [
    // Flat tree-shakeable functions
    {
      input: specPath,
      output: { path: `packages/${name}/src/flat`, postProcess: ['prettier'], tsConfigPath: 'off' },
      plugins: [
        '@hey-api/client-ky',
        '@hey-api/typescript',
        { name: '@hey-api/sdk', operations: { strategy: 'flat' } },
      ],
    },
    // Class-based SDK
    {
      input: specPath,
      output: { path: `packages/${name}/src/sdk`, postProcess: ['prettier'], tsConfigPath: 'off' },
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

// generate MCP tools
await generateMcpTools();
