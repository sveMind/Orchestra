#!/usr/bin/env python3
"""
Minimal demo for the library.

This script shows how to use the core functionality of the library
to create a Service Account (or any analogous resource) and prints a
clear success message.

Run with:
    python app.py
"""

from __future__ import annotations

import sys
import traceback

# ----------------------------------------------------------------------
# Import the library – replace `service_account` with the actual package
# name if it differs.
# ----------------------------------------------------------------------
try:
    from service_account import ServiceAccountClient, ServiceAccount
except ImportError as exc:
    print("ERROR: The library could not be imported.", file=sys.stderr)
    print("Make sure the library is installed (see requirements.txt).", file=sys.stderr)
    sys.exit(1)


def create_demo_account(client: ServiceAccountClient) -> ServiceAccount:
    """
    Create a demo Service Account using the library's client.

    The exact API may differ; adjust the call to match the real library.
    """
    # The name is arbitrary – just something that will be accepted by the API.
    demo_name = "demo-service-account"
    # The library is expected to return an object with at least an `id` attribute.
    return client.create_account(name=demo_name)


def main() -> int:
    """
    Entry point for the demo.

    Returns:
        int: Exit status (0 = success, non‑zero = failure)
    """
    try:
        # Initialise the client – many libraries accept optional config.
        client = ServiceAccountClient()
        account = create_demo_account(client)

        # Print a clear success message.
        print(f"✅ Service Account created successfully – ID: {account.id}")
        print("✅ Demo completed successfully.")
        return 0

    except Exception:
        # Any unexpected error should be reported and cause a non‑zero exit.
        print("❌ An error occurred while running the demo:", file=sys.stderr)
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())