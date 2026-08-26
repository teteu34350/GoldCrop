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
from django.views.decorators.http import require_POST

from .models import ColetaMeteorologica, ExecucaoAplicacao, Fazenda, PerfilProdutor, RecomendacaoJanela, Talhao


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


def _talhao_json(talhao):
    return {
        "id": talhao.id, "name": talhao.nome, "area": float(talhao.area_hectares or 0),
        "culture": talhao.cultura, "variety": talhao.variedade, "age": talhao.idade_anos,
        "soil": talhao.tipo_solo, "sensor": talhao.codigo_sensor, "latitude": float(talhao.latitude) if talhao.latitude is not None else None,
        "longitude": float(talhao.longitude) if talhao.longitude is not None else None, "radius": talhao.raio_metros,
    }


def _application_json(application):
    return {
        "id": application.id, "talhao": application.talhao.nome if application.talhao else "",
        "product": application.produto, "qty": str(application.quantidade or ""),
        "date": application.data_aplicacao.strftime("%d/%m/%Y"), "status": application.status,
        "result": "Realizado" if application.status == ExecucaoAplicacao.Status.REALIZADA else "Planejado",
        "ieaPrev": application.iea_previsto,
    }


def _recommendation_json(recommendation):
    return {
        "id": recommendation.id, "date": recommendation.data.isoformat(),
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
    latest_collection = farm.coletas_meteorologicas.first()
    recommendations = RecomendacaoJanela.objects.filter(coleta=latest_collection) if latest_collection else RecomendacaoJanela.objects.none()
    return JsonResponse({
        "ok": True, "farm": {"id": farm.id, "name": farm.nome, "area": float(farm.area_hectares), "culture": farm.culturas[0] if farm.culturas else ""},
        "talhoes": [_talhao_json(t) for t in farm.talhoes.filter(ativo=True)],
        "applications": [_application_json(item) for item in farm.aplicacoes.all()],
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
    collection = ColetaMeteorologica.objects.create(
        fazenda=farm, coletada_em=_parse_datetime(data.get("fetchedAt")),
        latitude=location.get("latitude"), longitude=location.get("longitude"), timezone=location.get("timezone", ""),
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
    collection = farm.coletas_meteorologicas.first()
    if not collection:
        return _error("Salve a coleta meteorológica antes da recomendação.")
    recommendations = data.get("recommendations", [])
    RecomendacaoJanela.objects.filter(coleta=collection).delete()
    for item in recommendations:
        inicio = _parse_datetime(item.get("windowStart"))
        fim = _parse_datetime(item.get("windowEnd"))
        RecomendacaoJanela.objects.create(
            fazenda=farm, coleta=collection, data=date.fromisoformat(item["date"]), inicio=inicio, fim=fim,
            adequacao=int(item.get("adequacyIndex", 0)), classificacao=item.get("classification", "unknown"),
            confianca=item.get("confidence", 0), decisao=item.get("decision", "INSUFFICIENT_DATA"),
            fatores=item.get("factors", {}), riscos=item.get("risks", {}), qualidade_dados=item.get("dataQuality", {}),
            metricas=item.get("metrics", {}), proximas_24h=item.get("next24h", {}), proximas_48h=item.get("next48h", {}),
        )
    return JsonResponse({"ok": True, "count": len(recommendations)}, status=201)


@require_POST
def application_create_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados da aplicação ou fazenda inválidos.")
    talhao = farm.talhoes.filter(nome=data.get("talhao", "")).first()
    try:
        application_date = date.fromisoformat(data["data"])
    except (KeyError, TypeError, ValueError):
        return _error("Informe uma data de aplicação válida.")
    application_time = None
    if data.get("horario"):
        try: application_time = time.fromisoformat(data["horario"])
        except ValueError: return _error("Informe um horário válido.")
    application = ExecucaoAplicacao.objects.create(
        fazenda=farm, talhao=talhao, produto=str(data.get("produto", "")).strip(),
        tipo_insumo=str(data.get("tipo", "")), dose=str(data.get("dose", "")), quantidade=data.get("quantidade") or None,
        data_aplicacao=application_date, horario=application_time, observacoes=str(data.get("observacoes", "")),
        status=data.get("status", ExecucaoAplicacao.Status.REALIZADA), criado_por=request.user,
    )
    return JsonResponse({"ok": True, "application": _application_json(application)}, status=201)


@require_POST
def talhao_create_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados do talhão ou fazenda inválidos.")
    try:
        talhao = Talhao.objects.create(
            fazenda=farm, nome=str(data.get("nome", "")).strip(), area_hectares=data.get("area") or None,
            cultura=str(data.get("cultura", "")).strip(), latitude=data.get("latitude"), longitude=data.get("longitude"),
            raio_metros=int(data.get("raio", 80)),
        )
    except (IntegrityError, TypeError, ValueError):
        return _error("Não foi possível cadastrar este talhão.")
    return JsonResponse({"ok": True, "talhao": _talhao_json(talhao)}, status=201)


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
