"""환경변수 검증 — services/api-node/src/config/env.ts와 같은 .env를 참조."""
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    NODE_ENV: str = Field(default="development")
    REDIS_URL: str = Field(default="redis://localhost:6379")

    # 공공데이터 API 키 — M2에서 활성화. 비어 있으면 ETL 라우터에서 실 호출 차단.
    MOLIT_API_KEY: str = Field(default="")
    BLDRGST_API_KEY: str = Field(default="")
    KAPT_API_KEY: str = Field(default="")


def load_settings() -> Settings:
    return Settings()
