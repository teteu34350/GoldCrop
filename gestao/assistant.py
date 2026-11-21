import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.db.models import F, Q, Sum
from django.utils import timezone

from dashboard.models import (
    ColetaMeteorologica, EventoCalendario, ExecucaoAplicacao, LeituraSensorIoT,
    MovimentacaoEstoque, PlanejamentoAplicacao, Produto, RecomendacaoJanela,
    ResultadoJanela, SensorIoT, Talhao,
)
from .models import (
    EquipamentoAgricola, LancamentoFinanceiro, Safra, ServicoFazenda,
)


MODULE_PATTERNS = {
    'farm': r'\b(fazenda|propriedade|irrigacao|cultivo|convencional|organico)\b',
    'plots': r'\b(talhao|talhoes|cafezal|cafezais|variedade|variedades|cultivar|area plantada|idade da lavoura|solo)\b',
    'harvests': r'\b(safra|safras|ano agricola)\b',
    'applications': r'\b(aplicacao|aplicacoes|pulverizacao|adubacao|fertirrigacao|insumo aplicado)\b',
    'stock': r'\b(estoque|insumo|insumos|fertilizante|adubo|defensivo|sementes?|estoque minimo)\b',
    'finance': r'\b(financeiro|gastei|gastos?|despesas?|receitas?|compras?|custos?|valor|pagamento)\b',
    'equipment': r'\b(equipamento|equipamentos|maquina|maquinas|manutencao|trator|pulverizador)\b',
    'services': r'\b(servico|servicos|contratado|prestado|prestados)\b',
    'calendar': r'\b(calendario|agenda|atividade|atividades|colheita|florada|frutificacao|maturacao|pos colheita|plantio)\b',
    'weather': r'\b(clima|tempo|previsao|chuva|temperatura|vento|umidade|janela|meteorolog)\b',
    'reports': r'\b(relatorio|relatorios|indicador|indicadores|resumo|maior gasto|por hectare)\b',
}

TOOL_LIMITS = {
    'farm': 1,
    'plots': 10,
    'harvests': 8,
    'applications': 8,
    'stock': 10,
    'finance': 5,
    'equipment': 8,
    'services': 8,
    'calendar': 10,
    'weather': 8,
    'reports': 1,
}


@dataclass(frozen=True)
class AssistantQuery:
    normalized: str
    modules: tuple
    start_date: object
    end_date: object
    period_label: str
    plot_name: str
    category: str


@dataclass(frozen=True)
class AssistantReply:
    text: str
    feature: str
    slot: dict | None = None


def normalize_text(value):
    normalized = unicodedata.normalize('NFD', str(value).casefold())
    return ''.join(char for char in normalized if unicodedata.category(char) != 'Mn')


def _period(message):
    today = timezone.localdate()
    normalized = normalize_text(message)
    if re.search(r'\b(hoje|neste dia|no dia de hoje)\b', normalized):
        return today, today, 'hoje'
    if re.search(r'\b(ontem|dia anterior)\b', normalized):
        yesterday = today - timedelta(days=1)
        return yesterday, yesterday, 'ontem'
    if re.search(r'\b(ultimos?\s+7\s+dias|ultima semana)\b', normalized):
        return today - timedelta(days=6), today, 'últimos sete dias'
    if re.search(r'\b(ultimos?\s+30\s+dias|ultimo mes)\b', normalized):
        return today - timedelta(days=29), today, 'últimos trinta dias'
    days_match = re.search(r'\b(ultimos?)\s+(\d{1,3})\s+dias\b', normalized)
    if days_match:
        days = min(int(days_match.group(2)), 365)
        return today - timedelta(days=days - 1), today, f'últimos {days} dias'
    if re.search(r'\b(mes passado|mes anterior)\b', normalized):
        month_end = today.replace(day=1) - timedelta(days=1)
        return month_end.replace(day=1), month_end, 'mês passado'
    if re.search(r'\b(este mes|neste mes|mes atual)\b', normalized):
        return today.replace(day=1), today, 'este mês'
    if re.search(r'\b(este ano|neste ano|ano atual)\b', normalized):
        return today.replace(month=1, day=1), today, 'este ano'
    if re.search(r'\b(esta semana|nesta semana|semana atual|desta semana)\b', normalized):
        start = today - timedelta(days=today.weekday())
        return start, today, 'esta semana'

    date_matches = re.findall(
        r'\b(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})\b',
        normalized,
    )
    if date_matches:
        parsed = []
        for value in date_matches:
            try:
                parsed.append(
                    date.fromisoformat(value)
                    if '-' in value else datetime.strptime(value, '%d/%m/%Y').date()
                )
            except ValueError:
                continue
        if len(parsed) > 1:
            return min(parsed), max(parsed), 'período informado'
        if parsed:
            return parsed[0], parsed[0], 'data informada'
    return None, today, 'período disponível'


