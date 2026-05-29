"""PDF 저장 — S3 어댑터 + 로컬 dev 어댑터.

⚠️ AWS 자격증명이 비어 있으면 dev 환경에서만 로컬 디렉토리에 저장한다.
   production에서는 자격증명이 필수 — 누락 시 503.
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol


class ReportStorage(Protocol):
    async def save(self, *, inspection_id: str, content: bytes) -> str:
        """저장 후 접근 가능한 URL(서명 URL 또는 file://) 반환."""


class LocalDevStorage:
    """로컬 디스크에 저장. 운영팀이 S3 자격증명을 설정하면 S3StorageAdapter로 교체."""

    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir

    async def save(self, *, inspection_id: str, content: bytes) -> str:
        target = self._base_dir / f"{inspection_id}.pdf"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return f"file://{target.resolve().as_posix()}"


class S3SignedUrlStorage:
    """AWS S3 + 서명 URL. boto3 설치 + 자격증명 발급 후 활성화."""

    def __init__(
        self,
        bucket: str,
        region: str,
        access_key: str,
        secret_key: str,
    ) -> None:
        if not (bucket and access_key and secret_key):
            raise RuntimeError("AWS S3 자격증명 누락")
        self._bucket = bucket
        self._region = region
        self._access_key = access_key
        self._secret_key = secret_key

    async def save(self, *, inspection_id: str, content: bytes) -> str:
        # boto3 의존성은 운영팀이 자격증명과 함께 추가 — M4는 인터페이스만.
        raise NotImplementedError(
            "S3SignedUrlStorage.save 실 호출은 boto3 설치 + 자격증명 후 구현"
        )
