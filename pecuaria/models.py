from django.conf import settings
from django.db import models

from dashboard.models import Fazenda, Produto

class Animal(models.Model):
    TIPO_CHOICES = [
        ('LEITE', 'Gado Leiteiro'),
        ('CORTE', 'Gado de Corte'),
        ('MISTO', 'Misto'),
        ('OUTRO', 'Outro'),
    ]

    CATEGORIA_CHOICES = [
        ('VACA_LACTACAO', 'Vaca em lactação'),
        ('VACA_SECA', 'Vaca seca'),
        ('NOVILHA', 'Novilha'),
        ('BEZERRA', 'Bezerra'),
        ('BEZERRO', 'Bezerro'),
        ('TOURO', 'Touro'),
    ]

    SEXO_CHOICES = [
        ('M', 'Macho'),
        ('F', 'Fêmea'),
    ]

    STATUS_CHOICES = [
        ('ATIVO', 'Ativo'),
        ('VENDIDO', 'Vendido'),
        ('MORTO', 'Morto'),
        ('TRANSFERIDO', 'Transferido'),
        ('OUTRO', 'Outro'),
    ]

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name='animais')
    identificacao = models.CharField('Identificação/Brinco', max_length=100)
    nome = models.CharField('Nome/Apelido', max_length=150, blank=True)
    tipo = models.CharField('Tipo', max_length=20, choices=TIPO_CHOICES, default='LEITE')
    categoria = models.CharField('Categoria', max_length=50, choices=CATEGORIA_CHOICES)
    sexo = models.CharField('Sexo', max_length=1, choices=SEXO_CHOICES)
    raca = models.CharField('Raça', max_length=100, blank=True)
    data_nascimento = models.DateField('Data de Nascimento', null=True, blank=True)
    peso = models.DecimalField('Peso (kg)', max_digits=8, decimal_places=2, null=True, blank=True)
    origem = models.CharField('Origem', max_length=150, blank=True)
    mae = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='filhos_mae', limit_choices_to={'sexo': 'F'})
    pai = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='filhos_pai', limit_choices_to={'sexo': 'M'})
    data_entrada = models.DateField('Data de Entrada', null=True, blank=True)
    status = models.CharField('Status', max_length=20, choices=STATUS_CHOICES, default='ATIVO')
    observacoes = models.TextField('Observações', blank=True)
    arquivado = models.BooleanField('Arquivado', default=False)
    
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['identificacao']
        verbose_name = 'Animal'
        verbose_name_plural = 'Animais'
        constraints = [
            models.UniqueConstraint(
                fields=['fazenda', 'identificacao'],
                name='pecuaria_animal_id_unico_por_fazenda',
            ),
        ]
        indexes = [
            models.Index(fields=['fazenda', 'status', 'categoria']),
        ]

    def __str__(self):
        nome_display = f" - {self.nome}" if self.nome else ""
        return f"{self.identificacao}{nome_display} ({self.get_categoria_display()})"


