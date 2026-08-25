"""
Loads saved preprocessor + XGBoost + AdaBoost models, scores test_orders.csv.
"""

import pandas as pd
import joblib

# ---- Load saved artifacts ----
preprocessor = joblib.load("preprocessor.pkl")
xgb_model = joblib.load("xgb_model.pkl")
ada_model = joblib.load("ada_model.pkl")
label_map = joblib.load("label_map.pkl")


def predict(new_df: pd.DataFrame, use_ensemble: bool = True) -> pd.DataFrame:
    # Use the SAME fitted preprocessor from training -- no manual get_dummies needed
    X_new = preprocessor.transform(new_df)

    proba_xgb = xgb_model.predict_proba(X_new)

    if use_ensemble:
        proba_ada = ada_model.predict_proba(X_new)
        avg_proba = (proba_xgb + proba_ada) / 2
    else:
        avg_proba = proba_xgb

    pred_idx = avg_proba.argmax(axis=1)
    pred_labels = [label_map[i] for i in pred_idx]
    confidence = avg_proba.max(axis=1)

    result = new_df.copy()
    result["predicted_class"] = pred_labels
    result["confidence"] = confidence.round(4)

    for i, name in label_map.items():
        result[f"proba_{name}"] = avg_proba[:, i].round(4)

    return result


if __name__ == "__main__":
    test_orders = pd.read_csv("test_orders.csv")

    scored = predict(test_orders, use_ensemble=True)

    print(scored[["predicted_class", "confidence"]].to_string())

    UNCERTAIN_THRESHOLD = 0.60
    uncertain = scored[scored["confidence"] < UNCERTAIN_THRESHOLD]
    print(f"\n{len(uncertain)} / {len(scored)} cases flagged as UNCERTAIN (confidence < {UNCERTAIN_THRESHOLD})")
    if len(uncertain) > 0:
        print(uncertain[["predicted_class", "confidence"]].to_string())

    scored.to_csv("scored_test_orders.csv", index=False)
    print("\nSaved full results to scored_test_orders.csv")