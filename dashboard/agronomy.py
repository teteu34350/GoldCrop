from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


OPERATIONS = {
    "ADUBACAO": "Janela de Adubação",
    "FITOSSANITARIA": "Janela Fitossanitária",
    "PLANTIO": "Janela de Plantio",
    "MECANIZADA": "Janela de Operações Agrícolas",
}

COMMON_SOURCE = (
    "Previsão horária Open-Meteo no centro aproximado do talhão; não substitui "
    "medições locais nem a avaliação de um profissional."
)


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def _series(hourly, name):
    values = hourly.get(name)
    return values if isinstance(values, list) else None


def _as_number(series, index):
    if series is None or index >= len(series):
        return None
    return _number(series[index])


def _local_times(hourly, timezone_name):
    time_values = hourly.get("time")
    if not isinstance(time_values, list):
        return []
    try:
        tz = ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, TypeError):
        return []
    parsed = []
    for value in time_values:
        if not isinstance(value, str):
            parsed.append(None)
            continue
        try:
            parsed.append(datetime.fromisoformat(value).replace(tzinfo=tz))
        except ValueError:
            parsed.append(None)
    return parsed


def _metric(series, index, name):
    value = _as_number(series, index)
    return {"value": value, "unit": name} if value is not None else None


def _requirements_missing(operation, plot, criteria):
    missing = []
    if not plot.get("cultura"):
        missing.append("cultura do talhão")
    if operation == "ADUBACAO":
        if not criteria.get("produto"):
            missing.append("fonte/nome do fertilizante")
        if not criteria.get("metodo_aplicacao"):
            missing.append("forma de aplicação do fertilizante")
        if _number(criteria.get("max_chuva_24h_mm")) is None:
            missing.append("limite de chuva em 24 h definido para este fertilizante e método")
        if _number(criteria.get("temperatura_max_c")) is None:
            missing.append("limite de temperatura definido para este fertilizante e método")
    elif operation == "FITOSSANITARIA":
        if not criteria.get("produto"):
            missing.append("produto defensivo")
        if not criteria.get("metodo_aplicacao"):
            missing.append("método de aplicação")
        if criteria.get("rotulo_confirmado") is not True:
            missing.append("confirmação de consulta ao rótulo e à bula vigentes")
        if criteria.get("limites_rotulo_completos") is not True:
            missing.append("confirmação de que todas as restrições meteorológicas aplicáveis do rótulo/bula foram informadas")
        if not str(criteria.get("fonte_referencia", "")).strip():
            missing.append("identificação da fonte do rótulo/bula consultada")
        verified_on = criteria.get("data_verificacao")
        if not isinstance(verified_on, str):
            missing.append("data de verificação do rótulo/bula")
        else:
            try:
                datetime.strptime(verified_on, "%Y-%m-%d")
            except ValueError:
                missing.append("data de verificação válida do rótulo/bula")
        if _number(criteria.get("intervalo_sem_chuva_h")) is None:
            missing.append("intervalo sem chuva indicado no rótulo/bula")
        limits = criteria.get("limites_rotulo")
        accepted_limits = {
            "vento_max_kmh", "rajada_max_kmh", "temperatura_min_c",
            "temperatura_max_c", "umidade_min_pct", "umidade_max_pct",
        }
        if not isinstance(limits, dict) or not any(
            key in accepted_limits and _number(value) is not None
            for key, value in limits.items()
        ):
            missing.append("restrições meteorológicas aplicáveis transcritas do rótulo/bula")
    elif operation == "PLANTIO":
        if not plot.get("tipo_solo"):
            missing.append("tipo de solo cadastrado no talhão")
        if not criteria.get("estagio"):
            missing.append("estágio ou época de plantio")
        if not criteria.get("drenagem"):
            missing.append("condição de drenagem observada no talhão")
        if _number(criteria.get("temperatura_solo_min_c")) is None or _number(criteria.get("temperatura_solo_max_c")) is None:
            missing.append("faixa de temperatura do solo validada para esta cultura e estágio")
        if (
            _number(criteria.get("umidade_solo_min_m3m3")) is None
            and _number(criteria.get("chuva_min_24h_mm")) is None
        ):
            missing.append("critério de água no solo ou chuva mínima, validado para a cultura")
    elif operation == "MECANIZADA":
        if not criteria.get("tipo_operacao"):
            missing.append("tipo de operação mecanizada")
        if not plot.get("tipo_solo"):
            missing.append("tipo de solo do talhão")
        if _number(criteria.get("max_chuva_24h_mm")) is None:
            missing.append("limite de chuva antecedente definido para a operação e o solo")
        if criteria.get("condicao_trafegabilidade") not in {"trafegavel", "nao_trafegavel"}:
            missing.append("avaliação atual de trafegabilidade feita no campo")
        if criteria.get("relevo") not in {"plano", "ondulado", "declivoso"}:
            missing.append("relevo do talhão")
    return missing


