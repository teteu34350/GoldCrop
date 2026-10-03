from datetime import date, datetime, time

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.utils import timezone


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


class MembroFazenda(models.Model):
    class Funcao(models.TextChoices):
        PROPRIETARIO = "OWNER", "Proprietário"
        GERENTE = "MANAGER", "Gerente"
        TECNICO = "TECHNICIAN", "Técnico / Agrônomo"
        FUNCIONARIO = "EMPLOYEE", "Funcionário"

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="membros")
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="membros_fazenda")
    funcao = models.CharField(max_length=20, choices=Funcao.choices, default=Funcao.FUNCIONARIO)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["criado_em", "id"]
        constraints = [
            models.UniqueConstraint(fields=["fazenda", "usuario"], name="membro_unico_por_fazenda"),
        ]

    def __str__(self):
        return f"{self.usuario} — {self.fazenda} ({self.get_funcao_display()})"


class ConviteFazenda(models.Model):
    class Status(models.TextChoices):
        PENDENTE = "PENDING", "Pendente"
        ACEITO = "ACCEPTED", "Aceito"
        REVOGADO = "REVOKED", "Revogado"

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="convites")
    email = models.EmailField()
    funcao = models.CharField(
        max_length=20,
        choices=[choice for choice in MembroFazenda.Funcao.choices if choice[0] != MembroFazenda.Funcao.PROPRIETARIO],
    )
    token_digest = models.CharField(max_length=64, unique=True)
    convidado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="convites_enviados")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDENTE)
    expira_em = models.DateTimeField()
    criado_em = models.DateTimeField(auto_now_add=True)
    aceito_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-criado_em"]

    def __str__(self):
        return f"{self.email} — {self.fazenda} ({self.get_status_display()})"


class NotificacaoFazenda(models.Model):
    class Tipo(models.TextChoices):
        RECOMENDACAO = "RECOMMENDATION", "Nova recomendação"
        PLANEJAMENTO = "PLANNING", "Novo planejamento"
        APLICACAO = "APPLICATION", "Aplicação registrada"
        MEMBRO = "MEMBER", "Membro adicionado"

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="notificacoes")
    destinatario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notificacoes_fazenda")
    ator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="eventos_fazenda")
    tipo = models.CharField(max_length=24, choices=Tipo.choices)
    titulo = models.CharField(max_length=150)
    mensagem = models.CharField(max_length=500)
    lida_em = models.DateTimeField(null=True, blank=True)
    criada_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-criada_em", "-id"]
        indexes = [models.Index(fields=["destinatario", "fazenda", "lida_em"])]

    def __str__(self):
        return self.titulo


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


class PlanejamentoAplicacao(models.Model):
    class Status(models.TextChoices):
        PLANEJADA = "PLANEJADA", "Planejada"
        CONFIRMADA = "CONFIRMADA", "Confirmada"
        EXECUTADA = "EXECUTADA", "Executada"
        CANCELADA = "CANCELADA", "Cancelada"

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="planejamentos")
    talhao = models.ForeignKey(Talhao, on_delete=models.SET_NULL, null=True, blank=True, related_name="planejamentos")
    recomendacao = models.ForeignKey("RecomendacaoJanela", on_delete=models.SET_NULL, null=True, blank=True, related_name="planejamentos")
    produto = models.CharField(max_length=150)
    tipo_aplicacao = models.CharField(max_length=100, blank=True)
    dose = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    unidade_dose = models.CharField(max_length=30, blank=True)
    data_planejada = models.DateField()
    horario_inicial = models.TimeField(null=True, blank=True)
    horario_final = models.TimeField(null=True, blank=True)
    observacoes = models.TextField(blank=True)
    responsavel = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANEJADA)
    criado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="planejamentos_criados")
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-data_planejada", "-criado_em"]

    def dose_display(self):
        if self.dose is None:
            return ""
        dose_text = f"{self.dose} {self.unidade_dose}".strip()
        return dose_text or str(self.dose)

    def dentro_da_janela(self, data_real=None, horario_real=None):
        if not self.recomendacao:
            return False
        if data_real is None:
            return False
        horario = horario_real or time.min
        moment = datetime.combine(data_real, horario)
        if moment.tzinfo is None:
            moment = timezone.make_aware(moment, timezone.get_current_timezone())
        inicio = self.recomendacao.inicio
        fim = self.recomendacao.fim
        if inicio.tzinfo is None:
            inicio = timezone.make_aware(inicio, timezone.get_current_timezone())
        if fim.tzinfo is None:
            fim = timezone.make_aware(fim, timezone.get_current_timezone())
        return inicio <= moment <= fim


class ExecucaoAplicacao(models.Model):
    class Status(models.TextChoices):
        PLANEJADA = "planned", "Planejada"
        CONFIRMADA = "confirmed", "Confirmada"
        REALIZADA = "done", "Realizada"
        CANCELADA = "cancelled", "Cancelada"

    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="aplicacoes")
    talhao = models.ForeignKey(Talhao, on_delete=models.SET_NULL, null=True, blank=True, related_name="aplicacoes")
    planejamento = models.ForeignKey(PlanejamentoAplicacao, on_delete=models.SET_NULL, null=True, blank=True, related_name="execucoes")
    recomendacao = models.ForeignKey("RecomendacaoJanela", on_delete=models.SET_NULL, null=True, blank=True, related_name="aplicacoes")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PLANEJADA)
    produto = models.CharField(max_length=150)
    tipo_insumo = models.CharField(max_length=100, blank=True)
    dose = models.CharField(max_length=80, blank=True)
    quantidade = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    quantidade_realizada = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
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
    talhao = models.ForeignKey(Talhao, on_delete=models.SET_NULL, null=True, blank=True, related_name="coletas_meteorologicas")
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
    talhao = models.ForeignKey(Talhao, on_delete=models.SET_NULL, null=True, blank=True, related_name="recomendacoes")
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
