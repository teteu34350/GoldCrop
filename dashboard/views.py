import json
import re
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import ColetaMeteorologica, ExecucaoAplicacao, Fazenda, PerfilProdutor, PlanejamentoAplicacao, RecomendacaoJanela, SensorIoT, Talhao


def _json_body(request):
    try:
        return json.loads(request.body)
    except (TypeError, json.JSONDecodeError):
        return None


def _error(message, status=400, field_errors=None):
    data = {"ok": False, "message": message}
    if field_errors:
        data["field_errors"] = field_errors
    return JsonResponse(data, status=status)


def _protected_page(request, template):
    if not request.user.is_authenticated:
        return redirect(f"/login/?next={request.path}")
    perfil = getattr(request.user, "perfil", None)
    fazenda = request.user.fazendas.first()
    nome = perfil.nome_completo if perfil else request.user.get_full_name() or request.user.username
    return render(request, template, {"auth_user_data": {
        "name": nome,
        "initials": "".join(part[0] for part in nome.split()[:2]).upper(),
        "email": request.user.email,
        "phone": perfil.telefone if perfil else "",
        "role": "Produtor / Administrador",
        "farm": fazenda.nome if fazenda else "Sem fazenda cadastrada",
    }})


def home(request): return _protected_page(request, "dashboard.html")
def calendario_view(request): return _protected_page(request, "calendario.html")
def talhoes_view(request): return _protected_page(request, "talhoes.html")
def fazenda_view(request): return _protected_page(request, "fazenda.html")
def sensores_view(request): return _protected_page(request, "sensores.html")
def aplicacoes_view(request): return _protected_page(request, "aplicacoes.html")
def historico_view(request): return _protected_page(request, "historico.html")
def configuracoes_view(request): return _protected_page(request, "configuracoes.html")


def login_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard:dashboard")
    return render(request, "login.html")


def cadastro_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard:dashboard")
    return render(request, "cadastro.html")


def _current_farm(request):
    return request.user.fazendas.first()


def _parse_datetime(value):
    if not value:
        return timezone.now()
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed


def _parse_coordinate(value, maximum):
    raw = str(value).strip().upper().replace(" ", "")
    direction = raw[-1] if raw and raw[-1] in "NSEW" else ""
    if direction:
        raw = raw[:-1]
    if re.fullmatch(r"-?\d{6}", raw):
        sign = -1 if raw.startswith("-") or direction in "SW" or not direction else 1
        digits = raw.lstrip("-")
        degrees, minutes, seconds = int(digits[:2]), int(digits[2:4]), int(digits[4:])
        if minutes >= 60 or seconds >= 60:
            raise ValueError
        coordinate = Decimal(degrees) + Decimal(minutes) / 60 + Decimal(seconds) / 3600
        coordinate *= sign
    else:
        coordinate = Decimal(raw)
    if not -maximum <= coordinate <= maximum:
        raise ValueError
    return coordinate


def _talhao_json(talhao):
    return {
        "id": talhao.id, "name": talhao.nome,
        "area": float(talhao.area_hectares) if talhao.area_hectares is not None else None,
        "culture": talhao.cultura, "variety": talhao.variedade, "age": talhao.idade_anos,
        "soil": talhao.tipo_solo, "sensor": talhao.codigo_sensor, "latitude": float(talhao.latitude) if talhao.latitude is not None else None,
        "longitude": float(talhao.longitude) if talhao.longitude is not None else None, "radius": talhao.raio_metros,
    }


def _application_json(application):
    return {
        "id": application.id, "talhao": application.talhao.nome if application.talhao else "",
        "talhao_id": application.talhao_id,
        "product": application.produto, "qty": str(application.quantidade or ""),
        "date": application.data_aplicacao.strftime("%d/%m/%Y"), "status": application.status,
        "result": {
            ExecucaoAplicacao.Status.REALIZADA: "Realizado",
            ExecucaoAplicacao.Status.CANCELADA: "Cancelado",
            ExecucaoAplicacao.Status.CONFIRMADA: "Confirmado",
            ExecucaoAplicacao.Status.PLANEJADA: "Planejado",
        }.get(application.status, application.status),
        "ieaPrev": application.iea_previsto,
        "created_by": (
            application.criado_por.get_full_name() or application.criado_por.username
            if application.criado_por else ""
        ),
        "farm_id": application.fazenda_id,
    }


