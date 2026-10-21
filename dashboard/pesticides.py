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
OPERATIONAL_SCREENING_CRITERIA = {
    "maximum_wind_speed_kmh": 15,
    "maximum_wind_gust_kmh": 20,
    "rain_probability_caution_percent": 30,
    "rain_probability_unfavorable_percent": 60,
    "minimum_window_hours": 2,
    "rain_lookahead_hours": 2,
    "temperature_caution_below_c": 10,
    "temperature_caution_above_c": 32,
    "relative_humidity_caution_below_percent": 30,
    "relative_humidity_caution_above_percent": 95,
}


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


def weather_selection_score(weather, *, now=None):
    if not isinstance(weather, dict):
        return (0, 0, 0, 0)

    try:
        zone = ZoneInfo(weather.get("timezone"))
    except (TypeError, ValueError, ZoneInfoNotFoundError):
        return (0, 0, 0, 0)

    fetched_at = _parse_time(weather.get("fetched_at"), zone)
    current_time = now or datetime.now(zone)
    if fetched_at is None:
        return (0, 0, 0, 0)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=zone)
    else:
        current_time = current_time.astimezone(zone)

    age = current_time.astimezone(dt_timezone.utc) - fetched_at.astimezone(dt_timezone.utc)
    fresh = -MAX_CLOCK_SKEW <= age <= MAX_WEATHER_AGE
    hourly = weather.get("hourly")
    timestamps = hourly.get("timestamps") if isinstance(hourly, dict) else None
    values = hourly.get("values") if isinstance(hourly, dict) else None
    if not isinstance(timestamps, list) or not isinstance(values, dict):
        return (int(fresh), 0, 0, -int(age.total_seconds() // 60))

    aligned_fields = sum(
        isinstance(values.get(field), list) and len(values[field]) == len(timestamps)
        for field in WEATHER_FIELDS
    )
    parsed_times = [_parse_time(value, zone) for value in timestamps]
    future_rows = [
        index
        for index, timestamp in enumerate(parsed_times)
        if timestamp is not None
        and timestamp.astimezone(dt_timezone.utc) + timedelta(hours=1)
        > current_time.astimezone(dt_timezone.utc)
    ]
    complete_rows = sum(
        all(
            isinstance(values.get(field), list)
            and index < len(values[field])
            and _number(values[field][index]) is not None
            for field in WEATHER_FIELDS
        )
        for index in future_rows
    )
    complete_forecast = (
        bool(future_rows)
        and all(timestamp is not None for timestamp in parsed_times)
        and aligned_fields == len(WEATHER_FIELDS)
        and complete_rows == len(future_rows)
    )
    return (
        int(fresh),
        int(fresh and complete_forecast),
        complete_rows,
        -max(0, int(age.total_seconds() // 60)),
    )


def evaluate_meteorological_windows(weather, *, now=None):
    """Screen hourly weather using documented operational criteria, not product-label limits."""
    if not isinstance(weather, dict):
        return _insufficient("Não há previsão meteorológica salva para este talhão.")

    timezone_name = weather.get("timezone")
    try:
        zone = ZoneInfo(timezone_name)
    except (TypeError, ValueError, ZoneInfoNotFoundError):
        return _insufficient("Fuso horário da previsão ausente ou inválido.", missing=["timezone"])

    fetched_at = _parse_time(weather.get("fetched_at"), zone)
    current_time = now or datetime.now(zone)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=zone)
    else:
        current_time = current_time.astimezone(zone)
    if fetched_at is None:
        return _insufficient("Horário da atualização meteorológica não disponível.", missing=["fetched_at"])
    age = current_time.astimezone(dt_timezone.utc) - fetched_at.astimezone(dt_timezone.utc)
    if age < -MAX_CLOCK_SKEW or age > MAX_WEATHER_AGE:
        return _insufficient(
            "A previsão salva está desatualizada; atualize os dados meteorológicos.",
            missing=["previsão atualizada"],
        )

    hourly = weather.get("hourly")
    timestamps = hourly.get("timestamps") if isinstance(hourly, dict) else None
    values = hourly.get("values") if isinstance(hourly, dict) else None
    if not isinstance(timestamps, list) or not timestamps or not isinstance(values, dict):
        return _insufficient("A previsão horária necessária não está disponível.", missing=["previsão horária"])

    parsed_times = [_parse_time(value, zone) for value in timestamps]
    rows = []
    missing_fields = []
    for field, label in WEATHER_FIELDS.items():
        series = values.get(field)
        if not isinstance(series, list) or len(series) != len(timestamps):
            missing_fields.append(label)
    for index, timestamp in enumerate(parsed_times):
        if timestamp is None or timestamp.astimezone(dt_timezone.utc) + timedelta(hours=1) <= current_time.astimezone(dt_timezone.utc):
            continue
        metrics = {
            field: _number(values[field][index])
            if isinstance(values.get(field), list) and index < len(values[field])
            else None
            for field in WEATHER_FIELDS
        }
        for field in ("apparent_temperature", "weather_code"):
            series = values.get(field)
            metrics[field] = _number(series[index]) if isinstance(series, list) and index < len(series) else None
        missing = [
            WEATHER_FIELDS[field]
            for field in WEATHER_FIELDS
            if metrics[field] is None
        ]
        reasons = []
        alerts = []
        classification = "insufficient" if missing or missing_fields else "favorable"

        if classification != "insufficient":
            if metrics["wind_speed_10m"] > OPERATIONAL_SCREENING_CRITERIA["maximum_wind_speed_kmh"]:
                classification = "unfavorable"
                alerts.append("Vento acima do critério operacional de triagem.")
            if metrics["wind_gusts_10m"] > OPERATIONAL_SCREENING_CRITERIA["maximum_wind_gust_kmh"]:
                classification = "unfavorable"
                alerts.append("Rajadas acima do critério operacional de triagem.")

            rain_unknown = False
            rain_volume = False
            rain_probability = 0
            for offset in range(OPERATIONAL_SCREENING_CRITERIA["rain_lookahead_hours"] + 1):
                future_index = index + offset
                if future_index >= len(timestamps):
                    rain_unknown = True
                    break
                amount_series = values.get("precipitation")
                probability_series = values.get("precipitation_probability")
                amount = _number(amount_series[future_index]) if isinstance(amount_series, list) and future_index < len(amount_series) else None
                probability = _number(probability_series[future_index]) if isinstance(probability_series, list) and future_index < len(probability_series) else None
                if amount is None or probability is None:
                    rain_unknown = True
                    break
                rain_volume = rain_volume or amount > 0
                rain_probability = max(rain_probability, probability)
            if rain_unknown:
                classification = "insufficient"
                missing.append("precipitação durante o período de análise")
            elif rain_volume or rain_probability >= OPERATIONAL_SCREENING_CRITERIA["rain_probability_unfavorable_percent"]:
                classification = "unfavorable"
                alerts.append("Há precipitação ou alta probabilidade de chuva durante/depois do horário.")
            elif rain_probability >= OPERATIONAL_SCREENING_CRITERIA["rain_probability_caution_percent"]:
                if classification == "favorable":
                    classification = "attention"
                alerts.append("Probabilidade de chuva exige cautela.")

            temperature = metrics["temperature_2m"]
            if (
                temperature < OPERATIONAL_SCREENING_CRITERIA["temperature_caution_below_c"]
                or temperature > OPERATIONAL_SCREENING_CRITERIA["temperature_caution_above_c"]
            ):
                if classification == "favorable":
                    classification = "attention"
                alerts.append("Temperatura fora da faixa operacional de triagem.")
            if metrics["relative_humidity_2m"] < OPERATIONAL_SCREENING_CRITERIA["relative_humidity_caution_below_percent"]:
                if classification == "favorable":
                    classification = "attention"
                alerts.append("Umidade relativa baixa; há maior potencial de evaporação.")
            elif metrics["relative_humidity_2m"] > OPERATIONAL_SCREENING_CRITERIA["relative_humidity_caution_above_percent"]:
                if classification == "favorable":
                    classification = "attention"
                alerts.append("Umidade relativa muito alta; considere o risco de molhamento persistente.")
            if not alerts:
                reasons.append("Variáveis meteorológicas disponíveis dentro dos critérios operacionais de triagem.")

        rows.append({
            "date": timestamp.date().isoformat(),
            "start": timestamp.isoformat(),
            "end": (timestamp.astimezone(dt_timezone.utc) + timedelta(hours=1)).astimezone(zone).isoformat(),
            "classification": classification,
            "metrics": metrics,
            "reasons": reasons,
            "alerts": alerts,
            "missing": sorted(set(missing)),
        })

    if not rows:
        return _insufficient("Não há horários futuros disponíveis no horizonte atual.", missing=["horários futuros"])

    # A single favorable hour is too short to present as a usable operation window.
    index = 0
    while index < len(rows):
        end_index = index + 1
        while (
            end_index < len(rows)
            and rows[end_index]["classification"] == rows[index]["classification"]
            and rows[end_index - 1]["end"] == rows[end_index]["start"]
        ):
            end_index += 1
        if (
            rows[index]["classification"] == "favorable"
            and end_index - index < OPERATIONAL_SCREENING_CRITERIA["minimum_window_hours"]
        ):
            for row in rows[index:end_index]:
                row["classification"] = "attention"
                row["alerts"].append("Período favorável mais curto que a duração mínima de planejamento (2 horas).")
                row["reasons"] = []
        index = end_index

    windows = []
    index = 0
    while index < len(rows):
        end_index = index + 1
        while (
            end_index < len(rows)
            and rows[end_index]["classification"] == rows[index]["classification"]
            and rows[end_index - 1]["end"] == rows[end_index]["start"]
        ):
            end_index += 1
        grouped = rows[index:end_index]
        windows.append({
            "date": grouped[0]["date"],
            "start": grouped[0]["start"],
            "end": grouped[-1]["end"],
            "duration_hours": len(grouped),
            "classification": grouped[0]["classification"],
            "hours": grouped,
            "reasons": sorted({reason for row in grouped for reason in row["reasons"]}),
            "alerts": sorted({alert for row in grouped for alert in row["alerts"]}),
            "missing": sorted({item for row in grouped for item in row["missing"]}),
        })
        index = end_index

    favorable = [window for window in windows if window["classification"] == "favorable"]
    has_sufficient_rows = not missing_fields and all(not row["missing"] for row in rows)
    return {
        "operation": "FITOSSANITARIA",
        "classification": (
            "favorable" if favorable else
            "attention" if any(window["classification"] == "attention" for window in windows) else
            "unfavorable" if any(window["classification"] == "unfavorable" for window in windows) else
            "insufficient"
        ),
        "message": (
            "Classificação meteorológica operacional; confirme a bula e as condições reais da aplicação."
            if favorable else
            "Nenhuma janela favorável com duração mínima foi encontrada na previsão."
        ),
        "source": weather.get("source", "Open-Meteo"),
        "fetched_at": fetched_at.isoformat(),
        "timezone": timezone_name,
        "age_minutes": max(0, int(age.total_seconds() // 60)),
        "forecast_start": rows[0]["start"],
        "forecast_end": rows[-1]["end"],
        "confidence": "high" if has_sufficient_rows else "limited",
        "missing": sorted(set(missing_fields)),
        "criteria": OPERATIONAL_SCREENING_CRITERIA,
        "minimum_window_hours": OPERATIONAL_SCREENING_CRITERIA["minimum_window_hours"],
        "windows": windows,
        "hours": rows,
        "next_opportunity": favorable[0] if favorable else None,
        "recommendation_notice": "Esta análise é meteorológica e não substitui a verificação da bula nem a avaliação das condições reais da operação.",
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
