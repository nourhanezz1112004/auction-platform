# ai-service/app/services/model_store.py
# ══════════════════════════════════════════════════════════════════════
# BidSpace AI — Model Store v2.0
# IMPROVEMENTS:
#   • Loads 5 models (price, fraud, rec, reputation, demand)
#   • Thread-safe reload with RLock
#   • Health check per model
#   • Last-loaded timestamp per model
# ══════════════════════════════════════════════════════════════════════

import json, threading
from pathlib import Path
from typing import Optional
from datetime import datetime
import joblib

MODELS_DIR   = Path(__file__).parent.parent.parent / "models"
MANIFEST_PATH = MODELS_DIR / "manifest.json"


class ModelStore:
    _lock = threading.RLock()

    def __init__(self):
        self.price_model:      Optional[dict] = None
        self.fraud_model:      Optional[dict] = None
        self.rec_model:        Optional[dict] = None
        self.reputation_model: Optional[dict] = None
        self.demand_model:     Optional[dict] = None
        self.manifest:         Optional[dict] = None
        self._load_times:      dict = {}
        self.reload()

    # ── Public API ─────────────────────────────────────────────────────────────

    def reload(self) -> dict:
        """Load / hot-swap all models. Thread-safe. Returns per-model status."""
        with self._lock:
            status = {}
            status["price"]      = self._load("price_model.joblib",      "price_model")
            status["fraud"]      = self._load("fraud_model.joblib",       "fraud_model")
            status["rec"]        = self._load("rec_model.joblib",         "rec_model")
            status["reputation"] = self._load("reputation_model.joblib",  "reputation_model")
            status["demand"]     = self._load("demand_model.joblib",      "demand_model")

            if MANIFEST_PATH.exists():
                self.manifest = json.loads(MANIFEST_PATH.read_text())
                print(f"[ModelStore] Manifest version: {self.manifest.get('version')}")

            return status

    async def load_all(self) -> dict:
        """Async wrapper for reload — called from FastAPI lifespan."""
        return self.reload()

    def health(self) -> dict:
        """Returns a health dict for the /health endpoint."""
        return {
            "price":       self._model_health("price_model",      self.price_model),
            "fraud":       self._model_health("fraud_model",       self.fraud_model),
            "rec":         self._model_health("rec_model",         self.rec_model),
            "reputation":  self._model_health("reputation_model",  self.reputation_model),
            "demand":      self._model_health("demand_model",      self.demand_model),
        }

    # ── Properties ─────────────────────────────────────────────────────────────

    @property
    def version(self) -> str:
        if self.manifest:
            return self.manifest.get("version", "untrained")
        return "untrained"

    @property
    def all_loaded(self) -> bool:
        return all([
            self.price_model, self.fraud_model, self.rec_model,
            self.reputation_model, self.demand_model,
        ])

    @property
    def n_loaded(self) -> int:
        return sum(1 for m in [
            self.price_model, self.fraud_model, self.rec_model,
            self.reputation_model, self.demand_model,
        ] if m is not None)

    # ── Private helpers ─────────────────────────────────────────────────────────

    def _load(self, filename: str, attr: str) -> str:
        path = MODELS_DIR / filename
        if not path.exists():
            print(f"[ModelStore] ⚠️  {filename} not found — fallback mode")
            setattr(self, attr, None)
            return "missing"
        try:
            setattr(self, attr, joblib.load(path))
            self._load_times[attr] = datetime.now().isoformat()
            print(f"[ModelStore] ✅ Loaded {filename}")
            return "ok"
        except Exception as e:
            print(f"[ModelStore] ❌ Failed to load {filename}: {e}")
            setattr(self, attr, None)
            return f"error: {e}"

    def _model_health(self, key: str, bundle: Optional[dict]) -> dict:
        return {
            "loaded":      bundle is not None,
            "version":     bundle.get("version", "unknown") if bundle else None,
            "loaded_at":   self._load_times.get(key),
        }


# Global singleton
model_store = ModelStore()
