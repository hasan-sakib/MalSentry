"""
Default model path and re-exports for the f30/u20 ResNet50 fusion classifier (see malware_model.py).
"""

from __future__ import annotations

import os
from pathlib import Path

from utils.malware_model import (
    MalwareClassifier,
    bind_predict,
    load_classifier_state,
    predict_pil,
)

__all__ = [
    "MalwareClassifier",
    "bind_predict",
    "default_model_path",
    "load_classifier_state",
    "predict_pil",
]


def default_model_path() -> str:
    """Project models/final_model.pth unless MALWARE_MODEL_NAME is set."""
    root = Path(__file__).resolve().parents[1]
    name = os.environ.get("MALWARE_MODEL_NAME", "/Users/sakib/Projects/Malware_Detect/models/full_unfrozen_backbone.pth")
    return str(root / "models" / name)
