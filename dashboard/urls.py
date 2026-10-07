from django.urls import path
from django.urls import reverse_lazy
from django.contrib.auth import views as auth_views

from .views import (
    home, calendario_view, janela_ouro_view, talhoes_view, fazenda_view,
    sensores_view, aplicacoes_view, historico_view, configuracoes_view,
    farm_onboarding_view,
    login_view, cadastro_view, login_api, cadastro_api, logout_api,
    system_state_api, weather_ingest_api, recommendations_ingest_api,
    application_create_api, talhao_create_api, talhao_update_api, talhao_delete_api,
    profile_update_api, password_reset_api, planejamento_create_api, aplicacao_exec_api, analytics_api,
    farms_api, farm_create_api, farm_join_api, farm_access_code_api,
    farm_settings_api, farm_team_api, farm_member_api,
    notifications_api, notification_read_api,
    estoque_view, estoque_dashboard_api, estoque_produtos_api, estoque_movimentacoes_api,
    calendar_events_api, calendar_event_detail_api,
)

app_name = 'dashboard'

urlpatterns = [
    path('dashboard/', home, name='dashboard'),
    path('fazendas/boas-vindas/', farm_onboarding_view, name='farm_onboarding'),
    path('calendario/', calendario_view, name='calendar'),
    path('janela-de-ouro/', janela_ouro_view, name='gold_window'),
    path('talhoes/', talhoes_view, name='talhoes'),
    path('fazenda/', fazenda_view, name='fazenda'),
    path('sensores/', sensores_view, name='sensores'),
    path('aplicacoes/', aplicacoes_view, name='aplicacoes'),
    path('historico/', historico_view, name='historico'),
    path('configuracoes/', configuracoes_view, name='settings'),

    path('login/', login_view, name='login'),
    path('cadastro/', cadastro_view, name='cadastro'),
    path('api/auth/login/', login_api, name='login_api'),
    path('api/auth/password-reset/', password_reset_api, name='password_reset_api'),
    path('api/auth/cadastro/', cadastro_api, name='cadastro_api'),
    path('logout/', logout_api, name='logout'),
    path('api/state/', system_state_api, name='system_state_api'),
    path('api/weather/ingest/', weather_ingest_api, name='weather_ingest_api'),
    path('api/recommendations/ingest/', recommendations_ingest_api, name='recommendations_ingest_api'),
    path('api/applications/', application_create_api, name='application_create_api'),
    path('api/planejamentos/', planejamento_create_api, name='planejamento_create_api'),
    path('api/planejamentos/<int:planejamento_id>/exec/', aplicacao_exec_api, name='aplicacao_exec_api'),
    path('api/analytics/', analytics_api, name='analytics_api'),
    path('api/calendar/events/', calendar_events_api, name='calendar_events_api'),
    path('api/calendar/events/<int:event_id>/', calendar_event_detail_api, name='calendar_event_detail_api'),
    path('api/talhoes/', talhao_create_api, name='talhao_create_api'),
    path('api/talhoes/<int:talhao_id>/', talhao_update_api, name='talhao_update_api'),
    path('api/talhoes/<int:talhao_id>/delete/', talhao_delete_api, name='talhao_delete_api'),
    path('api/profile/', profile_update_api, name='profile_update_api'),
    path('api/farms/', farms_api, name='farms_api'),
    path('api/farms/create/', farm_create_api, name='farm_create_api'),
    path('api/farms/join/', farm_join_api, name='farm_join_api'),
    path('api/farms/access-code/', farm_access_code_api, name='farm_access_code_api'),
    path('api/farms/settings/', farm_settings_api, name='farm_settings_api'),
    path('api/farms/team/', farm_team_api, name='farm_team_api'),
    path('api/farms/team/<int:user_id>/', farm_member_api, name='farm_member_api'),
    path('api/notifications/', notifications_api, name='notifications_api'),
    path('api/notifications/<int:notification_id>/read/', notification_read_api, name='notification_read_api'),
    path('conta/redefinir/concluido/', auth_views.PasswordResetCompleteView.as_view(
        template_name='registration/password_reset_complete.html',
    ), name='password_reset_complete'),
    path('conta/redefinir/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(
        template_name='registration/password_reset_confirm.html',
        success_url=reverse_lazy('dashboard:password_reset_complete'),
    ), name='password_reset_confirm'),

    path('estoque/', estoque_view, name='estoque'),
    path('api/estoque/dashboard/', estoque_dashboard_api, name='estoque_dashboard_api'),
    path('api/estoque/produtos/', estoque_produtos_api, name='estoque_produtos_api'),
    path('api/estoque/movimentacoes/', estoque_movimentacoes_api, name='estoque_movimentacoes_api'),

    path('', home, name='home'),
]