def _validate_criteria(operation, criteria):
    nonnegative = (
        "max_chuva_24h_mm", "intervalo_sem_chuva_h",
        "chuva_min_24h_mm", "max_chuva_recente_24h_mm", "max_umidade_solo_m3m3",
    )
    for name in nonnegative:
        value = _number(criteria.get(name))
        if name in criteria and (value is None or value < 0):
            raise ValueError(f"Informe um valor não negativo válido para {name}.")
    if "intervalo_sem_chuva_h" in criteria:
        value = _number(criteria["intervalo_sem_chuva_h"])
        if value is not None and (not value.is_integer() or value > 168):
            raise ValueError("O intervalo sem chuva deve ser um número inteiro entre 0 e 168 horas.")
    limit_groups = [criteria.get("limites_rotulo", {})] if operation == "FITOSSANITARIA" else []
    for limits in limit_groups:
        if not isinstance(limits, dict):
            raise ValueError("Informe as restrições meteorológicas em formato válido.")
        for name, value in limits.items():
            if _number(value) is None:
                raise ValueError(f"Informe um valor numérico válido para {name}.")
        if _number(limits.get("temperatura_min_c")) is not None and _number(limits.get("temperatura_max_c")) is not None:
            if _number(limits["temperatura_min_c"]) > _number(limits["temperatura_max_c"]):
                raise ValueError("A temperatura mínima não pode exceder a máxima.")
        if _number(limits.get("umidade_min_pct")) is not None and _number(limits.get("umidade_max_pct")) is not None:
            if _number(limits["umidade_min_pct"]) > _number(limits["umidade_max_pct"]):
                raise ValueError("A umidade mínima não pode exceder a máxima.")
        for name in ("vento_max_kmh", "rajada_max_kmh"):
            value = _number(limits.get(name))
            if value is not None and value < 0:
                raise ValueError(f"{name} não pode ser negativo.")
    for lower_name, upper_name in (
        ("umidade_solo_min_m3m3", "umidade_solo_max_m3m3"),
        ("temperatura_solo_min_c", "temperatura_solo_max_c"),
    ):
        lower = _number(criteria.get(lower_name))
        upper = _number(criteria.get(upper_name))
        if (lower_name in criteria and lower is None) or (upper_name in criteria and upper is None):
            raise ValueError("Informe limites numéricos válidos para a faixa do solo.")
        if lower is not None and upper is not None and lower > upper:
            raise ValueError("O limite mínimo não pode exceder o limite máximo.")
    for name in ("umidade_solo_min_m3m3", "umidade_solo_max_m3m3", "max_umidade_solo_m3m3"):
        value = _number(criteria.get(name))
        if value is not None and not 0 <= value <= 1:
            raise ValueError(f"{name} deve estar entre 0 e 1 m³/m³.")
    for name in ("umidade_min_pct", "umidade_max_pct"):
        value = _number((criteria.get("limites_rotulo") or {}).get(name))
        if value is not None and not 0 <= value <= 100:
            raise ValueError(f"{name} deve estar entre 0 e 100%.")


