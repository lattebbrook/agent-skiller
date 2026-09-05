"""The Python side of the sandbox boundary.

Usage: python3 -I runner.py <script> <max_memory_mb> <cpu_seconds>

The server has already put the script in a throwaway directory, scrubbed the
environment and started a wall-clock timer. This shim applies the limits a
process can apply to itself, then runs the script as __main__ so it reads its
input from stdin exactly as it would when run by hand.
"""
import resource
import runpy
import sys


def apply_limits(max_memory_mb: int, cpu_seconds: int) -> None:
    limits = [
        (resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds)),
        (resource.RLIMIT_FSIZE, (16 * 1024 * 1024, 16 * 1024 * 1024)),
        (resource.RLIMIT_AS, (max_memory_mb * 1024 * 1024, max_memory_mb * 1024 * 1024)),
    ]
    if hasattr(resource, "RLIMIT_NPROC"):
        limits.append((resource.RLIMIT_NPROC, (32, 32)))
    for which, value in limits:
        try:
            resource.setrlimit(which, value)
        except (ValueError, OSError):
            # Some platforms refuse some limits (macOS and RLIMIT_AS, for one).
            # The wall-clock timeout in the server still holds.
            pass


def main() -> None:
    script = sys.argv[1]
    apply_limits(int(sys.argv[2]), int(sys.argv[3]))
    sys.argv = [script]
    sys.path.insert(0, ".")
    runpy.run_path(script, run_name="__main__")


if __name__ == "__main__":
    main()
