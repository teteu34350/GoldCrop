import json
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple


class GoldCropAnalysisEngine:
    """Deterministic analysis engine for fertilizer application suitability.

    The engine receives a weather/soil data dictionary (matching the structure
    exposed by ``window.GOLDCROP_WEATHER``) and returns a deterministic result
    containing a suitability *score* (0‑100) and a recommended time *window*.

    Configuration can be supplied via a JSON/YAML file (future‑proof) that
    defines the scoring curves for soil moisture, rainfall and evapotranspiration.
    If no configuration is provided the engine falls back to a sensible default
    located at ``static/analysis/config_default.json``.
    """

    def __init__(self, config: Dict[str, Any] | None = None):
        # Load default config if none supplied
        if config is None:
            default_path = Path(__file__).resolve().parents[2] / "static" / "analysis" / "config_default.json"
            if default_path.is_file():
                with open(default_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
            else:
                config = {}
        self.config = config
        # Pre‑process curves for fast lookup
        self.moisture_curve = self._build_piecewise(self.config.get("soil_moisture", {}))
        self.rain_curve = self._build_piecewise(self.config.get("rainfall", {}))
        self.et0_factor = self.config.get("et0_factor", 1.0)

    # ---------------------------------------------------------------------
    # Helper: build a simple piecewise linear function from a list of (x, y)
    # points sorted by x. The returned callable clamps to the first/last point.
    # ---------------------------------------------------------------------
    def _build_piecewise(self, curve_cfg: Dict[str, Any]):
        points: List[Tuple[float, float]] = curve_cfg.get("points", [])
        if not points:
            # Identity fallback (0‑100 linear)
            points = [(0.0, 0.0), (100.0, 100.0)]
        # Ensure sorted by x
        points.sort(key=lambda p: p[0])
        xs, ys = zip(*points)

        def fn(x: float) -> float:
            if x <= xs[0]:
                return ys[0]
            if x >= xs[-1]:
                return ys[-1]
            for i in range(1, len(xs)):
                if xs[i - 1] <= x <= xs[i]:
                    x0, y0 = xs[i - 1], ys[i - 1]
                    x1, y1 = xs[i], ys[i]
                    return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
            return ys[-1]

        return fn

    # ---------------------------------------------------------------------
    # Core analysis routine
    # ---------------------------------------------------------------------
    def analyze(self, weather_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyse the supplied weather/soil data.

        Parameters
        ----------
        weather_data:
            Dictionary containing keys ``soil``, ``current`` and ``hourly``.
            Expected sub‑keys (minimal subset used by the engine)::

                soil: {"moisture": float}               # %
                current: {"precipitation": float}       # mm in last hour
                hourly: {"et0": List[float],            # mm per hour
                         "time": List[str]}            # ISO timestamps
        Returns
        -------
        dict
            ``{"score": int, "window_start": str, "window_end": str,
               "breakdown": {...}, "explanation": str}``
        """
        soil_moisture = float(weather_data.get("soil", {}).get("moisture", 0.0))
        precipitation = float(weather_data.get("current", {}).get("precipitation", 0.0))
        et0_series = weather_data.get("hourly", {}).get("et0", [])
        et0_total = sum(float(v) for v in et0_series[:24]) if isinstance(et0_series, list) else 0.0

        moisture_score = self.moisture_curve(soil_moisture)
        rain_score = self.rain_curve(precipitation)
        et0_score = max(0.0, 100.0 - (et0_total * self.et0_factor))
        et0_score = min(100.0, et0_score)

        weights = self.config.get("weights", {"moisture": 0.4, "rain": 0.3, "et0": 0.3})
        final_score = (
            moisture_score * weights.get("moisture", 0.4)
            + rain_score * weights.get("rain", 0.3)
            + et0_score * weights.get("et0", 0.3)
        )
        final_score = round(final_score, 2)

        time_series = weather_data.get("hourly", {}).get("time", [])
        if time_series:
            start_iso = time_series[0]
        else:
            from datetime import datetime, timezone, timedelta
            start_iso = datetime.now(timezone.utc).isoformat()
        from datetime import datetime, timedelta
        start_dt = datetime.fromisoformat(start_iso)
        window_start = (start_dt + timedelta(hours=1)).isoformat()
        window_end = (start_dt + timedelta(hours=25)).isoformat()

        explanation = (
            f"Soil moisture ({soil_moisture:.1f}% ) yields a score of {moisture_score:.1f}. "
            f"Precipitation ({precipitation:.1f} mm) yields a rain score of {rain_score:.1f}. "
            f"ET0 demand ({et0_total:.1f} mm) yields an ET0 score of {et0_score:.1f}. "
            f"Weighted aggregation results in a final suitability score of {final_score}."
        )

        return {
            "score": final_score,
            "window_start": window_start,
            "window_end": window_end,
            "breakdown": {
                "soil_moisture": moisture_score,
                "precipitation": rain_score,
                "et0": et0_score,
            },
            "explanation": explanation,
        }

# Simple demo when run as script
if __name__ == "__main__":
    demo = {
        "soil": {"moisture": 45},
        "current": {"precipitation": 2.5},
        "hourly": {"et0": [0.8] * 24, "time": ["2024-01-01T00:00:00Z"] * 24},
    }
    eng = GoldCropAnalysisEngine()
    print(json.dumps(eng.analyze(demo), indent=2))
