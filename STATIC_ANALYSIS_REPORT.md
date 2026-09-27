# Static Analysis Report

*Scan Date: 2026-09-13*
*Target: /Users/davidsoderman/Documents/REPO/AutoBot/src*

## Scan Summary

| Metric | Value |
|--------|-------|
| Files Scanned | 0 |
| Rules Applied | 2 |
| Total Findings | 236 |
| 🔴 ERROR | 0 |
| 🟠 WARNING | 236 |
| 🟡 INFO | 0 |
| ⚪ UNKNOWN | 0 |

## Findings

### 📄 `index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 98, Col 14
- **Message:** Remove console.log/debug/info from production code

```
              // console.log(`Loaded plugin: ${plugin.name}`);
```

### 📄 `plugins/agile-workflow/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 10, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n🚀 Starting Agile Workflow for Issue #${issueNumber}: ${title}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 18, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('\n--- Step 1: Product Manager Planning ---');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 34, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('PM Plan posted to Issue.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 37, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('\n--- Step 2: Scrum Master Task Breakdown ---');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 53, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('Scrum Tasks posted to Issue.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 56, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('\n--- Step 3: Execution (Dev & QA) ---');
```

### 📄 `plugins/auto-pilot/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 14, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log('🚀 Engaging AI-Driven Auto-Pilot...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 15, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log('Analyzing workspace changes to determine optimal pipeline steps...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 21, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('No changes detected. Auto-Pilot standing by.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 25, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`Detected ${changedFiles.length} changed file(s). Processing in parallel...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 29, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Skipping deleted or missing file: ${file}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 34, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n--- Analyzing: ${fileName} ---`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 77, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n[Auto-Pilot Plan] Decision for ${fileName}: ${JSON.stringify(plan)}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 94, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`[${fileName}] Skipping test generation for test file.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 105, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n✅ Finished processing: ${fileName}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 110, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log('\n🏁 Auto-Pilot mission complete.');
```

### 📄 `plugins/code-fixer/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 11, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`Analyzing ${filePath} for fixes...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 42, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log('No changes needed.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 48, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`\nOriginal file backed up to: ${backupPath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 51, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`✅ Applied fix to: ${filePath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 59, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`\nInitiating Git workflow for fix...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 73, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log(`Pull Request created successfully: ${prUrl}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 80, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('AI Response:', fixSuggestion);
```

### 📄 `plugins/continuous-mode/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 32, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n♾️  Starting Orchestra Continuous Development Loop...\n`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 38, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`📖 Monitoring requirements from: ${readmePath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 41, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`⚠️  Requirement file not found at ${readmePath}. Proceeding with empty requirements.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 51, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`\n🔄 [Loop ${loopCount}] Checking for work...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 55, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`📋 Found ${openIssues.length} open issues.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 59, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} Backlog empty. Generating new tasks...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 92, Col 21
- **Message:** Remove console.log/debug/info from production code

```
                        console.log('😴 No new tasks generated. Sleeping for 10 seconds...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 106, Col 21
- **Message:** Remove console.log/debug/info from production code

```
                        console.log(`✨ Created Issue: ${task.title} (${url})`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 116, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log(`\n🚀 Processing Issue #${issue.number}: ${issue.title}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 125, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log(`👷 Assigned to: ${getAgentIcon(primaryAgent)} ${primaryAgent}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 160, Col 25
- **Message:** Remove console.log/debug/info from production code

```
                            console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} Starting PR Review for #${prNumber}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 164, Col 25
- **Message:** Remove console.log/debug/info from production code

```
                            console.log(`\n${getAgentIcon(AgentRole.SCRUM_MASTER)} Merging PR #${prNumber}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 168, Col 29
- **Message:** Remove console.log/debug/info from production code

```
                                console.log(`✅ Issue #${issue.number} Resolved.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 179, Col 21
- **Message:** Remove console.log/debug/info from production code

```
                        console.log(`⚠️  No PR created for Issue #${issue.number}. Moving to next.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 184, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log('⏳ Cooling down...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 189, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log('🔄 Retrying in 10 seconds...');
```

### 📄 `plugins/demo-mode/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 19, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n🎬 Starting Orchestra Demo Workflow...\n`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 25, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} Creating detailed project description in a separate repository...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 47, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`📄 Created project description at: ${readmePath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 50, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`📖 Reading requirements from: ${input}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 57, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} [Project Planner] Initiating Project Planning...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 64, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} PM Analysis:\n${pmAnalysis.substring(0, 200)}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 71, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n${getAgentIcon(AgentRole.ARCHITECT)} Architecture:\n${architectDesign.substring(0, 200)}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 74, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n👥 Gathering Team Input...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 117, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n${getAgentIcon(AgentRole.SCRUM_MASTER)} Generated ${tasks.length} tasks.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 122, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`📅 Project Plan Issue Created: ${planUrl}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 126, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`\n---------------------------------------------------`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 127, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`🔄 Processing Task ${index + 1}/${tasks.length}: ${task.title}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 128, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`---------------------------------------------------`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 136, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`📝 Issue Created: #${issueNumber} - ${task.title}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 137, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`🏷️  Assigned to: ${getAgentIcon(AgentRole.SOFTWARE_ENGINEER)} Dev, ${getAgentIcon(AgentRole.QA_ENGINEER)} QA via tags: ${labels.join(', ')}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 173, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} Starting PR Review for #${prNumber}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 176, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`${getAgentIcon(AgentRole.SCRUM_MASTER)} [Scrum Master] Adding additional developer reviewers as requested...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 183, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`\n${getAgentIcon(AgentRole.SCRUM_MASTER)} Merging PR #${prNumber}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 187, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`✅ PR #${prNumber} Merged Successfully.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 191, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`\n${getAgentIcon(AgentRole.TECHNICAL_WRITER)} Generating Documentation...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 193, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`📚 Documentation updated for ${targetFile}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 199, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n🎉 Product Development Workflow Completed!`);
```

### 📄 `plugins/dev-cycle/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 15, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n🔄 Initiating Dev-QA Orchestration Cycle...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 16, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`Target File: ${filePath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 17, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`Task: ${task}\n`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 34, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`\n--- Iteration ${iteration}/${MAX_ITERATIONS} ---`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 37, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`👨‍💻 Developer is working...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 65, Col 21
- **Message:** Remove console.log/debug/info from production code

```
                        console.log(`\n💡 Developer identified a new issue: "${newIssueTitle}"`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 68, Col 21
- **Message:** Remove console.log/debug/info from production code

```
                        console.log(`   -> Created Issue: ${newIssueUrl}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 74, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`Spawning ${devAgentsCount} developer agents in parallel...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 107, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`   -> Code updated.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 110, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`🕵️‍♀️ QA and Integration Agents are reviewing in parallel...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 152, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`✅ QA and Integration Agents Approved the changes.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 155, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`📝 Generating final Unit Tests...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 166, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log(`\nInitiating Git workflow...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 190, Col 21
- **Message:** Remove console.log/debug/info from production code

```
                        console.log(`🚀 Pull Request created: ${prUrl}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 205, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`❌ QA/Integration found issues:`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 207, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(feedback);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 216, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`\n🎉 Dev Cycle Completed Successfully!`);
```

### 📄 `plugins/doc-gen/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 355, Col 11
- **Message:** Remove console.log/debug/info from production code

```
              console.log(`ℹ️ Code already well-documented: ${resolved}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 360, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`✅ Updated inline code documentation: ${resolved}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 370, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`ℹ️ No documentation updates needed: ${resolved}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 376, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`ℹ️ No documentation updates needed: ${resolved}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 381, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`ℹ️ Documentation already accurate (no meaningful change): ${resolved}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 386, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`✅ Updated documentation: ${resolved}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 408, Col 11
- **Message:** Remove console.log/debug/info from production code

```
              console.log('ℹ️ Unable to fetch PR diff. Documentation update skipped.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 419, Col 11
- **Message:** Remove console.log/debug/info from production code

```
              console.log('ℹ️ No repository changes detected. Documentation update skipped.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 438, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('ℹ️ No repository changes detected. Documentation update skipped.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 444, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('ℹ️ Only documentation files changed. Documentation update skipped.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 459, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('ℹ️ No non-documentation changes detected. Documentation update skipped.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 476, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log(
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 983, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('ℹ️ No documentation files selected for update. Documentation update skipped.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 1105, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('ℹ️ No documentation updates were necessary.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 1110, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`✅ Structure generated. Documentation updated: ${updatedCount} file(s). Skipped: ${skippedCount} file(s).`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 1112, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`✅ Documentation updated: ${updatedCount} file(s). Skipped: ${skippedCount} file(s).`);
```

### 📄 `plugins/init/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 139, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log('Detected CI targets:', platforms);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 150, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Docs workflow already exists at ${docsWorkflowPath}. Skipping creation.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 153, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Created GitHub Actions docs workflow at ${docsWorkflowPath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 156, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Added GitHub Actions docs workflow at ${docsWorkflowPath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 164, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`.gitlab-ci.yml already exists at ${gitlabCiPath}.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 165, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('You can add the following job manually:');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 166, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(gitlabDocsJobContent);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 169, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Created GitLab CI file at ${gitlabCiPath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 177, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`azure-pipelines.yml already exists at ${azureCiPath}.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 178, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('You can add the following job manually:');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 179, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(azureDocsJobContent);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 182, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Created Azure DevOps pipeline at ${azureCiPath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 191, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Docs workflow already exists at ${docsWorkflowPath}. Skipping creation.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 194, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Created GitHub Actions docs workflow at ${docsWorkflowPath}`);
```

### 📄 `plugins/my-new-feature/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 11, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('🚀 my-new-feature plugin is running!');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 12, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('Args:', args);
```

### 📄 `plugins/plugin-creator/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 27, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('To create a local plugin for your project, this feature is coming soon.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 53, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('🚀 ${pluginName} plugin is running!');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 54, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('Args:', args);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 63, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`✅ Plugin '${pluginName}' created successfully!`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 64, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`📂 Location: ${pluginDir}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 65, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\nTo test it:`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 66, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`1. Run 'npm run build'`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 67, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`2. Run 'npx orchestra ${pluginName}'`);
```

### 📄 `plugins/pr-reviewer/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 19, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`\n🕵️‍♂️ Detected CI PR context. Starting PR Review for PR #${prNumber}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 25, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n🕵️‍♂️ Starting PR Review for PR #${prNumber}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 65, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log('🤖 Analyzing diff with Dev and QA agents in parallel...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 85, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`✅ PR Review posted successfully.`);
```

### 📄 `plugins/project-manager/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 12, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Reading requirements from file: ${input}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 18, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Using custom instruction: "${instruction}"`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 22, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`Initiating Project Management...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 31, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n[Product Manager]:\n${pmAnalysis}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 39, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n[Architect]:\n${architectDesign}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 41, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\nGathering Team Input (Huddle)...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 87, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n[Scrum Master] Generated ${tasks.length} tasks.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 124, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\nStarting parallel issue creation for ${tasks.length} tasks...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 127, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Processing Task: ${task}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 161, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`  -> Issue created: ${task.substring(0, 30)}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 166, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('\nProject breakdown completed.');
```

### 📄 `plugins/release-notes/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 7, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`Generating release notes for version: ${version}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 15, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Current version ${version} is already tagged.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 19, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`Fetching commits since previous tag: ${startTag}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 25, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Fetching commits since last tag: ${latestTag}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 31, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('No previous tag found. Fetching recent commits (limit 50)...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 37, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('No new commits found.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 39, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Found ${commits.length} commits.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 59, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('Requesting AI generation...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 62, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('\n--- Generated Release Notes ---\n');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 63, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(releaseNotes);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 64, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('\n-------------------------------\n');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 67, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('Creating Release...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 71, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`✅ Release created successfully: ${releaseUrl}`);
```

### 📄 `plugins/static-analysis/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 18, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`\n🔍 Starting Static Analysis with Opengrep on: ${resolvedPath}\n`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 25, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('\n💡 Tip: Install opengrep with: curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 33, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`📊 Scan complete: ${findings.length} finding(s), ${errors.length} error(s), scanned ${stats.scannedFiles} file(s) with ${stats.totalRules} rule(s).`);
```

### 📄 `plugins/static-analysis/opengrepRunner.ts`

#### Rule: `overly-broad-cors-star`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 217, Col 25
- **Message:** Overly permissive CORS - restrict Access-Control-Allow-Origin

```
          - pattern-regex: (Access-Control-Allow-Origin).*(\\*|all)
```

#### Rule: `overly-broad-cors-star`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 219, Col 26
- **Message:** Overly permissive CORS - restrict Access-Control-Allow-Origin

```
          - pattern: header("Access-Control-Allow-Origin: *")
```

### 📄 `plugins/static-analysis/reportUtils.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 113, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n✅ ${successMessage} Report generated at: ${reportPath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 114, Col 21
- **Message:** Remove console.log/debug/info from production code

```
        if (!hasIssues) console.log('No significant issues found. Modes issue/comment skipped.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 128, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n⚠️ No VCS provider configured. Writing report locally: ${reportPath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 135, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`ℹ️ An open issue already exists (#${existingIssue}). Adding report as a comment instead.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 137, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('✅ Comment added to existing issue.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 139, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('Creating issue...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 141, Col 21
- **Message:** Remove console.log/debug/info from production code

```
          if (issueUrl) console.log(`✅ Issue created successfully: ${issueUrl}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 142, Col 12
- **Message:** Remove console.log/debug/info from production code

```
          else console.log('❌ Failed to create issue.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 150, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Commenting on PR #${prContext.prNumber}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 152, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('✅ Comment posted to PR.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 154, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('❌ Mode is "comment" but no CI PR context found. Writing to local report instead.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 163, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`\n✅ ${successMessage} Report generated at: ${reportPath}`);
```

### 📄 `plugins/test-gen/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 158, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('AI Response:', aiResponse);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 163, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`ℹ️ No new test coverage needed; existing ${framework} tests left intact: ${testFile}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 170, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`✅ ${verb} tests (${framework}): ${testFile}`);
```

### 📄 `plugins/vuln-scan/codebaseScan.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 34, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log('🔎 Scanning codebase for bad practices and security flaws...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 43, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`Found ${sourceFiles.length} source files to sample.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 63, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log('🤖 Analyzing source code...');
```

### 📄 `plugins/vuln-scan/dependencyScan.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 147, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`📦 Scanning Node.js package dependencies in ${dir} (npm audit)...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 163, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`📦 Scanning Python dependencies in ${requirementsTxtPath} (safety)...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 183, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`📦 Scanning Go dependencies in ${goDir} (govulncheck)...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 200, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('📦 Scanning .NET dependencies (dotnet list package --vulnerable)...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 226, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log('🤖 Analyzing dependency vulnerabilities...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 235, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log('🤖 Attempting to auto-fix dependency vulnerabilities...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 240, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Running npm audit fix in ${dir}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 250, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Updating pinned Python requirements in ${requirementsPath}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 260, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Running Go dependency updates in ${goDir}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 278, Col 11
- **Message:** Remove console.log/debug/info from production code

```
              console.log(`Updating .NET package ${pkg} in ${projectPath}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 297, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('No files changed after auto-fix attempts.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 302, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`Changes detected. Creating PR branch: ${branchName}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 308, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('🤖 Generating PR description from the updated files...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 329, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`✅ Pull Request created successfully for dependency updates: ${prUrl}`);
```

### 📄 `plugins/vuln-scan/index.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 15, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`\n🕵️‍♂️ Starting comprehensive security scan on repository: ${dirPath}\n`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 38, Col 3
- **Message:** Remove console.log/debug/info from production code

```
      console.log(`Scanning for vulnerabilities in: ${filePath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 58, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('No significant vulnerabilities found.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 62, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('\n--- Vulnerability Analysis ---\n');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 63, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(analysis);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 65, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('\nGenerating fix suggestion from multiple developers...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 100, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('\n--- Suggested Fix ---\n');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 101, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(fixSuggestion);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 107, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`\nOriginal file backed up to: ${backupPath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 110, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`✅ Fix applied to: ${filePath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 130, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log('\nCreating Issue...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 137, Col 8
- **Message:** Remove console.log/debug/info from production code

```
           console.log(`ℹ️ Issue already exists (#${existingIssueId}). Adding report as comment.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 142, Col 22
- **Message:** Remove console.log/debug/info from production code

```
           if (issueUrl) console.log(`Issue created successfully: ${issueUrl}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 150, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`\nInitiating Git workflow for fix...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 163, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log(`Pull Request created successfully: ${prUrl}`);
```

### 📄 `plugins/vuln-scan/reportUtils.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 10, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`\n✅ Security scan complete! Report generated at: ${reportPath}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 11, Col 21
- **Message:** Remove console.log/debug/info from production code

```
        if (!hasIssues) console.log('No significant issues found. Modes issue/pr/comment skipped.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 20, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log('Mode "pr" selected for full repo scan. Attempting to report issue...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 25, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`ℹ️ An open issue already exists for security scans (#${existingIssue}). Adding report as a comment instead.`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 27, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('✅ Comment added to existing issue.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 29, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('Creating security issue...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 31, Col 21
- **Message:** Remove console.log/debug/info from production code

```
          if (issueUrl) console.log(`✅ Issue created successfully: ${issueUrl}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 32, Col 12
- **Message:** Remove console.log/debug/info from production code

```
          else console.log('❌ Failed to create issue.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 38, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log(`Commenting on PR #${prContext.prNumber}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 40, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('✅ Comment posted to PR.');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 42, Col 7
- **Message:** Remove console.log/debug/info from production code

```
          console.log('❌ Mode is "comment" but no CI PR context found. Writing to local report instead.');
```

### 📄 `server.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 20, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`Received GitHub event: ${event}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 27, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Push detected on ${branch} (${commitId})`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 38, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`Cloning ${repoUrl} to ${workspaceDir}...`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 49, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log('Running Auto-Pilot...');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 66, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`New Issue Opened: #${issue.number} - ${issue.title}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 76, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Targeting file: ${targetFile}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 95, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`🚀 Orchestra Server listening on port ${PORT}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 96, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
```

### 📄 `services/agentService.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 63, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`🤖 Consulting Agent: ${role}...`);
```

### 📄 `services/aiService.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 59, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`🔌 Connected to Google Gemini (Model: ${model})`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 65, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`🔌 Connected to Ollama (Host: ${ollamaHost}, Model: ${model})`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 81, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`🔌 Connected to OpenRouter (Model: ${model})`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 83, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log(`🔌 Connected to OpenAI (Model: ${model})`);
```

### 📄 `services/gitService.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 128, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Created and checked out branch: ${branchName}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 138, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Checked out branch: ${branchName}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 157, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Created and checked out branch: ${branchName} (from ${startPoint})`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 189, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Committed changes: ${message}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 199, Col 9
- **Message:** Remove console.log/debug/info from production code

```
            console.log(`Pushed changes to ${branchName}`);
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 209, Col 5
- **Message:** Remove console.log/debug/info from production code

```
        console.log(`Force-pushed changes to ${branchName}`);
```

### 📄 `services/pluginAgentFactory.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 72, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log(aiResponse);
```

### 📄 `services/vcs/AzureDevOpsProvider.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 63, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log('Skipping Azure Work Item creation: AZURE_WORKITEM is not set to true.');
```

### 📄 `services/vcs/VcsFactory.ts`

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 78, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log('🔌 Using Orchestra Service Provider (VCS)');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 82, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log('🔌 Using GitLab Provider');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 88, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log('🔌 Using Azure DevOps Provider');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 93, Col 17
- **Message:** Remove console.log/debug/info from production code

```
                    console.log('🔌 Using GitHub Provider');
```

#### Rule: `console-log`

- **Severity:** 🟠 **WARNING**
- **Location:** Line 102, Col 13
- **Message:** Remove console.log/debug/info from production code

```
                console.log('🔌 Using Jira for Issue Tracking');
```