def _metrics_at(hourly, index):
    return {
        "temperatura_c": _as_number(_series(hourly, "temperature_2m"), index),
        "umidade_relativa_pct": _as_number(_series(hourly, "relative_humidity_2m"), index),
        "ponto_orvalho_c": _as_number(_series(hourly, "dew_point_2m"), index),
        "precipitacao_mm": _as_number(_series(hourly, "precipitation"), index),
        "probabilidade_chuva_pct": _as_number(_series(hourly, "precipitation_probability"), index),
        "vento_kmh": _as_number(_series(hourly, "wind_speed_10m"), index),
        "rajada_kmh": _as_number(_series(hourly, "wind_gusts_10m"), index),
        "direcao_vento_graus": _as_number(_series(hourly, "wind_direction_10m"), index),
        "et0_mm": _as_number(_series(hourly, "et0_fao_evapotranspiration"), index),
        "radiacao_solar_wm2": _as_number(_series(hourly, "shortwave_radiation"), index),
        "temperatura_solo_6cm_c": _as_number(_series(hourly, "soil_temperature_6cm"), index),
        "temperatura_solo_18cm_c": _as_number(_series(hourly, "soil_temperature_18cm"), index),
        "umidade_solo_3_9cm_m3m3": _as_number(_series(hourly, "soil_moisture_3_to_9cm"), index),
        "umidade_solo_9_27cm_m3m3": _as_number(_series(hourly, "soil_moisture_9_to_27cm"), index),
        "duracao_insolacao_s": _as_number(_series(hourly, "sunshine_duration"), index),
    }


def _next_precipitation(hourly, index, hours):
    values = _series(hourly, "precipitation")
    if values is None or index + hours > len(values):
        return None
    amounts = [_number(value) for value in values[index:index + hours]]
    if any(value is None for value in amounts):
        return None
    return sum(amounts)


def _rolling_precipitation(hourly, index, hours):
    values = _series(hourly, "precipitation")
    if values is None or index - hours + 1 < 0:
        return None
    amounts = [_number(value) for value in values[index - hours + 1:index + 1]]
    if any(value is None for value in amounts):
        return None
    return sum(amounts)