def _planejamento_json(planejamento):
    return {
        "id": planejamento.id,
        "talhao_id": planejamento.talhao_id,
        "talhao": planejamento.talhao.nome if planejamento.talhao else "",
        "produto": planejamento.produto,
        "tipo_aplicacao": planejamento.tipo_aplicacao,
        "dose": str(planejamento.dose) if planejamento.dose is not None else "",
        "unidade_dose": planejamento.unidade_dose,
        "data_planejada": planejamento.data_planejada.isoformat(),
        "horario_inicial": planejamento.horario_inicial.isoformat() if planejamento.horario_inicial else None,
        "horario_final": planejamento.horario_final.isoformat() if planejamento.horario_final else None,
        "responsavel": planejamento.responsavel,
        "status": planejamento.status,
        "recomendacao_id": planejamento.recomendacao_id,
        "observacoes": planejamento.observacoes,
    }


def _recommendation_json(recommendation):
    return {
        "id": recommendation.id, "talhao_id": recommendation.talhao_id,
        "date": recommendation.data.isoformat(),
        "windowStart": recommendation.inicio.isoformat(), "windowEnd": recommendation.fim.isoformat(),
        "adequacyIndex": recommendation.adequacao, "classification": recommendation.classificacao,
        "confidence": float(recommendation.confianca), "decision": recommendation.decisao,
        "factors": recommendation.fatores, "risks": recommendation.riscos,
        "dataQuality": recommendation.qualidade_dados, "metrics": recommendation.metricas,
        "next24h": recommendation.proximas_24h, "next48h": recommendation.proximas_48h,
    }


def system_state_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return JsonResponse({"ok": True, "farm": None, "talhoes": [], "applications": [], "recommendations": []})
    talhoes = list(farm.talhoes.filter(ativo=True))
    talhao_context = {}
    for talhao in talhoes:
        collection = talhao.coletas_meteorologicas.first()
        recommendations = list(collection.recomendacoes.all()) if collection else []
        talhao_context[talhao.id] = {
            "collection": collection,
            "recommendations": [_recommendation_json(item) for item in recommendations],
        }
    requested_talhao_id = request.GET.get("talhao_id")
    selected_context = talhao_context.get(int(requested_talhao_id)) if requested_talhao_id and requested_talhao_id.isdigit() else None
    latest_collection = selected_context["collection"] if selected_context else farm.coletas_meteorologicas.first()
    recommendations = latest_collection.recomendacoes.all() if latest_collection else RecomendacaoJanela.objects.none()
    owner_name = request.user.get_full_name() or request.user.username
    talhao_payload = []
    for talhao in talhoes:
        context = talhao_context[talhao.id]
        collection = context["collection"]
        serialized = _talhao_json(talhao)
        serialized["recommendations"] = context["recommendations"]
        serialized["weather"] = {
            "fetchedAt": collection.coletada_em.isoformat(),
            "location": {
                "latitude": float(collection.latitude),
                "longitude": float(collection.longitude),
                "timezone": collection.timezone,
            },
            "current": collection.dados_atuais,
            "hourly": collection.dados_horarios,
            "daily": collection.dados_diarios,
            "soil": collection.dados_solo_modelados,
        } if collection else None
        talhao_payload.append(serialized)
    return JsonResponse({
        "ok": True, "farm": {
            "id": farm.id, "name": farm.nome, "area": float(farm.area_hectares),
            "culture": farm.culturas[0] if farm.culturas else "", "city": farm.cidade,
            "state": farm.estado, "district": farm.bairro, "address": farm.endereco,
            "owner": owner_name, "sensors": SensorIoT.objects.filter(fazenda=farm, ativo=True).count(),
        },
        "talhoes": talhao_payload,
        "applications": [_application_json(item) for item in farm.aplicacoes.all()],
        "planejamentos": [_planejamento_json(item) for item in farm.planejamentos.select_related("talhao").all()],
        "recommendations": [_recommendation_json(item) for item in recommendations],
    })


