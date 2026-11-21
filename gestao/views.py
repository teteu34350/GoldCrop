import json
import os
import re
import unicodedata
import urllib.error
import urllib.request
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F, Sum
from django.http import HttpResponseForbidden, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from dashboard.models import EventoCalendario, MovimentacaoEstoque, Produto, Talhao
from dashboard.views import _current_farm, _has_farm_permission
from pecuaria.models import Animal, ProducaoLeite

from .models import EquipamentoAgricola, LancamentoFinanceiro, Safra, ServicoFazenda


MODULES = {
    'financeiro': ('Financeiro', 'Acompanhe receitas, despesas e compras da fazenda.'),
    'safras': ('Safras', 'Organize culturas, áreas, plantios e colheitas.'),
    'servicos': ('Serviços', 'Controle serviços contratados e prestados.'),
    'equipamentos': ('Máquinas e equipamentos', 'Acompanhe seus equipamentos e manutenções.'),
    'registros': ('Registros', 'Consulte e registre atividades da fazenda.'),
    'relatorios': ('Relatórios', 'Resumo baseado nos dados persistidos da fazenda.'),
    'assistente': ('Assistente IA', 'Consulte os dados locais e prepare lançamentos com confirmação.'),
}


def _error(message, status=400, field_errors=None):
    payload = {'ok': False, 'message': message}
    if field_errors:
        payload['field_errors'] = field_errors
    return JsonResponse(payload, status=status)


