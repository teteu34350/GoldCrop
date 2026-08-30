from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models


phone_validator = RegexValidator(
    regex=r"^\d{10,11}$",
    message="Informe um telefone brasileiro com DDD.",
)


class PerfilProdutor(models.Model):
    """Dados pessoais que complementam o usuário autenticável do Django."""

    usuario = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="perfil")
    nome_completo = models.CharField(max_length=150)
    telefone = models.CharField(max_length=11, validators=[phone_validator])
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.nome_completo


class Fazenda(models.Model):
    """Propriedade cadastrada no onboarding de um produtor."""

    class TipoCultivo(models.TextChoices):
        CONVENCIONAL = "Convencional", "Convencional"
        ORGANICO = "Orgânico", "Orgânico Certificado"
        AGROFLORESTAL = "Agroflorestal", "Agroflorestal"
        ILPF = "Integrado (ILPF)", "Integrado (ILPF)"

    class Irrigacao(models.TextChoices):
        GOTEJAMENTO = "Gotejamento", "Gotejamento"
        ASPERSAO = "Aspersão / Pivô Central", "Aspersão / Pivô Central"
        MICROASPERSAO = "Microaspersão", "Microaspersão"
        SEQUEIRO = "Sem Irrigação (Sequeiro)", "Sem Irrigação (Sequeiro)"

    produtor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="fazendas")
    nome = models.CharField(max_length=150)
    cep = models.CharField(max_length=8, validators=[RegexValidator(r"^\d{8}$", "Informe um CEP válido.")])
    estado = models.CharField(max_length=2)
    cidade = models.CharField(max_length=100)
    bairro = models.CharField(max_length=120)
    endereco = models.CharField(max_length=255, blank=True)
    area_hectares = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0.01)])
    quantidade_talhoes = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    culturas = models.JSONField(default=list)
    tipo_cultivo = models.CharField(max_length=30, choices=TipoCultivo.choices, default=TipoCultivo.CONVENCIONAL)
    irrigacao = models.CharField(max_length=35, choices=Irrigacao.choices, default=Irrigacao.GOTEJAMENTO)
    criada_em = models.DateTimeField(auto_now_add=True)
    atualizada_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nome"]
        constraints = [models.UniqueConstraint(fields=["produtor", "nome"], name="fazenda_nome_unico_por_produtor")]

    def __str__(self):
        return self.nome


class Talhao(models.Model):
    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="talhoes")
    nome = models.CharField(max_length=100)
    area_hectares = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cultura = models.CharField(max_length=100, blank=True)
    variedade = models.CharField(max_length=100, blank=True)
    idade_anos = models.PositiveIntegerField(null=True, blank=True)
    tipo_solo = models.CharField(max_length=100, blank=True)
    codigo_sensor = models.CharField(max_length=50, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, validators=[MinValueValidator(-90), MaxValueValidator(90)])
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, validators=[MinValueValidator(-180), MaxValueValidator(180)])
    raio_metros = models.PositiveIntegerField(default=80)
    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nome"]
        constraints = [models.UniqueConstraint(fields=["fazenda", "nome"], name="talhao_nome_unico_por_fazenda")]

    def __str__(self):
        return f"{self.fazenda.nome} - {self.nome}"


class ExecucaoAplicacao(models.Model):
    class Status(models.TextChoices):
        PLANEJADA = "planned", "Planejada"
        REALIZADA = "done", "Realizada"
        CANCELADA = "cancelled", "Cancelada"

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="aplicacoes")
    talhao = models.ForeignKey(Talhao, on_delete=models.SET_NULL, null=True, blank=True, related_name="aplicacoes")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PLANEJADA)
    produto = models.CharField(max_length=150)
    tipo_insumo = models.CharField(max_length=100, blank=True)
    dose = models.CharField(max_length=80, blank=True)
    quantidade = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    data_aplicacao = models.DateField()
    horario = models.TimeField(null=True, blank=True)
    observacoes = models.TextField(blank=True)
    iea_previsto = models.PositiveSmallIntegerField(null=True, blank=True)
    criado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="aplicacoes_criadas")
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-data_aplicacao", "-criado_em"]


class ColetaMeteorologica(models.Model):
    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="coletas_meteorologicas")
    fonte = models.CharField(max_length=40, default="open-meteo")
    coletada_em = models.DateTimeField()
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    timezone = models.CharField(max_length=80, blank=True)
    dados_atuais = models.JSONField(default=dict)
    dados_horarios = models.JSONField(default=dict)
    dados_diarios = models.JSONField(default=dict)
    dados_solo_modelados = models.JSONField(default=dict)
    dados_brutos = models.JSONField(default=dict)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-coletada_em"]


class RecomendacaoJanela(models.Model):
    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="recomendacoes")
    coleta = models.ForeignKey(ColetaMeteorologica, on_delete=models.CASCADE, related_name="recomendacoes")
    data = models.DateField()
    inicio = models.DateTimeField()
    fim = models.DateTimeField()
    adequacao = models.PositiveSmallIntegerField()
    classificacao = models.CharField(max_length=30)
    confianca = models.DecimalField(max_digits=5, decimal_places=4)
    decisao = models.CharField(max_length=30)
    fatores = models.JSONField(default=dict)
    riscos = models.JSONField(default=dict)
    qualidade_dados = models.JSONField(default=dict)
    metricas = models.JSONField(default=dict)
    proximas_24h = models.JSONField(default=dict)
    proximas_48h = models.JSONField(default=dict)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["data", "-adequacao"]
        indexes = [models.Index(fields=["fazenda", "data"]), models.Index(fields=["fazenda", "inicio"])]


class SensorIoT(models.Model):
    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="sensores_iot")
    talhao = models.ForeignKey(Talhao, on_delete=models.SET_NULL, null=True, blank=True, related_name="sensores_iot")
    identificador = models.CharField(max_length=100)
    tipo = models.CharField(max_length=80)
    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["fazenda", "identificador"], name="sensor_identificador_unico_por_fazenda")]


class LeituraSensorIoT(models.Model):
    sensor = models.ForeignKey(SensorIoT, on_delete=models.CASCADE, related_name="leituras")
    lida_em = models.DateTimeField()
    umidade_solo = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    temperatura = models.DecimalField(max_digits=7, decimal_places=3, null=True, blank=True)
    dados = models.JSONField(default=dict)

    class Meta:
        ordering = ["-lida_em"]
        indexes = [models.Index(fields=["sensor", "lida_em"])]