@require_POST
def weather_ingest_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados meteorológicos ou fazenda inválidos.")
    location = data.get("location") or {}
    talhao_id = data.get("talhao_id", data.get("referenceTalhaoId"))
    talhao = farm.talhoes.filter(pk=talhao_id, ativo=True).first() if talhao_id is not None else None
    if talhao_id is not None and (talhao is None or talhao.latitude is None or talhao.longitude is None):
        return _error("Talhão não encontrado ou sem coordenadas na sua fazenda.", 404)
    latitude = talhao.latitude if talhao else location.get("latitude")
    longitude = talhao.longitude if talhao else location.get("longitude")
    if latitude is None or longitude is None:
        return _error("Informe as coordenadas do local da coleta.")
    collection = ColetaMeteorologica.objects.create(
        fazenda=farm, talhao=talhao, coletada_em=_parse_datetime(data.get("fetchedAt")),
        latitude=latitude, longitude=longitude, timezone=location.get("timezone", ""),
        dados_atuais=data.get("current", {}), dados_horarios=data.get("hourly", {}),
        dados_diarios=data.get("daily", {}), dados_solo_modelados=data.get("soil", {}), dados_brutos=data,
    )
    return JsonResponse({"ok": True, "collection_id": collection.id}, status=201)


@require_POST
def recommendations_ingest_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Recomendação ou fazenda inválida.")
    talhao_id = data.get("talhao_id")
    if talhao_id is not None:
        talhao = farm.talhoes.filter(pk=talhao_id, ativo=True).first()
        if talhao is None:
            return _error("Talhão não encontrado na sua fazenda.", 404)
        collection = talhao.coletas_meteorologicas.first()
    else:
        collection = farm.coletas_meteorologicas.first()
    if not collection:
        return _error("Salve a coleta meteorológica antes da recomendação.")
    recommendations = data.get("recommendations", [])
    RecomendacaoJanela.objects.filter(coleta=collection).delete()
    created_recommendations = []
    for item in recommendations:
        inicio = _parse_datetime(item.get("windowStart"))
        fim = _parse_datetime(item.get("windowEnd"))
        created_recommendations.append(RecomendacaoJanela.objects.create(
            fazenda=farm, talhao=collection.talhao, coleta=collection, data=date.fromisoformat(item["date"]), inicio=inicio, fim=fim,
            adequacao=int(item.get("adequacyIndex", 0)), classificacao=item.get("classification", "unknown"),
            confianca=item.get("confidence", 0), decisao=item.get("decision", "INSUFFICIENT_DATA"),
            fatores=item.get("factors", {}), riscos=item.get("risks", {}), qualidade_dados=item.get("dataQuality", {}),
            metricas=item.get("metrics", {}), proximas_24h=item.get("next24h", {}), proximas_48h=item.get("next48h", {}),
        ))
    return JsonResponse({
        "ok": True, "count": len(created_recommendations),
        "recommendations": [_recommendation_json(item) for item in created_recommendations],
    }, status=201)


@require_POST
def application_create_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados da aplicação ou fazenda inválidos.")
    talhao = farm.talhoes.filter(pk=data.get("talhao_id"), ativo=True).first() if data.get("talhao_id") is not None else farm.talhoes.filter(nome=data.get("talhao", ""), ativo=True).first()
    if talhao is None:
        return _error("Talhão não encontrado na sua fazenda.", 404)
    try:
        application_date = date.fromisoformat(data["data"])
    except (KeyError, TypeError, ValueError):
        return _error("Informe uma data de aplicação válida.")
    application_time = None
    if data.get("horario"):
        try: application_time = time.fromisoformat(data["horario"])
        except ValueError: return _error("Informe um horário válido.")
    status = str(data.get("status", ExecucaoAplicacao.Status.REALIZADA))
    status_aliases = {
        "REALIZADA": ExecucaoAplicacao.Status.REALIZADA,
        "PLANEJADA": ExecucaoAplicacao.Status.PLANEJADA,
        "CONFIRMADA": ExecucaoAplicacao.Status.CONFIRMADA,
        "CANCELADA": ExecucaoAplicacao.Status.CANCELADA,
    }
    status = status_aliases.get(status.upper(), status)
    if status not in ExecucaoAplicacao.Status.values:
        return _error("Informe um status de aplicação válido.")
    planejamento = None
    if data.get("planejamento_id"):
        planejamento = farm.planejamentos.filter(pk=data.get("planejamento_id")).first()
        if planejamento is None or planejamento.talhao_id != talhao.id:
            return _error("Planejamento não encontrado para este talhão.", 404)
    application = ExecucaoAplicacao.objects.create(
        fazenda=farm, talhao=talhao, planejamento=planejamento,
        recomendacao=planejamento.recomendacao if planejamento else None,
        iea_previsto=planejamento.recomendacao.adequacao if planejamento and planejamento.recomendacao else None,
        produto=str(data.get("produto", "")).strip(),
        tipo_insumo=str(data.get("tipo", "")), dose=str(data.get("dose", "")), quantidade=data.get("quantidade") or None,
        data_aplicacao=application_date, horario=application_time, observacoes=str(data.get("observacoes", "")),
        status=status, criado_por=request.user,
    )
    if planejamento and status == ExecucaoAplicacao.Status.REALIZADA:
        planejamento.status = PlanejamentoAplicacao.Status.EXECUTADA
        planejamento.save(update_fields=["status", "atualizado_em"])
    return JsonResponse({"ok": True, "application": _application_json(application)}, status=201)


