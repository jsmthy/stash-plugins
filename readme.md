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

On scene update, checks for scenes with files in the `.StashIngest` directory that meet some criteria and moves target files to organized Studio directories in the `.StashIngest` directory's parent folder.

#### Example

Given a directory structure:

```
Scenes/
└── .StashIngest/
    ├── testfile1.mp4
    └── testfile2.mp4
```

Once the scene associated with `testfile1.mp4` has Title, Studio, Release Date populated and organized flag set to true, it will rename and move the file.

```
Scenes/
└── .StashIngest/
    └── testfile2.mp4
└── Best Studio/
    └── Best Studio - 2025-01-01 - Best Scene Title.mp4
```

#### How to Use

1. Dump files into `.StashIngest/`.
1. Configure your Identify process to set `organized = true`.
1. Scan and identify. (Scan with phash to simplify StashDB identification.)