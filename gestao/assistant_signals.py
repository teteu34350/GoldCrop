from django.db import transaction
from django.db.models.signals import m2m_changed, post_delete, post_save

from dashboard.models import (
    ColetaMeteorologica, ExecucaoAplicacao, EventoCalendario, Fazenda,
    LeituraSensorIoT, MovimentacaoEstoque, PlanejamentoAplicacao, Produto,
    RecomendacaoJanela, ResultadoJanela, SensorIoT, Talhao,
)
from .assistant import invalidate_assistant_cache
from .models import EquipamentoAgricola, LancamentoFinanceiro, Safra, ServicoFazenda


_INVALIDATED_MODELS = (
    ColetaMeteorologica,
    EquipamentoAgricola,
    EventoCalendario,
    Fazenda,
    ExecucaoAplicacao,
    LancamentoFinanceiro,
    LeituraSensorIoT,
    MovimentacaoEstoque,
    PlanejamentoAplicacao,
    Produto,
    RecomendacaoJanela,
    ResultadoJanela,
    Safra,
    SensorIoT,
    ServicoFazenda,
    Talhao,
)


def _farm_id(instance):
    if isinstance(instance, Fazenda):
        return instance.pk
    farm_id = getattr(instance, 'fazenda_id', None)
    if farm_id:
        return farm_id
    if isinstance(instance, LeituraSensorIoT):
        return SensorIoT.objects.filter(pk=instance.sensor_id).values_list('fazenda_id', flat=True).first()
    if isinstance(instance, MovimentacaoEstoque):
        return Produto.objects.filter(pk=instance.produto_id).values_list('fazenda_id', flat=True).first()
    return None


def _invalidate_for_instance(sender, instance, **kwargs):
    farm_id = _farm_id(instance)
    if farm_id:
        transaction.on_commit(
            lambda selected_farm_id=farm_id: invalidate_assistant_cache(selected_farm_id),
        )


for _model in _INVALIDATED_MODELS:
    post_save.connect(
        _invalidate_for_instance,
        sender=_model,
        dispatch_uid=f'assistant-cache-save-{_model._meta.label_lower}',
    )
    post_delete.connect(
        _invalidate_for_instance,
        sender=_model,
        dispatch_uid=f'assistant-cache-delete-{_model._meta.label_lower}',
    )


def _invalidate_safra_plots(sender, instance, **kwargs):
    if instance.fazenda_id:
        transaction.on_commit(
            lambda selected_farm_id=instance.fazenda_id: invalidate_assistant_cache(selected_farm_id),
        )


m2m_changed.connect(
    _invalidate_safra_plots,
    sender=Safra.talhoes.through,
    dispatch_uid='assistant-cache-safra-plots',
)