@require_POST
def planejamento_create_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados do planejamento ou fazenda inválidos.")
    talhao_id = data.get("talhao_id")
    talhao = farm.talhoes.filter(pk=talhao_id).first() if talhao_id is not None else None
    if talhao is None:
        return _error("Talhão não encontrado ou não pertence à sua fazenda.", 404)
    try:
        data_planejada = date.fromisoformat(str(data.get("data_planejada")))
        horario_inicial = time.fromisoformat(str(data.get("horario_inicial"))) if data.get("horario_inicial") else None
        horario_final = time.fromisoformat(str(data.get("horario_final"))) if data.get("horario_final") else None
    except ValueError:
        return _error("Informe data e horários válidos para o planejamento.")
    recomendacao_id = data.get("recomendacao_id")
    recomendacao = None
    if recomendacao_id:
        recomendacao = farm.recomendacoes.filter(pk=recomendacao_id).first()
        if recomendacao and recomendacao.talhao_id != talhao.id:
            return _error("A recomendação selecionada pertence a outro talhão.", 400)
    dose = data.get("dose")
    try:
        dose_decimal = Decimal(str(dose)) if dose not in (None, "") else None
    except (InvalidOperation, ValueError):
        return _error("Dose do insumo inválida.")
    planejamento = PlanejamentoAplicacao.objects.create(
        fazenda=farm,
        talhao=talhao,
        recomendacao=recomendacao,
        produto=str(data.get("produto", "")).strip(),
        tipo_aplicacao=str(data.get("tipo_aplicacao", "")).strip(),
        dose=dose_decimal,
        unidade_dose=str(data.get("unidade_dose", "")).strip(),
        data_planejada=data_planejada,
        horario_inicial=horario_inicial,
        horario_final=horario_final,
        observacoes=str(data.get("observacoes", "")).strip(),
        responsavel=str(data.get("responsavel", "")).strip(),
        status=PlanejamentoAplicacao.Status.PLANEJADA,
        criado_por=request.user,
    )
    return JsonResponse({"ok": True, "planejamento": _planejamento_json(planejamento)}, status=201)


