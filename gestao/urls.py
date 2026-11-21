from django.urls import path

from . import views

app_name = 'gestao'

urlpatterns = [
    path('financeiro/', views.financeiro_page, name='financeiro'),
    path('safras/', views.safras_page, name='safras'),
    path('servicos/', views.servicos_page, name='servicos'),
    path('equipamentos/', views.equipamentos_page, name='equipamentos'),
    path('registros/', views.registros_page, name='registros'),
    path('relatorios/', views.relatorios_page, name='relatorios'),
    path('assistente/', views.assistente_page, name='assistente'),
    path('api/financeiro/', views.financeiro_api, name='financeiro_api'),
    path('api/safras/', views.safras_api, name='safras_api'),
    path('api/servicos/', views.servicos_api, name='servicos_api'),
    path('api/equipamentos/', views.equipamentos_api, name='equipamentos_api'),
    path('api/registros/', views.registros_api, name='registros_api'),
    path('api/relatorios/', views.relatorios_api, name='relatorios_api'),
    path('api/assistente/', views.assistente_api, name='assistente_api'),
]