def parse_assistant_query(message):
    normalized = normalize_text(message)
    modules = tuple(
        name for name, pattern in MODULE_PATTERNS.items()
        if re.search(pattern, normalized)
    )
    start_date, end_date, period_label = _period(message)
    plot_name = ''
    plot_match = re.search(r'\btalh[aã]o\s+([\w-]+(?:\s+[\w-]+)?)', message, re.IGNORECASE)
    if plot_match:
        plot_name = plot_match.group(1).strip()

    category = ''
    for label, terms in (
        ('fertilizantes', ('fertilizante', 'fertilizantes', 'adubo', 'adubos')),
        ('defensivos', ('defensivo', 'defensivos', 'agrotoxico', 'agrotoxicos')),
        ('combustíveis', ('diesel', 'combustivel', 'combustiveis')),
        ('serviços', ('servico', 'servicos', 'mao de obra')),
        ('sementes', ('semente', 'sementes')),
    ):
        if any(term in normalized for term in terms):
            category = label
            break
    return AssistantQuery(
        normalized=normalized,
        modules=modules,
        start_date=start_date,
        end_date=end_date,
        period_label=period_label,
        plot_name=plot_name,
        category=category,
    )


def classify_feature(message):
    query = parse_assistant_query(message)
    for module in query.modules:
        if module in TOOL_LIMITS:
            return module
    return 'general'


def is_cacheable_query(message):
    query = parse_assistant_query(message)
    volatile = re.search(
        r'\b(estoque|saldo|financeiro|gastei|despesa|receita|compra|custo|'
        r'aplicacao|aplicacoes|clima|tempo|previsao|janela|chuva|vento|'
        r'relatorio|relatorios|indicador|indicadores|resumo|'
        r'confirmar|registrar|registre|adicionar|adicione|adiciona|coloque|'
        r'colocar|planeje|planejar|agende|agendar|programe|programar|'
        r'realizei|adubei|apliquei|colhi|usei|baixa)\b',
        query.normalized,
    )
    return bool(query.modules) and not volatile


def _cache_version_key(farm_id):
    return f'gestao:assistant:farm:{farm_id}:generation'


def assistant_cache_key(user_id, farm_id, message):
    generation = cache.get(_cache_version_key(farm_id), 0)
    normalized = normalize_text(message)
    digest = hashlib.sha256(normalized.encode('utf-8')).hexdigest()
    return f'gestao:assistant:{farm_id}:{user_id}:{generation}:{digest}'


def get_cached_reply(user_id, farm_id, message):
    if not is_cacheable_query(message):
        return None
    return cache.get(assistant_cache_key(user_id, farm_id, message))


def set_cached_reply(user_id, farm_id, message, value):
    if is_cacheable_query(message):
        cache.set(assistant_cache_key(user_id, farm_id, message), value, timeout=120)


def invalidate_assistant_cache(farm_id):
    if not farm_id:
        return
    key = _cache_version_key(farm_id)
    cache.add(key, 0, timeout=None)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=None)


def assistant_context(request, farm):
    context = request.session.get('gestao_assistente_context', {})
    if (
        not isinstance(context, dict)
        or context.get('user_id') != request.user.id
        or context.get('farm_id') != farm.id
    ):
        return {'turns': [], 'finance_comparisons': []}
    return {
        'turns': context.get('turns', [])[-4:],
        'finance_comparisons': context.get('finance_comparisons', [])[-4:],
    }


def save_assistant_turn(request, farm, message, reply, feature, slot=None):
    current = assistant_context(request, farm)
    turns = current['turns']
    if not (len(message) > 1 and normalize_text(message).startswith(('confirmar', 'cancelar'))):
        turns.append({
            'user': str(message)[:240],
            'assistant': str(reply)[:360],
            'feature': feature,
        })
    comparisons = current['finance_comparisons'] if feature == 'finance' else []
    if slot and slot.get('type') == 'finance_total':
        comparisons.append(slot)
    request.session['gestao_assistente_context'] = {
        'user_id': request.user.id,
        'farm_id': farm.id,
        'turns': turns[-4:],
        'finance_comparisons': comparisons[-4:],
    }
    request.session.modified = True


def _tool_farm(farm, query, message):
    coffee_plot_count = sum(
        1 for plot in Talhao.objects.filter(fazenda=farm, ativo=True)
        if normalize_text(plot.cultura).startswith('cafe')
    )
    return {
        'name': farm.nome,
        'location': ', '.join(part for part in (farm.cidade, farm.estado) if part),
        'area_hectares': str(farm.area_hectares),
        'registered_plot_count': farm.quantidade_talhoes,
        'active_coffee_plot_count': coffee_plot_count,
        'cultivation': farm.tipo_cultivo,
        'irrigation': farm.irrigacao,
    }


def _tool_plots(farm, query, message):
    rows = [
        row for row in Talhao.objects.filter(fazenda=farm, ativo=True).order_by('nome')
        if normalize_text(row.cultura).startswith('cafe')
    ]
    if query.plot_name:
        rows = [row for row in rows if normalize_text(query.plot_name) in normalize_text(row.nome)]
    return [{
        'name': row.nome,
        'area_hectares': str(row.area_hectares) if row.area_hectares is not None else None,
        'crop': row.cultura,
        'variety': row.variedade,
        'age_years': row.idade_anos,
        'soil_type': row.tipo_solo,
        'has_coordinates': row.latitude is not None and row.longitude is not None,
    } for row in rows[:TOOL_LIMITS['plots']]]


