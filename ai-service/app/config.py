import os
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

class Config:
    """
    Central configuration for the AI Service.
    Exposes all environment variables and thresholds.
    """
    # Model Configurations
    SENTENCE_TRANSFORMER_MODEL: str = os.getenv("SENTENCE_TRANSFORMER_MODEL", "all-MiniLM-L6-v2")
    MODEL_ARTIFACTS_PATH: str = os.getenv("MODEL_ARTIFACTS_PATH", "app/ml/artifacts")
    
    # Database Configuration (Phase 2 pgvector queries)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/auction")

    # AI Thresholds (used by routers to document bounds, or future overrides)
    BOT_DETECTED_THRESHOLD: float = float(os.getenv("BOT_DETECTED_THRESHOLD", "0.7"))
    CAPTCHA_THRESHOLD: float = float(os.getenv("CAPTCHA_THRESHOLD", "0.4"))
    
    FRAUD_FLAGGED_THRESHOLD: float = float(os.getenv("FRAUD_FLAGGED_THRESHOLD", "0.7"))
    FRAUD_LOG_THRESHOLD: float = float(os.getenv("FRAUD_LOG_THRESHOLD", "0.4"))

settings = Config()
