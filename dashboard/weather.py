import json
from datetime import date, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from django.utils import timezone

from .models import ColetaMeteorologica


CURRENT_VARIABLES = (
    "temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,"
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,"
    "shortwave_radiation,et0_fao_evapotranspiration,weather_code"
)
HOURLY_VARIABLES = (
    "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,"
    "rain,showers,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m,"
    "cloud_cover,shortwave_radiation,et0_fao_evapotranspiration,weather_code,"
    "soil_temperature_0cm,soil_temperature_6cm,soil_temperature_18cm,"
    "soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,"
    "soil_moisture_9_to_27cm,soil_moisture_27_to_81cm,sunshine_duration"
)
DAILY_VARIABLES = (
    "temperature_2m_max,temperature_2m_mean,temperature_2m_min,precipitation_sum,"
    "rain_sum,showers_sum,precipitation_probability_max,wind_speed_10m_max,"
    "wind_gusts_10m_max,shortwave_radiation_sum,sunshine_duration,"
    "et0_fao_evapotranspiration,weather_code"
)
ARCHIVE_HOURLY_VARIABLES = (
    "temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,rain,"
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m,"
    "et0_fao_evapotranspiration,shortwave_radiation"
)
ARCHIVE_DAILY_VARIABLES = (
    "temperature_2m_max,temperature_2m_min,precipitation_sum,"
    "precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max,"
    "shortwave_radiation_sum,et0_fao_evapotranspiration"
)
CACHE_MINUTES = 60
FORECAST_DAYS = 7
PAST_DAYS = 7


class WeatherProviderError(Exception):
    """Raised when the forecast provider cannot return a usable response."""


def _forecast_url(plot):
    params = {
        "latitude": str(plot.latitude),
        "longitude": str(plot.longitude),
        "current": CURRENT_VARIABLES,
        "hourly": HOURLY_VARIABLES,
        "daily": DAILY_VARIABLES,
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
        "timezone": "auto",
        "forecast_days": FORECAST_DAYS,
        "past_days": PAST_DAYS,
    }
    return "https://api.open-meteo.com/v1/forecast?" + urlencode(params)


def fetch_forecast(plot):
    try:
        with urlopen(_forecast_url(plot), timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise WeatherProviderError("A previsão Open-Meteo está temporariamente indisponível.") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("hourly"), dict):
        raise WeatherProviderError("A resposta da previsão meteorológica está incompleta.")
    return payload


def fetch_archive(plot, start_date, end_date):
    params = {
        "latitude": str(plot.latitude),
        "longitude": str(plot.longitude),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "hourly": ARCHIVE_HOURLY_VARIABLES,
        "daily": ARCHIVE_DAILY_VARIABLES,
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
        "timezone": "auto",
    }
    url = "https://archive-api.open-meteo.com/v1/archive?" + urlencode(params)
    try:
        with urlopen(url, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise WeatherProviderError("Os dados históricos do Open-Meteo estão indisponíveis para este período.") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("hourly"), dict):
        raise WeatherProviderError("A resposta histórica do Open-Meteo está incompleta para este período.")
    return payload


def _collection_payload(collection):
    return collection.dados_brutos.get("provider_payload")


