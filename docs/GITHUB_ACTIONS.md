# Orchestra with GitHub Actions

This guide explains how to integrate Orchestra agents into your GitHub Actions workflows.

You can use the official `sveMind/Orchestra` action to simplify your workflow configuration.

## Prerequisites

Set the following secrets in your repository (`Settings > Secrets and variables > Actions`):

*   `OPENAI_API_KEY` (or `GEMINI_API_KEY`, etc.)
*   `GITHUB_TOKEN` (Standard GITHUB_TOKEN is usually sufficient)

## Examples

### 1. Automated PR Reviewer
Trigger Orchestra to review every Pull Request.

```yaml
name: Orchestra PR Reviewer

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run Orchestra PR Review
        uses: sveMind/Orchestra@v1
        with:
          command: pr-review
          arguments: ${{ github.event.pull_request.number }}
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
        env:
          AI_PROVIDER: openai
          AI_MODEL: gpt-4
```

### 2. Auto-Pilot on Push
Analyze changes on every push and run tests/security scans automatically.

```yaml
name: Orchestra Auto-Pilot

on:
  push:
    branches: [main, develop]

jobs:
  auto_pilot:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Important for diff analysis

      - name: Configure Git Identity
        run: |
          git config --global user.name "Orchestra"
          git config --global user.email "orchestra@example.com"

      - name: Run Auto-Pilot
        uses: sveMind/Orchestra@v1
        with:
          command: auto
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
        env:
          VCS_PROVIDER: github
```

### 3. Automated Release Notes
Generate release notes when a new tag is pushed.

```yaml
name: Orchestra Release Notes

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate Release Notes
        uses: sveMind/Orchestra@v1
        with:
          command: release-notes
          arguments: ${{ github.ref_name }}
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### 4. Agile Workflow Trigger
Trigger the full Agile workflow when an issue is labeled with `orchestra`.

```yaml
name: Orchestra Agile Workflow

on:
  issues:
    types: [labeled]

jobs:
  agile_workflow:
    if: github.event.label.name == 'orchestra'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Configure Git Identity
        run: |
          git config --global user.name "Orchestra"
          git config --global user.email "orchestra@example.com"

      - name: Run Agile Workflow
        uses: sveMind/Orchestra@v1
        with:
          command: agile
          arguments: ${{ github.event.issue.number }} "${{ github.event.issue.title }}"
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```
