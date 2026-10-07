from django.urls import path

from . import views

app_name = "pecuaria"

urlpatterns = [
    path("", views.dashboard_page, name="dashboard"),
    path("animais/<int:animal_id>/", views.animal_page, name="animal_page"),
    path("api/dashboard/", views.dashboard_api, name="dashboard_api"),
    path("api/animais/", views.animais_api, name="animais_api"),
    path("api/animais/<int:animal_id>/", views.animal_detail_api, name="animal_detail_api"),
    path("api/producao/", views.producao_api, name="producao_api"),
    path("api/manejo/", views.manejo_api, name="manejo_api"),
    path("api/reproducao/", views.reproducao_api, name="reproducao_api"),
    path("api/alimentacao/", views.alimentacao_api, name="alimentacao_api"),
]