def get_forecast_collection(plot, force_refresh=False):
    if plot.latitude is None or plot.longitude is None:
        raise WeatherProviderError("Cadastre as coordenadas do talhão para obter a previsão.")
    cutoff = timezone.now() - timedelta(minutes=CACHE_MINUTES)
    latest = plot.coletas_meteorologicas.filter(
        fonte="open-meteo",
        latitude=plot.latitude,
        longitude=plot.longitude,
        coletada_em__gte=cutoff,
    ).first()
    payload = _collection_payload(latest) if latest else None
    if payload and not force_refresh:
        return latest, payload, False

    payload = fetch_forecast(plot)
    fetched_at = timezone.now()
    payload_with_metadata = {
        "provider_payload": payload,
        "source": "open-meteo",
        "fetched_at": fetched_at.isoformat(),
        "timezone": payload.get("timezone"),
        "past_days": PAST_DAYS,
        "forecast_days": FORECAST_DAYS,
        "units": {
            "temperature": "°C",
            "wind_speed": "km/h",
            "precipitation": "mm",
            "soil_moisture": "m³/m³",
            "radiation": "W/m²",
        },
    }
    hourly = payload.get("hourly") or {}
    daily = payload.get("daily") or {}
    soil_names = (
        "soil_temperature_0cm",
        "soil_temperature_6cm",
        "soil_temperature_18cm",
        "soil_moisture_0_to_1cm",
        "soil_moisture_1_to_3cm",
        "soil_moisture_3_to_9cm",
        "soil_moisture_9_to_27cm",
        "soil_moisture_27_to_81cm",
    )
    collection = ColetaMeteorologica.objects.create(
        fazenda=plot.fazenda,
        talhao=plot,
        fonte="open-meteo",
        coletada_em=fetched_at,
        latitude=plot.latitude,
        longitude=plot.longitude,
        timezone=payload.get("timezone", ""),
        dados_atuais={
            "observedAt": (payload.get("current") or {}).get("time"),
            "values": payload.get("current") or {},
        },
        dados_horarios={
            "timestamps": hourly.get("time") or [],
            "values": {
                name: values for name, values in hourly.items()
                if name != "time" and isinstance(values, list)
            },
        },
        dados_diarios={
            "timestamps": daily.get("time") or [],
            "values": {
                name: values for name, values in daily.items()
                if name != "time" and isinstance(values, list)
            },
        },
        dados_solo_modelados={
            "source": "open-meteo-model",
            "sensorType": "weather-model-estimate",
            "timestamps": hourly.get("time") or [],
            "values": {
                name: hourly[name] for name in soil_names if name in hourly
            },
        },
        dados_brutos=payload_with_metadata,
    )
    return collection, payload, True


def forecast_response(payload, collection):
    return {
        **payload,
        "fetchedAt": collection.coletada_em.isoformat(),
        "source": collection.fonte,
        "collection_id": collection.id,
        "coverage": {
            "past_days": PAST_DAYS,
            "forecast_days": FORECAST_DAYS,
            "soil_values": "Estimativas meteorológicas modeladas, não medições de sensores.",
        },
    }


def get_archive_collection(plot, start_date, end_date):
    if plot.latitude is None or plot.longitude is None:
        raise WeatherProviderError("Cadastre as coordenadas do talhão para consultar o histórico.")
    for collection in plot.coletas_meteorologicas.filter(fonte="open-meteo-archive")[:30]:
        metadata = collection.dados_brutos
        if (
            collection.coletada_em >= timezone.now() - timedelta(days=1)
            and metadata.get("period_start") == start_date.isoformat()
            and metadata.get("period_end") == end_date.isoformat()
        ):
            payload = metadata.get("provider_payload")
            if payload:
                return collection, payload, False

    payload = fetch_archive(plot, start_date, end_date)
    fetched_at = timezone.now()
    hourly = payload.get("hourly") or {}
    daily = payload.get("daily") or {}
    collection = ColetaMeteorologica.objects.create(
        fazenda=plot.fazenda,
        talhao=plot,
        fonte="open-meteo-archive",
        coletada_em=fetched_at,
        latitude=plot.latitude,
        longitude=plot.longitude,
        timezone=payload.get("timezone", ""),
        dados_horarios={
            "timestamps": hourly.get("time") or [],
            "values": {
                name: values for name, values in hourly.items()
                if name != "time" and isinstance(values, list)
            },
        },
        dados_diarios={
            "timestamps": daily.get("time") or [],
            "values": {
                name: values for name, values in daily.items()
                if name != "time" and isinstance(values, list)
            },
        },
        dados_brutos={
            "provider_payload": payload,
            "source": "open-meteo-archive",
            "fetched_at": fetched_at.isoformat(),
            "timezone": payload.get("timezone"),
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
            "units": {
                "temperature": "°C",
                "wind_speed": "km/h",
                "precipitation": "mm",
            },
            "data_kind": "historical-modelled-reanalysis",
        },
    )
    return collection, payload, True
