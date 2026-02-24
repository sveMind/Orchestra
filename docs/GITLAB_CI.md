# Orchestra with GitLab CI/CD

This guide explains how to integrate Orchestra agents into your GitLab CI pipelines.

You can use the official `sveMind/Orchestra` CI templates to simplify your configuration.

## Prerequisites

Set the following variables in `Settings > CI/CD > Variables`:

*   `OPENAI_API_KEY` (or `GEMINI_API_KEY`, etc.)
*   `GITLAB_TOKEN`: A Personal Access Token or Project Access Token with `api` scope.
*   `VCS_PROVIDER`: Set to `gitlab`.

## Configuration (.gitlab-ci.yml)

### Method 1: Using the CI Template (Recommended)

You can include the official Orchestra template in your `.gitlab-ci.yml`. This provides pre-configured jobs that you can extend or use directly.

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/sveMind/Orchestra/main/templates/gitlab-ci.yml'

stages:
  - test
  - deploy

# 1. Auto-Pilot (Runs on Push)
orchestra-auto:
  extends: .orchestra_base
  stage: test
  script:
    # Optional: Configure git identity if needed for commits
    - git config --global user.email "orchestra@example.com"
    - git config --global user.name "Orchestra"
    - git fetch --unshallow || true
    - orchestra auto
  rules:
    - if: $CI_PIPELINE_SOURCE == "push" && $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

# 2. Vulnerability Scanner (Runs on Merge Requests)
orchestra-vuln-scan:
  extends: .orchestra_base
  stage: test
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

# 3. Release Notes (Runs on Tag)
orchestra-release-notes:
  extends: .orchestra_base
  stage: deploy
  rules:
    - if: $CI_COMMIT_TAG
```

### Method 2: Manual Configuration

If you prefer to manually configure the jobs, you can define them as follows:

```yaml
stages:
  - automation

auto_pilot:
  stage: automation
  image: node:20
  rules:
    - if: $CI_PIPELINE_SOURCE == "push" && $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  variables:
    VCS_PROVIDER: "gitlab"
  script:
    - npm install -g orchestra-svemind
    - git config --global user.email "orchestra@example.com"
    - git config --global user.name "Orchestra"
    - git fetch --unshallow || true 
    - orchestra auto
```

### 4. Agile Workflow (Triggered via API or Manual)
Since GitLab Issues don't directly trigger CI pipelines like GitHub Actions, you can set up a manual job or use a webhook listener. Here is a manual job example to trigger the workflow on a specific issue.

```yaml
agile_workflow:
  stage: automation
  image: node:18
  when: manual
  variables:
    ISSUE_ID: "" # Pass this when triggering manually
    ISSUE_TITLE: ""
    VCS_PROVIDER: "gitlab"
  script:
    - npm install -g orchestra-svemind
    - git config --global user.email "orchestra@example.com"
    - git config --global user.name "Orchestra"
    - orchestra agile $ISSUE_ID "$ISSUE_TITLE"
```

---

## 🔧 Configuring the Runner

Ensure your GitLab Runner has internet access to reach:
1.  The AI Provider API (e.g., api.openai.com)
2.  The GitLab API (gitlab.com or your self-hosted instance)
