from django.db import models

# Create your models here.
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from dashboard.models import Fazenda, Talhao


class LancamentoFinanceiro(models.Model):
    class Tipo(models.TextChoices):
        RECEITA = 'RECEITA', 'Receita'
        DESPESA = 'DESPESA', 'Despesa'
        COMPRA = 'COMPRA', 'Compra'

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name='lancamentos_financeiros')
    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    titulo = models.CharField(max_length=160)
    categoria = models.CharField(max_length=80, default='Outros')
    valor = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    data = models.DateField()
    observacao = models.TextField(blank=True)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='lancamentos_financeiros_criados',
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data', '-criado_em']
        indexes = [
            models.Index(fields=['fazenda', 'data']),
            models.Index(fields=['fazenda', 'tipo', 'data']),
        ]

    def __str__(self):
        return f'{self.get_tipo_display()} - {self.titulo} ({self.valor})'


class Safra(models.Model):
    class Status(models.TextChoices):
        PLANEJAMENTO = 'PLANEJAMENTO', 'Planejamento'
        EM_ANDAMENTO = 'EM_ANDAMENTO', 'Em andamento'
        CONCLUIDA = 'CONCLUIDA', 'Concluída'
        ENCERRADA = 'ENCERRADA', 'Encerrada'

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name='safras')
    cultura = models.CharField(max_length=100)
    variedade = models.CharField(max_length=100, blank=True)
    ano_safra = models.CharField(max_length=20)
    area_hectares = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0.01)])
    data_plantio = models.DateField(null=True, blank=True)
    colheita_prevista = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANEJAMENTO)
    talhoes = models.ManyToManyField(Talhao, blank=True, related_name='safras')
    observacao = models.TextField(blank=True)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='safras_criadas',
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-ano_safra', 'cultura', 'id']
        indexes = [models.Index(fields=['fazenda', 'status'])]

    def __str__(self):
        return f'{self.cultura} - {self.ano_safra}'


class ServicoFazenda(models.Model):
    class Tipo(models.TextChoices):
        CONTRATADO = 'CONTRATADO', 'Contratado'
        PRESTADO = 'PRESTADO', 'Prestado'

    class Status(models.TextChoices):
        PENDENTE = 'PENDENTE', 'Pendente'
        CONCLUIDO = 'CONCLUIDO', 'Concluído'
        CANCELADO = 'CANCELADO', 'Cancelado'

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name='servicos')
    nome = models.CharField(max_length=160)
    tipo = models.CharField(max_length=12, choices=Tipo.choices)
    pessoa = models.CharField(max_length=150, blank=True)
    local = models.CharField(max_length=150, blank=True)
    quantidade = models.CharField(max_length=80, blank=True)
    valor = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    data = models.DateField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDENTE)
    observacao = models.TextField(blank=True)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='servicos_fazenda_criados',
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data', '-criado_em']
        indexes = [models.Index(fields=['fazenda', 'data'])]

    def __str__(self):
        return self.nome


class EquipamentoAgricola(models.Model):
    class Status(models.TextChoices):
        OPERACIONAL = 'OPERACIONAL', 'Operacional'
        MANUTENCAO = 'MANUTENCAO', 'Em manutenção'
        INATIVO = 'INATIVO', 'Inativo'

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name='equipamentos')
    nome = models.CharField(max_length=150)
    tipo = models.CharField(max_length=80)
    identificacao = models.CharField(max_length=80, blank=True)
    horimetro = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True, validators=[MinValueValidator(0)])
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPERACIONAL)
    ultima_manutencao = models.DateField(null=True, blank=True)
    proxima_manutencao = models.DateField(null=True, blank=True)
    observacao = models.TextField(blank=True)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='equipamentos_agricolas_criados',
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['nome', 'id']
        indexes = [models.Index(fields=['fazenda', 'status'])]

    def __str__(self):
        return self.nome
