"""OmniChat RunPod Serverless worker runtime.

The package is intentionally split into a dependency-free request/output
contract and lazy-loaded GPU implementations.  This lets CI exercise all
validation and contract behavior without downloading model weights.
"""

__all__ = ["contract", "storage", "worker"]
