from django.contrib import admin

from .models import (
    AcessoSistema, ColetaMeteorologica, ExecucaoAplicacao, Fazenda, LeituraSensorIoT,
    MembroFazenda, MovimentacaoEstoque, NotificacaoFazenda, PerfilProdutor, Produto,
    RecomendacaoJanela, SensorIoT, Talhao,
)


@admin.register(AcessoSistema)
class AcessoSistemaAdmin(admin.ModelAdmin):
    list_display = ("usuario", "fazenda", "acessado_em")
    list_filter = ("fazenda", "acessado_em")
    search_fields = ("usuario__username", "usuario__email", "fazenda__nome")
    list_select_related = ("usuario", "fazenda")
    date_hierarchy = "acessado_em"
    readonly_fields = ("usuario", "fazenda", "acessado_em")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PerfilProdutor)
class PerfilProdutorAdmin(admin.ModelAdmin):
    list_display = ("nome_completo", "usuario", "telefone", "criado_em")
    search_fields = ("nome_completo", "usuario__email", "telefone")


@admin.register(Fazenda)
class FazendaAdmin(admin.ModelAdmin):
    list_display = ("nome", "produtor", "cidade", "estado", "area_hectares", "criada_em")
    list_filter = ("estado", "tipo_cultivo", "irrigacao")
    search_fields = ("nome", "produtor__email", "cidade")


@admin.register(MembroFazenda)
class MembroFazendaAdmin(admin.ModelAdmin):
    list_display = ("fazenda", "usuario", "funcao", "criado_em")
    list_filter = ("funcao",)
    search_fields = ("fazenda__nome", "usuario__email")


@admin.register(NotificacaoFazenda)
class NotificacaoFazendaAdmin(admin.ModelAdmin):
    list_display = ("titulo", "fazenda", "destinatario", "tipo", "lida_em", "criada_em")
    list_filter = ("tipo", "lida_em")
    search_fields = ("titulo", "mensagem", "destinatario__email")


@admin.register(Talhao)
class TalhaoAdmin(admin.ModelAdmin):
    list_display = ("nome", "fazenda", "cultura", "area_hectares", "latitude", "longitude", "ativo")
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


@admin.register(Produto)
class ProdutoAdmin(admin.ModelAdmin):
    list_display = (
        "nome", "fazenda", "categoria", "quantidade_atual", "unidade",
        "estoque_minimo", "ativo",
    )
    list_filter = ("fazenda", "categoria", "ativo")
    search_fields = ("nome", "fazenda__nome", "categoria")
    list_select_related = ("fazenda",)


@admin.register(MovimentacaoEstoque)
class MovimentacaoEstoqueAdmin(admin.ModelAdmin):
    list_display = (
        "produto", "fazenda", "tipo", "quantidade", "motivo", "data",
        "talhao", "criado_por",
    )
    list_filter = ("tipo", "data")
    search_fields = (
        "produto__nome", "produto__fazenda__nome", "motivo", "talhao__nome",
    )
    list_select_related = ("produto", "produto__fazenda", "talhao", "criado_por")

    @admin.display(description="Fazenda", ordering="produto__fazenda__nome")
    def fazenda(self, obj):
        return obj.produto.fazenda
