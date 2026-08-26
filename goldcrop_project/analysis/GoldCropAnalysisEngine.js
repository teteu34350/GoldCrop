// GoldCropAnalysisEngine.js
// Deterministic, modular, explainable analysis engine for fertilizer application windows.
// Input: normalized weather/soil object (as produced by window.GOLDCROP_WEATHER) and optional config.
// Output: recommendation object (synchronous).

class GoldCropAnalysisEngine {
  constructor(input, config = {}) {
    if (!input || typeof input !== 'object') {
      throw new Error('Input object is required');
    }
    this.input = input;
    this.config = this._mergeConfig(config);
    this._validateInput();
  }

  // Merge user config with defaults (hard‑coded here; could be loaded from JSON)
  _mergeConfig(userConfig) {
    const defaultConfig = {
      factorWeights: {
        soilMoisture: 0.20,
        rain: 0.15,
        rainDistribution: 0.10,
        evapotranspiration: 0.15,
        wind: 0.10,
        temperature: 0.10,
        humidity: 0.10,
        applicationRisk: 0.10,
      },
      reliabilityWeights: {
        soilMoisture: 0.30,
        rainVolume: 0.20,
        windSpeed: 0.15,
        temperature: 0.15,
        humidity: 0.10,
        et0: 0.05,
        cloudCover: 0.02,
        solarRadiation: 0.02,
      },
      soilMoistureCurve: [
        { moisture: 0,   adequacy: 0 },
        { moisture: 20,  adequacy: 30 },
        { moisture: 40,  adequacy: 85 },
        { moisture: 60,  adequacy: 85 },
        { moisture: 75,  adequacy: 50 },
        { moisture: 90,  adequacy: 10 },
        { moisture: 100, adequacy: 0 },
      ],
      rain: {
        lowVolume: 2,
        optimalVolumeMin: 5,
        optimalVolumeMax: 15,
        highVolume: 30,
        probLow: 30,
        probHigh: 70,
        intensityLow: 0.5,
        intensityHigh: 5,
      },
      et0: { demandWeight: 0.4, reference: 4 },
      riskThresholds: {
        leachingSoilMoisture: 80,
        runoffRainVolume: 25,
        windDrift: 30,
        temperatureExtreme: { min: 5, max: 35 },
        humidityExtreme: { min: 30, max: 80 },
        volatilisationTemp: 30,
      },
      classification: {
        veryUnfavorable: { min: 0, max: 20 },
        unfavorable: { min: 21, max: 40 },
        attention: { min: 41, max: 60 },
        favorable: { min: 61, max: 80 },
        goldenWindow: { min: 81, max: 100 },
      },
      decisionPolicy: {
        adequacyThreshold: 60,
        maxLeachingRisk: 'high',
        maxRunoffRisk: 'high',
        maxWindRisk: 'high',
        minConfidence: 0.65,
      },
      windowLengthHours: 4,
      windowStepHours: 1,
      ...userConfig,
    };
    return defaultConfig;
  }

  _validateInput() {
    const required = ['weather', 'soil'];
    for (const key of required) {
      if (!this.input[key]) {
        throw new Error(`Missing required input section: ${key}`);
      }
    }
  }

  // Entry point – evaluate all windows and return the best recommendation
  evaluate() {
    const windows = this._generateTemporalWindows();
    const results = windows.map(w => this._evaluateWindow(w));
    const viable = results.filter(r => r.decision !== 'INSUFFICIENT_DATA');
    if (viable.length === 0) return results[0];
    viable.sort((a, b) => b.adequacyIndex - a.adequacyIndex || b.confidence - a.confidence);
    return viable[0];
  }

