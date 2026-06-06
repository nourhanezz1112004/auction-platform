"""
ML module — exposes pre-loaded model singletons.
Imported by routers; never instantiate models directly outside this module.
"""
from app.ml.anti_bot   import AntiBotModel
from app.ml.fraud      import FraudModel
from app.ml.recommender import RecommenderModel

anti_bot_model    = AntiBotModel()
fraud_model       = FraudModel()
recommender_model = RecommenderModel()

__all__ = ["anti_bot_model", "fraud_model", "recommender_model"]
