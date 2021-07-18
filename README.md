# Archive

📁 Volt package repository.

## How It Works

- Packages are deployed by putting them inside `./packages/{package}.json`.
- Resident bot automatically indexes `./packages/` and publishes results at `https://voltengine.github.io/archive/packages.csv`.
- To access individual package information visit `https://voltengine.github.io/archive/packages/{package}.json`.
- `packages.json` might take some space, so its SHA-256 is available under `https://voltengine.github.io/archive/packages.csv.sha256`.