class ProducaoLeite(models.Model):
    ORDENHA_CHOICES = [
        ('MANHA', 'Manhã'),
        ('TARDE', 'Tarde'),
        ('NOITE', 'Noite'),
        ('UNICA', 'Única'),
    ]

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name='producoes_leite')
    animal = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name='producoes_leite', null=True, blank=True)
    data = models.DateField('Data da Produção')
    quantidade = models.DecimalField('Quantidade de Litros', max_digits=8, decimal_places=2)
    ordenha = models.CharField('Ordenha', max_length=20, choices=ORDENHA_CHOICES, default='UNICA')
    observacao = models.TextField('Observação', blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data', '-criado_em']
        verbose_name = 'Produção de Leite'
        verbose_name_plural = 'Produções de Leite'
        indexes = [
            models.Index(fields=['fazenda', '-data']),
            models.Index(fields=['animal', '-data']),
        ]

    def __str__(self):
        animal_str = self.animal.identificacao if self.animal else 'Lote/Geral'
        return f"{self.data} - {animal_str} - {self.quantidade}L"


class Manejo(models.Model):
    TIPO_CHOICES = [
        ('VACINACAO', 'Vacinação'),
        ('MEDICAMENTO', 'Medicamento'),
        ('VERMIFUGACAO', 'Vermifugação'),
        ('DOENCA', 'Doença'),
        ('TRATAMENTO', 'Tratamento'),
        ('PESAGEM', 'Pesagem'),
        ('PARTO', 'Parto'),
        ('INSEMINACAO', 'Inseminação'),
        ('DIAGNOSTICO_GESTACAO', 'Diagnóstico de Gestação'),
        ('SECAGEM', 'Secagem'),
        ('ALTERACAO_CATEGORIA', 'Alteração de Categoria'),
        ('OUTRO', 'Outro'),
    ]

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name='manejos_pecuaria')
    animal = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name='manejos')
    tipo_evento = models.CharField('Tipo de Evento', max_length=50, choices=TIPO_CHOICES)
    data = models.DateField('Data do Evento')
    descricao = models.TextField('Descrição', blank=True)
    produto_utilizado = models.ForeignKey(Produto, on_delete=models.SET_NULL, null=True, blank=True, related_name='manejos_pecuaria')
    quantidade_produto = models.DecimalField('Quantidade de produto utilizado', max_digits=10, decimal_places=2, null=True, blank=True)
    dosagem = models.CharField('Dosagem', max_length=100, blank=True)
    responsavel = models.CharField('Responsável', max_length=150, blank=True)
    observacoes = models.TextField('Observações', blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data', '-criado_em']
        verbose_name = 'Registro de Manejo'
        verbose_name_plural = 'Registros de Manejo'
        indexes = [
            models.Index(fields=['fazenda', '-data']),
            models.Index(fields=['animal', '-data']),
        ]

    def __str__(self):
        return f"{self.data} - {self.get_tipo_evento_display()} - {self.animal.identificacao}"


class Reproducao(models.Model):
    TIPO_CHOICES = [
        ('INSEMINACAO', 'Inseminação'),
        ('MONTA', 'Monta'),
        ('DIAGNOSTICO', 'Diagnóstico de Gestação'),
        ('GESTACAO', 'Gestação Confirmada'),
        ('PARTO', 'Parto'),
        ('ABORTO', 'Aborto'),
        ('SECAGEM', 'Secagem'),
    ]

    STATUS_GESTACAO_CHOICES = [
        ('PENDENTE', 'Aguardando Diagnóstico'),
        ('CONFIRMADA', 'Confirmada'),
        ('NEGATIVA', 'Negativa/Falha'),
        ('CONCLUIDA', 'Concluída (Parto/Aborto)'),
    ]

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name='reproducoes_pecuaria')
    animal = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name='reproducoes')
    tipo = models.CharField('Tipo de Evento', max_length=50, choices=TIPO_CHOICES)
    data = models.DateField('Data do Evento')
    touro_inseminador = models.CharField('Touro/Sêmen', max_length=150, blank=True)
    data_estimada_parto = models.DateField('Data Estimada do Parto', null=True, blank=True)
    status_gestacao = models.CharField('Status da Gestação', max_length=20, choices=STATUS_GESTACAO_CHOICES, blank=True)
    observacoes = models.TextField('Observações', blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data', '-criado_em']
        verbose_name = 'Registro de Reprodução'
        verbose_name_plural = 'Registros de Reprodução'
        indexes = [
            models.Index(fields=['fazenda', '-data']),
            models.Index(fields=['animal', '-data']),
            models.Index(fields=['fazenda', 'data_estimada_parto']),
        ]

    def __str__(self):
        return f"{self.data} - {self.get_tipo_display()} - {self.animal.identificacao}"


class Alimentacao(models.Model):
    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name='alimentacoes_pecuaria')
    animal = models.ForeignKey(Animal, on_delete=models.SET_NULL, null=True, blank=True, related_name='alimentacoes', help_text="Deixe em branco para lote/geral")
    produto = models.ForeignKey(Produto, on_delete=models.SET_NULL, null=True, blank=True, related_name='alimentacoes_pecuaria')
    tipo_alimento = models.CharField('Tipo de Alimento', max_length=100)
    quantidade = models.DecimalField('Quantidade Consumida', max_digits=10, decimal_places=2)
    unidade = models.CharField('Unidade', max_length=20)
    data = models.DateField('Data do Consumo')
    observacao = models.TextField('Observação', blank=True)
    criado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data', '-criado_em']
        verbose_name = 'Registro de Alimentação'
        verbose_name_plural = 'Registros de Alimentação'
        indexes = [
            models.Index(fields=['fazenda', '-data']),
            models.Index(fields=['produto', '-data']),
        ]

    def __str__(self):
        return f"{self.data} - {self.tipo_alimento} - {self.quantidade}{self.unidade}"
