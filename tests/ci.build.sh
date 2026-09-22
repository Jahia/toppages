#!/bin/bash
source ./set-env.sh

# ci.build deploys EVERY *-SNAPSHOT.jar it finds here, so the directory must exist but
# must never be seeded by hand: a leftover from a renamed artifactId would be deployed
# alongside the current one.
mkdir -p ./artifacts

if [[ -e ../target ]]; then
  cp -R ../target/*-SNAPSHOT.jar ./artifacts/
fi

version=$(node -p "require('./package.json').devDependencies['@jahia/cypress']")
echo Using @jahia/cypress@$version...
npx --yes --package @jahia/cypress@$version ci.build
