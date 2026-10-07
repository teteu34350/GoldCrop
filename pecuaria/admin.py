from django.contrib import admin

from .models import Alimentacao, Animal, Manejo, ProducaoLeite, Reproducao


@admin.register(Animal)
class AnimalAdmin(admin.ModelAdmin):
    list_display = ("identificacao", "nome", "fazenda", "categoria", "status", "arquivado")
    list_filter = ("fazenda", "tipo", "categoria", "status", "arquivado")
    search_fields = ("identificacao", "nome", "raca")
    list_select_related = ("fazenda",)


@admin.register(ProducaoLeite)
class ProducaoLeiteAdmin(admin.ModelAdmin):
    list_display = ("data", "fazenda", "animal", "quantidade", "ordenha")
    list_filter = ("fazenda", "ordenha", "data")
    list_select_related = ("fazenda", "animal")


@admin.register(Manejo)
class ManejoAdmin(admin.ModelAdmin):
    list_display = ("data", "fazenda", "animal", "tipo_evento", "responsavel")
    list_filter = ("fazenda", "tipo_evento", "data")
    list_select_related = ("fazenda", "animal")


@admin.register(Reproducao)
class ReproducaoAdmin(admin.ModelAdmin):
    list_display = ("data", "fazenda", "animal", "tipo", "data_estimada_parto", "status_gestacao")
    list_filter = ("fazenda", "tipo", "status_gestacao")
    list_select_related = ("fazenda", "animal")


@admin.register(Alimentacao)
class AlimentacaoAdmin(admin.ModelAdmin):
    list_display = ("data", "fazenda", "animal", "tipo_alimento", "quantidade", "unidade", "produto")
    list_filter = ("fazenda", "tipo_alimento", "data")
    list_select_related = ("fazenda", "animal", "produto")
