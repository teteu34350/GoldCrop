from django.urls import path

from .views import cadastro_view, home, login_view

app_name = 'dashboard'

urlpatterns = [
    path('', home, name='home'),
    path('login/', login_view, name='login'),
    path('cadastro/', cadastro_view, name='cadastro'),
]

