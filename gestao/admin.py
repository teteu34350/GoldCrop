from django.contrib import admin

from .models import AssistenteUso, EquipamentoAgricola, LancamentoFinanceiro, Safra, ServicoFazenda


@admin.register(LancamentoFinanceiro)
class LancamentoFinanceiroAdmin(admin.ModelAdmin):
    list_display = ('data', 'fazenda', 'tipo', 'titulo', 'categoria', 'valor')
    list_filter = ('fazenda', 'tipo', 'categoria', 'data')
    search_fields = ('titulo', 'categoria', 'fazenda__nome')
    list_select_related = ('fazenda', 'criado_por')


@admin.register(Safra)
class SafraAdmin(admin.ModelAdmin):
    list_display = ('cultura', 'ano_safra', 'fazenda', 'area_hectares', 'status')
    list_filter = ('fazenda', 'status', 'ano_safra')
    search_fields = ('cultura', 'variedade', 'fazenda__nome')
    list_select_related = ('fazenda',)


@admin.register(ServicoFazenda)
class ServicoFazendaAdmin(admin.ModelAdmin):
    list_display = ('nome', 'fazenda', 'tipo', 'data', 'valor', 'status')
    list_filter = ('fazenda', 'tipo', 'status', 'data')
    search_fields = ('nome', 'pessoa', 'local', 'fazenda__nome')
    list_select_related = ('fazenda', 'criado_por')


@admin.register(EquipamentoAgricola)
class EquipamentoAgricolaAdmin(admin.ModelAdmin):
    list_display = ('nome', 'fazenda', 'tipo', 'identificacao', 'status', 'proxima_manutencao')
    list_filter = ('fazenda', 'status', 'tipo')
    search_fields = ('nome', 'tipo', 'identificacao', 'fazenda__nome')
    list_select_related = ('fazenda', 'criado_por')


@admin.register(AssistenteUso)
class AssistenteUsoAdmin(admin.ModelAdmin):
    list_display = (
        'criada_em', 'fazenda', 'usuario', 'funcionalidade', 'resolucao',
        'chamada_api', 'cache_utilizado', 'tokens_entrada', 'tokens_saida',
        'duracao_ms',
    )
    list_filter = ('fazenda', 'resolucao', 'funcionalidade', 'chamada_api', 'cache_utilizado', 'criada_em')
    list_select_related = ('fazenda', 'usuario')
    date_hierarchy = 'criada_em'
    ordering = ('-criada_em',)
    readonly_fields = [field.name for field in AssistenteUso._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
