/**
 * Utility functions for discovering packages and their specs.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IGNORED_PACKAGES = ['shared'];

/**
 * Discovers the spec file for a package, must be a file with a .json, .yaml, or .yml extension inside the package's 'spec' directory.
 */
function discoverSpec(packagePath: string): string | null {
  const specFolderPath = join(packagePath, 'spec');
  const specName = readdirSync(specFolderPath)
    .filter((name) => {
      return (
        (statSync(join(specFolderPath, name)).isFile() && name.endsWith('.json')) ||
        name.endsWith('.yaml') ||
        name.endsWith('.yml')
      );
    })
    ?.at(0);
  return specName ? join(specFolderPath, specName) : null;
}

/**
 * Generates a SDK name from a package name, example: 'firefly' -> 'FireflySDK', 'audio-video' -> 'AudioVideoSDK', etc.
 */
const generateSdkName = (name: string): string =>
  name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('') + 'SDK';

type Package = {
  name: string;
  packagePath: string;
  specPath: string;
  sdkName: string;
};

/**
 * Discovers all packages in the 'packages' directory
 */
function discoverPackages(): Package[] {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const packagesDir = join(root, 'packages');

  const packagePaths = readdirSync(packagesDir)
    .filter((name) => {
      const pkgPath = join(packagesDir, name);
      return statSync(pkgPath).isDirectory() && !IGNORED_PACKAGES.includes(name);
    })
    .map((name) => join(packagesDir, name));

  const packages = [] as Package[];
  for (const packagePath of packagePaths) {
    const name = packagePath.split('/').pop() as string;
    const specPath = discoverSpec(packagePath);
    if (specPath) {
      packages.push({
        name,
        packagePath,
        specPath,
        sdkName: generateSdkName(name),
      });
    } else {
      console.warn(`No spec found for package at path ${specPath}, ignoring.`);
    }
  }

  return packages;
}

export const packages = discoverPackages();
