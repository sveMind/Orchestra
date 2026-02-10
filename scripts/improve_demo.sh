#!/bin/bash

# AutoBot Improvement Pipeline Demo
# This script demonstrates how AutoBot iteratively improves a project.

echo "🚀 Starting AutoBot Improvement Pipeline..."
echo "=========================================="

TARGET_FILE="examples/mock-website/src/cart.ts"
REQ_FILE="examples/mock-website/REQUIREMENTS.md"

# 1. Security Audit
echo ""
echo "🔒 Phase 1: Security Audit"
echo "Running Vulnerability Scanner on $TARGET_FILE..."
npm start -- vuln-scan "$TARGET_FILE"

# 2. Test Coverage
echo ""
echo "🧪 Phase 2: Test Coverage"
echo "Generating Unit Tests for $TARGET_FILE..."
npm start -- test-gen "$TARGET_FILE"

# 3. Documentation
echo ""
echo "📚 Phase 3: Documentation"
echo "Generating documentation for $TARGET_FILE..."
# Assuming we have a doc-gen plugin, or using project-manager to suggest docs
npm start -- project-manager "$TARGET_FILE" "Generate a README.md for this component explaining its usage and methods."

# 4. Refactoring Plan
echo ""
echo "🧠 Phase 4: Refactoring Plan"
echo "Analyzing code for architectural improvements..."
npm start -- project-manager "$TARGET_FILE" "Analyze this code. Suggest 3 refactoring improvements for performance and maintainability. Create tasks for them."

echo ""
echo "✅ Improvement Pipeline Completed!"
