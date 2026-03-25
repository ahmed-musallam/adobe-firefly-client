# Adobe Firefly Client

A collection of JavaScript/TypeScript API clients for Adobe Firefly Services, auto-generated from official OpenAPI specs using [hey-api](https://heyapi.dev).

## Packages

| Package                                                                  | Description                                                | API Docs                                                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`@musallam/ffs-firefly-client`](packages/firefly/README.md)             | Text-to-image, image expansion, fill, and video generation | [Firefly API](https://developer.adobe.com/firefly-services/docs/firefly-api/api/)       |
| [`@musallam/ffs-photoshop-client`](packages/photoshop/README.md)         | PSD manipulation, background removal, masking, text layers | [Photoshop API](https://developer.adobe.com/firefly-services/docs/photoshop/api/)       |
| [`@musallam/ffs-lightroom-client`](packages/lightroom/README.md)         | Auto tone, manual edits, XMP preset application            | [Lightroom API](https://developer.adobe.com/firefly-services/docs/lightroom/api/)       |
| [`@musallam/ffs-audio-video-client`](packages/audio-video/README.md)     | Text-to-speech, transcription, avatar generation, dubbing  | [Audio & Video API](https://developer.adobe.com/audio-video-firefly-services/api/)      |
| [`@musallam/ffs-indesign-client`](packages/indesign/README.md)           | Data merge, renditions, PDF-to-InDesign conversion         | [InDesign API](https://developer.adobe.com/firefly-services/docs/indesign-apis/api/)    |
| [`@musallam/ffs-cloud-storage-client`](packages/cloud-storage/README.md) | Creative Cloud project and file management                 | [Cloud Storage API](https://developer.adobe.com/cloud-storage/guides/api/specification) |
| [`@musallam/ffs-substance-3d-client`](packages/substance-3d/README.md)   | 3D scene assembly, compositing, format conversion          | [Substance 3D API](https://developer.adobe.com/firefly-services/docs/s3dapi/api/)       |

Each package ships both a flat tree-shakeable API and a class-based SDK, with full TypeScript types.

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io) 10+

### Setup

```sh
git clone https://github.com/ahmed-musallam/adobe-firefly-client.git
cd adobe-firefly-client
pnpm install
```

### Regenerate API clients

Regenerates all source files from the OpenAPI specs in `packages/*/spec/`:

```sh
pnpm generate
```

> Generated files (`src/flat/`, `src/sdk/`) are committed to the repo.

### Build

```sh
pnpm build
```

Compiles all packages to `dist/` using [tsdown](https://tsdown.dev), producing ESM and CJS outputs with TypeScript declarations.

### Test

```sh
pnpm test
```

### Lint & Format

```sh
pnpm lint          # oxlint
pnpm format        # prettier --write
pnpm format:check  # prettier --check
```

### Docs

```sh
pnpm docs
```

Generates a TypeDoc site into `docs/` (gitignored). Automatically deployed to GitHub Pages on push to `main`.

### Clean

```sh
pnpm clean        # removes src/flat, src/sdk, and dist for all packages
pnpm clean:dist   # removes only dist
```

---

## Project Structure

```
adobe-firefly-client/
├── packages/
│   ├── firefly/
│   │   ├── spec/          # OpenAPI spec (source of truth)
│   │   ├── src/
│   │   │   ├── flat/      # Generated — tree-shakeable functions
│   │   │   └── sdk/       # Generated — class-based SDK
│   │   └── tests/
│   ├── photoshop/
│   └── ...                # same structure for all 7 packages
├── openapi-ts.config.ts   # Single config for all 14 generation jobs
├── tsdown.config.ts       # Shared build config for all packages
├── tsconfig.base.json     # Shared TypeScript config
├── turbo.json             # Task orchestration
└── pnpm-workspace.yaml    # Workspace + dependency catalog
```

---

## OpenAPI Specs

Specs are co-located with their packages and downloaded at the time of the last publish.

| Spec              | Location                                            |
| ----------------- | --------------------------------------------------- |
| Firefly API       | `packages/firefly/spec/firefly-api.json`            |
| Photoshop API     | `packages/photoshop/spec/photoshop-api.json`        |
| Lightroom API     | `packages/lightroom/spec/lightroom-api.json`        |
| Audio & Video API | `packages/audio-video/spec/audio-video-api.json`    |
| InDesign API      | `packages/indesign/spec/indesign-api.json`          |
| Cloud Storage API | `packages/cloud-storage/spec/cloud-storage-api.yml` |
| Substance 3D API  | `packages/substance-3d/spec/substance-3d-api.yaml`  |

---

## Release

Releases are fully automated via [multi-semantic-release](https://github.com/qiwi/multi-semantic-release) on every push to `main`.

- Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org)
- Each package is versioned independently based on its own commit history
- `fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` → major
- Changelogs and GitHub Releases are generated automatically
- Packages are published to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements)

### Commit message examples

```sh
feat(firefly): add support for new model parameter
fix(photoshop): correct endpoint path for removeBackground
chore: update openapi specs
```

---

## Contributing

1. Fork the repo and create a branch from `main`
2. Follow [Conventional Commits](https://www.conventionalcommits.org) — enforced by commitlint
3. Run `pnpm lint && pnpm format:check` before pushing
4. Open a pull request — CI runs format check, lint, build, and tests automatically
