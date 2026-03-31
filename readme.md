# Stash Plugins

> [!WARNING]
> Absolutely no warranties or guarantees. Use at your own risk.

## Installation

1. Stash > Settings > Plugins > Add Source
    1. Name: `jsmthy/stash-plugins` or whatever you want
    1. Source: `https://jsmthy.github.io/stash-plugins/main/index.yml`
    1. Confirm

## Plugins

### Stash Ingest

On scene update, checks for scenes with files in the `.StashIngest` directory that meet criteria (title, studio, date, organized, phash) and moves them to organized Studio directories.

#### Example

```
Scenes/.StashIngest/testfile1.mp4
→ Scenes/Best Studio/Best Studio - 2025-01-01 - Best Scene Title [a1b2c3d4e5f6].mp4
```

#### Duplicate Handling

When enabled, incoming files are compared against existing scenes by phash match.

- **2D scenes:** prefers 1080p. Keeps higher if below, closest to 1080p if above.
- **VR scenes** (tagged "VR"): always keeps highest resolution.
- **Equal resolution:** prefers better codec (av1 > hevc > h264).
- Rejected files are moved to `.StashDuplicates`.

#### How to Use

1. Dump files into `.StashIngest/`.
1. Configure your Identify process to set `organized = true`.
1. Scan and identify. (Scan with phash to simplify StashDB identification.)
1. Configure plugin settings (Handle Duplicates, VR Tag Name) as needed.