def _tool_harvests(farm, query, message):
    rows = Safra.objects.filter(fazenda=farm).prefetch_related('talhoes').order_by('-ano_safra')[:TOOL_LIMITS['harvests']]
    return [{
        'crop': row.cultura,
        'year': row.ano_safra,
        'variety': row.variedade,
        'area_hectares': str(row.area_hectares),
        'planting_date': row.data_plantio.isoformat() if row.data_plantio else None,
        'expected_harvest': row.colheita_prevista.isoformat() if row.colheita_prevista else None,
        'status': row.get_status_display(),
        'plots': [plot.nome for plot in row.talhoes.all()[:10]],
    } for row in rows if normalize_text(row.cultura).startswith('cafe')]


def _tool_applications(farm, query, message):
    executions = ExecucaoAplicacao.objects.filter(fazenda=farm).select_related('talhao').order_by('-data_aplicacao', '-criado_em')
    plans = PlanejamentoAplicacao.objects.filter(fazenda=farm).select_related('talhao').order_by('-data_planejada', '-criado_em')
    if query.start_date:
        executions = executions.filter(data_aplicacao__gte=query.start_date)
        plans = plans.filter(data_planejada__gte=query.start_date)
    if query.end_date:
        executions = executions.filter(data_aplicacao__lte=query.end_date)
        plans = plans.filter(data_planejada__lte=query.end_date)
    return {
        'executions': [{
            'date': row.data_aplicacao.isoformat(),
            'plot': row.talhao.nome if row.talhao else None,
            'product': row.produto,
            'input_type': row.tipo_insumo,
            'quantity': str(row.quantidade_realizada or row.quantidade) if (row.quantidade_realizada or row.quantidade) is not None else None,
            'status': row.get_status_display(),
        } for row in executions[:TOOL_LIMITS['applications']]],
        'plans': [{
            'date': row.data_planejada.isoformat(),
            'plot': row.talhao.nome if row.talhao else None,
            'product': row.produto,
            'application_type': row.tipo_aplicacao,
            'dose': row.dose_display(),
            'status': row.get_status_display(),
        } for row in plans[:TOOL_LIMITS['applications']]],
    }


def _tool_stock(farm, query, message):
    products = Produto.objects.filter(fazenda=farm, ativo=True).order_by('nome')
    if query.category:
        category_terms = {
            'fertilizantes': ('adubo', 'fertilizante'),
            'defensivos': ('defensivo', 'agrotoxico'),
            'combustíveis': ('diesel', 'combustivel'),
            'sementes': ('semente',),
        }.get(query.category, ())
        if category_terms:
            category_filter = Q()
            for term in category_terms:
                category_filter |= Q(nome__icontains=term) | Q(categoria__icontains=term)
            products = products.filter(category_filter)
    product_rows = [{
        'name': row.nome,
        'category': row.categoria,
        'quantity': str(row.quantidade_atual),
        'unit': row.unidade,
        'minimum': str(row.estoque_minimo),
        'below_minimum': row.quantidade_atual <= row.estoque_minimo,
    } for row in products[:TOOL_LIMITS['stock']]]
    product_ids = [row['name'] for row in product_rows]
    movement_rows = MovimentacaoEstoque.objects.filter(
        produto__fazenda=farm,
        produto__nome__in=product_ids,
    ).select_related('produto', 'talhao').order_by('-data', '-criado_em')[:6]
    return {
        'products': product_rows,
        'recent_movements': [{
            'date': row.data.isoformat(),
            'product': row.produto.nome,
            'type': row.get_tipo_display(),
            'quantity': str(row.quantidade),
            'plot': row.talhao.nome if row.talhao else None,
        } for row in movement_rows],
    }


def _tool_finance(farm, query, message):
    rows = LancamentoFinanceiro.objects.filter(fazenda=farm)
    if query.start_date:
        rows = rows.filter(data__gte=query.start_date)
    if query.end_date:
        rows = rows.filter(data__lte=query.end_date)
    if query.category:
        category_terms = {
            'fertilizantes': ('fertilizante', 'adubo'),
            'defensivos': ('defensivo', 'agrotoxico'),
            'combustíveis': ('diesel', 'combustivel'),
            'serviços': ('servico', 'mao de obra'),
            'sementes': ('semente',),
        }[query.category]
        category_filter = Q()
        for term in category_terms:
            category_filter |= Q(titulo__icontains=term) | Q(categoria__icontains=term)
        rows = rows.filter(category_filter)
    totals = {
        'income': str(rows.filter(tipo=LancamentoFinanceiro.Tipo.RECEITA).aggregate(total=Sum('valor'))['total'] or Decimal('0')),
        'expenses_and_purchases': str(rows.exclude(tipo=LancamentoFinanceiro.Tipo.RECEITA).aggregate(total=Sum('valor'))['total'] or Decimal('0')),
        'record_count': rows.count(),
        'period': query.period_label,
    }
    if re.search(r'\b(liste|detalhe|quais lancamentos|itens)\b', query.normalized):
        totals['recent_entries'] = [{
            'date': row.data.isoformat(),
            'type': row.get_tipo_display(),
            'description': row.titulo,
            'category': row.categoria,
            'amount': str(row.valor),
        } for row in rows.order_by('-data', '-criado_em')[:TOOL_LIMITS['finance']]]
    return totals