def _evaluate_slot(operation, index, hourly, criteria, plot):
    metrics = _metrics_at(hourly, index)
    factors = []
    risks = []
    required_weather = {
        "ADUBACAO": ("precipitacao_mm", "temperatura_c"),
        "FITOSSANITARIA": (
            "temperatura_c", "umidade_relativa_pct", "precipitacao_mm",
            "vento_kmh", "rajada_kmh",
        ),
        "PLANTIO": ("temperatura_solo_6cm_c",),
        "MECANIZADA": ("precipitacao_mm",),
    }[operation]
    absent = [name for name in required_weather if metrics[name] is None]
    if absent:
        names = {
            "temperatura_c": "temperatura do ar",
            "umidade_relativa_pct": "umidade relativa",
            "precipitacao_mm": "precipitação",
            "vento_kmh": "velocidade do vento",
            "rajada_kmh": "rajadas de vento",
            "temperatura_solo_6cm_c": "estimativa da temperatura do solo a 6 cm",
        }
        missing_labels = ", ".join(names.get(name, name) for name in absent)
        return "DADOS_INSUFICIENTES", factors, [f"Previsão horária sem: {missing_labels}."], metrics

    if operation == "FITOSSANITARIA":
        limit_names = {
            "vento_max_kmh": ("vento_kmh", "max", "km/h"),
            "rajada_max_kmh": ("rajada_kmh", "max", "km/h"),
            "temperatura_min_c": ("temperatura_c", "min", "°C"),
            "temperatura_max_c": ("temperatura_c", "max", "°C"),
            "umidade_min_pct": ("umidade_relativa_pct", "min", "%"),
            "umidade_max_pct": ("umidade_relativa_pct", "max", "%"),
        }
        attention = False
        for limit_name, (metric_name, direction, unit) in limit_names.items():
            limit = _number((criteria.get("limites_rotulo") or {}).get(limit_name))
            actual = metrics[metric_name]
            if limit is None:
                continue
            if actual is None:
                risks.append(f"Sem valor previsto para validar {limit_name} do rótulo.")
            elif (direction == "max" and actual > limit) or (direction == "min" and actual < limit):
                risks.append(f"{metric_name} {actual:g}{unit} viola o limite do rótulo ({limit:g}{unit}).")
            else:
                factors.append(f"{metric_name} {actual:g}{unit} dentro do limite informado no rótulo.")
                attention = attention or actual == limit
        rain_free_hours = int(_number(criteria.get("intervalo_sem_chuva_h")) or 0)
        rain_after = _next_precipitation(hourly, index, rain_free_hours + 1)
        if rain_after is None:
            risks.append("Previsão incompleta para cobrir o intervalo sem chuva do rótulo.")
        elif rain_after > 0:
            risks.append(f"Previsão de {rain_after:g} mm durante a aplicação e o intervalo sem chuva indicado no rótulo.")
        else:
            factors.append("Sem precipitação prevista durante a aplicação e o intervalo sem chuva informado.")
        if any("Sem valor previsto" in item or "incompleta" in item for item in risks):
            return "DADOS_INSUFICIENTES", factors, risks, metrics
        if risks:
            return "DESFAVORAVEL", factors, risks, metrics
        return "ATENCAO" if attention else "FAVORAVEL", factors, risks, metrics

    if operation == "ADUBACAO":
        limits = {
            "max_chuva_24h_mm": ("precipitacao_mm", "max", "mm"),
            "temperatura_max_c": ("temperatura_c", "max", "°C"),
            "temperatura_min_c": ("temperatura_c", "min", "°C"),
        }
        attention = False
        for limit_name, (metric_name, direction, unit) in limits.items():
            limit = _number(criteria.get(limit_name))
            if limit is None:
                continue
            actual = _next_precipitation(hourly, index, 24) if limit_name == "max_chuva_24h_mm" else metrics[metric_name]
            if actual is None:
                risks.append(f"Sem previsão suficiente para avaliar {limit_name}.")
            elif (direction == "max" and actual > limit) or (direction == "min" and actual < limit):
                risks.append(f"{limit_name} informado para este produto/método foi excedido ({actual:g}{unit}; limite {limit:g}{unit}).")
            else:
                factors.append(f"{limit_name} informado para este produto/método foi atendido.")
                attention = attention or actual == limit
        soil_min = _number(criteria.get("umidade_solo_min_m3m3"))
        soil_max = _number(criteria.get("umidade_solo_max_m3m3"))
        soil_value = metrics["umidade_solo_3_9cm_m3m3"]
        if soil_min is not None or soil_max is not None:
            if soil_value is None:
                risks.append("Sem estimativa de umidade do solo na camada 3–9 cm para avaliar a faixa informada.")
            elif (soil_min is not None and soil_value < soil_min) or (soil_max is not None and soil_value > soil_max):
                risks.append("Estimativa modelada de umidade do solo fora da faixa informada.")
            else:
                factors.append("Estimativa modelada de umidade do solo dentro da faixa informada.")
        if any("Sem " in item for item in risks):
            return "DADOS_INSUFICIENTES", factors, risks, metrics
        if risks:
            return "DESFAVORAVEL", factors, risks, metrics
        return "ATENCAO" if attention else "FAVORAVEL", factors, risks, metrics

    if operation == "PLANTIO":
        soil_temp = metrics["temperatura_solo_6cm_c"]
        lower = _number(criteria.get("temperatura_solo_min_c"))
        upper = _number(criteria.get("temperatura_solo_max_c"))
        attention = False
        if soil_temp is None:
            risks.append("Temperatura do solo estimada indisponível.")
        elif soil_temp < lower or soil_temp > upper:
            risks.append(f"Temperatura do solo estimada ({soil_temp:g} °C) fora da faixa informada ({lower:g}–{upper:g} °C).")
        else:
            factors.append("Temperatura do solo estimada dentro da faixa informada para cultura e estágio.")
            attention = soil_temp in (lower, upper)
        moisture_min = _number(criteria.get("umidade_solo_min_m3m3"))
        if moisture_min is not None:
            moisture = metrics["umidade_solo_3_9cm_m3m3"]
            if moisture is None:
                risks.append("Estimativa de umidade do solo indisponível.")
            elif moisture < moisture_min:
                risks.append("Estimativa de umidade do solo abaixo do mínimo informado.")
            else:
                factors.append("Estimativa modelada de umidade do solo atende ao mínimo informado.")
        rainfall_min = _number(criteria.get("chuva_min_24h_mm"))
        if rainfall_min is not None:
            rain = _next_precipitation(hourly, index, 24)
            if rain is None:
                risks.append("Previsão incompleta para avaliar a chuva acumulada em 24 h.")
            elif rain < rainfall_min:
                risks.append(f"Precipitação prevista em 24 h ({rain:g} mm) abaixo do mínimo informado ({rainfall_min:g} mm).")
            else:
                factors.append("Precipitação prevista em 24 h atende ao mínimo informado.")
        recent_rain_max = _number(criteria.get("max_chuva_recente_24h_mm"))
        if recent_rain_max is not None:
            recent_rain = _rolling_precipitation(hourly, index - 1, 24)
            if recent_rain is None:
                risks.append("Histórico horário incompleto para avaliar a chuva recente em 24 h.")
            elif recent_rain > recent_rain_max:
                risks.append(f"Chuva recente de 24 h ({recent_rain:g} mm) acima do limite informado ({recent_rain_max:g} mm).")
            else:
                factors.append("Chuva recente de 24 h dentro do limite informado.")
        if any("indisponível" in item or "incompleta" in item for item in risks):
            return "DADOS_INSUFICIENTES", factors, risks, metrics
        if risks:
            return "DESFAVORAVEL", factors, risks, metrics
        return "ATENCAO" if attention else "FAVORAVEL", factors, risks, metrics

    if operation == "MECANIZADA":
        if criteria["condicao_trafegabilidade"] == "nao_trafegavel":
            risks.append("O produtor informou que o talhão não está trafegável; não agendar tráfego de máquinas.")
            return "DESFAVORAVEL", factors, risks, metrics
        rain = _rolling_precipitation(hourly, index - 1, 24)
        maximum = _number(criteria.get("max_chuva_24h_mm"))
        if rain is None:
            risks.append("Sem histórico horário completo para calcular a chuva antecedente em 24 h.")
            return "DADOS_INSUFICIENTES", factors, risks, metrics
        if rain > maximum:
            risks.append(f"Chuva antecedente de 24 h ({rain:g} mm) acima do limite informado ({maximum:g} mm).")
            return "DESFAVORAVEL", factors, risks, metrics
        factors.append("Chuva antecedente de 24 h dentro do limite informado para esta operação e solo.")
        factors.append("Trafegabilidade informada pelo produtor como adequada no momento da análise.")
        if criteria["relevo"] == "declivoso":
            risks.append("Relevo declivoso informado: confirme limite de inclinação e segurança do equipamento com o fabricante.")
            return "ATENCAO", factors, risks, metrics
        soil_max = _number(criteria.get("max_umidade_solo_m3m3"))
        soil_moisture = metrics["umidade_solo_3_9cm_m3m3"]
        if soil_max is not None:
            if soil_moisture is None:
                risks.append("Estimativa modelada de umidade do solo indisponível; tráfego não pode ser confirmado.")
                return "DADOS_INSUFICIENTES", factors, risks, metrics
            if soil_moisture > soil_max:
                risks.append("Estimativa modelada de umidade do solo acima do limite informado para a operação.")
                return "DESFAVORAVEL", factors, risks, metrics
        return "ATENCAO" if rain == maximum else "FAVORAVEL", factors, risks, metrics

    return "DADOS_INSUFICIENTES", factors, ["Tipo de operação não reconhecido."], metrics