  // Build candidate windows from hourly timestamps
  _generateTemporalWindows() {
    const hourly = this.input.weather.hourly;
    const timestamps = hourly.timestamps;
    const stepMs = this.config.windowStepHours * 3600 * 1000;
    const lengthMs = this.config.windowLengthHours * 3600 * 1000;
    const windows = [];
    for (let i = 0; i < timestamps.length; i++) {
      const start = new Date(timestamps[i]).getTime();
      const end = start + lengthMs;
      const endIdx = timestamps.findIndex(ts => new Date(ts).getTime() >= end);
      if (endIdx === -1) break;
      windows.push({ startIdx: i, endIdx, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    }
    return windows;
  }

  _evaluateWindow(window) {
    const hourlyVals = this.input.weather.hourly.values;
    const slice = {};
    for (const [k, arr] of Object.entries(hourlyVals)) {
      slice[k] = arr.slice(window.startIdx, window.endIdx + 1);
    }
    const factors = {};
    const explanations = [];

    const soilMoisture = this.input.soil.moisture ?? null;
    const soilScore = this._soilMoistureScore(soilMoisture);
    factors.soilMoisture = soilScore;
    explanations.push(`Soil moisture ${soilMoisture}% → ${soilScore.score}`);

    const rainVolume = this._sumArray(slice.precipitation ?? []);
    const rainProb = this._maxArray(slice.precipitation_probability ?? []);
    const rainScore = this._rainScore(rainVolume, rainProb);
    factors.rain = rainScore;
    explanations.push(`Rain ${rainVolume} mm (prob ${rainProb}%) → ${rainScore.score}`);

    const rainDistScore = this._rainDistributionScore(slice.precipitation ?? []);
    factors.rainDistribution = rainDistScore;
    explanations.push(`Rain distribution ${rainDistScore.score}`);

    const et0 = this._meanArray(slice.et0_fao_evapotranspiration ?? []);
    const evapoScore = this._evapotranspirationScore(et0, soilMoisture);
    factors.evapotranspiration = evapoScore;
    explanations.push(`ET0 ${et0?.toFixed(1) ?? 'n/a'} mm → ${evapoScore.score}`);

    const wind = this._meanArray(slice.wind_speed_10m ?? []);
    const windScore = this._windScore(wind);
    factors.wind = windScore;
    explanations.push(`Wind ${wind?.toFixed(1) ?? 'n/a'} km/h → ${windScore.score}`);

    const temp = this._meanArray(slice.temperature_2m ?? []);
    const tempScore = this._temperatureScore(temp);
    factors.temperature = tempScore;
    explanations.push(`Temp ${temp?.toFixed(1) ?? 'n/a'} °C → ${tempScore.score}`);

    const hum = this._meanArray(slice.relative_humidity_2m ?? []);
    const humScore = this._humidityScore(hum);
    factors.humidity = humScore;
    explanations.push(`Humidity ${hum?.toFixed(1) ?? 'n/a'}% → ${humScore.score}`);

    const appRiskScore = { score: 100, explanation: 'No extra risk data – full score' };
    factors.applicationRisk = appRiskScore;

    const adequacyIndex = this._aggregateScores(factors);
    const { confidence, missingCritical } = this._dataQuality();
    const risks = this._evaluateRisks({ soilMoisture, rainVolume, wind, temp });
    const decision = this._decisionEngine({ adequacyIndex, risks, confidence, missingCritical });

    return {
      windowStart: window.start,
      windowEnd: window.end,
      adequacyIndex,
      classification: this._classifyAdequacy(adequacyIndex),
      confidence,
      factors: this._stripScoreObjects(factors),
      risks,
      decision,
      explanation: this._buildExplanation({ adequacyIndex, risks, confidence, decision, explanations }),
      dataQuality: { missingCritical, missingImportant: [], missingOptional: [] },
    };
  }

  _stripScoreObjects(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = { score: v.score, explanation: v.explanation };
    }
    return out;
  }

  // ---- Factor calculators -------------------------------------------------
  _soilMoistureScore(m) {
    const curve = this.config.soilMoistureCurve;
    if (m == null) return { score: 0, explanation: 'Missing soil moisture' };
    let lower = curve[0];
    let upper = curve[curve.length - 1];
    for (let i = 0; i < curve.length - 1; i++) {
      if (m >= curve[i].moisture && m <= curve[i + 1].moisture) { lower = curve[i]; upper = curve[i + 1]; break; }
    }
    const range = upper.moisture - lower.moisture;
    const ratio = range === 0 ? 0 : (m - lower.moisture) / range;
    const adequacy = lower.adequacy + ratio * (upper.adequacy - lower.adequacy);
    return { score: Math.round(adequacy), explanation: `Soil moisture ${m}% interpolated` };
  }

  _rainScore(volume, prob) {
    const cfg = this.config.rain;
    let score = 0;
    if (volume < cfg.lowVolume) score = 30;
    else if (volume >= cfg.optimalVolumeMin && volume <= cfg.optimalVolumeMax) score = 80;
    else if (volume > cfg.highVolume) score = 10;
    else score = 50;
    if (prob < cfg.probLow) score = Math.min(score, 70);
    if (prob > cfg.probHigh) score = Math.min(score, 60);
    return { score, explanation: `Rain ${volume} mm, prob ${prob}%` };
  }

  _rainDistributionScore(arr) {
    if (!arr.length) return { score: 0, explanation: 'No rain data' };
    const max = Math.max(...arr);
    const avg = this._meanArray(arr);
    const ratio = max / (avg || 1);
    const score = ratio > 2 ? 40 : 70;
    return { score, explanation: `Intensity ratio ${ratio.toFixed(2)}` };
  }

  _evapotranspirationScore(et0, soilM) {
    if (et0 == null) return { score: 0, explanation: 'Missing ET0' };
    const demand = this.config.et0.demandWeight * (et0 / this.config.et0.reference);
    const soilScore = this._soilMoistureScore(soilM).score / 100;
    const adequacy = Math.max(0, Math.min(100, 100 - demand * (1 - soilScore) * 100));
    return { score: Math.round(adequacy), explanation: `ET0 ${et0} mm, demand ${demand.toFixed(2)}` };
  }

  _windScore(speed) {
    if (speed == null) return { score: 0, explanation: 'Missing wind data' };
    const thresh = this.config.riskThresholds.windDrift;
    const score = speed <= thresh ? 90 : Math.max(0, 90 - (speed - thresh) * 2);
    return { score, explanation: `Wind ${speed} km/h` };
  }

  _temperatureScore(t) {
    if (t == null) return { score: 0, explanation: 'Missing temperature' };
    const { min, max } = this.config.riskThresholds.temperatureExtreme;
    if (t < min) return { score: 30, explanation: `Temp ${t}°C below ${min}` };
    if (t > max) return { score: 30, explanation: `Temp ${t}°C above ${max}` };
    return { score: 80, explanation: `Temp ${t}°C optimal` };
  }

  _humidityScore(h) {
    if (h == null) return { score: 0, explanation: 'Missing humidity' };
    const { min, max } = this.config.riskThresholds.humidityExtreme;
    if (h < min) return { score: 30, explanation: `Humidity ${h}% below ${min}` };
    if (h > max) return { score: 30, explanation: `Humidity ${h}% above ${max}` };
    return { score: 80, explanation: `Humidity ${h}% optimal` };
  }

  // -----------------------------------------------------------------------
  _aggregateScores(factors) {
    const w = this.config.factorWeights;
    let total = 0;
    for (const [k, obj] of Object.entries(factors)) {
      total += (w[k] ?? 0) * obj.score;
    }
    return Math.round(total);
  }

  _dataQuality() {
    const critical = ['soilMoisture', 'rainVolume', 'windSpeed', 'temperature', 'humidity'];
    let missingCritical = [];
    let confidence = 1.0;
    for (const key of critical) {
      if (this.input[key] == null) {
        missingCritical.push(key);
        confidence -= this.config.reliabilityWeights[key] || 0.05;
      }
    }
    confidence = Math.max(0, Math.min(1, confidence));
    return { confidence, missingCritical };
  }

  _evaluateRisks({ soilMoisture, rainVolume, wind, temp }) {
    const cfg = this.config.riskThresholds;
    const leach = (soilMoisture > cfg.leachingSoilMoisture && rainVolume > cfg.highVolume) ? 'high' : (soilMoisture > cfg.leachingSoilMoisture ? 'medium' : 'low');
    const runoff = rainVolume > cfg.runoffRainVolume ? 'high' : (rainVolume > cfg.lowVolume ? 'medium' : 'low');
    const windDrift = wind > cfg.windDrift ? 'high' : (wind > cfg.windDrift * 0.6 ? 'medium' : 'low');
    const tempStress = (temp < cfg.temperatureExtreme.min || temp > cfg.temperatureExtreme.max) ? 'high' : 'low';
    const hum = this.input.soil?.humidity ?? null;
    const humStress = (hum != null && (hum < cfg.humidityExtreme.min || hum > cfg.humidityExtreme.max)) ? 'high' : 'low';
    return {
      leaching: { level: leach, explanation: `Soil ${soilMoisture}% vs ${cfg.leachingSoilMoisture}, rain ${rainVolume} mm` },
      runoff: { level: runoff, explanation: `Rain ${rainVolume} mm` },
      windDrift: { level: windDrift, explanation: `Wind ${wind} km/h` },
      temperatureStress: { level: tempStress, explanation: `Temp ${temp}°C` },
      humidityStress: { level: humStress, explanation: `Humidity ${hum ?? 'n/a'}%` },
    };
  }

  _decisionEngine({ adequacyIndex, risks, confidence, missingCritical }) {
    const p = this.config.decisionPolicy;
    if (confidence < p.minConfidence) return 'INSUFFICIENT_DATA';
    if (Object.values(risks).some(r => r.level === 'high')) return 'AVOID';
    if (adequacyIndex >= p.adequacyThreshold) return 'APPLY';
    if (adequacyIndex >= 40) return 'WAIT';
    return 'AVOID';
  }

  _classifyAdequacy(v) {
    const cls = this.config.classification;
    for (const [name, range] of Object.entries(cls)) {
      if (v >= range.min && v <= range.max) return name;
    }
    return 'unknown';
  }

  _buildExplanation({ adequacyIndex, risks, confidence, decision, explanations }) {
    const parts = [];
    parts.push(`Adequacy ${adequacyIndex}`);
    parts.push(`Confidence ${confidence.toFixed(2)}`);
    parts.push(`Decision ${decision}`);
    parts.push('Factors:');
    parts.push(...explanations);
    parts.push('Risks:');
    for (const [k, v] of Object.entries(risks)) {
      parts.push(`${k} ${v.level}`);
    }
    return parts.join(' | ');
  }

  // Utility helpers
  _sumArray(a) { return a.reduce((s, v) => s + v, 0); }
  _maxArray(a) { return a.length ? Math.max(...a) : null; }
  _meanArray(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GoldCropAnalysisEngine;
} else {
  window.GoldCropAnalysisEngine = GoldCropAnalysisEngine;
}
