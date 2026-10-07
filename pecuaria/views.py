import json
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth, TruncWeek
from django.http import Http404, HttpResponseForbidden
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_GET, require_http_methods

from dashboard.models import MovimentacaoEstoque, Produto
from dashboard.views import _current_farm, _has_farm_permission, _protected_page

from .models import Alimentacao, Animal, Manejo, ProducaoLeite, Reproducao


def _error(message, status=400, field_errors=None):
    response = {"ok": False, "message": message}
    if field_errors:
        response["field_errors"] = field_errors
    return JsonResponse(response, status=status)


def _body(request):
    try:
        value = json.loads(request.body)
    except (TypeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _farm_for_request(request, permission="view"):
    if not request.user.is_authenticated:
        return None, _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return None, _error("Fazenda não encontrada.", 404)
    if not _has_farm_permission(farm, request.user, permission):
        return None, _error("Acesso negado.", 403)
    return farm, None


def _date_value(value, field_name="data"):
    if not isinstance(value, str):
        raise ValueError(field_name)
    parsed = parse_date(value)
    if parsed is None:
        raise ValueError(field_name)
    return parsed


def _string_value(value):
    return str(value or "").strip()


def _decimal_value(value, field_name, *, required=True):
    if value in (None, "") and not required:
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(field_name) from None
    if not result.is_finite():
        raise ValueError(field_name)
    return result


def _validated(model):
    try:
        model.full_clean()
    except ValidationError as exc:
        return {key: [str(message) for message in messages] for key, messages in exc.message_dict.items()}
    return None


def _animal_json(animal):
    return {
        "id": animal.id,
        "identificacao": animal.identificacao,
        "nome": animal.nome,
        "tipo": animal.tipo,
        "tipo_label": animal.get_tipo_display(),
        "categoria": animal.categoria,
        "categoria_label": animal.get_categoria_display(),
        "sexo": animal.sexo,
        "sexo_label": animal.get_sexo_display(),
        "raca": animal.raca,
        "data_nascimento": animal.data_nascimento.isoformat() if animal.data_nascimento else "",
        "peso": float(animal.peso) if animal.peso is not None else None,
        "origem": animal.origem,
        "mae_id": animal.mae_id,
        "mae": animal.mae.identificacao if animal.mae else "",
        "pai_id": animal.pai_id,
        "pai": animal.pai.identificacao if animal.pai else "",
        "data_entrada": animal.data_entrada.isoformat() if animal.data_entrada else "",
        "status": animal.status,
        "status_label": animal.get_status_display(),
        "observacoes": animal.observacoes,
        "arquivado": animal.arquivado,
    }


def _record_animal(farm, value, *, required=True):
    if value in (None, "") and not required:
        return None
    try:
        return Animal.objects.get(pk=int(value), fazenda=farm, arquivado=False)
    except (TypeError, ValueError, Animal.DoesNotExist):
        raise ValueError("animal_id") from None


def _animal_history(animal):
    events = []
    for row in animal.producoes_leite.filter(fazenda=animal.fazenda)[:100]:
        events.append({
            "data": row.data.isoformat(),
            "tipo": "Produção de leite",
            "descricao": f"{row.quantidade} L" + (f" ({row.get_ordenha_display()})" if row.ordenha != "UNICA" else ""),
            "observacao": row.observacao,
        })
    for row in animal.manejos.filter(fazenda=animal.fazenda)[:100]:
        events.append({
            "data": row.data.isoformat(),
            "tipo": row.get_tipo_evento_display(),
            "descricao": row.descricao or row.dosagem or "Registro de manejo",
            "observacao": row.observacoes,
        })
    for row in animal.reproducoes.filter(fazenda=animal.fazenda)[:100]:
        events.append({
            "data": row.data.isoformat(),
            "tipo": row.get_tipo_display(),
            "descricao": row.get_status_gestacao_display() if row.status_gestacao else row.touro_inseminador,
            "observacao": row.observacoes,
        })
    for row in animal.alimentacoes.filter(fazenda=animal.fazenda)[:100]:
        events.append({
            "data": row.data.isoformat(),
            "tipo": "Alimentação",
            "descricao": f"{row.tipo_alimento}: {row.quantidade} {row.unidade}",
            "observacao": row.observacao,
        })
    return sorted(events, key=lambda event: event["data"], reverse=True)[:200]


def _products_for_farm(farm):
    return Produto.objects.filter(fazenda=farm, ativo=True).order_by("nome")


def _choice_label(model, field_name, value):
    return dict(model._meta.get_field(field_name).choices).get(value, value)


def dashboard_page(request):
    page_response = _protected_page(request, "pecuaria.html")
    farm = _current_farm(request) if request.user.is_authenticated else None
    if page_response.status_code == 200 and farm and not _has_farm_permission(farm, request.user, "view"):
        return HttpResponseForbidden("Acesso negado.")
    return page_response


def animal_page(request, animal_id):
    page_response = _protected_page(request, "pecuaria.html")
    if page_response.status_code != 200:
        return page_response
    farm = _current_farm(request)
    if not farm or not _has_farm_permission(farm, request.user, "view"):
        return HttpResponseForbidden("Acesso negado.")
    if not Animal.objects.filter(pk=animal_id, fazenda=farm).exists():
        raise Http404("Animal não encontrado.")
    return page_response


@require_GET
def dashboard_api(request):
    farm, error = _farm_for_request(request)
    if error:
        return error
    today = timezone.localdate()
    week_start = today - timedelta(days=6)
    month_start = today.replace(day=1)
    active = Animal.objects.filter(fazenda=farm, status="ATIVO", arquivado=False)
    herd_counts = {
        row["categoria"]: row["count"]
        for row in active.values("categoria").annotate(count=Count("id"))
    }
    lactating = herd_counts.get("VACA_LACTACAO", 0)
    production_today = ProducaoLeite.objects.filter(fazenda=farm, data=today).aggregate(total=Sum("quantidade"))["total"] or Decimal("0")
    production_week = ProducaoLeite.objects.filter(fazenda=farm, data__gte=week_start, data__lte=today).aggregate(total=Sum("quantidade"))["total"] or Decimal("0")
    production_month = ProducaoLeite.objects.filter(fazenda=farm, data__gte=month_start, data__lte=today).aggregate(total=Sum("quantidade"))["total"] or Decimal("0")
    daily_rows = (
        ProducaoLeite.objects.filter(fazenda=farm, data__gte=today - timedelta(days=13), data__lte=today)
        .values("data").annotate(total=Sum("quantidade")).order_by("data")
    )
    daily_production = {row["data"]: row["total"] for row in daily_rows}
    production_chart = [
        {"data": (today - timedelta(days=13 - offset)).isoformat(),
         "litros": float(daily_production.get(today - timedelta(days=13 - offset), 0))}
        for offset in range(14)
    ]
    weekly_rows = (
        ProducaoLeite.objects.filter(
            fazenda=farm,
            data__gte=today - timedelta(days=today.weekday() + 77),
            data__lte=today,
        )
        .annotate(period=TruncWeek("data")).values("period").annotate(total=Sum("quantidade")).order_by("period")
    )
    weekly_production = {row["period"]: row["total"] for row in weekly_rows}
    weekly_chart = []
    for offset in range(11, -1, -1):
        period_start = today - timedelta(days=(today.weekday() + 7 * offset))
        weekly_chart.append({
            "data": period_start.isoformat(),
            "litros": float(weekly_production.get(period_start, 0)),
        })
    month_starts = []
    current_month = today.year * 12 + today.month - 1
    for offset in range(11, -1, -1):
        absolute_month = current_month - offset
        year, month_index = divmod(absolute_month, 12)
        month_starts.append(date(year, month_index + 1, 1))
    monthly_rows = (
        ProducaoLeite.objects.filter(fazenda=farm, data__gte=month_starts[0], data__lte=today)
        .annotate(period=TruncMonth("data")).values("period").annotate(total=Sum("quantidade")).order_by("period")
    )
    monthly_production = {row["period"]: row["total"] for row in monthly_rows}
    monthly_chart = [{
        "data": period_start.isoformat(),
        "litros": float(monthly_production.get(period_start, 0)),
    } for period_start in month_starts]

    consumed_records = Alimentacao.objects.filter(
        fazenda=farm,
        produto__isnull=False,
        data__gte=today - timedelta(days=29),
        data__lte=today,
    ).values("produto_id").annotate(total=Sum("quantidade"))
    consumption_by_product = {
        row["produto_id"]: row["total"] for row in consumed_records
    }
    managed_consumption = Manejo.objects.filter(
        fazenda=farm,
        produto_utilizado__isnull=False,
        quantidade_produto__isnull=False,
        data__gte=today - timedelta(days=29),
        data__lte=today,
    ).values("produto_utilizado_id").annotate(total=Sum("quantidade_produto"))
    for row in managed_consumption:
        consumption_by_product[row["produto_utilizado_id"]] = (
            consumption_by_product.get(row["produto_utilizado_id"], Decimal("0")) + row["total"]
        )
    consumed_product_ids = set(Alimentacao.objects.filter(
        fazenda=farm, produto__isnull=False,
    ).values_list("produto_id", flat=True).distinct()) | set(Manejo.objects.filter(
        fazenda=farm, produto_utilizado__isnull=False,
    ).values_list("produto_utilizado_id", flat=True).distinct())
    relevant_terms = ("ração", "racao", "silagem", "feno", "milho", "medic", "mineral", "verm")
    low_products = []
    livestock_stocks = []
    for product in _products_for_farm(farm):
        related = product.id in consumed_product_ids or any(
            term in f"{product.nome} {product.categoria}".casefold() for term in relevant_terms
        )
        if related:
            average_daily = consumption_by_product.get(product.id, Decimal("0")) / Decimal("30")
            livestock_stocks.append({
                "produto": product.nome,
                "quantidade": float(product.quantidade_atual),
                "estoque_minimo": float(product.estoque_minimo),
                "unidade": product.unidade,
                "consumo_medio_dia": float(average_daily),
                "autonomia_dias": round(float(product.quantidade_atual / average_daily), 1) if average_daily else None,
                "situacao": "danger" if product.quantidade_atual <= 0 else (
                    "warning" if product.quantidade_atual <= product.estoque_minimo else "success"
                ),
            })
        if related and product.quantidade_atual <= product.estoque_minimo:
            low_products.append({
                "produto": product.nome,
                "quantidade": float(product.quantidade_atual),
                "estoque_minimo": float(product.estoque_minimo),
                "unidade": product.unidade,
                "situacao": "danger" if product.quantidade_atual <= 0 else "warning",
            })

    due_events = Reproducao.objects.filter(
        fazenda=farm,
        data_estimada_parto__gte=today,
        status_gestacao__in=["PENDENTE", "CONFIRMADA"],
        animal__status="ATIVO",
        animal__arquivado=False,
    ).select_related("animal").order_by("data_estimada_parto")[:8]
    upcoming_births = [{
        "animal_id": event.animal_id,
        "animal": event.animal.identificacao,
        "nome": event.animal.nome,
        "data": event.data_estimada_parto.isoformat(),
        "status": event.get_status_gestacao_display(),
        "tipo": "Parto previsto",
    } for event in due_events]
    future_management = Manejo.objects.filter(
        fazenda=farm,
        data__gt=today,
        data__lte=today + timedelta(days=30),
        animal__status="ATIVO",
        animal__arquivado=False,
    ).select_related("animal").order_by("data")[:8]
    upcoming_events = upcoming_births + [{
        "animal_id": event.animal_id,
        "animal": event.animal.identificacao,
        "nome": event.animal.nome,
        "data": event.data.isoformat(),
        "status": "",
        "tipo": event.get_tipo_evento_display(),
        "descricao": event.descricao,
    } for event in future_management]
    pending_diagnoses = Reproducao.objects.filter(
        fazenda=farm,
        status_gestacao="PENDENTE",
        data__lte=today - timedelta(days=30),
        animal__status="ATIVO",
        animal__arquivado=False,
    ).select_related("animal").order_by("data")[:5]
    alerts = [
        {
            "tipo": "estoque",
            "mensagem": f"{item['produto']} abaixo do estoque mínimo ({item['quantidade']:g} {item['unidade']}).",
        } for item in low_products
    ]
    alerts.extend({
        "tipo": "reproducao",
        "mensagem": f"Parto previsto de {event['animal']} em {event['data']}.",
    } for event in upcoming_births if date.fromisoformat(event["data"]) <= today + timedelta(days=14))
    alerts.extend({
        "tipo": "manejo",
        "mensagem": f"{event.get_tipo_evento_display()} agendado para {event.animal.identificacao} em {event.data}.",
    } for event in future_management if event.data <= today + timedelta(days=7))
    alerts.extend({
        "tipo": "reproducao",
        "mensagem": f"Diagnóstico de gestação pendente para {event.animal.identificacao}.",
    } for event in pending_diagnoses)
    return JsonResponse({
        "ok": True,
        "fazenda": farm.nome,
        "resumo": {
            "total_animais": active.count(),
            "vacas_lactacao": lactating,
            "vacas_secas": herd_counts.get("VACA_SECA", 0),
            "novilhas": herd_counts.get("NOVILHA", 0),
            "bezerros": herd_counts.get("BEZERRO", 0) + herd_counts.get("BEZERRA", 0),
            "touros": herd_counts.get("TOURO", 0),
            "producao_hoje": float(production_today),
            "producao_semana": float(production_week),
            "producao_mes": float(production_month),
            "media_litros_vaca_dia": round(float(production_today) / lactating, 2) if lactating else 0,
            "media_semanal_litros_vaca_dia": round(float(production_week) / (7 * lactating), 2) if lactating else 0,
            "media_mensal_litros_vaca_dia": round(
                float(production_month) / ((today - month_start).days + 1) / lactating, 2,
            ) if lactating else 0,
        },
        "categorias": [{
            "categoria": key,
            "nome": _choice_label(Animal, "categoria", key),
            "quantidade": value,
        } for key, value in herd_counts.items()],
        "producao_diaria": production_chart,
        "producao_semanal": weekly_chart,
        "producao_mensal": monthly_chart,
        "eventos": sorted(upcoming_events, key=lambda event: event["data"])[:12],
        "alertas": alerts[:12],
        "estoques_baixos": low_products[:8],
        "estoques": livestock_stocks[:12],
    })


@require_http_methods(["GET", "POST"])
def animais_api(request):
    farm, error = _farm_for_request(request, "view" if request.method == "GET" else "manage")
    if error:
        return error
    if request.method == "GET":
        animals = Animal.objects.filter(fazenda=farm)
        if request.GET.get("arquivados") != "1":
            animals = animals.filter(arquivado=False)
        if request.GET.get("categoria"):
            animals = animals.filter(categoria=request.GET["categoria"].strip())
        if request.GET.get("status"):
            animals = animals.filter(status=request.GET["status"].strip())
        if request.GET.get("raca"):
            animals = animals.filter(raca__icontains=request.GET["raca"].strip())
        if request.GET.get("q"):
            search = request.GET["q"].strip()
            animals = animals.filter(Q(identificacao__icontains=search) | Q(nome__icontains=search))
        return JsonResponse({"ok": True, "animais": [_animal_json(item) for item in animals.select_related("mae", "pai")]})

    data = _body(request)
    if data is None:
        return _error("Envie os dados do animal em formato válido.")
    try:
        animal = Animal(fazenda=farm)
        _set_animal_fields(animal, data, farm)
    except ValueError as exc:
        return _error(f"Valor inválido para {exc.args[0]}.")
    field_errors = _validated(animal)
    if field_errors:
        return _error("Revise os dados do animal.", field_errors=field_errors)
    animal.save()
    return JsonResponse({"ok": True, "animal": _animal_json(animal)}, status=201)


def _set_animal_fields(animal, data, farm):
    fields = ("identificacao", "nome", "tipo", "categoria", "sexo", "raca", "origem", "status", "observacoes")
    for field in fields:
        if field in data:
            setattr(animal, field, str(data[field] or "").strip())
    for field in ("data_nascimento", "data_entrada"):
        if field in data:
            value = data[field]
            setattr(animal, field, _date_value(value, field) if value else None)
    if "peso" in data:
        animal.peso = _decimal_value(data["peso"], "peso", required=False)
        if animal.peso is not None and animal.peso <= 0:
            raise ValueError("peso")
    for field, expected_sex in (("mae_id", "F"), ("pai_id", "M")):
        if field in data:
            parent_id = data[field]
            if parent_id in (None, ""):
                setattr(animal, field[:-3], None)
            else:
                try:
                    parent = Animal.objects.get(pk=int(parent_id), fazenda=farm, arquivado=False, sexo=expected_sex)
                except (TypeError, ValueError, Animal.DoesNotExist):
                    raise ValueError(field) from None
                if animal.pk and parent.pk == animal.pk:
                    raise ValueError(field)
                setattr(animal, field[:-3], parent)
    if "arquivado" in data:
        if not isinstance(data["arquivado"], bool):
            raise ValueError("arquivado")
        animal.arquivado = data["arquivado"]
    if animal.categoria in ("VACA_LACTACAO", "VACA_SECA", "NOVILHA", "BEZERRA") and animal.sexo != "F":
        raise ValueError("sexo")
    if animal.categoria in ("BEZERRO", "TOURO") and animal.sexo != "M":
        raise ValueError("sexo")
    if animal.data_nascimento and animal.data_nascimento > timezone.localdate():
        raise ValueError("data_nascimento")


@require_http_methods(["GET", "PATCH", "DELETE"])
def animal_detail_api(request, animal_id):
    farm, error = _farm_for_request(request, "view" if request.method == "GET" else "manage")
    if error:
        return error
    animal = Animal.objects.filter(pk=animal_id, fazenda=farm).select_related("mae", "pai").first()
    if not animal:
        return _error("Animal não encontrado.", 404)
    if request.method == "GET":
        result = _animal_json(animal)
        result["historico"] = _animal_history(animal)
        return JsonResponse({"ok": True, "animal": result})
    if request.method == "DELETE":
        animal.arquivado = True
        animal.save(update_fields=["arquivado", "atualizado_em"])
        return JsonResponse({"ok": True, "message": "Animal arquivado."})
    data = _body(request)
    if data is None:
        return _error("Envie os dados do animal em formato válido.")
    try:
        previous_category = animal.categoria
        previous_weight = animal.peso
        _set_animal_fields(animal, data, farm)
    except ValueError as exc:
        return _error(f"Valor inválido para {exc.args[0]}.")
    field_errors = _validated(animal)
    if field_errors:
        return _error("Revise os dados do animal.", field_errors=field_errors)
    with transaction.atomic():
        animal.save()
        if previous_category != animal.categoria:
            Manejo.objects.create(
                fazenda=farm,
                animal=animal,
                tipo_evento="ALTERACAO_CATEGORIA",
                data=timezone.localdate(),
                descricao=f"Categoria alterada de {_choice_label(Animal, 'categoria', previous_category)} para {animal.get_categoria_display()}.",
            )
        if previous_weight != animal.peso and animal.peso is not None:
            Manejo.objects.create(
                fazenda=farm,
                animal=animal,
                tipo_evento="PESAGEM",
                data=timezone.localdate(),
                descricao=f"Peso atualizado para {animal.peso} kg.",
            )
    return JsonResponse({"ok": True, "animal": _animal_json(animal)})


def _production_json(row):
    return {
        "id": row.id, "animal_id": row.animal_id,
        "animal": row.animal.identificacao if row.animal else "Lote/Geral",
        "data": row.data.isoformat(), "quantidade": float(row.quantidade),
        "ordenha": row.get_ordenha_display(), "observacao": row.observacao,
    }


@require_http_methods(["GET", "POST"])
def producao_api(request):
    farm, error = _farm_for_request(request, "view" if request.method == "GET" else "record")
    if error:
        return error
    if request.method == "GET":
        queryset = ProducaoLeite.objects.filter(fazenda=farm)
        start_value = request.GET.get("inicio")
        end_value = request.GET.get("fim")
        try:
            start_date = _date_value(start_value, "inicio") if start_value else None
            end_date = _date_value(end_value, "fim") if end_value else None
        except ValueError as exc:
            return _error(f"Data inválida: {exc.args[0]}.")
        if start_date and end_date and start_date > end_date:
            return _error("A data inicial deve ser anterior à data final.")
        if start_date:
            queryset = queryset.filter(data__gte=start_date)
        if end_date:
            queryset = queryset.filter(data__lte=end_date)
        by_animal = queryset.values("animal_id", "animal__identificacao").annotate(
            litros=Sum("quantidade"),
        ).order_by("-litros")
        return JsonResponse({
            "ok": True,
            "producoes": [_production_json(row) for row in queryset.select_related("animal").order_by("-data", "-id")[:150]],
            "total_litros": float(queryset.aggregate(total=Sum("quantidade"))["total"] or 0),
            "por_animal": [{
                "animal_id": row["animal_id"],
                "animal": row["animal__identificacao"] or "Lote/Geral",
                "litros": float(row["litros"]),
            } for row in by_animal],
        })
    data = _body(request)
    if data is None:
        return _error("Envie os dados da produção em formato válido.")
    try:
        animal = _record_animal(farm, data.get("animal_id"), required=False)
        amount = _decimal_value(data.get("quantidade"), "quantidade")
        if amount <= 0:
            raise ValueError("quantidade")
        row = ProducaoLeite(
            fazenda=farm, animal=animal,
            data=_date_value(data.get("data")), quantidade=amount,
            ordenha=_string_value(data.get("ordenha") or "UNICA"),
            observacao=_string_value(data.get("observacao")),
        )
    except ValueError as exc:
        return _error(f"Valor inválido para {exc.args[0]}.")
    field_errors = _validated(row)
    if field_errors:
        return _error("Revise os dados da produção.", field_errors=field_errors)
    row.save()
    row = ProducaoLeite.objects.select_related("animal").get(pk=row.pk)
    return JsonResponse({"ok": True, "producao": _production_json(row)}, status=201)


def _management_json(row):
    return {
        "id": row.id, "animal_id": row.animal_id,
        "animal": row.animal.identificacao, "tipo": row.tipo_evento,
        "tipo_label": row.get_tipo_evento_display(), "data": row.data.isoformat(),
        "descricao": row.descricao, "produto_id": row.produto_utilizado_id,
        "produto": row.produto_utilizado.nome if row.produto_utilizado else "",
        "quantidade_produto": float(row.quantidade_produto) if row.quantidade_produto is not None else None,
        "dosagem": row.dosagem, "responsavel": row.responsavel,
        "observacoes": row.observacoes,
    }


@require_http_methods(["GET", "POST"])
def manejo_api(request):
    farm, error = _farm_for_request(request, "view" if request.method == "GET" else "record")
    if error:
        return error
    if request.method == "GET":
        rows = Manejo.objects.filter(fazenda=farm).select_related("animal", "produto_utilizado").order_by("-data", "-id")[:150]
        return JsonResponse({"ok": True, "manejos": [_management_json(row) for row in rows]})
    data = _body(request)
    if data is None:
        return _error("Envie os dados do manejo em formato válido.")
    try:
        animal = _record_animal(farm, data.get("animal_id"))
        product = None
        if data.get("produto_id") not in (None, ""):
            product = _products_for_farm(farm).filter(pk=int(data["produto_id"])).first()
            if not product:
                raise ValueError("produto_id")
        product_amount = None
        if product:
            product_amount = _decimal_value(data.get("quantidade_produto"), "quantidade_produto")
            if product_amount <= 0:
                raise ValueError("quantidade_produto")
        elif data.get("quantidade_produto") not in (None, ""):
            raise ValueError("produto_id")
        row = Manejo(
            fazenda=farm, animal=animal,
            tipo_evento=_string_value(data.get("tipo")),
            data=_date_value(data.get("data")),
            descricao=_string_value(data.get("descricao")),
            produto_utilizado=product,
            quantidade_produto=product_amount,
            dosagem=_string_value(data.get("dosagem")),
            responsavel=_string_value(data.get("responsavel")),
            observacoes=_string_value(data.get("observacoes")),
        )
    except (TypeError, ValueError) as exc:
        return _error(f"Valor inválido para {exc.args[0] if exc.args else 'produto_id'}.")
    field_errors = _validated(row)
    if field_errors:
        return _error("Revise os dados do manejo.", field_errors=field_errors)
    try:
        with transaction.atomic():
            if product:
                locked_product = Produto.objects.select_for_update().get(pk=product.pk, fazenda=farm, ativo=True)
                if locked_product.quantidade_atual < product_amount:
                    return _error(
                        f"Estoque insuficiente. Disponível: {locked_product.quantidade_atual} {locked_product.unidade}."
                    )
                locked_product.quantidade_atual -= product_amount
                locked_product.save(update_fields=["quantidade_atual", "atualizado_em"])
                MovimentacaoEstoque.objects.create(
                    produto=locked_product,
                    tipo=MovimentacaoEstoque.Tipo.SAIDA,
                    quantidade=product_amount,
                    motivo="Consumo na pecuária",
                    data=row.data,
                    observacao=row.observacoes or row.descricao,
                    criado_por=request.user,
                )
            row.save()
    except Produto.DoesNotExist:
        return _error("O produto selecionado não está mais disponível.", 409)
    row = Manejo.objects.select_related("animal", "produto_utilizado").get(pk=row.pk)
    return JsonResponse({"ok": True, "manejo": _management_json(row)}, status=201)


def _reproduction_json(row):
    return {
        "id": row.id, "animal_id": row.animal_id,
        "animal": row.animal.identificacao, "tipo": row.tipo,
        "tipo_label": row.get_tipo_display(), "data": row.data.isoformat(),
        "touro_inseminador": row.touro_inseminador,
        "data_estimada_parto": row.data_estimada_parto.isoformat() if row.data_estimada_parto else "",
        "status_gestacao": row.status_gestacao,
        "status_gestacao_label": row.get_status_gestacao_display() if row.status_gestacao else "",
        "observacoes": row.observacoes,
    }


@require_http_methods(["GET", "POST"])
def reproducao_api(request):
    farm, error = _farm_for_request(request, "view" if request.method == "GET" else "record")
    if error:
        return error
    if request.method == "GET":
        rows = Reproducao.objects.filter(fazenda=farm).select_related("animal").order_by("-data", "-id")[:150]
        return JsonResponse({"ok": True, "reproducoes": [_reproduction_json(row) for row in rows]})
    data = _body(request)
    if data is None:
        return _error("Envie os dados reprodutivos em formato válido.")
    try:
        animal = _record_animal(farm, data.get("animal_id"))
        event_date = _date_value(data.get("data"))
        event_type = _string_value(data.get("tipo"))
        due_date = _date_value(data["data_estimada_parto"], "data_estimada_parto") if data.get("data_estimada_parto") else None
        if not due_date and event_type in ("INSEMINACAO", "MONTA", "GESTACAO"):
            due_date = event_date + timedelta(days=283)
        pregnancy_status = _string_value(data.get("status_gestacao"))
        if not pregnancy_status:
            pregnancy_status = {
                "INSEMINACAO": "PENDENTE",
                "MONTA": "PENDENTE",
                "GESTACAO": "CONFIRMADA",
                "DIAGNOSTICO": "PENDENTE",
                "PARTO": "CONCLUIDA",
                "ABORTO": "CONCLUIDA",
            }.get(event_type, "")
        row = Reproducao(
            fazenda=farm, animal=animal, tipo=event_type, data=event_date,
            touro_inseminador=_string_value(data.get("touro_inseminador")),
            data_estimada_parto=due_date,
            status_gestacao=pregnancy_status,
            observacoes=_string_value(data.get("observacoes")),
        )
    except ValueError as exc:
        return _error(f"Valor inválido para {exc.args[0]}.")
    field_errors = _validated(row)
    if field_errors:
        return _error("Revise os dados reprodutivos.", field_errors=field_errors)
    row.save()
    row = Reproducao.objects.select_related("animal").get(pk=row.pk)
    return JsonResponse({"ok": True, "reproducao": _reproduction_json(row)}, status=201)


def _feeding_json(row):
    return {
        "id": row.id, "animal_id": row.animal_id,
        "animal": row.animal.identificacao if row.animal else "Lote/Geral",
        "produto_id": row.produto_id, "produto": row.produto.nome if row.produto else "",
        "tipo_alimento": row.tipo_alimento, "quantidade": float(row.quantidade),
        "unidade": row.unidade, "data": row.data.isoformat(),
        "observacao": row.observacao,
    }


@require_http_methods(["GET", "POST"])
def alimentacao_api(request):
    farm, error = _farm_for_request(request, "view" if request.method == "GET" else "record")
    if error:
        return error
    if request.method == "GET":
        rows = Alimentacao.objects.filter(fazenda=farm).select_related("animal", "produto").order_by("-data", "-id")[:150]
        return JsonResponse({"ok": True, "alimentacoes": [_feeding_json(row) for row in rows]})
    data = _body(request)
    if data is None:
        return _error("Envie os dados da alimentação em formato válido.")
    try:
        animal = _record_animal(farm, data.get("animal_id"), required=False)
        product = None
        if data.get("produto_id") not in (None, ""):
            product = _products_for_farm(farm).filter(pk=int(data["produto_id"])).first()
            if not product:
                raise ValueError("produto_id")
        amount = _decimal_value(data.get("quantidade"), "quantidade")
        if amount <= 0:
            raise ValueError("quantidade")
        row = Alimentacao(
            fazenda=farm, animal=animal, produto=product,
            tipo_alimento=_string_value(data.get("tipo_alimento")),
            quantidade=amount,
            unidade=(product.unidade if product else _string_value(data.get("unidade"))),
            data=_date_value(data.get("data")),
            observacao=_string_value(data.get("observacao")),
            criado_por=request.user,
        )
    except (TypeError, ValueError) as exc:
        return _error(f"Valor inválido para {exc.args[0] if exc.args else 'produto_id'}.")
    field_errors = _validated(row)
    if field_errors:
        return _error("Revise os dados da alimentação.", field_errors=field_errors)
    try:
        with transaction.atomic():
            if product:
                locked_product = Produto.objects.select_for_update().get(pk=product.pk, fazenda=farm, ativo=True)
                if locked_product.quantidade_atual < amount:
                    return _error(
                        f"Estoque insuficiente. Disponível: {locked_product.quantidade_atual} {locked_product.unidade}."
                    )
                locked_product.quantidade_atual -= amount
                locked_product.save(update_fields=["quantidade_atual", "atualizado_em"])
                MovimentacaoEstoque.objects.create(
                    produto=locked_product,
                    tipo=MovimentacaoEstoque.Tipo.SAIDA,
                    quantidade=amount,
                    motivo="Consumo na pecuária",
                    data=row.data,
                    observacao=row.observacao,
                    criado_por=request.user,
                )
                row.produto = locked_product
            row.save()
    except Produto.DoesNotExist:
        return _error("O produto selecionado não está mais disponível.", 409)
    row = Alimentacao.objects.select_related("animal", "produto").get(pk=row.pk)
    return JsonResponse({"ok": True, "alimentacao": _feeding_json(row)}, status=201)
