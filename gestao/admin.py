from django.contrib import admin

from .models import EquipamentoAgricola, LancamentoFinanceiro, Safra, ServicoFazenda


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
