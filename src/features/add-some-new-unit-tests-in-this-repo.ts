#!/usr/bin/env bash
# ------------------------------------------------------------
# run_tests.sh – Simple test runner for the Go repository
# ------------------------------------------------------------
# This script executes the full test suite, produces a
# coverage profile, and generates both a textual and HTML
# coverage report. It is intended to be used locally and can
# be invoked from CI pipelines (e.g., GitHub Actions).
#
# Usage:
#   $ ./run_tests.sh
#
# Requirements:
#   - Go toolchain must be installed and $GOPATH/bin on PATH.
#   - All test files must follow the *_test.go naming
#     convention and reside in their respective packages.
# ------------------------------------------------------------

# Exit immediately on error, treat unset variables as an error,
# and propagate errors through pipelines.
set -euo pipefail

# Define output files
COVERAGE_PROFILE="coverage.out"
COVERAGE_HTML="coverage.html"

# Clean any previous coverage data
if [[ -f "${COVERAGE_PROFILE}" ]]; then
    rm -f "${COVERAGE_PROFILE}"
fi
if [[ -f "${COVERAGE_HTML}" ]]; then
    rm -f "${COVERAGE_HTML}"
fi

# ----------------------------------------------------------------
# Run all Go tests with coverage enabled.
# The -covermode=atomic flag provides a more accurate measurement
# when tests are run in parallel.
# ----------------------------------------------------------------
echo "▶️  Running go test ./... with coverage..."
go test ./... -covermode=atomic -coverprofile="${COVERAGE_PROFILE}"

# ----------------------------------------------------------------
# Display a concise coverage summary (functions, statements, etc.)
# ----------------------------------------------------------------
echo "✅  Coverage summary:"
go tool cover -func="${COVERAGE_PROFILE}"

# ----------------------------------------------------------------
# Generate an HTML coverage report for visual inspection.
# ----------------------------------------------------------------
echo "📄  Generating HTML coverage report (${COVERAGE_HTML})..."
go tool cover -html="${COVERAGE_PROFILE}" -o "${COVERAGE_HTML}"

echo "🎉  All tests passed and coverage reports generated."
echo "   • Text report:  ${COVERAGE_PROFILE}"
echo "   • HTML report:  ${COVERAGE_HTML}"