def _merge_slots(slots):
    merged = []
    for slot in slots:
        if (
            merged
            and merged[-1]["fim"] == slot["inicio"]
            and merged[-1]["inicio"].date() == slot["inicio"].date()
            and merged[-1]["classificacao"] == slot["classificacao"]
            and merged[-1]["riscos"] == slot["riscos"]
        ):
            merged[-1]["fim"] = slot["inicio"] + timedelta(hours=1)
            merged[-1]["_metric_samples"].append(slot["metricas"])
            merged[-1]["fatores"] = list(dict.fromkeys(merged[-1]["fatores"] + slot["fatores"]))
            continue
        merged.append({
            **slot,
            "fim": slot["inicio"] + timedelta(hours=1),
            "_metric_samples": [slot["metricas"]],
            "fatores": slot["fatores"][:],
            "riscos": slot["riscos"][:],
        })
    for item in merged:
        samples = item.pop("_metric_samples")
        summary = {}
        ranges = {}
        for name in samples[0]:
            values = [sample[name] for sample in samples if sample[name] is not None]
            if not values:
                summary[name] = None
                continue
            summary[name] = sum(values) if name in {
                "precipitacao_mm", "et0_mm", "duracao_insolacao_s",
            } else sum(values) / len(values)
            ranges[name] = {"min": min(values), "max": max(values)}
        summary["faixas_no_intervalo"] = ranges
        item["metricas"] = summary
    return merged


