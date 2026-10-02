/*
  GoldCropAnalysisEngine.js
  Deterministic, modular analysis engine for fertilizer application.
  Receives normalized weather/soil data (window.GOLDCROP_WEATHER) and optional config.
*/

class GoldCropAnalysisEngine {
  constructor(input, config = {}) {
    this.input = input;
    const defaultConfig = GoldCropAnalysisEngine.defaultConfig();
    this.config = { ...defaultConfig, ...config };
    this.criticalVariables = this.config.criticalVariables || [
      'soilMoisture',
      'rainVolume',
      'windSpeed',
      'temperature',
      'humidity',
    ];
  }

  static defaultConfig() {
    return {
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
        rainProbability: 0.05,
        windSpeed: 0.15,
        temperature: 0.15,
        humidity: 0.10,
        et0: 0.05,
        cloudCover: 0.02,
        solarRadiation: 0.02,
      },
      soilMoistureCurve: [
        { moisture: 0, adequacy: 0 },
        { moisture: 20, adequacy: 30 },
        { moisture: 40, adequacy: 85 },
        { moisture: 60, adequacy: 85 },
        { moisture: 75, adequacy: 50 },
        { moisture: 90, adequacy: 10 },
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
      postApplicationHours: 12,
      criticalVariables: [
        'soilMoisture',
        'rainVolume',
        'rainProbability',
        'windSpeed',
        'temperature',
        'humidity',
      ],
    };
  }

