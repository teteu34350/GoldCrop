from django.contrib import admin

from .models import ColetaMeteorologica, ExecucaoAplicacao, Fazenda, LeituraSensorIoT, PerfilProdutor, RecomendacaoJanela, SensorIoT, Talhao


@admin.register(PerfilProdutor)
class PerfilProdutorAdmin(admin.ModelAdmin):
    list_display = ("nome_completo", "usuario", "telefone", "criado_em")
    search_fields = ("nome_completo", "usuario__email", "telefone")


@admin.register(Fazenda)
class FazendaAdmin(admin.ModelAdmin):
    list_display = ("nome", "produtor", "cidade", "estado", "area_hectares", "criada_em")
    list_filter = ("estado", "tipo_cultivo", "irrigacao")
    search_fields = ("nome", "produtor__email", "cidade")


@admin.register(Talhao)
class TalhaoAdmin(admin.ModelAdmin):
    list_display = ("nome", "fazenda", "cultura", "area_hectares", "ativo")
    list_filter = ("ativo", "cultura")
    search_fields = ("nome", "fazenda__nome", "fazenda__produtor__email")


@admin.register(ExecucaoAplicacao)
class ExecucaoAplicacaoAdmin(admin.ModelAdmin):
    list_display = ("produto", "fazenda", "talhao", "data_aplicacao", "status", "iea_previsto")
    list_filter = ("status", "data_aplicacao")
    search_fields = ("produto", "fazenda__nome", "talhao__nome")


@admin.register(ColetaMeteorologica)
class ColetaMeteorologicaAdmin(admin.ModelAdmin):
    list_display = ("fazenda", "fonte", "coletada_em", "latitude", "longitude")
    list_filter = ("fonte", "coletada_em")


@admin.register(RecomendacaoJanela)
class RecomendacaoJanelaAdmin(admin.ModelAdmin):
    list_display = ("fazenda", "data", "inicio", "fim", "adequacao", "decisao", "confianca")
    list_filter = ("decisao", "classificacao", "data")
    search_fields = ("fazenda__nome",)


@admin.register(SensorIoT)
class SensorIoTAdmin(admin.ModelAdmin):
    list_display = ("identificador", "fazenda", "talhao", "tipo", "ativo")
    list_filter = ("ativo", "tipo")
    search_fields = ("identificador", "fazenda__nome", "talhao__nome")


@admin.register(LeituraSensorIoT)
class LeituraSensorIoTAdmin(admin.ModelAdmin):
    list_display = ("sensor", "lida_em", "umidade_solo", "temperatura")
    list_filter = ("lida_em",)