@require_POST
def aplicacao_exec_api(request, planejamento_id):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Dados da execução inválidos.")
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.")
    planejamento = farm.planejamentos.filter(pk=planejamento_id).first()
    if not planejamento:
        return _error("Planejamento não encontrado na sua fazenda.", 404)
    try:
        data_real = date.fromisoformat(str(data.get("data_real")))
        horario_real = time.fromisoformat(str(data.get("horario_real"))) if data.get("horario_real") else None
    except ValueError:
        return _error("Informe data e horário reais válidos.")
    quantidade_planejada = data.get("quantidade_planejada")
    quantidade_realizada = data.get("quantidade_realizada")
    try:
        quantidade_realizada_valor = Decimal(str(quantidade_realizada)) if quantidade_realizada not in (None, "") else None
    except (InvalidOperation, ValueError):
        return _error("Quantidade realizada inválida.")
    try:
        quantidade_planejada_valor = Decimal(str(quantidade_planejada)) if quantidade_planejada not in (None, "") else None
    except (InvalidOperation, ValueError):
        return _error("Quantidade planejada inválida.")
    status = str(data.get("status", "EXECUTADA")).upper()
    if status not in {"PLANEJADA", "CONFIRMADA", "EXECUTADA", "CANCELADA"}:
        status = "EXECUTADA"
    app = ExecucaoAplicacao.objects.create(
        fazenda=farm,
        talhao=planejamento.talhao,
        planejamento=planejamento,
        recomendacao=planejamento.recomendacao,
        produto=planejamento.produto,
        tipo_insumo=planejamento.tipo_aplicacao,
        dose=f"{planejamento.dose} {planejamento.unidade_dose}".strip(),
        quantidade=quantidade_planejada_valor,
        quantidade_realizada=quantidade_realizada_valor,
        data_aplicacao=data_real,
        horario=horario_real,
        observacoes=str(data.get("observacoes", "")).strip(),
        iea_previsto=planejamento.recomendacao.adequacao if planejamento.recomendacao else None,
        criado_por=request.user,
        status=ExecucaoAplicacao.Status.REALIZADA if status == "EXECUTADA" else ExecucaoAplicacao.Status.CANCELADA if status == "CANCELADA" else ExecucaoAplicacao.Status.CONFIRMADA if status == "CONFIRMADA" else ExecucaoAplicacao.Status.PLANEJADA,
    )
    planejamento.status = PlanejamentoAplicacao.Status.EXECUTADA if status == "EXECUTADA" else PlanejamentoAplicacao.Status.CANCELADA if status == "CANCELADA" else PlanejamentoAplicacao.Status.CONFIRMADA
    planejamento.save(update_fields=["status", "atualizado_em"])
    dentro_janela = planejamento.dentro_da_janela(data_real, horario_real)
    mensagem = "Aplicação realizada dentro da janela recomendada." if dentro_janela else "Aplicação realizada fora da janela recomendada."
    return JsonResponse({"ok": True, "app": _application_json(app), "dentro_janela": dentro_janela, "mensagem": mensagem}, status=201)


@require_GET
def analytics_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return JsonResponse({"ok": True, "period": {"start": None, "end": None}, "applications": {"total": 0, "executed": 0, "cancelled": 0, "inside_recommended_window": 0, "outside_recommended_window": 0}, "iea": {"average": 0}, "farm": {"monitored_area": 0.0}, "financial": {"potential_savings": None, "status": "insufficient_data"}, "talhoes": []})
    applications = farm.aplicacoes.all()
    total = applications.count()
    executed = applications.filter(status=ExecucaoAplicacao.Status.REALIZADA).count()
    cancelled = applications.filter(status=ExecucaoAplicacao.Status.CANCELADA).count()
    monitored_area = sum((float(t.area_hectares) if t.area_hectares else 0.0) for t in farm.talhoes.filter(ativo=True))
    avg_iea = 0
    if applications.exists():
        values = [float(app.iea_previsto) for app in applications.exclude(iea_previsto__isnull=True) if app.iea_previsto is not None]
        avg_iea = round(sum(values) / len(values), 2) if values else 0
    inside = 0
    outside = 0
    for app in applications.filter(status=ExecucaoAplicacao.Status.REALIZADA):
        if app.recomendacao:
            app_moment = datetime.combine(app.data_aplicacao, app.horario or time.min)
            if app_moment.tzinfo is None:
                app_moment = timezone.make_aware(app_moment, timezone.get_current_timezone())
            inicio = app.recomendacao.inicio
            fim = app.recomendacao.fim
            if inicio.tzinfo is None:
                inicio = timezone.make_aware(inicio, timezone.get_current_timezone())
            if fim.tzinfo is None:
                fim = timezone.make_aware(fim, timezone.get_current_timezone())
            if inicio <= app_moment <= fim:
                inside += 1
            else:
                outside += 1
        else:
            outside += 1
    analytics = {
        "ok": True,
        "period": {"start": None, "end": None},
        "applications": {
            "total": total,
            "executed": executed,
            "cancelled": cancelled,
            "inside_recommended_window": inside,
            "outside_recommended_window": outside,
        },
        "iea": {"average": avg_iea},
        "farm": {"monitored_area": round(monitored_area, 2)},
        "financial": {"potential_savings": None, "status": "insufficient_data"},
        "talhoes": [{"id": talhao.id, "name": talhao.nome, "area": float(talhao.area_hectares or 0), "farm_id": talhao.fazenda_id} for talhao in farm.talhoes.filter(ativo=True)],
    }
    return JsonResponse(analytics)