def _body(request):
    try:
        payload = json.loads(request.body)
    except (TypeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _farm_for_request(request, permission='view'):
    if not request.user.is_authenticated:
        return None, _error('Autenticação necessária.', 401)
    farm = _current_farm(request)
    if not farm:
        return None, _error('Fazenda não encontrada.', 404)
    if not _has_farm_permission(farm, request.user, permission):
        return None, _error('Acesso negado.', 403)
    return farm, None


def _decimal(value, field, *, minimum=Decimal('0'), required=True):
    if value in (None, '') and not required:
        return None
    try:
        result = Decimal(str(value).replace(',', '.'))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(field) from None
    if not result.is_finite() or result < minimum:
        raise ValueError(field)
    return result


def _date(value, field='data', *, required=True):
    if value in (None, '') and not required:
        return None
    parsed = parse_date(str(value))
    if parsed is None:
        raise ValueError(field)
    return parsed


def _format_brl(value):
    formatted = f'{value:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return f'R$ {formatted}'


def _format_quantity(value):
    formatted = format(value, 'f')
    return formatted.rstrip('0').rstrip('.') if '.' in formatted else formatted


def _validated(model):
    try:
        model.full_clean()
    except ValidationError as error:
        return {key: [str(message) for message in messages] for key, messages in error.message_dict.items()}
    return None


def _module_page(request, module):
    if module not in MODULES:
        return _error('Página não encontrada.', 404)
    if not request.user.is_authenticated:
        return redirect(f'/login/?next={request.path}')
    farm = _current_farm(request)
    if not farm:
        return redirect('dashboard:farm_onboarding')
    if not _has_farm_permission(farm, request.user, 'view'):
        return HttpResponseForbidden('Acesso negado.')
    profile = getattr(request.user, 'perfil', None)
    name = profile.nome_completo if profile else request.user.get_full_name() or request.user.username
    title, description = MODULES[module]
    return render(request, 'gestao/module.html', {
        'module': module,
        'module_title': title,
        'module_description': description,
        'talhoes': Talhao.objects.filter(fazenda=farm, ativo=True),
        'event_categories': EventoCalendario.Categoria.choices,
        'auth_user_data': {
            'id': request.user.id,
            'name': name,
            'initials': ''.join(part[0] for part in name.split()[:2]).upper(),
            'email': request.user.email,
            'phone': profile.telefone if profile else '',
            'role': '',
            'farm': farm.nome,
        },
    })


def financeiro_page(request):
    return _module_page(request, 'financeiro')


def safras_page(request):
    return _module_page(request, 'safras')


def servicos_page(request):
    return _module_page(request, 'servicos')


def equipamentos_page(request):
    return _module_page(request, 'equipamentos')


def registros_page(request):
    return _module_page(request, 'registros')


def relatorios_page(request):
    return _module_page(request, 'relatorios')


def assistente_page(request):
    return _module_page(request, 'assistente')


@require_http_methods(['GET', 'POST'])
def financeiro_api(request):
    farm, error = _farm_for_request(request, 'view' if request.method == 'GET' else 'record')
    if error:
        return error
    if request.method == 'GET':
        rows = LancamentoFinanceiro.objects.filter(fazenda=farm)[:200]
        month_start = timezone.localdate().replace(day=1)
        current = LancamentoFinanceiro.objects.filter(fazenda=farm, data__gte=month_start, data__lte=timezone.localdate())
        return JsonResponse({
            'ok': True,
            'totals': {
                'receitas': str(current.filter(tipo=LancamentoFinanceiro.Tipo.RECEITA).aggregate(total=Sum('valor'))['total'] or 0),
                'despesas': str(current.exclude(tipo=LancamentoFinanceiro.Tipo.RECEITA).aggregate(total=Sum('valor'))['total'] or 0),
            },
            'lancamentos': [{
                'id': row.id, 'tipo': row.tipo, 'titulo': row.titulo,
                'categoria': row.categoria, 'valor': str(row.valor),
                'data': row.data.isoformat(), 'observacao': row.observacao,
            } for row in rows],
        })

    data = _body(request)
    if data is None:
        return _error('Dados inválidos.')
    tipo = str(data.get('tipo', '')).upper()
    titulo = str(data.get('titulo', '')).strip()
    if tipo not in LancamentoFinanceiro.Tipo.values or not titulo:
        return _error('Informe o tipo e a descrição do lançamento.')
    try:
        valor = _decimal(data.get('valor'), 'valor', minimum=Decimal('0.01'))
        data_lancamento = _date(data.get('data') or timezone.localdate().isoformat())
    except ValueError as error:
        return _error(f'Confira o campo {error.args[0]}.')
    row = LancamentoFinanceiro(
        fazenda=farm, tipo=tipo, titulo=titulo,
        categoria=str(data.get('categoria', 'Outros')).strip() or 'Outros',
        valor=valor, data=data_lancamento,
        observacao=str(data.get('observacao', '')).strip(), criado_por=request.user,
    )
    errors = _validated(row)
    if errors:
        return _error('Revise os dados do lançamento.', field_errors=errors)
    row.save()
    return JsonResponse({'ok': True, 'id': row.id}, status=201)


@require_http_methods(['GET', 'POST'])
def safras_api(request):
    farm, error = _farm_for_request(request, 'view' if request.method == 'GET' else 'record')
    if error:
        return error
    if request.method == 'GET':
        rows = Safra.objects.filter(fazenda=farm).prefetch_related('talhoes')
        return JsonResponse({'ok': True, 'safras': [{
            'id': row.id, 'cultura': row.cultura, 'variedade': row.variedade,
            'ano_safra': row.ano_safra, 'area_hectares': str(row.area_hectares),
            'data_plantio': row.data_plantio.isoformat() if row.data_plantio else '',
            'colheita_prevista': row.colheita_prevista.isoformat() if row.colheita_prevista else '',
            'status': row.status, 'talhoes': [talhao.nome for talhao in row.talhoes.all()],
        } for row in rows]})
    data = _body(request)
    if data is None:
        return _error('Dados inválidos.')
    try:
        area = _decimal(data.get('area_hectares'), 'area_hectares', minimum=Decimal('0.01'))
        data_plantio = _date(data.get('data_plantio'), 'data_plantio', required=False)
        colheita = _date(data.get('colheita_prevista'), 'colheita_prevista', required=False)
    except ValueError as error:
        return _error(f'Confira o campo {error.args[0]}.')
    cultura = str(data.get('cultura', '')).strip()
    ano_safra = str(data.get('ano_safra', '')).strip()
    talhao_ids = data.get('talhoes', [])
    if not cultura or not ano_safra or not isinstance(talhao_ids, list):
        return _error('Informe cultura, ano da safra e talhões válidos.')
    try:
        parsed_ids = [int(value) for value in talhao_ids]
    except (TypeError, ValueError):
        return _error('Selecione talhões válidos.')
    talhoes = list(Talhao.objects.filter(fazenda=farm, ativo=True, id__in=parsed_ids))
    if len(talhoes) != len(set(parsed_ids)):
        return _error('Um ou mais talhões não pertencem a esta fazenda.')
    row = Safra(
        fazenda=farm, cultura=cultura, variedade=str(data.get('variedade', '')).strip(),
        ano_safra=ano_safra, area_hectares=area, data_plantio=data_plantio,
        colheita_prevista=colheita, status=data.get('status') or Safra.Status.PLANEJAMENTO,
        observacao=str(data.get('observacao', '')).strip(), criado_por=request.user,
    )
    errors = _validated(row)
    if errors:
        return _error('Revise os dados da safra.', field_errors=errors)
    row.save()
    row.talhoes.set(talhoes)
    return JsonResponse({'ok': True, 'id': row.id}, status=201)


@require_http_methods(['GET', 'POST'])
def servicos_api(request):
    farm, error = _farm_for_request(request, 'view' if request.method == 'GET' else 'record')
    if error:
        return error
    if request.method == 'GET':
        rows = ServicoFazenda.objects.filter(fazenda=farm)[:200]
        return JsonResponse({'ok': True, 'servicos': [{
            'id': row.id, 'nome': row.nome, 'tipo': row.tipo, 'pessoa': row.pessoa,
            'local': row.local, 'quantidade': row.quantidade,
            'valor': str(row.valor) if row.valor is not None else '',
            'data': row.data.isoformat(), 'status': row.status, 'observacao': row.observacao,
        } for row in rows]})
    data = _body(request)
    if data is None:
        return _error('Dados inválidos.')
    try:
        valor = _decimal(data.get('valor'), 'valor', minimum=Decimal('0'), required=False)
        data_servico = _date(data.get('data') or timezone.localdate().isoformat())
    except ValueError as error:
        return _error(f'Confira o campo {error.args[0]}.')
    row = ServicoFazenda(
        fazenda=farm, nome=str(data.get('nome', '')).strip(),
        tipo=str(data.get('tipo', '')).upper(), pessoa=str(data.get('pessoa', '')).strip(),
        local=str(data.get('local', '')).strip(), quantidade=str(data.get('quantidade', '')).strip(),
        valor=valor, data=data_servico,
        status=str(data.get('status') or ServicoFazenda.Status.PENDENTE).upper(),
        observacao=str(data.get('observacao', '')).strip(), criado_por=request.user,
    )
    errors = _validated(row)
    if errors:
        return _error('Revise os dados do serviço.', field_errors=errors)
    row.save()
    return JsonResponse({'ok': True, 'id': row.id}, status=201)


@require_http_methods(['GET', 'POST'])
def equipamentos_api(request):
    farm, error = _farm_for_request(request, 'view' if request.method == 'GET' else 'record')
    if error:
        return error
    if request.method == 'GET':
        rows = EquipamentoAgricola.objects.filter(fazenda=farm)[:200]
        return JsonResponse({'ok': True, 'equipamentos': [{
            'id': row.id, 'nome': row.nome, 'tipo': row.tipo,
            'identificacao': row.identificacao,
            'horimetro': str(row.horimetro) if row.horimetro is not None else '',
            'status': row.status,
            'ultima_manutencao': row.ultima_manutencao.isoformat() if row.ultima_manutencao else '',
            'proxima_manutencao': row.proxima_manutencao.isoformat() if row.proxima_manutencao else '',
            'observacao': row.observacao,
        } for row in rows]})
    data = _body(request)
    if data is None:
        return _error('Dados inválidos.')
    try:
        horimetro = _decimal(data.get('horimetro'), 'horimetro', minimum=Decimal('0'), required=False)
        ultima = _date(data.get('ultima_manutencao'), 'ultima_manutencao', required=False)
        proxima = _date(data.get('proxima_manutencao'), 'proxima_manutencao', required=False)
    except ValueError as error:
        return _error(f'Confira o campo {error.args[0]}.')
    row = EquipamentoAgricola(
        fazenda=farm, nome=str(data.get('nome', '')).strip(),
        tipo=str(data.get('tipo', '')).strip(),
        identificacao=str(data.get('identificacao', '')).strip(),
        horimetro=horimetro,
        status=str(data.get('status') or EquipamentoAgricola.Status.OPERACIONAL).upper(),
        ultima_manutencao=ultima, proxima_manutencao=proxima,
        observacao=str(data.get('observacao', '')).strip(), criado_por=request.user,
    )
    errors = _validated(row)
    if errors:
        return _error('Revise os dados do equipamento.', field_errors=errors)
    row.save()
    return JsonResponse({'ok': True, 'id': row.id}, status=201)


@require_http_methods(['GET', 'POST'])
def registros_api(request):
    farm, error = _farm_for_request(request, 'view' if request.method == 'GET' else 'record')
    if error:
        return error
    if request.method == 'GET':
        rows = EventoCalendario.objects.filter(fazenda=farm).select_related('talhao')[:200]
        return JsonResponse({'ok': True, 'registros': [{
            'id': row.id, 'titulo': row.titulo, 'categoria': row.categoria,
            'data': row.data.isoformat(), 'status': row.status,
            'talhao': row.talhao.nome if row.talhao else '',
            'descricao': row.descricao or row.observacoes,
        } for row in rows]})
    data = _body(request)
    if data is None:
        return _error('Dados inválidos.')
    try:
        data_evento = _date(data.get('data') or timezone.localdate().isoformat())
    except ValueError:
        return _error('Informe uma data válida.')
    talhao = None
    talhao_id = data.get('talhao_id')
    if talhao_id:
        try:
            talhao = Talhao.objects.get(pk=int(talhao_id), fazenda=farm, ativo=True)
        except (TypeError, ValueError, Talhao.DoesNotExist):
            return _error('Talhão não encontrado nesta fazenda.')
    row = EventoCalendario(
        fazenda=farm, criado_por=request.user, titulo=str(data.get('titulo', '')).strip(),
        descricao=str(data.get('descricao', '')).strip(), data=data_evento,
        categoria=str(data.get('categoria') or EventoCalendario.Categoria.TAREFA).upper(),
        status=str(data.get('status') or EventoCalendario.Status.CONCLUIDA).upper(),
        talhao=talhao, prioridade=EventoCalendario.Prioridade.MEDIA,
    )
    errors = _validated(row)
    if errors:
        return _error('Revise os dados do registro.', field_errors=errors)
    row.save()
    return JsonResponse({'ok': True, 'id': row.id}, status=201)


@require_GET
def relatorios_api(request):
    farm, error = _farm_for_request(request)
    if error:
        return error
    today = timezone.localdate()
    month_start = today.replace(day=1)
    financial = LancamentoFinanceiro.objects.filter(fazenda=farm, data__gte=month_start, data__lte=today)
    total_income = financial.filter(tipo=LancamentoFinanceiro.Tipo.RECEITA).aggregate(total=Sum('valor'))['total'] or Decimal('0')
    total_expense = financial.exclude(tipo=LancamentoFinanceiro.Tipo.RECEITA).aggregate(total=Sum('valor'))['total'] or Decimal('0')
    products = Produto.objects.filter(fazenda=farm, ativo=True)
    low_items = products.filter(quantidade_atual__lte=F('estoque_minimo')).values(
        'nome', 'quantidade_atual', 'unidade', 'estoque_minimo',
    )
    recent_movements = LancamentoFinanceiro.objects.filter(
        fazenda=farm,
    ).order_by('-data', '-criado_em')[:5]
    return JsonResponse({
        'ok': True,
        'periodo': f'{month_start.isoformat()} a {today.isoformat()}',
        'financeiro': {
            'receitas': str(total_income), 'despesas': str(total_expense),
            'saldo': str(total_income - total_expense),
        },
        'movimentacoes_recentes': [{
            'tipo': row.tipo,
            'titulo': row.titulo,
            'categoria': row.categoria,
            'valor': str(row.valor),
            'data': row.data.isoformat(),
        } for row in recent_movements],
        'estoque_baixo': [{
            'nome': row['nome'], 'quantidade': str(row['quantidade_atual']),
            'unidade': row['unidade'], 'estoque_minimo': str(row['estoque_minimo']),
        } for row in low_items],
        'servicos_pendentes': ServicoFazenda.objects.filter(
            fazenda=farm, status=ServicoFazenda.Status.PENDENTE,
        ).count(),
        'equipamentos_manutencao': EquipamentoAgricola.objects.filter(
            fazenda=farm, status=EquipamentoAgricola.Status.MANUTENCAO,
        ).count(),
    })


def _normalize(value):
    normalized = unicodedata.normalize('NFD', value.casefold())
    return ''.join(char for char in normalized if unicodedata.category(char) != 'Mn')


def _money_value(text):
    number = r'((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)'
    patterns = (
        rf'R\$\s*{number}',
        rf'{number}\s*(?:reais?|brl)\b',
        rf'(?:por|no valor de|valor de|custou|total de)\s*(?:R\$\s*)?{number}',
        rf'(?:gastei|paguei|despesa|despesas|comprei|compra|recebi|receita|vendi)(?:\s+de)?\s+(?:R\$\s*)?{number}(?!\s*(?:kg|l|litros?|unidades?|ha)\b)',
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue
        raw = match.group(1)
        normalized = raw.replace('.', '').replace(',', '.') if ',' in raw else re.sub(r'\.(?=\d{3}(?:$|[^\d]))', '', raw)
        try:
            value = Decimal(normalized)
        except InvalidOperation:
            continue
        if value.is_finite() and value > 0:
            return value
    return None


def _stock_products(farm, normalized_message):
    matchers = (
        ('semente',),
        ('adubo', 'fertilizante'),
        ('defensivo',),
        ('diesel', 'combustivel'),
        ('peca',),
    )
    for words in matchers:
        if any(word in normalized_message for word in words):
            return [
                product for product in Produto.objects.filter(fazenda=farm, ativo=True)
                if any(word in _normalize(f'{product.nome} {product.categoria}') for word in words)
            ]
    return []


def _normalize_unit(value):
    unit = _normalize(value).rstrip('.')
    if unit in {'litro', 'litros', 'l'}:
        return 'l'
    if unit in {'quilo', 'quilos', 'kg'}:
        return 'kg'
    if unit.startswith('unidade') or unit == 'un':
        return 'un'
    return unit


def _stage_assistant_action(request, farm, kind, payload, description):
    request.session['gestao_assistente_pendente'] = {
        'user_id': request.user.id,
        'farm_id': farm.id,
        'kind': kind,
        'payload': payload,
        'created_at': timezone.now().timestamp(),
    }
    return JsonResponse({
        'ok': True,
        'reply': f'Posso fazer esta alteração no banco do GoldCrop: {description}. Deseja confirmar?',
        'confirmation_required': True,
    })


def _local_assistant_reply(request, farm, message):
    normalized = _normalize(message)
    is_question = '?' in message or re.match(
        r'^(?:(?:me\s+)?(?:diga|fala|informe)\s+)?'
        r'(quant[oa]s?|qual|quais|como|mostre|liste|consulte|tem)\b',
        normalized,
    )
    month_start = timezone.localdate().replace(day=1)

    if is_question and re.search(
        r'\b(animal|animais|rebanho|gado|vacas?|novilhas?|bezerros?|bezerras?|touros?)\b',
        normalized,
    ):
        active_animals = Animal.objects.filter(fazenda=farm, status='ATIVO', arquivado=False)
        category_counts = {
            'vaca': ('VACA_LACTACAO', 'VACA_SECA'),
            'novilha': ('NOVILHA',),
            'bezerro': ('BEZERRO', 'BEZERRA'),
            'bezerra': ('BEZERRA',),
            'touro': ('TOURO',),
        }
        category = next(
            (key for key in category_counts if re.search(rf'\b{key}s?\b', normalized)),
            None,
        )
        if category:
            count = active_animals.filter(categoria__in=category_counts[category]).count()
            singular, plural, gender = {
                'vaca': ('vaca', 'vacas', 'f'),
                'novilha': ('novilha', 'novilhas', 'f'),
                'bezerro': ('bezerro', 'bezerros', 'm'),
                'bezerra': ('bezerra', 'bezerras', 'f'),
                'touro': ('touro', 'touros', 'm'),
            }[category]
            noun = singular if count == 1 else plural
            if gender == 'f':
                adjective = 'ativa' if count == 1 else 'ativas'
                participle = 'cadastrada' if count == 1 else 'cadastradas'
            else:
                adjective = 'ativo' if count == 1 else 'ativos'
                participle = 'cadastrado' if count == 1 else 'cadastrados'
            return JsonResponse({
                'ok': True,
                'reply': f'A fazenda atual tem {count} {noun} {adjective} {participle} no GoldCrop.',
            })

        count = active_animals.count()
        noun = 'animal' if count == 1 else 'animais'
        adjective = 'ativo' if count == 1 else 'ativos'
        participle = 'cadastrado' if count == 1 else 'cadastrados'
        return JsonResponse({
            'ok': True,
            'reply': f'A fazenda atual tem {count} {noun} {adjective} {participle} no GoldCrop.',
        })

    if is_question and re.search(r'\b(leite|litros?)\b', normalized) and re.search(
        r'\b(producao|produziu|produzimos|ordenha|litros?)\b',
        normalized,
    ):
        today = timezone.localdate()
        if re.search(r'\b(semana|semanal|ultimos?\s+7\s+dias)\b', normalized):
            start_date = today - timedelta(days=6)
            period = 'nos últimos 7 dias'
        elif re.search(r'\b(mes|mensal)\b', normalized):
            start_date = today.replace(day=1)
            period = 'neste mês'
        else:
            start_date = today
            period = 'hoje'
        total = ProducaoLeite.objects.filter(
            fazenda=farm, data__gte=start_date, data__lte=today,
        ).aggregate(total=Sum('quantidade'))['total'] or Decimal('0')
        return JsonResponse({
            'ok': True,
            'reply': f'A produção de leite registrada {period} soma {total} litros.',
        })

    if is_question and re.search(r'\b(servico|servicos|pendente|pendentes)\b', normalized):
        count = ServicoFazenda.objects.filter(
            fazenda=farm, status=ServicoFazenda.Status.PENDENTE,
        ).count()
        noun = 'serviço pendente registrado' if count == 1 else 'serviços pendentes registrados'
        return JsonResponse({
            'ok': True,
            'reply': f'A fazenda tem {count} {noun} no GoldCrop.',
        })

    if is_question and re.search(r'\b(equipamento|equipamentos|maquina|maquinas|manutencao)\b', normalized):
        equipment = EquipamentoAgricola.objects.filter(fazenda=farm)
        if re.search(r'\b(manutencao|conserto|oficina)\b', normalized):
            count = equipment.filter(status=EquipamentoAgricola.Status.MANUTENCAO).count()
            noun = 'equipamento marcado' if count == 1 else 'equipamentos marcados'
            reply = f'{count} {noun} para manutenção no GoldCrop.'
        else:
            count = equipment.exclude(status=EquipamentoAgricola.Status.INATIVO).count()
            noun = 'equipamento ativo cadastrado' if count == 1 else 'equipamentos ativos cadastrados'
            reply = f'A fazenda tem {count} {noun} no GoldCrop.'
        return JsonResponse({'ok': True, 'reply': reply})

    if is_question and re.search(r'\b(quanto|total|soma|saldo)\b', normalized):
        if re.search(r'\b(gastei|gasto|despesa|despesas|compras?)\b', normalized):
            rows = LancamentoFinanceiro.objects.filter(
                fazenda=farm, data__gte=month_start, data__lte=timezone.localdate(),
            ).exclude(
                tipo=LancamentoFinanceiro.Tipo.RECEITA,
            )
            total = rows.aggregate(total=Sum('valor'))['total'] or Decimal('0')
            return JsonResponse({'ok': True, 'reply': f'As despesas e compras registradas neste mês somam {_format_brl(total)}.'})
        if re.search(r'\b(receita|receitas|recebi|venda|vendi)\b', normalized):
            total = LancamentoFinanceiro.objects.filter(
                fazenda=farm, data__gte=month_start, data__lte=timezone.localdate(),
                tipo=LancamentoFinanceiro.Tipo.RECEITA,
            ).aggregate(total=Sum('valor'))['total'] or Decimal('0')
            return JsonResponse({'ok': True, 'reply': f'As receitas registradas neste mês somam {_format_brl(total)}.'})
        if 'saldo' in normalized:
            income = LancamentoFinanceiro.objects.filter(
                fazenda=farm, data__gte=month_start, data__lte=timezone.localdate(),
                tipo=LancamentoFinanceiro.Tipo.RECEITA,
            ).aggregate(total=Sum('valor'))['total'] or Decimal('0')
            expenses = LancamentoFinanceiro.objects.filter(
                fazenda=farm, data__gte=month_start, data__lte=timezone.localdate(),
            ).exclude(tipo=LancamentoFinanceiro.Tipo.RECEITA).aggregate(total=Sum('valor'))['total'] or Decimal('0')
            return JsonResponse({'ok': True, 'reply': f'O saldo dos lançamentos deste mês é {_format_brl(income - expenses)}.'})

    if is_question and re.search(
        r'\b(estoque|produto|produtos|semente|adubo|fertilizante|defensivo|diesel|minimo|minima)\b',
        normalized,
    ):
        products = _stock_products(farm, normalized)
        if products:
            summary = '; '.join(
                f'{product.nome}: {_format_quantity(product.quantidade_atual)} {product.unidade}'
                for product in products
            )
            return JsonResponse({'ok': True, 'reply': f'Saldo no estoque do GoldCrop: {summary}.'})
        if re.search(r'\b(baixo|baixa|abaixo|minimo|minima|alerta|alertas|falta|acabando)\b', normalized):
            low_stock = Produto.objects.filter(fazenda=farm, ativo=True, quantidade_atual__lte=F('estoque_minimo'))
            count = low_stock.count()
            names = list(low_stock.values_list('nome', flat=True)[:8])
            reply = f'Encontrei {count} produto(s) no mínimo ou abaixo dele: {", ".join(names)}.' if names else 'Não há produtos abaixo do estoque mínimo.'
            return JsonResponse({'ok': True, 'reply': reply})
        products = Produto.objects.filter(fazenda=farm, ativo=True).order_by('nome')[:10]
        rows = [
            f'{product.nome}: {_format_quantity(product.quantidade_atual)} {product.unidade}'
            for product in products
        ]
        reply = f'Saldos atuais: {"; ".join(rows)}.' if rows else 'Não há produtos ativos cadastrados no estoque desta fazenda.'
        return JsonResponse({'ok': True, 'reply': reply})

    if not is_question and re.search(r'\b(despesa|despesas|gastei|gasto|paguei|comprei|compra|compras|receita|recebi|vendi)\b', normalized):
        if not _has_farm_permission(farm, request.user, 'record'):
            return _error('Você não tem permissão para propor lançamentos nesta fazenda.', 403)
        kind = (
            LancamentoFinanceiro.Tipo.RECEITA
            if re.search(r'\b(receita|recebi|vendi)\b', normalized)
            else LancamentoFinanceiro.Tipo.COMPRA
            if re.search(r'\b(comprei|compra|compras)\b', normalized) and not re.search(r'\b(despesa|gastei|paguei)\b', normalized)
            else LancamentoFinanceiro.Tipo.DESPESA
        )
        value = _money_value(message)
        label = kind.lower()
        if value is None:
            return JsonResponse({'ok': True, 'reply': f'Qual foi o valor da {label}? Informe, por exemplo, “Tive uma despesa de R$ 350 com diesel”.'})
        title = re.sub(r'R\$\s*[\d.,]+|[\d.,]+\s*(?:reais?|brl)\b', ' ', message, flags=re.IGNORECASE)
        title = re.sub(
            r'\b(eu|tive|uma|um|despesa|despesas|gasto|gastos|gastei|paguei|pago|comprei|compra|compras|receita|recebi|vendi|venda|de|da|do|com|em|no|na|por|hoje)\b',
            ' ', title, flags=re.IGNORECASE,
        )
        title = re.sub(r'\s+', ' ', title).strip(' ,.!?') or f'{kind.title()} informada'
        title = title[0].upper() + title[1:]
        category = 'Combustível' if re.search(r'\b(diesel|combustivel)\b', normalized) else 'Insumos' if re.search(r'\b(adubo|fertilizante|semente|defensivo)\b', normalized) else 'Outros'
        payload = {
            'tipo': kind,
            'titulo': title[:160],
            'categoria': category,
            'valor': str(value),
            'data': timezone.localdate().isoformat(),
            'observacao': 'Lançamento preparado pelo assistente.',
        }
        return _stage_assistant_action(request, farm, 'financeiro', payload, f'{kind.title()} de {_format_brl(value)} para "{payload["titulo"]}"')

    if not is_question and re.search(r'\b(zerar|zere|zera|zerou|acabou|acabaram|esgotar|esgotou|usei|consumi|retirei|baixar|dei baixa)\b', normalized) and re.search(r'\b(estoque|sementes?|adubo|fertilizante|defensivo|diesel|combustivel|pecas?)\b', normalized):
        if not _has_farm_permission(farm, request.user, 'record'):
            return _error('Você não tem permissão para propor movimentações nesta fazenda.', 403)
        products = _stock_products(farm, normalized)
        if not products:
            return JsonResponse({'ok': True, 'reply': 'Não encontrei esse produto no estoque desta fazenda. Confira o nome do item.'})
        if re.search(r'\b(zerar|zere|zera|zerou|acabou|acabaram|esgotar|esgotou)\b', normalized):
            changes = [
                {
                    'produto_id': product.id,
                    'quantidade': str(product.quantidade_atual),
                    'saldo_esperado': str(product.quantidade_atual),
                }
                for product in products if product.quantidade_atual > 0
            ]
            if not changes:
                return JsonResponse({'ok': True, 'reply': 'O estoque correspondente já está zerado.'})
            names = ', '.join(product.nome for product in products if product.quantidade_atual > 0)
            return _stage_assistant_action(request, farm, 'estoque', {'movimentos': changes}, f'zerar o estoque de {names}')
        match = re.search(r'((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)\s*(kg|litros?|l|unidades?|un\.?|ha)(?=\s|$|[.,!?])', normalized)
        if not match:
            return JsonResponse({'ok': True, 'reply': 'Qual quantidade e unidade devo dar baixa? Exemplo: “Usei 50 kg de sementes”.'})
        if len(products) != 1:
            return JsonResponse({'ok': True, 'reply': 'Encontrei mais de um produto. Diga o nome exato para eu preparar a baixa.'})
        raw_quantity = match.group(1)
        normalized_quantity = raw_quantity.replace('.', '').replace(',', '.') if ',' in raw_quantity else re.sub(r'\.(?=\d{3}$)', '', raw_quantity)
        quantity = Decimal(normalized_quantity)
        unit = _normalize_unit(match.group(2))
        product = products[0]
        if unit != _normalize_unit(product.unidade):
            return JsonResponse({'ok': True, 'reply': f'O produto está cadastrado em {product.unidade}. Informe a quantidade nessa unidade.'})
        if quantity <= 0 or quantity > product.quantidade_atual:
            return JsonResponse({'ok': True, 'reply': f'Quantidade inválida ou maior que o saldo atual de {product.quantidade_atual} {product.unidade}.'})
        payload = {'movimentos': [{
            'produto_id': product.id,
            'quantidade': str(quantity),
            'saldo_esperado': str(product.quantidade_atual),
        }]}
        return _stage_assistant_action(request, farm, 'estoque', payload, f'dar baixa de {quantity} {product.unidade} em {product.nome}')

    if not is_question and re.search(r'\b(plantei|apliquei|colhi|irriguei|abasteci)\b', normalized):
        if not _has_farm_permission(farm, request.user, 'record'):
            return _error('Você não tem permissão para propor registros nesta fazenda.', 403)
        action = re.search(r'\b(plantei|apliquei|colhi|irriguei|abasteci)\b', normalized).group(1)
        event_type = {
            'plantei': EventoCalendario.Categoria.PLANTIO,
            'apliquei': EventoCalendario.Categoria.APLICACAO,
            'colhi': EventoCalendario.Categoria.COLHEITA,
            'irriguei': EventoCalendario.Categoria.IRRIGACAO,
            'abasteci': EventoCalendario.Categoria.TAREFA,
        }[action]
        activity_name = {
            'plantei': 'Plantio',
            'apliquei': 'Aplicação',
            'colhi': 'Colheita',
            'irriguei': 'Irrigação',
            'abasteci': 'Abastecimento',
        }[action]
        talhao_match = re.search(r'\b(talh[aã]o\s+[\w-]+)\b', message, re.IGNORECASE)
        talhao = None
        if talhao_match:
            talhao = Talhao.objects.filter(fazenda=farm, nome__iexact=talhao_match.group(1)).first()
            if not talhao:
                return JsonResponse({'ok': True, 'reply': f'Não encontrei {talhao_match.group(1)} nesta fazenda. Confira o nome do talhão.'})
        details = re.sub(r'\b(eu|plantei|apliquei|colhi|irriguei|abasteci|hoje|ontem|no|na|do|da|talh[aã]o\s+[\w-]+)\b', ' ', message, flags=re.IGNORECASE)
        details = re.sub(r'\s+', ' ', details).strip(' ,.!?')
        title = f'{activity_name} registrado' + (f': {details[:100]}' if details else '')
        return _stage_assistant_action(request, farm, 'atividade', {
            'titulo': title[:160],
            'categoria': event_type,
            'data': timezone.localdate().isoformat(),
            'talhao_id': talhao.id if talhao else None,
        }, f'registrar {activity_name.lower()}' + (f' em {talhao.nome}' if talhao else ''))

    return None


def _confirm_assistant_action(request, farm):
    pending = request.session.get('gestao_assistente_pendente')
    if not isinstance(pending, dict):
        return _error('Não há alteração pendente para confirmar.')
    if pending.get('user_id') != request.user.id or pending.get('farm_id') != farm.id:
        request.session.pop('gestao_assistente_pendente', None)
        return _error('A confirmação expirou ou pertence a outra fazenda.', 409)
    if timezone.now().timestamp() - pending.get('created_at', 0) > 600:
        request.session.pop('gestao_assistente_pendente', None)
        return _error('A confirmação expirou. Envie o comando novamente.', 409)
    if not _has_farm_permission(farm, request.user, 'record'):
        return _error('Você não tem permissão para gravar dados nesta fazenda.', 403)

    payload = pending.get('payload', {})
    if pending.get('kind') == 'financeiro':
        row = LancamentoFinanceiro(
            fazenda=farm, tipo=payload['tipo'], titulo=payload['titulo'],
            categoria=payload['categoria'], valor=Decimal(payload['valor']),
            data=parse_date(payload['data']), observacao=payload['observacao'],
            criado_por=request.user,
        )
        errors = _validated(row)
        if errors:
            return _error('Não foi possível validar o lançamento.', field_errors=errors)
        row.save()
        reply = f'Lançamento salvo no financeiro do GoldCrop: {row.get_tipo_display()} de {_format_brl(row.valor)} — {row.titulo}.'
    elif pending.get('kind') == 'estoque':
        movements = payload.get('movimentos', [])
        if not movements:
            return _error('A proposta de movimentação está vazia.')
        with transaction.atomic():
            products = []
            for movement in movements:
                try:
                    product = Produto.objects.select_for_update().get(
                        pk=int(movement['produto_id']), fazenda=farm, ativo=True,
                    )
                except (KeyError, TypeError, ValueError, Produto.DoesNotExist):
                    request.session.pop('gestao_assistente_pendente', None)
                    return _error('Um dos produtos não está mais disponível nesta fazenda.', 409)
                quantity = Decimal(movement['quantidade'])
                expected_balance = Decimal(movement.get('saldo_esperado', str(product.quantidade_atual)))
                if product.quantidade_atual != expected_balance:
                    request.session.pop('gestao_assistente_pendente', None)
                    return _error(f'O saldo de {product.nome} mudou. Envie o comando novamente para revisar a proposta.', 409)
                if quantity <= 0 or quantity > product.quantidade_atual:
                    request.session.pop('gestao_assistente_pendente', None)
                    return _error(f'O saldo de {product.nome} mudou. Envie o comando novamente para revisar a proposta.', 409)
                products.append((product, quantity))
            for product, quantity in products:
                product.quantidade_atual -= quantity
                product.save(update_fields=['quantidade_atual', 'atualizado_em'])
                MovimentacaoEstoque.objects.create(
                    produto=product, tipo=MovimentacaoEstoque.Tipo.SAIDA,
                    quantidade=quantity, motivo='Assistente IA',
                    data=timezone.localdate(), criado_por=request.user,
                    observacao='Movimentação confirmada pelo usuário no assistente.',
                )
        reply = 'Movimentação de estoque registrada no banco do GoldCrop.'
    elif pending.get('kind') == 'atividade':
        talhao = None
        talhao_id = payload.get('talhao_id')
        if talhao_id is not None:
            talhao = Talhao.objects.filter(pk=talhao_id, fazenda=farm, ativo=True).first()
            if not talhao:
                return _error('O talhão da proposta não está mais disponível nesta fazenda.', 409)
        row = EventoCalendario(
            fazenda=farm,
            criado_por=request.user,
            titulo=payload['titulo'],
            data=parse_date(payload['data']),
            categoria=payload['categoria'],
            status=EventoCalendario.Status.CONCLUIDA,
            prioridade=EventoCalendario.Prioridade.MEDIA,
            talhao=talhao,
            origem=EventoCalendario.Origem.USUARIO,
        )
        errors = _validated(row)
        if errors:
            return _error('Não foi possível validar o registro da atividade.', field_errors=errors)
        row.save()
        reply = f'Atividade registrada no calendário do GoldCrop: {row.titulo}.'
    else:
        return _error('Tipo de alteração pendente inválido.', 409)

    request.session.pop('gestao_assistente_pendente', None)
    return JsonResponse({'ok': True, 'reply': reply, 'saved': True})


@require_POST
def assistente_api(request):
    farm, error = _farm_for_request(request)
    if error:
        return error
    payload = _body(request)
    if payload is None:
        return _error('Mensagem inválida.')
    action = payload.get('action', 'message')
    if action == 'cancel':
        request.session.pop('gestao_assistente_pendente', None)
        return JsonResponse({'ok': True, 'reply': 'Não fiz nenhuma alteração.'})
    if action == 'confirm':
        return _confirm_assistant_action(request, farm)

    message = str(payload.get('message', '')).strip()
    if not message:
        return _error('Digite uma mensagem.')
    local_result = _local_assistant_reply(request, farm, message)
    if local_result is not None:
        return local_result

    api_key = os.environ.get('OPENROUTER_API_KEY', '').strip()
    if not api_key:
        return _error('OpenRouter não configurado. Defina OPENROUTER_API_KEY no ambiente do servidor.', 503)
    model = os.environ.get('OPENROUTER_MODEL', 'openrouter/free').strip()
    body = json.dumps({
        'model': model,
        'messages': [
            {'role': 'system', 'content': 'Você é o assistente do GoldCrop. Responda em português brasileiro, de forma prática e concisa. Você não recebe dados da fazenda e não deve inventar consultas ou alterações no banco.'},
            {'role': 'user', 'content': message[:4000]},
        ],
        'temperature': 0.3,
        'max_tokens': 500,
    }).encode('utf-8')
    external_request = urllib.request.Request(
        'https://openrouter.ai/api/v1/chat/completions',
        data=body,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'X-Title': 'GoldCrop',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(external_request, timeout=25) as response:
            result = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', errors='replace')[:500]
        return _error(f'OpenRouter retornou HTTP {error.code}: {detail}', 502)
    except urllib.error.URLError as error:
        return _error(f'Não foi possível conectar ao OpenRouter: {error.reason}', 502)
    except json.JSONDecodeError:
        return _error('OpenRouter retornou uma resposta inválida.', 502)
    except TimeoutError:
        return _error('A consulta ao OpenRouter excedeu o tempo limite.', 504)

    try:
        answer = result['choices'][0]['message']['content']
    except (KeyError, IndexError, TypeError):
        answer = ''
    if isinstance(answer, list):
        answer = ' '.join(part.get('text', '') for part in answer if isinstance(part, dict))
    if not isinstance(answer, str) or not answer.strip():
        return _error('OpenRouter não retornou uma resposta de texto.', 502)
    return JsonResponse({'ok': True, 'reply': answer.strip()})