def _tool_equipment(farm, query, message):
    rows = EquipamentoAgricola.objects.filter(fazenda=farm).order_by('nome')[:TOOL_LIMITS['equipment']]
    return [{
        'name': row.nome,
        'type': row.tipo,
        'identification': row.identificacao,
        'status': row.get_status_display(),
        'last_maintenance': row.ultima_manutencao.isoformat() if row.ultima_manutencao else None,
        'next_maintenance': row.proxima_manutencao.isoformat() if row.proxima_manutencao else None,
    } for row in rows]


def _tool_services(farm, query, message):
    rows = ServicoFazenda.objects.filter(fazenda=farm).order_by('-data', '-criado_em')[:TOOL_LIMITS['services']]
    return [{
        'name': row.nome,
        'type': row.get_tipo_display(),
        'person': row.pessoa,
        'date': row.data.isoformat(),
        'status': row.get_status_display(),
        'amount': str(row.valor) if row.valor is not None else None,
    } for row in rows]


def _tool_calendar(farm, query, message):
    rows = EventoCalendario.objects.filter(fazenda=farm).exclude(
        status=EventoCalendario.Status.CANCELADA,
    ).select_related('talhao').order_by('-data', '-id')
    if query.start_date:
        rows = rows.filter(data__gte=query.start_date)
    elif not re.search(r'\b(historico|anteriores?|passadas?)\b', query.normalized):
        rows = rows.filter(data__gte=timezone.localdate())
    if query.end_date:
        rows = rows.filter(data__lte=query.end_date)
    return [{
        'title': row.titulo,
        'category': row.get_categoria_display(),
        'date': row.data.isoformat(),
        'status': row.get_status_display(),
        'plot': row.talhao.nome if row.talhao else None,
    } for row in rows[:TOOL_LIMITS['calendar']]]


