// GoldCrop Analysis Engine configuration
window.GOLDCROP_ANALYSIS_CONFIG = {
  // ---- FACTOR WEIGHTS (must sum to 1.0) ----
  factorWeights: {
    soilMoisture: 0.20,
    rain: 0.15,
    rainDistribution: 0.10,
    evapotranspiration: 0.15,
    wind: 0.10,
    temperature: 0.10,
    humidity: 0.10,
    applicationRisk: 0.10
  },

  // ---- RELIABILITY (confidence) WEIGHTS ----
  reliabilityWeights: {
    // critical variables – large penalty when missing
    soilMoisture: 0.30,
    rainVolume: 0.20,
    windSpeed: 0.15,
    temperature: 0.15,
    // important but less critical
    humidity: 0.10,
    et0: 0.05,
    // optional / complementary
    cloudCover: 0.02,
    solarRadiation: 0.02
    // any variable not listed defaults to 0.01
  },

  // ---- SOIL‑MOISTURE ADAPTIVE CURVE ----
  // List of {moisture: %, adequacy: %}. Engine linearly interpolates.
  soilMoistureCurve: [
    { moisture: 0,  adequacy: 0 },
    { moisture: 20, adequacy: 30 },
    { moisture: 40, adequacy: 85 },
    { moisture: 60, adequacy: 85 },
    { moisture: 75, adequacy: 50 },
    { moisture: 90, adequacy: 10 },
    { moisture: 100, adequacy: 0 }
  ],

  // ---- RAIN EVALUATION PARAMETERS ----
  rain: {
    lowVolume: 2,
    optimalVolumeMin: 5,
    optimalVolumeMax: 15,
    highVolume: 30,
    probLow: 30,
    probHigh: 70,
    intensityLow: 0.5,
    intensityHigh: 5
  },

  // ---- ET0 PARAMETERS ----
  et0: {
    demandWeight: 0.4,
    reference: 4
  },

  // ---- RISK THRESHOLDS ----
  riskThresholds: {
    leachingSoilMoisture: 80,
    runoffRainVolume: 25,
    windDrift: 30,
    temperatureExtreme: { min: 5, max: 35 },
    humidityExtreme: { min: 30, max: 80 },
    volatilisationTemp: 30
  },

  // ---- CLASSIFICATION BANDS (adequacy index 0‑100) ----
  classification: {
    veryUnfavorable: { min: 0, max: 20 },
    unfavorable:      { min: 21, max: 40 },
    attention:        { min: 41, max: 60 },
    favorable:        { min: 61, max: 80 },
    goldenWindow:     { min: 81, max: 100 }
  },

  // ---- DECISION ENGINE POLICY ----
  decisionPolicy: {
    adequacyThreshold: 60,
    maxLeachingRisk: "high",
    maxRunoffRisk:   "high",
    maxWindRisk:     "high",
    minConfidence: 0.65
  },

  // ---- TEMPORAL WINDOW SETTINGS ----
  windowSettings: {
    lengthHours: 4,   // default window length
    stepHours: 1,     // step between window starts
    lookAheadHours: 12 // hours after window to assess post‑application conditions
  }
};
