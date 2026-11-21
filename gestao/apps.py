from django.apps import AppConfig


class GestaoConfig(AppConfig):
    name = 'gestao'
    verbose_name = 'Gestão rural'

    def ready(self):
        from . import assistant_signals