def _tool_weather(farm, query, message):
    collections = ColetaMeteorologica.objects.filter(fazenda=farm).select_related('talhao').order_by(
        'talhao_id', '-coletada_em',
    )
    latest_by_plot = {}
    for collection in collections:
        if collection.talhao and not normalize_text(collection.talhao.cultura).startswith('cafe'):
            continue
        key = collection.talhao_id or 0
        latest_by_plot.setdefault(key, collection)
        if len(latest_by_plot) >= 3:
            break
    weather_data = [{
        'plot': row.talhao.nome if row.talhao else None,
        'collected_at': row.coletada_em.isoformat(),
        'source': row.fonte,
        'current': {
            key: row.dados_atuais[key]
            for key in ('temperature_2m', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m', 'weather_code')
            if key in row.dados_atuais
        },
    } for row in latest_by_plot.values()]

    recommendations = RecomendacaoJanela.objects.filter(
        fazenda=farm,
        data__gte=timezone.localdate(),
        data__lte=timezone.localdate() + timedelta(days=7),
        decisao='APPLY',
        adequacao__gte=75,
        coleta__coletada_em__gte=timezone.now() - timedelta(hours=24),
    ).select_related('talhao').order_by('data', '-adequacao')[:TOOL_LIMITS['weather']]
    result = {
        'recent_collections': weather_data,
        'upcoming_windows': [{
            'operation': row.get_tipo_operacao_display(),
            'plot': row.talhao.nome if row.talhao else None,
            'date': row.data.isoformat(),
            'start': timezone.localtime(row.inicio).strftime('%H:%M'),
            'end': timezone.localtime(row.fim).strftime('%H:%M'),
            'suitability': row.adequacao,
            'decision': row.decisao,
            'confidence': str(row.confianca) if row.confianca is not None else None,
        } for row in recommendations],
    }
    if re.search(r'\b(sensor|telemetria|umidade do solo)\b', query.normalized):
        sensors = SensorIoT.objects.filter(fazenda=farm, ativo=True).select_related('talhao').order_by('identificador')[:6]
        result['sensors'] = [{
            'id': sensor.identificador,
            'type': sensor.tipo,
            'plot': sensor.talhao.nome if sensor.talhao else None,
            'latest_reading': (
                {
                    'at': reading.lida_em.isoformat(),
                    'soil_moisture': str(reading.umidade_solo) if reading.umidade_solo is not None else None,
                    'temperature': str(reading.temperatura) if reading.temperatura is not None else None,
                }
                if (reading := LeituraSensorIoT.objects.filter(sensor=sensor).first()) else None
            ),
        } for sensor in sensors]
    if re.search(r'\b(resultado|realizada|adiada|cancelada|desfecho)\b', query.normalized):
        outcomes = ResultadoJanela.objects.filter(fazenda=farm).select_related(
            'talhao', 'recomendacao',
        ).order_by('-criado_em')[:6]
        result['reported_outcomes'] = [{
            'status': row.get_status_display(),
            'plot': row.talhao.nome if row.talhao else None,
            'at': row.realizado_em.isoformat() if row.realizado_em else None,
            'recommendation_date': row.recomendacao.data.isoformat() if row.recomendacao else None,
            'result': row.resultado_informado[:200],
        } for row in outcomes]
    return result


def _tool_reports(farm, query, message):
    today = timezone.localdate()
    start = today.replace(day=1)
    finance = LancamentoFinanceiro.objects.filter(fazenda=farm, data__gte=start, data__lte=today)
    return {
        'period': f'{start.isoformat()} a {today.isoformat()}',
        'income': str(finance.filter(tipo=LancamentoFinanceiro.Tipo.RECEITA).aggregate(total=Sum('valor'))['total'] or Decimal('0')),
        'expenses': str(finance.exclude(tipo=LancamentoFinanceiro.Tipo.RECEITA).aggregate(total=Sum('valor'))['total'] or Decimal('0')),
        'low_stock_products': Produto.objects.filter(
            fazenda=farm, ativo=True, quantidade_atual__lte=F('estoque_minimo'),
        ).count(),
        'pending_services': ServicoFazenda.objects.filter(
            fazenda=farm, status=ServicoFazenda.Status.PENDENTE,
        ).count(),
        'equipment_in_maintenance': EquipamentoAgricola.objects.filter(
            fazenda=farm, status=EquipamentoAgricola.Status.MANUTENCAO,
        ).count(),
    }


QUERY_TOOLS = {
    'farm': _tool_farm,
    'plots': _tool_plots,
    'harvests': _tool_harvests,
    'applications': _tool_applications,
    'stock': _tool_stock,
    'finance': _tool_finance,
    'equipment': _tool_equipment,
    'services': _tool_services,
    'calendar': _tool_calendar,
    'weather': _tool_weather,
    'reports': _tool_reports,
}


def relevant_assistant_turns(message, previous_turns):
    modules = set(parse_assistant_query(message).modules)
    if not modules:
        return []
    return [
        turn for turn in previous_turns[-4:]
        if turn.get('feature') in modules
    ][-2:]


def build_relevant_context(farm, message, previous_turns=()):
    query = parse_assistant_query(message)
    normalized = query.normalized
    needs_data = bool(re.search(
        r'\b(quanto|qual|quais|liste|mostre|compare|relacione|meu|minha|meus|minhas|'
        r'desta fazenda|da fazenda|no sistema|por hectare|historico)\b',
        normalized,
    ))
    if not needs_data:
        return {}
    modules = list(query.modules)
    if re.search(r'\b(por hectare|por ha|maior gasto por)\b', normalized):
        modules.extend(('finance', 'plots'))
    if re.search(r'\b(safra|safras)\b', normalized) and 'finance' in modules:
        modules.append('harvests')
    if re.search(r'\b(aplicacao|aplicacoes|insumo aplicado)\b', normalized):
        modules.extend(('plots', 'stock'))
    if re.search(r'\b(quais insumos preciso comprar|o que preciso comprar|repor estoque)\b', normalized):
        modules.append('stock')
    selected = list(dict.fromkeys(module for module in modules if module in QUERY_TOOLS))
    if not selected:
        return {}
    context = {
        module: QUERY_TOOLS[module](farm, query, message)
        for module in selected
    }
    limitations = []
    if re.search(r'\b(gasto por hectare|gasto nesta safra|despesa nesta safra|despesa por talhao)\b', normalized):
        limitations = [
            'Lançamentos financeiros não têm vínculo estruturado com talhão ou safra; não atribua gastos a essas entidades.',
        ]
        context['data_limitations'] = limitations
    relevant_turns = relevant_assistant_turns(message, previous_turns)
    relevant_turns = [turn for turn in relevant_turns if turn.get('feature') in selected]
    if relevant_turns:
        context['conversation'] = [
            {'user': turn.get('user', '')[:200], 'assistant': turn.get('assistant', '')[:240]}
            for turn in relevant_turns[-2:]
        ]
    compact = json.dumps(context, ensure_ascii=False, separators=(',', ':'))
    while len(compact) > 5000 and selected:
        selected.pop()
        context = {module: QUERY_TOOLS[module](farm, query, message) for module in selected}
        if limitations:
            context['data_limitations'] = limitations
        if relevant_turns:
            context['conversation'] = [
                {'user': turn.get('user', '')[:200], 'assistant': turn.get('assistant', '')[:240]}
                for turn in relevant_turns[-2:]
            ]
        compact = json.dumps(context, ensure_ascii=False, separators=(',', ':'))
    return context


def resolve_local_query(farm, message, context=None):
    query = parse_assistant_query(message)
    normalized = query.normalized
    context = context or {'finance_comparisons': []}
    is_question = bool(
        '?' in message
        or re.match(r'^(?:(?:me\s+)?(?:diga|fale|informe|mostre)\s+)?'
                    r'(quanto|qual|quais|quando|como|liste|compare|resuma|tem|existe)\b', normalized)
    )

    if re.search(r'\b(o que voce consegue|o que pode consultar|quais dados voce tem|ajuda)\b', normalized):
        return AssistantReply(
            'Posso consultar localmente dados desta fazenda sobre talhões, safras, aplicações, estoque, '
            'financeiro, equipamentos, serviços, calendário e recomendações meteorológicas. '
            'Também posso preparar lançamentos para você confirmar. A produção em sacas não é calculada '
            'porque não existe um registro estruturado confiável desse dado.',
            'help',
        )

    if is_question and re.search(r'\b(producao|produtividade|sacas|rendimento)\b', normalized):
        return AssistantReply(
            'Não há registros estruturados de produção colhida em sacas por talhão; por isso não calculo '
            'produtividade nem comparações de produção. O sistema registra área, variedade, safra e '
            'atividades, mas esses dados não substituem o peso colhido.',
            'harvests',
        )

    if is_question and re.search(r'\b(maior gasto por hectare|gasto nesta safra|despesa nesta safra|despesa por talhao)\b', normalized):
        return AssistantReply(
            'Não consigo atribuir despesas a um talhão ou safra com segurança: os lançamentos financeiros '
            'não possuem vínculo estruturado com essas informações.',
            'finance',
        )

    previous_finance = context.get('finance_comparisons', [])
    followup_category = bool(
        query.category and previous_finance and re.match(r'^e\b', normalized)
    )
    finance_question = is_question and bool(re.search(
        r'\b(gastei|gasto|despesa|despesas|receita|receitas|compra|compras|custo|custos|financeiro|saldo)\b',
        normalized,
    ))
    if is_question and re.search(r'\b(qual foi o maior gasto|qual foi maior|maior deles|qual categoria gastou mais)\b', normalized):
        if len(previous_finance) >= 2:
            winner = max(previous_finance, key=lambda row: Decimal(row['value']))
            return AssistantReply(
                f'Entre as categorias consultadas, o maior total foi em {winner["category"]}: '
                f'R$ {Decimal(winner["value"]):,.2f}.'.replace(',', 'X').replace('.', ',').replace('X', '.'),
                'finance',
            )
        return AssistantReply(
            'Ainda não tenho duas categorias comparáveis nesta conversa. Pergunte os totais de cada categoria '
            'e depois posso comparar os valores.',
            'finance',
        )

    if (finance_question or followup_category) and (
        query.category or re.search(r'\b(gastei|gasto|despesa|despesas|receita|receitas|compra|compras|custo|custos|financeiro|saldo)\b', normalized)
    ):
        if 'safra' in normalized:
            return AssistantReply(
                'Os lançamentos financeiros não estão relacionados a uma safra específica. Posso somar por '
                'categoria e período, mas não afirmar que uma despesa pertence a determinada safra.',
                'finance',
            )
        start_date, end_date = query.start_date, query.end_date
        period_label = query.period_label
        if followup_category and previous_finance:
            start_date = date.fromisoformat(previous_finance[-1]['start_date']) if previous_finance[-1].get('start_date') else None
            end_date = date.fromisoformat(previous_finance[-1]['end_date'])
            period_label = previous_finance[-1]['period']
        rows = LancamentoFinanceiro.objects.filter(fazenda=farm)
        if start_date:
            rows = rows.filter(data__gte=start_date)
        if end_date:
            rows = rows.filter(data__lte=end_date)
        if query.category:
            terms = {
                'fertilizantes': ('fertilizante', 'adubo'),
                'defensivos': ('defensivo', 'agrotoxico'),
                'combustíveis': ('diesel', 'combustivel'),
                'serviços': ('servico', 'mao de obra'),
                'sementes': ('semente',),
            }[query.category]
            category_filter = Q()
            for term in terms:
                category_filter |= Q(titulo__icontains=term) | Q(categoria__icontains=term)
            rows = rows.filter(category_filter)
        if query.start_date is None and not followup_category:
            start_date = timezone.localdate().replace(day=1)
            end_date = timezone.localdate()
            rows = rows.filter(data__gte=start_date, data__lte=end_date)
            period_label = 'este mês'
        if re.search(r'\b(receita|receitas|recebi|venda|vendi)\b', normalized):
            rows = rows.filter(tipo=LancamentoFinanceiro.Tipo.RECEITA)
            value = rows.aggregate(total=Sum('valor'))['total'] or Decimal('0')
            label = 'receitas'
        else:
            rows = rows.exclude(tipo=LancamentoFinanceiro.Tipo.RECEITA)
            value = rows.aggregate(total=Sum('valor'))['total'] or Decimal('0')
            label = query.category or 'despesas e compras'
        formatted = f'{value:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
        slot = {
            'type': 'finance_total',
            'category': label,
            'value': str(value),
            'period': period_label,
            'start_date': start_date.isoformat() if start_date else '',
            'end_date': end_date.isoformat() if end_date else timezone.localdate().isoformat(),
        }
        return AssistantReply(
            f'O total de {label} registrado para {period_label} é R$ {formatted}.',
            'finance',
            slot,
        )

    if is_question and re.search(r'\b(quais insumos preciso comprar|o que preciso comprar|repor estoque)\b', normalized):
        rows = Produto.objects.filter(
            fazenda=farm, ativo=True, quantidade_atual__lte=F('estoque_minimo'),
        ).order_by('nome')[:10]
        products = list(rows)
        if not products:
            return AssistantReply('Nenhum insumo ativo está no mínimo ou abaixo dele no estoque registrado.', 'stock')
        summary = '; '.join(
            f'{row.nome}: {_format_quantity(row.quantidade_atual)} {row.unidade} '
            f'(mínimo {_format_quantity(row.estoque_minimo)} {row.unidade})'
            for row in products
        )
        return AssistantReply(f'Insumos no mínimo ou abaixo dele: {summary}.', 'stock')

    if is_question and 'stock' in query.modules and re.search(
        r'\b(movimentacao|movimentacoes|historico|entradas|saidas|consumo)\b',
        normalized,
    ):
        movements = MovimentacaoEstoque.objects.filter(
            produto__fazenda=farm,
        ).select_related('produto', 'talhao').order_by('-data', '-criado_em')
        if query.start_date:
            movements = movements.filter(data__gte=query.start_date)
        if query.end_date:
            movements = movements.filter(data__lte=query.end_date)
        rows = list(movements[:8])
        if not rows:
            return AssistantReply('Não há movimentações de estoque registradas para o período informado.', 'stock')
        summary = '; '.join(
            f'{row.data:%d/%m/%Y}: {row.get_tipo_display()} de {row.quantidade} {row.produto.unidade} '
            f'de {row.produto.nome}'
            + (f' ({row.talhao.nome})' if row.talhao else '')
            for row in rows
        )
        return AssistantReply(f'Histórico recente do estoque: {summary}.', 'stock')

    if is_question and re.search(r'\b(aplicacoes|aplicacao|pulverizacoes|historico de aplicacao)\b', normalized):
        rows = ExecucaoAplicacao.objects.filter(fazenda=farm).select_related('talhao').order_by(
            '-data_aplicacao', '-criado_em',
        )
        if query.plot_name:
            rows = rows.filter(talhao__nome__icontains=query.plot_name)
        if query.start_date:
            rows = rows.filter(data_aplicacao__gte=query.start_date)
        if query.end_date:
            rows = rows.filter(data_aplicacao__lte=query.end_date)
        results = list(rows[:8])
        if not results:
            return AssistantReply('Não há execuções de aplicação registradas para os filtros informados.', 'applications')
        summary = '; '.join(
            f'{row.data_aplicacao:%d/%m/%Y}: {row.produto} '
            f'({row.talhao.nome if row.talhao else "sem talhão"}, {row.get_status_display()})'
            for row in results
        )
        return AssistantReply(f'Aplicações registradas: {summary}.', 'applications')

    if is_question and 'farm' in query.modules and re.search(r'\b(dados|configuracao|configurada|propriedade|fazenda)\b', normalized):
        return AssistantReply(
            f'{farm.nome}: {farm.cidade}/{farm.estado}, área cadastrada de {farm.area_hectares} ha, '
            f'{farm.quantidade_talhoes} talhão(ões), cultivo {farm.tipo_cultivo} e irrigação {farm.irrigacao}.',
            'farm',
        )

    if is_question and 'plots' in query.modules and re.search(r'\b(talhao|talhoes|cafezal|variedade|cultivar|idade da lavoura|area plantada)\b', normalized):
        plots = [
            plot for plot in Talhao.objects.filter(fazenda=farm, ativo=True).order_by('nome')
            if normalize_text(plot.cultura).startswith('cafe')
        ][:20]
        if query.plot_name:
            plots = [plot for plot in plots if normalize_text(query.plot_name) in normalize_text(plot.nome)]
        if re.search(r'\b(area plantada|area dos talhoes|area total)\b', normalized):
            area = sum((plot.area_hectares or Decimal('0') for plot in plots), Decimal('0'))
            if not any(plot.area_hectares is not None for plot in plots):
                return AssistantReply('Não há área informada nos talhões ativos desta fazenda.', 'plots')
            return AssistantReply(f'A área informada nos talhões selecionados é {_format_quantity(area)} ha.', 'plots')
        if re.search(r'\b(variedade|variedades|cultivar)\b', normalized):
            varieties = [f'{plot.nome}: {plot.variedade}' for plot in plots if plot.variedade]
            return AssistantReply(
                'Variedades cadastradas: ' + ('; '.join(varieties) if varieties else 'não informadas nos talhões ativos.'),
                'plots',
            )
        if not plots:
            return AssistantReply('Não encontrei talhões ativos correspondentes aos filtros informados.', 'plots')
        summary = '; '.join(
            f'{plot.nome}: {plot.area_hectares if plot.area_hectares is not None else "área não informada"} ha, '
            f'{plot.variedade or "variedade não informada"}, '
            f'{plot.idade_anos if plot.idade_anos is not None else "idade não informada"} ano(s)'
            for plot in plots[:10]
        )
        return AssistantReply(f'Talhões de café cadastrados: {summary}.', 'plots')

    if is_question and 'harvests' in query.modules:
        rows = [row for row in Safra.objects.filter(fazenda=farm).order_by('-ano_safra') if normalize_text(row.cultura).startswith('cafe')][:8]
        if not rows:
            return AssistantReply('Nenhuma safra de café foi cadastrada nesta fazenda.', 'harvests')
        summary = '; '.join(
            f'{row.ano_safra}: {row.variedade or "variedade não informada"}, '
            f'{row.area_hectares} ha, {row.get_status_display()}'
            for row in rows
        )
        return AssistantReply(f'Safras de café registradas: {summary}.', 'harvests')

    if is_question and 'services' in query.modules:
        service_rows = ServicoFazenda.objects.filter(fazenda=farm)
        if re.search(r'\bpendente|pendentes\b', normalized):
            service_rows = service_rows.filter(status=ServicoFazenda.Status.PENDENTE)
        if query.start_date:
            service_rows = service_rows.filter(data__gte=query.start_date)
        if query.end_date:
            service_rows = service_rows.filter(data__lte=query.end_date)
        rows = list(service_rows.order_by('-data', '-criado_em')[:8])
        if not rows:
            return AssistantReply('Não há serviços registrados que correspondam à consulta.', 'services')
        summary = '; '.join(
            f'{row.nome} ({row.get_tipo_display()}, {row.get_status_display()}, {row.data:%d/%m/%Y})'
            for row in rows
        )
        return AssistantReply(f'Serviços registrados: {summary}.', 'services')

    if is_question and 'equipment' in query.modules:
        equipment_rows = EquipamentoAgricola.objects.filter(fazenda=farm)
        if re.search(r'\bmanutencao\b', normalized):
            equipment_rows = equipment_rows.filter(status=EquipamentoAgricola.Status.MANUTENCAO)
        rows = list(equipment_rows.order_by('nome')[:8])
        if not rows:
            return AssistantReply('Não há equipamentos registrados que correspondam à consulta.', 'equipment')
        summary = '; '.join(
            f'{row.nome} ({row.tipo}, {row.get_status_display()}'
            + (f', próxima manutenção {row.proxima_manutencao:%d/%m/%Y}' if row.proxima_manutencao else '')
            + ')'
            for row in rows
        )
        return AssistantReply(f'Equipamentos cadastrados: {summary}.', 'equipment')

    if is_question and 'calendar' in query.modules and re.search(r'\b(eventos?|atividades?|calendario|agenda)\b', normalized):
        rows = EventoCalendario.objects.filter(fazenda=farm).exclude(
            status=EventoCalendario.Status.CANCELADA,
        ).select_related('talhao').order_by('data')
        if query.start_date:
            rows = rows.filter(data__gte=query.start_date)
        elif not re.search(r'\b(historico|anteriores?|passadas?)\b', normalized):
            rows = rows.filter(data__gte=timezone.localdate())
        if query.end_date:
            rows = rows.filter(data__lte=query.end_date)
        if query.plot_name:
            rows = rows.filter(talhao__nome__icontains=query.plot_name)
        results = list(rows[:8])
        if not results:
            return AssistantReply('Não há atividades registradas para os filtros informados.', 'calendar')
        summary = '; '.join(
            f'{row.data:%d/%m/%Y}: {row.titulo} ({row.get_status_display()}'
            + (f', {row.talhao.nome}' if row.talhao else '')
            + ')'
            for row in results
        )
        return AssistantReply(f'Atividades do calendário: {summary}.', 'calendar')

    if is_question and 'reports' in query.modules:
        report = _tool_reports(farm, query, message)
        income = Decimal(report['income'])
        expenses = Decimal(report['expenses'])
        summary = (
            f'Resumo deste mês ({report["period"]}): receitas de R$ {income:,.2f}, '
            f'despesas de R$ {expenses:,.2f}, {report["low_stock_products"]} produto(s) '
            f'no mínimo ou abaixo dele, {report["pending_services"]} serviço(s) pendente(s) '
            f'e {report["equipment_in_maintenance"]} equipamento(s) em manutenção.'
        ).replace(',', 'X').replace('.', ',').replace('X', '.')
        return AssistantReply(summary, 'reports')

    if is_question and 'weather' in query.modules and re.search(
        r'\b(clima|tempo|previsao|temperatura|chuva|vento|umidade)\b',
        normalized,
    ) and not re.search(r'\b(janela|adubacao|pulverizacao)\b', normalized):
        collections = ColetaMeteorologica.objects.filter(fazenda=farm).select_related(
            'talhao',
        ).order_by('-coletada_em')
        if query.plot_name:
            collections = collections.filter(talhao__nome__icontains=query.plot_name)
        collection = collections.first()
        if not collection or not collection.dados_atuais:
            return AssistantReply('Não há uma coleta meteorológica salva para os filtros informados. Atualize a previsão do talhão.', 'weather')
        current = collection.dados_atuais
        values = []
        for key, label, unit in (
            ('temperature_2m', 'temperatura', '°C'),
            ('relative_humidity_2m', 'umidade relativa', '%'),
            ('precipitation', 'precipitação', 'mm'),
            ('wind_speed_10m', 'vento', 'km/h'),
        ):
            if key in current:
                values.append(f'{label} {current[key]}{unit}')
        if not values:
            return AssistantReply('A última coleta não contém os valores meteorológicos necessários para responder.', 'weather')
        plot = f' no {collection.talhao.nome}' if collection.talhao else ''
        return AssistantReply(
            f'Última previsão salva{plot}, coletada em {timezone.localtime(collection.coletada_em):%d/%m/%Y %H:%M}: '
            + ', '.join(values) + '.',
            'weather',
        )

    return None


def _format_quantity(value):
    formatted = format(value, 'f')
    return formatted.rstrip('0').rstrip('.') if '.' in formatted else formatted
