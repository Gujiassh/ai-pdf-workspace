from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://ai_pdf:ai_pdf_dev@127.0.0.1:5432/ai_pdf_workspace"

    model_config = SettingsConfigDict(
        env_prefix="AI_PDF_",
        env_file=".env",
        extra="ignore",
    )


settings = Settings()