@require_POST
def talhao_create_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados do talhão ou fazenda inválidos.")
    try:
        latitude = _parse_coordinate(data.get("latitude"), 90)
        longitude = _parse_coordinate(data.get("longitude"), 180)
        talhao = Talhao.objects.create(
            fazenda=farm, nome=str(data.get("nome", "")).strip(), area_hectares=data.get("area") or None,
            cultura=str(data.get("cultura", "")).strip(), latitude=latitude, longitude=longitude,
            raio_metros=int(data.get("raio", 80)),
        )
    except (IntegrityError, InvalidOperation, TypeError, ValueError):
        return _error("Não foi possível cadastrar este talhão.")
    return JsonResponse({"ok": True, "talhao": _talhao_json(talhao)}, status=201)


@require_http_methods(["POST", "PUT"])
def talhao_update_api(request, talhao_id):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados do talhão ou fazenda inválidos.")
    talhao = farm.talhoes.filter(pk=talhao_id).first()
    if not talhao:
        return _error("Talhão não encontrado.", 404)
    try:
        talhao.nome = str(data.get("nome", talhao.nome)).strip() or talhao.nome
        talhao.area_hectares = data.get("area") if data.get("area") is not None else talhao.area_hectares
        talhao.cultura = str(data.get("cultura", talhao.cultura)).strip() or talhao.cultura
        talhao.latitude = _parse_coordinate(data.get("latitude"), 90) if data.get("latitude") is not None else talhao.latitude
        talhao.longitude = _parse_coordinate(data.get("longitude"), 180) if data.get("longitude") is not None else talhao.longitude
        talhao.raio_metros = int(data.get("raio", talhao.raio_metros))
        talhao.save()
    except (IntegrityError, InvalidOperation, TypeError, ValueError):
        return _error("Não foi possível atualizar este talhão.")
    return JsonResponse({"ok": True, "talhao": _talhao_json(talhao)})


@require_http_methods(["POST", "DELETE"])
def talhao_delete_api(request, talhao_id):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.")
    talhao = farm.talhoes.filter(pk=talhao_id).first()
    if not talhao:
        return _error("Talhão não encontrado.", 404)
    talhao.delete()
    return JsonResponse({"ok": True, "deleted_id": talhao_id})


@require_POST
def profile_update_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Dados do perfil inválidos.")
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    phone = re.sub(r"\D", "", str(data.get("phone", "")))
    if not name or not email:
        return _error("Nome e e-mail são obrigatórios.")
    try:
        validate_email(email)
    except ValidationError:
        return _error("Informe um e-mail válido.")
    if User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).exclude(pk=request.user.pk).exists():
        return _error("Este e-mail já está vinculado a outro usuário.")
    request.user.first_name, *last_name = name.split(maxsplit=1)
    request.user.last_name = last_name[0] if last_name else ""
    request.user.email = email
    if "@" in request.user.username:
        request.user.username = email
    request.user.save(update_fields=["first_name", "last_name", "email", "username"])
    perfil, _ = PerfilProdutor.objects.get_or_create(usuario=request.user, defaults={"nome_completo": name, "telefone": phone})
    perfil.nome_completo = name
    perfil.telefone = phone or perfil.telefone
    perfil.save()
    farm = _current_farm(request)
    if farm and data.get("farm"):
        farm.nome = str(data["farm"]).strip()
        farm.save(update_fields=["nome", "atualizada_em"])
    return JsonResponse({"ok": True, "name": name, "email": email, "phone": perfil.telefone, "farm": farm.nome if farm else "Sem fazenda cadastrada"})


@require_POST
def logout_api(request):
    logout(request)
    return redirect("dashboard:login")


