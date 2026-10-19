from datetime import datetime, timedelta, timezone as dt_timezone
import math
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


WEATHER_FIELDS = {
    "temperature_2m": "Temperatura",
    "relative_humidity_2m": "Umidade relativa",
    "precipitation_probability": "Probabilidade de chuva",
    "precipitation": "Precipitação",
    "wind_speed_10m": "Velocidade do vento",
    "wind_gusts_10m": "Rajadas de vento",
}
MAX_WEATHER_AGE = timedelta(hours=12)
MAX_CLOCK_SKEW = timedelta(minutes=5)


def _number(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _parse_label(label):
    if not isinstance(label, dict):
        return None, ["Informe o produto e os limites aplicáveis da bula."]

    errors = []
    product = str(label.get("product", "")).strip()
    if not product:
        errors.append("Informe o produto utilizado.")
    if label.get("label_confirmed") is not True:
        errors.append("Confirme que os limites informados foram conferidos na bula/rótulo.")

    rules = {}
    bounds = {
        "max_wind_speed": (0, None, "Velocidade máxima do vento"),
        "max_wind_gusts": (0, None, "Rajada máxima"),
        "min_temperature": (-50, 60, "Temperatura mínima"),
        "max_temperature": (-50, 60, "Temperatura máxima"),
        "min_relative_humidity": (0, 100, "Umidade relativa mínima"),
        "max_relative_humidity": (0, 100, "Umidade relativa máxima"),
        "rain_free_hours": (0, 72, "Intervalo sem chuva"),
    }
    for key, (minimum, maximum, label_text) in bounds.items():
        raw = label.get(key)
        if raw in (None, ""):
            rules[key] = None
            continue
        value = _number(raw)
        if value is None or value < minimum or (maximum is not None and value > maximum):
            errors.append(f"{label_text}: informe um valor válido.")
        elif key == "rain_free_hours" and not value.is_integer():
            errors.append(f"{label_text}: informe um número inteiro de horas.")
        else:
            rules[key] = value

    if rules.get("min_temperature") is not None and rules.get("max_temperature") is not None:
        if rules["min_temperature"] > rules["max_temperature"]:
            errors.append("A temperatura mínima da bula não pode exceder a máxima.")
    if (
        rules.get("min_relative_humidity") is not None
        and rules.get("max_relative_humidity") is not None
        and rules["min_relative_humidity"] > rules["max_relative_humidity"]
    ):
        errors.append("A umidade mínima da bula não pode exceder a máxima.")

    if errors:
        return None, errors
    return {"product": product, **rules}, []


def _parse_time(value, zone):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=zone)
    return parsed.astimezone(zone)


def _insufficient(message, *, product="", missing=None):
    return {
        "operation": "FITOSSANITARIA",
        "product": product,
        "classification": "insufficient",
        "message": message,
        "missing": missing or [],
        "windows": [],
        "days": [],
        "next_opportunity": None,
        "confidence": "insufficient",
    }


