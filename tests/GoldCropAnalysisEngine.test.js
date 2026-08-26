const assert = require('assert');
const fs = require('fs');
const path = require('path');

const enginePath = path.resolve(__dirname, '../static/analysis/GoldCropAnalysisEngine.js');
const engineCode = fs.readFileSync(enginePath, 'utf8');

global.window = global;
// Para garantir que a classe seja exposta
const scriptToRun = engineCode + '\nif(typeof global !== "undefined") global.GoldCropAnalysisEngine = GoldCropAnalysisEngine;';
eval(scriptToRun);

const mockCurrent = {
  temperature_2m: 23,
  relative_humidity_2m: 50,
  precipitation: 0,
  rain: 0,
  showers: 0,
  wind_speed_10m: 10,
  wind_gusts_10m: 12,
  dew_point_2m: 12,
  cloud_cover: 10,
  shortwave_radiation: 500,
  et0_fao_evapotranspiration: 1,
  weather_code: 0,
  soil_moisture_0_to_1cm: 0.2,
  soil_moisture_1_to_3cm: 0.2,
  soil_moisture_3_to_9cm: 0.2,
  soil_moisture_9_to_27cm: 0.2,
  soil_moisture_27_to_81cm: 0.2
};

const mockHourly = {
  timestamps: Array.from({length: 24}, (_, i) => `2026-08-26T${String(i).padStart(2, '0')}:00`),
  values: {
    temperature_2m: Array(24).fill(23),
    relative_humidity_2m: Array(24).fill(50),
    precipitation_probability: Array(24).fill(0),
    precipitation: Array(24).fill(0),
    rain: Array(24).fill(0),
    showers: Array(24).fill(0),
    wind_speed_10m: Array(24).fill(10),
    wind_gusts_10m: Array(24).fill(12),
    dew_point_2m: Array(24).fill(12),
    cloud_cover: Array(24).fill(10),
    shortwave_radiation: Array(24).fill(500),
    et0_fao_evapotranspiration: Array(24).fill(1),
    weather_code: Array(24).fill(0)
  }
};

const mockWeather = {
  current: { values: mockCurrent },
  hourly: mockHourly,
  soil: {
    values: {
      soil_moisture_0_to_1cm: Array(24).fill(0.2),
      soil_moisture_1_to_3cm: Array(24).fill(0.2),
      soil_moisture_3_to_9cm: Array(24).fill(0.2),
      soil_moisture_9_to_27cm: Array(24).fill(0.2),
      soil_moisture_27_to_81cm: Array(24).fill(0.2)
    }
  }
};

function createEngine(overrides = {}) {
  const customWeather = JSON.parse(JSON.stringify(mockWeather));
  
  if (overrides.rain) {
    customWeather.hourly.values.rain.fill(overrides.rain);
    customWeather.hourly.values.precipitation.fill(overrides.rain);
  }
  
  if (overrides.moisture) {
    customWeather.soil.values.soil_moisture_0_to_1cm.fill(overrides.moisture);
  }
  
  if (overrides.wind) {
    customWeather.hourly.values.wind_speed_10m.fill(overrides.wind);
  }
  
  return new GoldCropAnalysisEngine(customWeather);
}

// 1. Adequacy >= 60 & confidence >= 0.65, no high risk -> 'APPLY'
{
  const engine = createEngine();
  const results = engine.evaluate();
  const best = results.bestRecommendation;
  
  assert(best.adequacyIndex >= 60, `Adequacy should be >= 60, got ${best.adequacyIndex}`);
  assert(best.confidence >= 0.65, `Confidence should be >= 0.65, got ${best.confidence}`);
  assert.strictEqual(best.decision, 'APPLY', `Decision should be APPLY, got ${best.decision}`);
}

// 2. High risk present (e.g. wind drift from high wind) blocks apply -> 'AVOID'
{
  // Wind = 40 km/h -> should trigger high wind drift risk and block
  const engine = createEngine({ wind: 40 });
  const results = engine.evaluate();
  const best = results.bestRecommendation;
  
  if (best) {
      assert.strictEqual(best.decision, 'AVOID', `Decision should be AVOID due to wind drift risk, got ${best.decision}`);
      assert.strictEqual(best.risks.windDrift.level, 'high', `Wind drift risk should be high`);
  }
}

// 3. Adequacy < 60 -> decision 'AVOID' or 'WAIT'
{
  const customWeather = JSON.parse(JSON.stringify(mockWeather));
  customWeather.soil.values.soil_moisture_0_to_1cm.fill(1); // 100%
  customWeather.hourly.values.temperature_2m.fill(50);
  customWeather.hourly.values.wind_speed_10m.fill(50);
  customWeather.hourly.values.rain.fill(100);
  customWeather.hourly.values.relative_humidity_2m.fill(0);
  const engine = new GoldCropAnalysisEngine(customWeather);
  const results = engine.evaluate();
  const best = results.bestRecommendation;
  
  if (best) {
      assert(best.adequacyIndex < 60, `Adequacy should be < 60 due to bad conditions, got ${best.adequacyIndex}`);
      assert.notStrictEqual(best.decision, 'APPLY', `Decision should not be APPLY, got ${best.decision}`);
  }
}

// 4. Missing critical data triggers confidence drop
{
  const customWeather = JSON.parse(JSON.stringify(mockWeather));
  delete customWeather.hourly.values.temperature_2m;
  delete customWeather.hourly.values.wind_speed_10m;
  delete customWeather.hourly.values.relative_humidity_2m;
  const engine = new GoldCropAnalysisEngine(customWeather);
  const results = engine.evaluate();
  const best = results.bestRecommendation;
  
  if (best) {
      assert(best.confidence < 0.65, `Confidence should be dropped below 0.65, got ${best.confidence}`);
      assert.strictEqual(best.decision, 'INSUFFICIENT_DATA', `Decision should be INSUFFICIENT_DATA`);
  }
}

console.log('All tests passed!');
