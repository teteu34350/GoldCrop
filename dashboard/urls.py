from django.urls import path

from .views import (
    home, calendario_view, talhoes_view, fazenda_view,
    sensores_view, aplicacoes_view, historico_view, configuracoes_view,
    login_view, cadastro_view, login_api, cadastro_api, logout_api,
    system_state_api, weather_ingest_api, recommendations_ingest_api, application_create_api, talhao_create_api
)

app_name = 'dashboard'

urlpatterns = [
    path('dashboard/', home, name='dashboard'),
    path('calendario/', calendario_view, name='calendar'),
    path('talhoes/', talhoes_view, name='talhoes'),
    path('fazenda/', fazenda_view, name='fazenda'),
    path('sensores/', sensores_view, name='sensores'),
    path('aplicacoes/', aplicacoes_view, name='aplicacoes'),
    path('historico/', historico_view, name='historico'),
    path('configuracoes/', configuracoes_view, name='settings'),

    path('login/', login_view, name='login'),
    path('cadastro/', cadastro_view, name='cadastro'),
    path('api/auth/login/', login_api, name='login_api'),
    path('api/auth/cadastro/', cadastro_api, name='cadastro_api'),
    path('logout/', logout_api, name='logout'),
    path('api/state/', system_state_api, name='system_state_api'),
    path('api/weather/ingest/', weather_ingest_api, name='weather_ingest_api'),
    path('api/recommendations/ingest/', recommendations_ingest_api, name='recommendations_ingest_api'),
    path('api/applications/', application_create_api, name='application_create_api'),
    path('api/talhoes/', talhao_create_api, name='talhao_create_api'),

    path('', home, name='home'),
]