def evaluate_operation(operation, plot, weather, criteria, now):
    if operation not in OPERATIONS:
        raise ValueError("Tipo de operação inválido.")
    if not isinstance(criteria, dict):
        raise ValueError("Os critérios da operação devem ser um objeto.")
    _validate_criteria(operation, criteria)
    hourly = weather.get("hourly", {}) if isinstance(weather, dict) else {}
    timezone_name = weather.get("timezone", "") if isinstance(weather, dict) else ""
    times = _local_times(hourly, timezone_name)
    missing = _requirements_missing(operation, plot, criteria)
    source_info = (weather.get("_goldcrop") or {}) if isinstance(weather, dict) else {}
    provenance = {
        "fonte": "Open-Meteo Forecast API",
        "origem_dado_solo": "estimativa meteorológica modelada; não é leitura de sensor",
        "coletado_em": source_info.get("fetched_at"),
        "fuso_horario": timezone_name or None,
        "periodo_historico_dias": source_info.get("past_days", 7),
        "horizonte_previsao_dias": source_info.get("forecast_days", 7),
        "confianca_meteorologica": (
            "Inconclusiva: faltam dados essenciais para as regras desta operação."
            if missing or not times else
            "Cobertura horária suficiente para as variáveis obrigatórias; isto não representa probabilidade de sucesso."
        ),
        "limites": [
            "Previsões pontuais não representam toda a variabilidade do talhão.",
            "Horizonte de até 7 dias; recomendações devem ser reavaliadas após atualização.",
            "Os 7 dias anteriores vêm do endpoint de previsão e não equivalem a observações de estação ou reanálise histórica.",
            "O nível de confiança descreve cobertura dos dados meteorológicos, não chance de sucesso.",
        ],
    }
    if missing or not times:
        reasons = [f"Informe: {', '.join(missing)}."] if missing else ["Fuso horário ou série horária ausente/inválida."]
        return {
            "windows": [{
                "inicio": now,
                "fim": now + timedelta(hours=1),
                "classificacao": "DADOS_INSUFICIENTES",
                "decisao": "DADOS_INSUFICIENTES",
                "fatores": [],
                "riscos": reasons,
                "metricas": {},
                "qualidade_dados": provenance,
                "confianca": 0,
                "justificativa": "Não há base suficiente para recomendar esta operação. " + " ".join(reasons),
            }],
            "proveniencia": provenance,
        }

    if operation == "FITOSSANITARIA":
        verified_on = datetime.strptime(criteria["data_verificacao"], "%Y-%m-%d").date()
        try:
            local_today = now.astimezone(ZoneInfo(timezone_name)).date()
        except (ZoneInfoNotFoundError, TypeError):
            local_today = now.date()
        if verified_on > local_today:
            raise ValueError("A data de verificação do rótulo/bula não pode estar no futuro.")

    candidate_slots = []
    for index, moment in enumerate(times):
        if moment is None or moment <= now.astimezone(moment.tzinfo):
            continue
        classification, factors, risks, metrics = _evaluate_slot(operation, index, hourly, criteria, plot)
        candidate_slots.append({
            "inicio": moment,
            "classificacao": classification,
            "decisao": classification,
            "fatores": factors,
            "riscos": risks,
            "metricas": metrics,
            "qualidade_dados": provenance,
        })

    if not candidate_slots:
        fallback = {
            "inicio": now,
            "fim": now + timedelta(hours=1),
            "classificacao": "DADOS_INSUFICIENTES",
            "decisao": "DADOS_INSUFICIENTES",
            "fatores": [],
            "riscos": ["Não há horários futuros disponíveis no horizonte carregado."],
            "metricas": {},
            "qualidade_dados": provenance,
        }
        grouped = [fallback]
    else:
        grouped = _merge_slots(candidate_slots)

    priority = {"FAVORAVEL": 0, "ATENCAO": 1, "DESFAVORAVEL": 2, "DADOS_INSUFICIENTES": 3}
    alternatives = sorted(grouped, key=lambda item: (priority.get(item["classificacao"], 4), item["inicio"]))
    results = []
    for item in alternatives[:12]:
        result = {
            **item,
            "confianca": None,
        }
        reason_parts = result["fatores"] + result["riscos"]
        result["justificativa"] = " ".join(reason_parts) or "Sem fatores suficientes para explicar a recomendação."
        results.append(result)
    return {"windows": results, "proveniencia": provenance}
