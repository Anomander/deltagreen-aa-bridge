# RELEASE.md — cutting a release

## The shape of it

Releases are tag-driven. Pushing `v<version>` runs `.github/workflows/release.yml`, which
tests, stamps the manifest, builds `module.zip`, publishes a GitHub release, and — if a
`FOUNDRY_API_TOKEN` secret exists — registers the version with the Foundry package registry.

There is **no build step**. The module is plain ES modules that Foundry loads straight from the
tree, so the zip is the tree minus its tooling: `module.json`, `LICENSE`, `README.md`,
`scripts/`, `lang/`.

## Before tagging

1. **Verify in a live world.** Green tests are not evidence.
   ```bash
   FOUNDRY_USER=Claude npm run fvtt:verify
   ```
2. **Re-check both contracts** against whatever the world is running.
   ```bash
   npm run sync:rolltypes && npm run sync:aa && git diff tests/fixtures/
   ```
   A non-empty diff is a decision to make, not a file to commit. See
   [TESTING.md](TESTING.md#when-a-drift-test-fails).
3. **Update the compatibility range** in `module.json` if the Foundry, system or AA version you
   verified against has moved.
4. **Write the changelog entry.** What changed, and what was confirmed in a world.
5. **Bump the version in both `module.json` and `package.json`.** They must agree — a unit test
   asserts it, and the workflow refuses a tag that disagrees with the manifest.

## Tagging

```bash
git commit -am "Release 0.2.0"
git tag v0.2.0
git push && git push --tags
```

The tag is the version, prefixed with `v`. `v0.2.0` releases `0.2.0`.

## What the workflow guarantees

| Step | Failure it prevents |
|---|---|
| `npm test` | A release that was already broken on `main`. |
| Tag/manifest version check | A release whose manifest advertises a different version than the tag it came from. |
| Manifest-path check against the zip | A module that installs and then 404s at load — a path declared in `module.json` and left out of the archive. Invisible to every other test. |
| `variable-substitution` on `module.json` | Hand-edited download URLs that point at the previous release. |

The Foundry registry step is skipped silently when `FOUNDRY_API_TOKEN` is unset, so the GitHub
release still succeeds on a repo that has not been registered.

## Manifest URLs

`manifest` points at `releases/latest/download/module.json` so installed copies see updates.
`download` is stamped per release, at `releases/download/<tag>/module.zip`, so an installed
version keeps resolving to the archive it was released with.

## After

Install the released manifest URL into a clean world and roll one attack. The zip is the only
artifact that has never been tested by anything upstream of it.
