<div align="center">

<img src="https://raw.githubusercontent.com/ietf-tools/common/main/assets/logos/semver-action.svg" alt="Semver Github Action" height="125" />

[![Release](https://img.shields.io/github/release/ietf-tools/semver-action.svg?style=flat&maxAge=600)](https://github.com/ietf-tools/semver-action/releases)
[![License](https://img.shields.io/github/license/ietf-tools/semver-action)](https://github.com/ietf-tools/semver-action/blob/main/LICENSE)

##### Semver Conventional Commits - Github Action

</div>

---

This GitHub Action automatically determinate the next release version to use based on all the [Conventional Commits](https://www.conventionalcommits.org) since the latest tag.

- [Example Workflow](#example-workflow)
- [Inputs](#inputs)
- [Outputs](#outputs)

## Example workflow
``` yaml
name: Deploy

on:
  push:
    tags:
      - v[0-9]+.[0-9]+.[0-9]+

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v2

      - name: Get Next Version
        id: semver
        uses: ietf-tools/semver-action@v1
        with:
          token: ${{ github.token }}
          branch: main

      - name: Create Release
        uses: ncipollo/release-action@v1
        with:
          allowUpdates: true
          draft: false
          name: ${{ steps.semver.outputs.next }}
          body: Changelog Contents
          token: ${{ github.token }}
```

## Inputs

| Field       | Description                                                                                                                                |      Required      | Default                                    |
|-------------|--------------------------------------------------------------------------------------------------------------------------------------------|:------------------:|--------------------------------------------|
| `token`     | Your GitHub token. (e.g. `${{ github.token }}`)                                                                                            | :white_check_mark: |                                            |
| `branch`    | The branch to use when fetching list of commits to compare against. (e.g. `main`)                                                          |         :x:        | `main`                                     |
| `majorList` | Comma separated commit prefixes, used to bump Major version. <br>*A `BREAKING CHANGE` note in a commit message will still cause a major bump.* |         :x:        |                                            |
| `minorList` | Comma separated commit prefixes, used to bump Minor version.                                                                               |         :x:        | `feat, feature`                            |
| `patchList` | Comma separated commit prefixes, used to bump Patch version.                                                                               |         :x:        | `fix, bugfix, perf, refactor, test, tests` |
| `patchAll`  | If set to `true`, will ignore `patchList` and always count commits as a Patch.                                                             |         :x:        | `false`                                    |

### Changelog inputs

- `majorTitle` Optional title of the breaking change section. If set blank, won't be rendered. If unset, will render default.
- `majorEmoji` Optional emoji code to prefix `majorTitle` text. If set blank, won't be rendered. If unset, will render default.
- `minorTitle` Optional title of the new features section. If set blank, won't be rendered. If unset, will render default.
- `minorEmoji` Optional emoji code to prefix `minorTitle` text. If set blank, won't be rendered. If unset, will render default.
- `patchTitle` Optional title of patch's section. If set blank, won't be rendered. If unset, will render default.
- `patchEmoji` Optional emoji code to prefix `patchTitle` text. If set blank, won't be rendered. If unset, will render default.
- `contributorsTitle` Optional title of patch's section. If set blank, won't be rendered. If unset, will render default.
- `contributorsEmoji` Optional emoji code to prefix `contributorsTitle` text. If set blank, won't be rendered. If unset, will render default.

## Outputs

| Field        | Description                                 |  Example Value  |
|--------------|---------------------------------------------|-----------------|
| `current`    | Current version number / latest tag.        |  `v1.1.9`       |
| `next`       | Next version number in format `v0.0.0`      |  `v1.2.0`       |
| `nextStrict` | Next version number without the `v` prefix. |  `1.2.0`        |
| `changeLog`  | Change log text, that can be used as        |  `# Release...` |
|              | release notes.                              |                 |

## :warning: Important :warning:

You must already have an existing tag in your repository. The job will exit with an error if it can't find the latest tag to compare against!
