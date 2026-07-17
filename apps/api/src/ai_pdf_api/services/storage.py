from __future__ import annotations

from collections.abc import Iterator
from io import BytesIO
from typing import BinaryIO

from minio import Minio
from minio.error import S3Error

from ai_pdf_api.core.settings import settings
from ai_pdf_api.core.metrics import observe_storage_operation


def build_storage_client() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_bucket_exists(client: Minio) -> None:
    with observe_storage_operation("ensure_bucket"):
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)


def upload_bytes(object_key: str, payload: bytes, content_type: str) -> None:
    upload_stream(object_key, BytesIO(payload), len(payload), content_type)


def upload_stream(object_key: str, payload: BinaryIO, length: int, content_type: str) -> None:
    client = build_storage_client()
    ensure_bucket_exists(client)
    with observe_storage_operation("upload"):
        client.put_object(
            settings.minio_bucket,
            object_key,
            payload,
            length=length,
            content_type=content_type,
        )


def object_exists(object_key: str) -> bool:
    client = build_storage_client()
    with observe_storage_operation("stat"):
        try:
            client.stat_object(settings.minio_bucket, object_key)
            return True
        except S3Error as error:
            if error.code in {"NoSuchBucket", "NoSuchKey", "NoSuchObject"}:
                return False
            raise


def download_bytes(object_key: str) -> bytes:
    client = build_storage_client()
    with observe_storage_operation("download"):
        response = client.get_object(settings.minio_bucket, object_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()


def stream_bytes(object_key: str, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
    client = build_storage_client()
    with observe_storage_operation("stream"):
        response = client.get_object(settings.minio_bucket, object_key)
        try:
            while chunk := response.read(chunk_size):
                yield chunk
        finally:
            response.close()
            response.release_conn()


def delete_object_if_exists(object_key: str) -> None:
    client = build_storage_client()
    with observe_storage_operation("delete"):
        try:
            client.remove_object(settings.minio_bucket, object_key)
        except S3Error as error:
            if error.code in {"NoSuchBucket", "NoSuchKey", "NoSuchObject"}:
                return
            raise
