from django.shortcuts import render


def home(request):
    return render(request, 'index.html')


def login_view(request):
    return render(request, 'login.html')


def cadastro_view(request):
    return render(request, 'cadastro.html')