def evaluate_pesticide_windows(weather, label, *, now=None):
    rules, label_errors = _parse_label(label)
    product = str(label.get("product", "")).strip() if isinstance(label, dict) else ""
    if label_errors:
        return _insufficient(
            "Dados do produto insuficientes para conferir as exigências da bula.",
            product=product,
            missing=label_errors,
        )

    if not isinstance(weather, dict):
        return _insufficient("Não há previsão meteorológica salva para este talhão.", product=product)

    timezone_name = weather.get("timezone")
    try:
        zone = ZoneInfo(timezone_name)
    except (TypeError, ValueError, ZoneInfoNotFoundError):
        return _insufficient(
            "Fuso horário da previsão ausente ou inválido.",
            product=product,
            missing=["timezone"],
        )

    fetched_at = _parse_time(weather.get("fetched_at"), zone)
    current_time = now or datetime.now(zone)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=zone)
    else:
        current_time = current_time.astimezone(zone)
    if fetched_at is None:
        return _insufficient(
            "Horário de atualização da previsão não disponível.",
            product=product,
            missing=["fetched_at"],
        )
    current_utc = current_time.astimezone(dt_timezone.utc)
    age = current_utc - fetched_at.astimezone(dt_timezone.utc)
    if age < -MAX_CLOCK_SKEW or age > MAX_WEATHER_AGE:
        return _insufficient(
            "A previsão salva está desatualizada; atualize os dados meteorológicos antes de decidir.",
            product=product,
            missing=["previsão atualizada"],
        )

    hourly = weather.get("hourly")
    timestamps = hourly.get("timestamps") if isinstance(hourly, dict) else None
    values = hourly.get("values") if isinstance(hourly, dict) else None
    if not isinstance(timestamps, list) or not timestamps or not isinstance(values, dict):
        return _insufficient(
            "A previsão horária necessária não está disponível.",
            product=product,
            missing=["previsão horária"],
        )

    parsed_times = [_parse_time(value, zone) for value in timestamps]
    invalid_times = [index for index, value in enumerate(parsed_times) if value is None]
    missing_fields = [
        WEATHER_FIELDS[field]
        for field in WEATHER_FIELDS
        if not isinstance(values.get(field), list) or len(values[field]) != len(timestamps)
    ]
    if invalid_times:
        missing_fields.append("horários válidos da previsão")

    rows = []
    for index, timestamp in enumerate(parsed_times):
        if (
            timestamp is None
            or timestamp.astimezone(dt_timezone.utc) + timedelta(hours=1) <= current_utc
        ):
            continue
        metrics = {}
        for field in WEATHER_FIELDS:
            series = values.get(field)
            metrics[field] = _number(series[index]) if isinstance(series, list) and index < len(series) else None
        rows.append((index, timestamp, metrics))

    if not rows:
        return _insufficient(
            "Não há horários futuros disponíveis no horizonte atual da previsão.",
            product=product,
            missing=["horários futuros"],
        )

    windows = []
    for index, timestamp, metrics in rows:
        missing = list(missing_fields)
        missing.extend(
            WEATHER_FIELDS[field]
            for field, value in metrics.items()
            if value is None and WEATHER_FIELDS[field] not in missing
        )
        rain_free_hours = int(rules.get("rain_free_hours") or 0)
        rain_period = []
        for offset in range(rain_free_hours + 1):
            future_index = index + offset
            if future_index >= len(timestamps):
                missing.append("previsão cobrindo todo o intervalo sem chuva exigido")
                break
            amount_series = values.get("precipitation")
            probability_series = values.get("precipitation_probability")
            amount = _number(amount_series[future_index]) if isinstance(amount_series, list) and future_index < len(amount_series) else None
            probability = _number(probability_series[future_index]) if isinstance(probability_series, list) and future_index < len(probability_series) else None
            if amount is None or probability is None:
                missing.append("precipitação durante o intervalo sem chuva")
                break
            rain_period.append((amount, probability))

        risks = []
        favorable_factors = []
        restrictions = []
        if missing:
            classification = "insufficient"
        else:
            if rules["max_wind_speed"] is not None and metrics["wind_speed_10m"] > rules["max_wind_speed"]:
                restrictions.append("Velocidade do vento acima do limite informado na bula.")
            if rules["max_wind_gusts"] is not None and metrics["wind_gusts_10m"] > rules["max_wind_gusts"]:
                restrictions.append("Rajadas acima do limite informado na bula.")
            if rules["min_temperature"] is not None and metrics["temperature_2m"] < rules["min_temperature"]:
                restrictions.append("Temperatura abaixo do limite informado na bula.")
            if rules["max_temperature"] is not None and metrics["temperature_2m"] > rules["max_temperature"]:
                restrictions.append("Temperatura acima do limite informado na bula.")
            if rules["min_relative_humidity"] is not None and metrics["relative_humidity_2m"] < rules["min_relative_humidity"]:
                restrictions.append("Umidade relativa abaixo do limite informado na bula.")
            if rules["max_relative_humidity"] is not None and metrics["relative_humidity_2m"] > rules["max_relative_humidity"]:
                restrictions.append("Umidade relativa acima do limite informado na bula.")

            if any(amount > 0 for amount, _ in rain_period):
                restrictions.append("Precipitação prevista durante o período analisado.")
            if restrictions:
                classification = "unfavorable"
            else:
                if rules["max_wind_speed"] is not None:
                    favorable_factors.append("Vento dentro do limite informado na bula.")
                if rules["max_wind_gusts"] is not None:
                    favorable_factors.append("Rajadas dentro do limite informado na bula.")
                if rules["min_temperature"] is not None or rules["max_temperature"] is not None:
                    favorable_factors.append("Temperatura dentro dos limites informados na bula.")
                if rules["min_relative_humidity"] is not None or rules["max_relative_humidity"] is not None:
                    favorable_factors.append("Umidade relativa dentro dos limites informados na bula.")
                if any(probability > 0 for _, probability in rain_period):
                    risks.append("Há probabilidade de chuva durante o período sem chuva exigido; a previsão não confirma precipitação.")
                if not any(amount > 0 or probability > 0 for amount, probability in rain_period):
                    favorable_factors.append("Sem precipitação ou probabilidade de chuva no intervalo analisado.")
                classification = "attention" if risks else "favorable"
                unspecified = [
                    field for field, rule in (
                        ("vento", rules["max_wind_speed"]),
                        ("rajadas", rules["max_wind_gusts"]),
                        ("temperatura", rules["min_temperature"] is not None or rules["max_temperature"] is not None),
                        ("umidade", rules["min_relative_humidity"] is not None or rules["max_relative_humidity"] is not None),
                    )
                    if rule is None or rule is False
                ]
                if unspecified:
                    risks.append(
                        "Sem limite específico informado na bula para: " + ", ".join(unspecified) + "."
                    )
                    if classification == "favorable":
                        classification = "attention"

        windows.append({
            "date": timestamp.date().isoformat(),
            "start": timestamp.isoformat(),
            "end": (
                timestamp.astimezone(dt_timezone.utc) + timedelta(hours=1)
            ).astimezone(zone).isoformat(),
            "classification": classification,
            "metrics": metrics,
            "favorable_factors": favorable_factors,
            "risks": risks,
            "restrictions": restrictions,
            "missing": sorted(set(missing)),
        })

    rank = {"favorable": 0, "attention": 1, "unfavorable": 2, "insufficient": 3}
    days = {}
    for window in windows:
        day = days.setdefault(window["date"], {"date": window["date"], "windows": [], "classification": "insufficient"})
        day["windows"].append(window)
        if rank[window["classification"]] < rank[day["classification"]]:
            day["classification"] = window["classification"]

    for day in days.values():
        day["windows"].sort(key=lambda item: item["start"])

    next_opportunity = next(
        (window for window in windows if window["classification"] == "favorable"),
        None,
    )
    classifications = [window["classification"] for window in windows]
    if "favorable" in classifications:
        overall = "favorable"
    elif "attention" in classifications:
        overall = "attention"
    elif "unfavorable" in classifications:
        overall = "unfavorable"
    else:
        overall = "insufficient"

    return {
        "operation": "FITOSSANITARIA",
        "product": rules["product"],
        "classification": overall,
        "message": (
            "A previsão e os limites declarados da bula não apontam restrições para pelo menos um horário."
            if next_opportunity
            else "Não foi encontrada uma janela favorável completa neste horizonte."
        ),
        "source": weather.get("source", "Open-Meteo"),
        "fetched_at": fetched_at.isoformat(),
        "timezone": timezone_name,
        "age_minutes": max(0, int(age.total_seconds() // 60)),
        "forecast_start": rows[0][1].isoformat(),
        "forecast_end": (
            rows[-1][1].astimezone(dt_timezone.utc) + timedelta(hours=1)
        ).astimezone(zone).isoformat(),
        "confidence": "high" if all(not item["missing"] for item in windows) else "limited",
        "missing": sorted(set(missing_fields)),
        "windows": windows,
        "days": list(days.values()),
        "next_opportunity": next_opportunity,
    }
