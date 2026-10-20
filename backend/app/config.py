import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "FocusFlow"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # Server
    HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
    
    # Database
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017/focusflow")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "focusflow")
    
    # JWT Authentication
    JWT_SECRET: str = os.getenv("JWT_SECRET", "focusflow_default_development_secret_key_min_32_chars_12345")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    
    # CORS
    CORS_ORIGINS: List[str] = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
        if origin.strip()
    ]
    
    # Attention Inference & Pipeline
    # Note: All ML inference runs client-side in the browser (TypeScript neural network).
    # ONNX_MODEL_PATH is not currently used for inference — it is reserved for future use.
    # ATTENTION_SIMULATION_MODE=true means the frontend defaults to the simulation input mode.
    ATTENTION_SIMULATION_MODE: bool = os.getenv("ATTENTION_SIMULATION_MODE", "true").lower() in ("true", "1", "yes")
    ONNX_MODEL_PATH: str = os.getenv("ONNX_MODEL_PATH", "./models/attention_model.onnx")

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

settings = Settings()
