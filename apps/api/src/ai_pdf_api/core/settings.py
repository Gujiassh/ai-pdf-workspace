from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://ai_pdf:ai_pdf_dev@127.0.0.1:5432/ai_pdf_workspace"
    minio_endpoint: str = "127.0.0.1:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "ai-pdf-workspace"
    minio_secure: bool = False
    max_upload_bytes: int = Field(default=1024 * 1024 * 100)

    model_config = SettingsConfigDict(
        env_prefix="AI_PDF_",
        env_file=".env",
        extra="ignore",
    )


settings = Settings()
