#!/bin/bash
set -e

# Usage: ./publish.sh <npm_token> [patch|minor|major]
# Example: ./publish.sh npm_xxxxxxxxx patch

TOKEN=$1

if [ -z "$TOKEN" ]; then
  echo "❌ Error: NPM token is required."
  echo "Usage: ./publish.sh <npm_token> [patch|minor|major]"
  exit 1
fi

if [ -z "$2" ]; then
  CURRENT_VERSION=$(node -p "require('./package.json').version")
  echo "Current version is: $CURRENT_VERSION"
  read -p "Do you want to publish a 'patch' update? (y/n/minor/major) [y]: " choice
  case "$choice" in
    y|Y|"") BUMP="patch" ;;
    minor) BUMP="minor" ;;
    major) BUMP="major" ;;
    n|N) echo "Publish cancelled."; exit 0 ;;
    *) echo "Invalid choice. Cancelled."; exit 1 ;;
  esac
else
  BUMP=$2
fi

echo "📦 Bumping version ($BUMP)..."
npm version $BUMP --no-git-tag-version

echo "🔨 Building project..."
npm run build

echo "🚀 Publishing to npm..."
# Create a local .npmrc with the token
echo "//registry.npmjs.org/:_authToken=${TOKEN}" > .npmrc

# Ensure we clean up .npmrc even if publish fails
trap 'rm -f .npmrc' EXIT

# Publish the package
npm publish

echo "✅ Published successfully!"