  _soilMoistureScore(pct) {
    const curve = this.config.soilMoistureCurve;
    if (pct <= curve[0].moisture) return curve[0].adequacy;
    if (pct >= curve[curve.length - 1].moisture) return curve[curve.length - 1].adequacy;
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i];
      const b = curve[i + 1];
      if (pct >= a.moisture && pct <= b.moisture) {
        const t = (pct - a.moisture) / (b.moisture - a.moisture);
        return a.adequacy + t * (b.adequacy - a.adequacy);
      }
    }
    return 0;
  }

  _rainScore(volume, prob, intensity) {
    const cfg = this.config.rain;
    let volumeScore;
    if (volume < cfg.lowVolume) volumeScore = 0;
    else if (volume <= cfg.optimalVolumeMax) {
      if (volume >= cfg.optimalVolumeMin) volumeScore = 100;
      else volumeScore = ((volume - cfg.lowVolume) / (cfg.optimalVolumeMin - cfg.lowVolume)) * 100;
    } else if (volume <= cfg.highVolume) {
      volumeScore = ((cfg.highVolume - volume) / (cfg.highVolume - cfg.optimalVolumeMax)) * 100;
    } else volumeScore = 0;
    const probScore = 100 - prob * 100;
    let intensityScore;
    if (intensity <= cfg.intensityLow) intensityScore = 100;
    else if (intensity >= cfg.intensityHigh) intensityScore = 0;
    else intensityScore = ((cfg.intensityHigh - intensity) / (cfg.intensityHigh - cfg.intensityLow)) * 100;
    return (volumeScore + probScore + intensityScore) / 3;
  }

  _rainDistributionScore(hourly) {
    if (!hourly || hourly.length === 0) return 100;
    const total = hourly.reduce((a, v) => a + v, 0);
    if (total === 0) return 100;
    const maxHour = Math.max(...hourly);
    const concentration = maxHour / total;
    return 100 * (1 - Math.min(concentration, 0.7));
  }

  _evapotranspirationScore(et0) {
    const { demandWeight, reference } = this.config.et0;
    const ratio = et0 / reference;
    return Math.max(0, 100 - demandWeight * ratio * 100);
  }

  _genericScore(val, th) {
    if (val < th.low) return 0;
    if (val > th.high) return 0;
    if (val >= th.optLow && val <= th.optHigh) return 100;
    if (val < th.optLow) return ((val - th.low) / (th.optLow - th.low)) * 100;
    return ((th.high - val) / (th.high - th.optHigh)) * 100;
  }

  _evaluateWindow(data) {
    const fW = this.config.factorWeights;
    const factors = {};
    const soilScore = this._soilMoistureScore(data.soilMoisture);
    factors.soilMoisture = { score: Math.round(soilScore), explanation: `Soil moisture ${data.soilMoisture}% → ${Math.round(soilScore)} adequacy.` };
    const rainScore = this._rainScore(data.rainVolume, data.rainProbability, data.rainIntensityMax);
    factors.rain = { score: Math.round(rainScore), explanation: `Rain ${data.rainVolume} mm, prob ${Math.round(data.rainProbability * 100)}%, intensity ${data.rainIntensityMax} mm/h.` };
    const rainDist = this._rainDistributionScore(data.hourlyPrecip);
    factors.rainDistribution = { score: Math.round(rainDist), explanation: 'Distribution based on concentration.' };
    const etScore = this._evapotranspirationScore(data.et0);
    factors.evapotranspiration = { score: Math.round(etScore), explanation: `ET0 ${data.et0} mm/day.` };
    const windScore = this._genericScore(data.windSpeed, { low: 0, high: 40, optLow: 0, optHigh: 15 });
    factors.wind = { score: Math.round(windScore), explanation: `Wind ${data.windSpeed} km/h.` };
    const tempScore = this._genericScore(data.temperature, { low: -10, high: 45, optLow: 20, optHigh: 30 });
    factors.temperature = { score: Math.round(tempScore), explanation: `Temp ${data.temperature} °C.` };
    const humScore = this._genericScore(data.humidity, { low: 10, high: 90, optLow: 40, optHigh: 70 });
    factors.humidity = { score: Math.round(humScore), explanation: `RH ${data.humidity}%` };
    factors.applicationRisk = { score: 100, explanation: 'No additional risk data.' };
    let adequacy = 0;
    for (const k of Object.keys(fW)) adequacy += (factors[k]?.score ?? 0) * fW[k];
    adequacy = Math.round(adequacy);
    const classification = this._classify(adequacy);
    const risks = this._evaluateRisks(data);
    const dq = this._evaluateDataQuality(data);
    const decision = this._decisionEngine({ adequacy, risks, confidence: dq.confidence });
    return {
      windowStart: data.windowStart,
      windowEnd: data.windowEnd,
      adequacyIndex: adequacy,
      classification,
      confidence: dq.confidence,
      factors,
      risks,
      decision,
      explanation: `Adequacy ${adequacy} (${classification}), confidence ${dq.confidence.toFixed(2)} → ${decision}.`,
      dataQuality: dq,
    };
  }

  _classify(val) {
    const c = this.config.classification;
    for (const [name, r] of Object.entries(c)) if (val >= r.min && val <= r.max) return name;
    return 'unknown';
  }

  _evaluateRisks(d) {
    const th = this.config.riskThresholds;
    const leaching = d.soilMoisture > th.leachingSoilMoisture && d.rainVolume > th.runoffRainVolume ? 'high' : 'low';
    const runoff = d.rainVolume > th.runoffRainVolume ? 'high' : 'low';
    const wind = d.windSpeed > th.windDrift ? 'high' : 'low';
    const volatil = d.temperature > th.volatilisationTemp ? 'high' : 'low';
    return {
      leaching: { level: leaching, explanation: `Soil ${d.soilMoisture}% & rain ${d.rainVolume} mm → ${leaching}` },
      runoff: { level: runoff, explanation: `Rain ${d.rainVolume} mm → ${runoff}` },
      windDrift: { level: wind, explanation: `Wind ${d.windSpeed} km/h → ${wind}` },
      volatilisation: { level: volatil, explanation: `Temp ${d.temperature}°C → ${volatil}` },
    };
  }

  _evaluateDataQuality(d) {
    const rw = this.config.reliabilityWeights;
    let confidence = 1.0;
    const missingCritical = [];
    const missingImportant = [];
    const missingOptional = [];
    for (const [v, w] of Object.entries(rw)) {
      if (d[v] === undefined || d[v] === null) {
        if (this.criticalVariables.includes(v)) { missingCritical.push(v); confidence -= w; }
        else { missingImportant.push(v); confidence -= w * 0.5; }
      }
    }
    confidence = Math.max(0, Math.min(1, confidence));
    if (missingCritical.length) return { confidence: 0, missingCritical, missingImportant, missingOptional };
    return { confidence, missingCritical, missingImportant, missingOptional };
  }

  _decisionEngine({ adequacy, risks, confidence }) {
    const p = this.config.decisionPolicy;
    if (confidence < p.minConfidence) return 'INSUFFICIENT_DATA';
    if (['high', 'very high'].includes(risks.leaching.level) && p.maxLeachingRisk === 'high') return 'AVOID';
    if (['high', 'very high'].includes(risks.runoff.level) && p.maxRunoffRisk === 'high') return 'AVOID';
    if (['high', 'very high'].includes(risks.windDrift.level) && p.maxWindRisk === 'high') return 'AVOID';
    if (adequacy >= p.adequacyThreshold && ['low', 'medium'].includes(risks.leaching.level) && ['low', 'medium'].includes(risks.runoff.level) && ['low', 'medium'].includes(risks.windDrift.level)) return 'APPLY';
    if (adequacy >= 40 && adequacy < p.adequacyThreshold) return 'WAIT';
    return 'AVOID';
  }

  _getSlice(hourly, startIndex, endIndex) {
    const values = hourly.values || {};
    const slice = (name) => (values[name] || []).slice(startIndex, endIndex);
    const average = (items) => {
      const valid = items.filter(Number.isFinite);
      return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
    };
    const isComplete = (items) => items.length > 0 && items.every(Number.isFinite);
    const toNumbers = (name) => slice(name).map(value => value == null ? NaN : Number(value));
    const sum = (items, requireComplete = false) => {
      const valid = items.filter(Number.isFinite);
      if (requireComplete && !isComplete(items)) return null;
      return valid.length ? valid.reduce((total, value) => total + value, 0) : null;
    };
    const maximum = (items, requireComplete = false) => {
      const valid = items.filter(Number.isFinite);
      if (requireComplete && !isComplete(items)) return null;
      return valid.length ? Math.max(...valid) : null;
    };
    const requiredAverage = (items) => isComplete(items) ? average(items) : null;
    const precipitation = toNumbers('precipitation');
    const probability = toNumbers('precipitation_probability');
    const temperatures = toNumbers('temperature_2m');
    const humidity = toNumbers('relative_humidity_2m');
    const wind = toNumbers('wind_speed_10m');
    const soilMoistureValue = requiredAverage(toNumbers('soil_moisture_9_to_27cm'));
    const probabilityAverage = requiredAverage(probability);

    return {
      rainVolume: sum(precipitation, true),
      rainProbability: probabilityAverage == null ? null : probabilityAverage / 100,
      rainIntensityMax: maximum(precipitation),
      hourlyPrecip: precipitation.filter(Number.isFinite),
      et0: average(toNumbers('et0_fao_evapotranspiration')),
      windSpeed: maximum(wind, true),
      temperature: requiredAverage(temperatures),
      humidity: requiredAverage(humidity),
      soilMoisture: soilMoistureValue == null ? null : soilMoistureValue * 100,
      rain: sum(toNumbers('rain')),
      showers: sum(toNumbers('showers')),
      windGusts: maximum(toNumbers('wind_gusts_10m')),
      cloudCover: average(toNumbers('cloud_cover')),
      solarRadiation: average(toNumbers('shortwave_radiation')),
    };
  }

  _futureConditions(hourly, startIndex, hours) {
    const endIndex = Math.min(hourly.timestamps.length, startIndex + hours);
    const data = this._getSlice(hourly, startIndex, endIndex);
    return {
      hours,
      rainVolume: data.rainVolume,
      rainProbability: data.rainProbability,
      windGusts: data.windGusts,
      et0: data.et0,
    };
  }

  _evaluateWindowWithContext(data, next24h, next48h) {
    const recommendation = this._evaluateWindow(data);
    return {
      ...recommendation,
      date: data.date,
      metrics: data,
      next24h,
      next48h,
    };
  }

  evaluate() {
    const { hourly, current } = this.input;
    if (!hourly?.timestamps?.length) return { recommendations: [], bestRecommendation: null };
    const winLen = this.config.windowLengthHours;
    const step = this.config.windowStepHours;
    const results = [];
    const maxHours = Math.min(hourly.timestamps.length, 7 * 24);
    const soilCurrent = current?.values?.soil_moisture_9_to_27cm;
    for (let startIndex = 0; startIndex + winLen <= maxHours; startIndex += step) {
      const endIndex = startIndex + winLen;
      const start = hourly.timestamps[startIndex];
      const data = this._getSlice(hourly, startIndex, endIndex);
      data.windowStart = start;
      data.windowEnd = hourly.timestamps[endIndex] || start;
      data.date = start.slice(0, 10);
      data.soilMoisture = data.soilMoisture ?? (Number.isFinite(soilCurrent) ? soilCurrent * 100 : null);
      const next24h = this._futureConditions(hourly, endIndex, 24);
      const next48h = this._futureConditions(hourly, endIndex, 48);
      results.push(this._evaluateWindowWithContext(data, next24h, next48h));
    }
    results.sort((a, b) => b.adequacyIndex - a.adequacyIndex);
    return {
      engine: 'GoldCropAnalysisEngine',
      generatedAt: new Date().toISOString(),
      horizonDays: 7,
      windowLengthHours: winLen,
      windowStepHours: step,
      recommendations: results,
      bestRecommendation: results[0] || null,
    };
  }
}

if (typeof module !== 'undefined') module.exports = GoldCropAnalysisEngine;