@require_POST
def login_api(request):
    data = _json_body(request)
    if data is None:
        return _error("Dados de acesso inválidos.")
    identifier = str(data.get("email", "")).strip()
    password = str(data.get("password", ""))
    user_record = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()
    user = authenticate(request, username=user_record.username, password=password) if user_record else None
    if user is None:
        return _error("E-mail ou senha incorretos.", 401)
    login(request, user)
    if not data.get("remember_me"):
        request.session.set_expiry(0)
    return JsonResponse({"ok": True, "redirect_url": "/dashboard/"})


@require_POST
def cadastro_api(request):
    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Dados do cadastro inválidos.")
    errors = {}

    def required(field, label):
        value = str(data.get(field, "")).strip()
        if not value:
            errors[field] = f"Informe {label}."
        return value

    nome = required("nome", "seu nome completo")
    email = required("email", "um e-mail").lower()
    telefone = re.sub(r"\D", "", str(data.get("telefone", "")))
    senha = str(data.get("senha", ""))
    nome_fazenda = required("nome_fazenda", "o nome da fazenda")
    estado = required("estado", "o estado").upper()
    cidade = required("cidade", "a cidade")
    bairro = required("bairro", "o bairro ou distrito")
    cep = re.sub(r"\D", "", str(data.get("cep", "")))
    culturas = data.get("culturas", [])
    tipo_cultivo = str(data.get("tipo_cultivo", ""))
    irrigacao = str(data.get("irrigacao", ""))
    if len(nome.split()) < 2: errors["nome"] = "Informe nome e sobrenome."
    try: validate_email(email)
    except ValidationError: errors["email"] = "Informe um e-mail válido."
    if len(telefone) not in (10, 11): errors["telefone"] = "Informe um telefone com DDD válido."
    if len(cep) != 8: errors["cep"] = "Informe um CEP válido."
    if len(estado) != 2: errors["estado"] = "Selecione uma UF válida."
    if not isinstance(culturas, list) or not culturas: errors["culturas"] = "Selecione ao menos uma cultura."
    if tipo_cultivo not in Fazenda.TipoCultivo.values: errors["tipo_cultivo"] = "Selecione um tipo de cultivo válido."
    if irrigacao not in Fazenda.Irrigacao.values: errors["irrigacao"] = "Selecione um sistema de irrigação válido."
    try:
        area = Decimal(str(data.get("area_hectares", "")))
        if area <= 0: raise InvalidOperation
    except (InvalidOperation, ValueError): errors["area_hectares"] = "Informe uma área maior que zero."
    try:
        talhoes = int(data.get("quantidade_talhoes", 0))
        if talhoes < 1: raise ValueError
    except (ValueError, TypeError): errors["quantidade_talhoes"] = "Informe ao menos um talhão."
    try: validate_password(senha)
    except ValidationError as exc: errors["senha"] = " ".join(exc.messages)
    if not re.search(r"[A-Za-z]", senha) or not re.search(r"\d", senha): errors["senha"] = "A senha deve ter letras e números."
    if errors:
        return _error("Revise os campos destacados.", field_errors=errors)
    if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
        return _error("Já existe uma conta com este e-mail.", field_errors={"email": "Este e-mail já está cadastrado."})
    try:
        with transaction.atomic():
            first_name, *last_name = nome.split(maxsplit=1)
            user = User.objects.create_user(username=email, email=email, password=senha, first_name=first_name, last_name=last_name[0] if last_name else "")
            PerfilProdutor.objects.create(usuario=user, nome_completo=nome, telefone=telefone)
            farm = Fazenda.objects.create(produtor=user, nome=nome_fazenda, cep=cep, estado=estado, cidade=cidade, bairro=bairro, endereco=str(data.get("endereco", "")).strip(), area_hectares=area, quantidade_talhoes=talhoes, culturas=culturas, tipo_cultivo=tipo_cultivo, irrigacao=irrigacao)
            Talhao.objects.bulk_create([Talhao(fazenda=farm, nome=f"Talhão {index:02d}") for index in range(1, talhoes + 1)])
    except IntegrityError:
        return _error("Já existe uma conta ou fazenda com estes dados.")
    login(request, user)
    return JsonResponse({"ok": True, "redirect_url": "/dashboard/"}, status=201)
