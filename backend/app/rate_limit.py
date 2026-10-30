"""In-memory sliding-window IP rate limiter for the public LLM agent endpoint."""

import time
from collections import deque
from threading import Lock

from fastapi import HTTPException, Request, status

from app.config import get_settings


class InMemoryRateLimiter:
    """Thread-safe sliding-window rate limiter keyed by client IP address."""

    def __init__(
        self,
        max_requests: int | None = None,
        window_seconds: int | None = None,
    ) -> None:
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    @property
    def max_requests(self) -> int:
        """Maximum allowed requests within the window."""
        if self._max_requests is not None:
            return self._max_requests
        return get_settings().rate_limit_max_requests

    @property
    def window_seconds(self) -> int:
        """Sliding window duration in seconds."""
        if self._window_seconds is not None:
            return self._window_seconds
        return get_settings().rate_limit_window_seconds

    def reset(self) -> None:
        """Clear all recorded request timestamps."""
        with self._lock:
            self._hits.clear()

    @staticmethod
    def extract_client_ip(request: Request) -> str:
        """Extract client IP from X-Forwarded-For header or request socket."""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            first_ip = forwarded_for.split(",")[0].strip()
            if first_ip:
                return first_ip
        if request.client and request.client.host:
            return request.client.host
        return "unknown"

    def _prune_stale_buckets(self, cutoff: float) -> None:
        """Remove expired timestamps and empty IP buckets to keep memory bounded."""
        stale_ips: list[str] = []
        for ip, timestamps in self._hits.items():
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if not timestamps:
                stale_ips.append(ip)
        for ip in stale_ips:
            del self._hits[ip]

    def check_request(self, client_ip: str, now: float | None = None) -> None:
        """Verify if client_ip is within quota; raise HTTP 429 if exceeded."""
        current_time = now if now is not None else time.monotonic()
        max_req = self.max_requests
        window = float(self.window_seconds)
        cutoff = current_time - window

        with self._lock:
            if len(self._hits) > 256:
                self._prune_stale_buckets(cutoff)

            bucket = self._hits.get(client_ip)
            if bucket is None:
                bucket = deque()
                self._hits[client_ip] = bucket

            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= max_req:
                oldest = bucket[0]
                retry_after = max(1, int(round((oldest + window) - current_time)))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Limite de uso da demonstração atingido ({max_req} consultas por hora). "
                        f"Aguarde {retry_after} segundos antes de enviar uma nova pergunta."
                    ),
                    headers={"Retry-After": str(retry_after)},
                )

            bucket.append(current_time)


agent_rate_limiter = InMemoryRateLimiter()


def enforce_agent_rate_limit(request: Request) -> None:
    """FastAPI dependency enforcing per-IP rate limiting on `/api/agent/chat`."""
    client_ip = agent_rate_limiter.extract_client_ip(request)
    agent_rate_limiter.check_request(client_ip)
