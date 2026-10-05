from datetime import date, datetime, time
import re

from django.core import mail
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.urls import reverse

from .models import (
    ColetaMeteorologica, ExecucaoAplicacao, Fazenda, MembroFazenda,
    NotificacaoFazenda, PerfilProdutor, PlanejamentoAplicacao, RecomendacaoJanela,
    Produto, Talhao,
)


class CadastroELoginApiTests(TestCase):
    def setUp(self):
        self.payload = {
            "nome": "Maria da Silva", "email": "maria@example.com", "telefone": "(35) 99999-1234",
            "senha": "Senha123", "nome_fazenda": "Fazenda Horizonte", "cep": "37000-000",
            "estado": "MG", "cidade": "Varginha", "bairro": "Zona Rural", "endereco": "BR 491 km 10",
            "area_hectares": 120.5, "quantidade_talhoes": 8, "culturas": ["Café Arábica"],
            "tipo_cultivo": "Convencional", "irrigacao": "Gotejamento",
            "funcao": MembroFazenda.Funcao.PROPRIETARIO,
        }

    def test_cadastro_cria_apenas_usuario_e_perfil(self):
        response = self.client.post(reverse("dashboard:cadastro_api"), self.payload, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="maria@example.com")
        self.assertTrue(user.check_password("Senha123"))
        self.assertEqual(PerfilProdutor.objects.get(usuario=user).telefone, "35999991234")
        self.assertFalse(Fazenda.objects.filter(produtor=user).exists())
        self.assertEqual(response.json()["redirect_url"], reverse("dashboard:farm_onboarding"))
        self.assertEqual(int(self.client.session["_auth_user_id"]), user.id)

    def test_cadastro_ignora_dados_de_fazenda_herdados_do_formulario_antigo(self):
        payload = {
            "nome": "Maria da Silva",
            "email": "maria-sem-fazenda@example.com",
            "telefone": "(35) 99999-1234",
            "senha": "Senha123",
            "nome_fazenda": "Fazenda que não deve ser criada",
            "funcao": "MANAGER",
        }
        response = self.client.post(
            reverse("dashboard:cadastro_api"),
            payload,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username=payload["email"])
        self.assertFalse(Fazenda.objects.filter(produtor=user).exists())
        self.assertEqual(response.json()["redirect_url"], reverse("dashboard:farm_onboarding"))
        self.assertEqual(int(self.client.session["_auth_user_id"]), user.id)

    def test_usuario_sem_fazenda_e_redirecionado_ao_onboarding(self):
        response = self.client.post(
            reverse("dashboard:cadastro_api"),
            {
                "nome": "Maria da Silva",
                "email": "onboarding@example.com",
                "telefone": "(35) 99999-1234",
                "senha": "Senha123",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertContains(self.client.get(response.json()["redirect_url"]), "Entrar na Fazenda")
        self.assertRedirects(self.client.get(reverse("dashboard:dashboard")), reverse("dashboard:farm_onboarding"))

    def test_impede_email_duplicado(self):
        self.client.post(reverse("dashboard:cadastro_api"), self.payload, content_type="application/json")
        response = self.client.post(reverse("dashboard:cadastro_api"), self.payload, content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json()["field_errors"])

    def test_login_valida_credenciais_reais(self):
        self.client.post(reverse("dashboard:cadastro_api"), self.payload, content_type="application/json")
        self.client.logout()
        response = self.client.post(reverse("dashboard:login_api"), {"email": self.payload["email"], "password": self.payload["senha"], "remember_me": True}, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["redirect_url"], reverse("dashboard:farm_onboarding"))


class PersistenciaSistemaTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="produtor@example.com", email="produtor@example.com", password="Senha123")
        self.farm = Fazenda.objects.create(
            produtor=self.user, nome="Fazenda Teste", cep="37000000", estado="MG", cidade="Varginha",
            bairro="Zona Rural", area_hectares=10, quantidade_talhoes=1, culturas=["Café"],
            tipo_cultivo="Convencional", irrigacao="Gotejamento",
        )
        self.client.force_login(self.user)

    def test_estado_e_talhao_sao_persistidos(self):
        response = self.client.post(reverse("dashboard:talhao_create_api"), {"nome": "Talhão 01", "area": 5, "cultura": "Café", "latitude": -20.89, "longitude": -46.08}, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        state = self.client.get(reverse("dashboard:system_state_api"))
        self.assertEqual(state.status_code, 200)
        talhao_state = state.json()["talhoes"][0]
        self.assertEqual(talhao_state["name"], "Talhão 01")
        self.assertEqual(talhao_state["latitude"], -20.89)
        self.assertEqual(talhao_state["longitude"], -46.08)

    def test_talhao_converte_coordenadas_compactadas(self):
        response = self.client.post(reverse("dashboard:talhao_create_api"), {"nome": "Talhão GPS", "area": 5, "cultura": "Café", "latitude": "205823", "longitude": "460704"}, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        talhao = Talhao.objects.get(nome="Talhão GPS")
        self.assertAlmostEqual(float(talhao.latitude), -20.973056, places=5)
        self.assertAlmostEqual(float(talhao.longitude), -46.117778, places=5)

    def test_talhao_pode_ser_atualizado(self):
        talhao = Talhao.objects.create(fazenda=self.farm, nome="Talhão 01", area_hectares=5, cultura="Café", latitude=-20.89, longitude=-46.08, raio_metros=80)
        response = self.client.put(
            reverse("dashboard:talhao_update_api", args=[talhao.id]),
            {"nome": "Talhão 01 Editado", "area": 7.5, "cultura": "Café Especial", "latitude": -20.90, "longitude": -46.09, "raio": 100},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        talhao.refresh_from_db()
        self.assertEqual(talhao.nome, "Talhão 01 Editado")
        self.assertEqual(float(talhao.area_hectares), 7.5)

    def test_talhao_pode_ser_removido(self):
        talhao = Talhao.objects.create(fazenda=self.farm, nome="Talhão 02", area_hectares=5, cultura="Café", latitude=-20.89, longitude=-46.08, raio_metros=80)
        response = self.client.delete(reverse("dashboard:talhao_delete_api", args=[talhao.id]))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Talhao.objects.filter(pk=talhao.pk).exists())

    def test_coleta_e_recomendacao_sao_persistidas(self):
        collection = self.client.post(reverse("dashboard:weather_ingest_api"), {"fetchedAt": "2026-08-26T12:00:00Z", "location": {"latitude": -20.89, "longitude": -46.08, "timezone": "America/Sao_Paulo"}, "current": {}, "hourly": {}, "daily": {}, "soil": {}}, content_type="application/json")
        self.assertEqual(collection.status_code, 201)
        recommendation = self.client.post(reverse("dashboard:recommendations_ingest_api"), {"recommendations": [{"date": "2026-08-27", "windowStart": "2026-08-27T10:00:00Z", "windowEnd": "2026-08-27T14:00:00Z", "adequacyIndex": 82, "classification": "goldenWindow", "confidence": 0.9, "decision": "APPLY"}]}, content_type="application/json")
        self.assertEqual(recommendation.status_code, 201)
        self.assertEqual(RecomendacaoJanela.objects.count(), 1)
        self.assertEqual(ColetaMeteorologica.objects.count(), 1)

    def test_perfil_atualiza_usuario_e_fazenda_da_sessao(self):
        response = self.client.post(reverse("dashboard:profile_update_api"), {"name": "Produtor Atualizado", "email": "novo@example.com", "phone": "35999991234", "farm": "Fazenda Nova"}, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.farm.refresh_from_db()
        self.assertEqual(self.user.email, "novo@example.com")
        self.assertEqual(self.user.perfil.nome_completo, "Produtor Atualizado")
        self.assertEqual(self.farm.nome, "Fazenda Nova")

    def test_recomendacoes_sao_independentes_por_talhao(self):
        first = Talhao.objects.create(
            fazenda=self.farm, nome="Talhão Norte", area_hectares=3, cultura="Café",
            latitude=-20.89, longitude=-46.08,
        )
        second = Talhao.objects.create(
            fazenda=self.farm, nome="Talhão Sul", area_hectares=4, cultura="Café",
            latitude=-20.90, longitude=-46.09,
        )
        base_payload = {
            "fetchedAt": "2026-09-01T12:00:00Z",
            "location": {"timezone": "America/Sao_Paulo"},
            "current": {}, "hourly": {}, "daily": {}, "soil": {},
        }
        recommendations_by_talhao = {}
        for talhao, adequacy in ((first, 91), (second, 48)):
            collection = self.client.post(
                reverse("dashboard:weather_ingest_api"),
                {**base_payload, "talhao_id": talhao.id},
                content_type="application/json",
            )
            self.assertEqual(collection.status_code, 201)
            response = self.client.post(
                reverse("dashboard:recommendations_ingest_api"),
                {
                    "talhao_id": talhao.id,
                    "recommendations": [{
                        "date": "2026-09-02",
                        "windowStart": "2026-09-02T08:00:00-03:00",
                        "windowEnd": "2026-09-02T12:00:00-03:00",
                        "adequacyIndex": adequacy,
                        "classification": "test",
                        "confidence": 0.9,
                        "decision": "test",
                    }],
                },
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 201)
            recommendations_by_talhao[talhao.id] = response.json()["recommendations"][0]["id"]

        state = self.client.get(reverse("dashboard:system_state_api")).json()
        talhao_state = {item["id"]: item for item in state["talhoes"]}
        self.assertEqual(talhao_state[first.id]["recommendations"][0]["adequacyIndex"], 91)
        self.assertEqual(talhao_state[second.id]["recommendations"][0]["adequacyIndex"], 48)
        self.assertNotEqual(
            recommendations_by_talhao[first.id],
            recommendations_by_talhao[second.id],
        )

    def test_coleta_usa_a_localizacao_propria_do_talhao(self):
        first = Talhao.objects.create(
            fazenda=self.farm, nome="Talhão Leste", latitude=-20.89, longitude=-46.08,
        )
        second = Talhao.objects.create(
            fazenda=self.farm, nome="Talhão Oeste", latitude=-20.91, longitude=-46.11,
        )
        payload = {
            "fetchedAt": "2026-09-01T12:00:00Z",
            "location": {
                "latitude": -20.89,
                "longitude": -46.08,
                "timezone": "America/Sao_Paulo",
            },
            "current": {}, "hourly": {}, "daily": {}, "soil": {},
        }

        for talhao in (first, second):
            response = self.client.post(
                reverse("dashboard:weather_ingest_api"),
                {**payload, "talhao_id": talhao.id},
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 201)

        first_collection = ColetaMeteorologica.objects.get(talhao=first)
        second_collection = ColetaMeteorologica.objects.get(talhao=second)
        self.assertEqual(float(first_collection.latitude), -20.89)
        self.assertEqual(float(first_collection.longitude), -46.08)
        self.assertEqual(float(second_collection.latitude), -20.91)
        self.assertEqual(float(second_collection.longitude), -46.11)

        state = self.client.get(reverse("dashboard:system_state_api")).json()
        talhao_state = {item["id"]: item for item in state["talhoes"]}
        self.assertEqual(talhao_state[first.id]["weather"]["location"]["latitude"], -20.89)
        self.assertEqual(talhao_state[second.id]["weather"]["location"]["longitude"], -46.11)

    def test_registro_direto_aceita_status_legado_realizada(self):
        talhao = Talhao.objects.create(fazenda=self.farm, nome="Talhão Registro", latitude=-20.89, longitude=-46.08)
        response = self.client.post(
            reverse("dashboard:application_create_api"),
            {
                "talhao_id": talhao.id,
                "produto": "Fertilizante",
                "data": "2026-09-02",
                "status": "REALIZADA",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["application"]["status"], ExecucaoAplicacao.Status.REALIZADA)


class PlanejamentoEIndicadoresTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="planejador@example.com", email="planejador@example.com", password="Senha123")
        self.farm = Fazenda.objects.create(
            produtor=self.user, nome="Fazenda Planejamento", cep="37000000", estado="MG", cidade="Varginha",
            bairro="Zona Rural", area_hectares=50, quantidade_talhoes=2, culturas=["Café"],
            tipo_cultivo="Convencional", irrigacao="Gotejamento",
        )
        self.talhao = Talhao.objects.create(fazenda=self.farm, nome="Talhão A", area_hectares=10, cultura="Café", latitude=-20.89, longitude=-46.08, raio_metros=100)
        self.collection = ColetaMeteorologica.objects.create(
            fazenda=self.farm, talhao=self.talhao, fonte="open-meteo", coletada_em=datetime(2026, 9, 1, 12, 0, 0),
            latitude=-20.89, longitude=-46.08, timezone="America/Sao_Paulo",
            dados_atuais={}, dados_horarios={}, dados_diarios={}, dados_solo_modelados={}, dados_brutos={}
        )
        self.recommendation = RecomendacaoJanela.objects.create(
            fazenda=self.farm, talhao=self.talhao, coleta=self.collection, data=date(2026, 9, 2), inicio=datetime(2026, 9, 2, 6, 0, 0),
            fim=datetime(2026, 9, 2, 10, 0, 0), adequacao=88, classificacao="golden_window",
            confianca=0.9, decisao="aplicar", fatores={}, riscos={}, qualidade_dados={}, metricas={}, proximas_24h={}, proximas_48h={}
        )
        self.client.force_login(self.user)

    def test_planejamento_cria_relacao_com_recomendacao(self):
        response = self.client.post(
            reverse("dashboard:planejamento_create_api"),
            {
                "talhao_id": self.talhao.id,
                "produto": "Ureia",
                "tipo_aplicacao": "Nitrogenado",
                "dose": "120",
                "unidade_dose": "kg/ha",
                "data_planejada": "2026-09-02",
                "horario_inicial": "06:00",
                "horario_final": "10:00",
                "responsavel": "João",
                "recomendacao_id": self.recommendation.id,
                "observacoes": "Aplicação de suporte",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["planejamento"]["produto"], "Ureia")
        self.assertEqual(payload["planejamento"]["recomendacao_id"], self.recommendation.id)
        self.assertTrue(PlanejamentoAplicacao.objects.filter(recomendacao=self.recommendation).exists())

    def test_execucao_registra_status_e_compara_janela(self):
        planejamento = PlanejamentoAplicacao.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            recomendacao=self.recommendation,
            produto="Ureia",
            tipo_aplicacao="Nitrogenado",
            dose=120,
            unidade_dose="kg/ha",
            data_planejada=date(2026, 9, 2),
            horario_inicial=time(6, 0),
            horario_final=time(10, 0),
            responsavel="João",
            status=PlanejamentoAplicacao.Status.PLANEJADA,
            criado_por=self.user,
        )
        response = self.client.post(
            reverse("dashboard:aplicacao_exec_api", args=[planejamento.id]),
            {
                "data_real": "2026-09-02",
                "horario_real": "07:32",
                "quantidade_planejada": 120,
                "quantidade_realizada": 115,
                "responsavel": "João",
                "status": "EXECUTADA",
                "observacoes": "Dentro da janela",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["app"]["status"], ExecucaoAplicacao.Status.REALIZADA)
        self.assertTrue(payload["dentro_janela"])
        self.assertIn("dentro da janela", payload["mensagem"].lower())

    def test_analytics_calcula_indicadores_por_fazenda(self):
        PlanejamentoAplicacao.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            recomendacao=self.recommendation,
            produto="Ureia",
            tipo_aplicacao="Nitrogenado",
            dose=120,
            unidade_dose="kg/ha",
            data_planejada=date(2026, 9, 2),
            horario_inicial=time(6, 0),
            horario_final=time(10, 0),
            responsavel="João",
            status=PlanejamentoAplicacao.Status.PLANEJADA,
            criado_por=self.user,
        )
        ExecucaoAplicacao.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            planejamento=None,
            recomendacao=self.recommendation,
            produto="Ureia",
            tipo_insumo="Nitrogenado",
            dose="120 kg/ha",
            quantidade=115,
            data_aplicacao=date(2026, 9, 2),
            horario=time(7, 32),
            observacoes="exec",
            iea_previsto=88,
            status=ExecucaoAplicacao.Status.REALIZADA,
            criado_por=self.user,
        )
        response = self.client.get(reverse("dashboard:analytics_api"), {"period": "30d"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["applications"]["total"], 1)
        self.assertEqual(payload["applications"]["executed"], 1)
        self.assertEqual(payload["iea"]["average"], 88)
        self.assertEqual(payload["farm"]["monitored_area"], 10.0)

    def test_usuario_nao_acessa_dados_de_outra_fazenda(self):
        other_user = User.objects.create_user(username="outro@example.com", email="outro@example.com", password="Senha123")
        other_farm = Fazenda.objects.create(
            produtor=other_user, nome="Fazenda Rival", cep="35000000", estado="SP", cidade="Campinas",
            bairro="Centro", area_hectares=40, quantidade_talhoes=1, culturas=["Café"],
            tipo_cultivo="Convencional", irrigacao="Gotejamento",
        )
        other_talhao = Talhao.objects.create(fazenda=other_farm, nome="Talhão Rival", area_hectares=10, cultura="Café", latitude=-22.89, longitude=-47.08, raio_metros=80)
        response = self.client.get(reverse("dashboard:analytics_api"))
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertNotIn(other_talhao.id, [item["id"] for item in payload.get("talhoes", [])])
        self.assertNotIn(other_farm.id, [item["farm_id"] for item in payload.get("talhoes", [])])


class MembershipTeamAndNotificationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner@example.com",
            email="owner@example.com",
            password="Senha123",
            first_name="Produtor",
            last_name="Principal",
        )
        self.farm = Fazenda.objects.create(
            produtor=self.owner,
            nome="Fazenda Compartilhada",
            cep="37000000",
            estado="MG",
            cidade="Varginha",
            bairro="Zona Rural",
            area_hectares=10,
            quantidade_talhoes=1,
            culturas=["Café"],
            tipo_cultivo="Convencional",
            irrigacao="Gotejamento",
        )
        self.talhao = Talhao.objects.create(
            fazenda=self.farm,
            nome="Talhão Compartilhado",
            area_hectares=4,
            cultura="Café",
            latitude=-20.89,
            longitude=-46.08,
        )
        MembroFazenda.objects.create(
            fazenda=self.farm,
            usuario=self.owner,
            funcao=MembroFazenda.Funcao.PROPRIETARIO,
        )
        self.client.force_login(self.owner)

    def test_selecao_de_fazenda_e_persistida_na_sessao_e_isolada_por_membro(self):
        another_owner = User.objects.create_user(
            username="second@example.com",
            email="second@example.com",
            password="Senha123",
        )
        another_farm = Fazenda.objects.create(
            produtor=another_owner,
            nome="Outra fazenda",
            cep="37000001",
            estado="MG",
            cidade="Varginha",
            bairro="Zona Rural",
            area_hectares=20,
            quantidade_talhoes=1,
            culturas=["Milho"],
            tipo_cultivo="Convencional",
            irrigacao="Gotejamento",
        )
        MembroFazenda.objects.create(
            fazenda=another_farm,
            usuario=self.owner,
            funcao=MembroFazenda.Funcao.PROPRIETARIO,
        )
        list_response = self.client.get(reverse("dashboard:farms_api"))
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()["farms"]), 2)
        switch_response = self.client.post(
            reverse("dashboard:farms_api"),
            {"farm_id": another_farm.id},
            content_type="application/json",
        )
        self.assertEqual(switch_response.status_code, 200)
        state = self.client.get(reverse("dashboard:system_state_api")).json()
        self.assertEqual(state["farm"]["id"], another_farm.id)
        self.assertEqual(state["farm"]["role"], MembroFazenda.Funcao.PROPRIETARIO)
        denied = self.client.post(
            reverse("dashboard:farms_api"),
            {"farm_id": 999999},
            content_type="application/json",
        )
        self.assertEqual(denied.status_code, 403)

    def test_login_de_usuario_vinculado_abre_dashboard_sem_criar_fazenda(self):
        self.owner.set_password("Senha123")
        self.owner.save(update_fields=["password"])
        self.client.logout()
        response = self.client.post(
            reverse("dashboard:login_api"),
            {"email": self.owner.email, "password": "Senha123", "remember_me": True},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["redirect_url"], reverse("dashboard:dashboard"))
        self.assertEqual(Fazenda.objects.filter(produtor=self.owner).count(), 1)

    def test_proprietario_cria_multiplas_fazendas_com_codigo_e_talhoes(self):
        payload = {
            "name": "Fazenda Nova",
            "cep": "37000002",
            "state": "MG",
            "city": "Varginha",
            "district": "Zona Rural",
            "address": "Estrada do Café",
            "area": "18.5",
            "plot_count": 2,
            "culture": "Café",
        }
        response = self.client.post(
            reverse("dashboard:farm_create_api"),
            payload,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        farm = Fazenda.objects.get(nome="Fazenda Nova")
        self.assertNotEqual(farm.identificador, self.farm.identificador)
        self.assertRegex(farm.codigo_acesso, r"^GCRP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$")
        self.assertEqual(
            MembroFazenda.objects.get(fazenda=farm, usuario=self.owner).funcao,
            MembroFazenda.Funcao.PROPRIETARIO,
        )
        self.assertEqual(farm.talhoes.count(), 2)
        self.assertEqual(self.client.get(reverse("dashboard:system_state_api")).json()["farm"]["id"], farm.id)

    def test_novo_usuario_pode_criar_fazenda_depois_do_cadastro(self):
        response = self.client.post(
            reverse("dashboard:cadastro_api"),
            {
                "nome": "Novo Proprietário",
                "email": "new-owner@example.com",
                "telefone": "(35) 99999-1234",
                "senha": "Senha123",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="new-owner@example.com")
        self.assertFalse(Fazenda.objects.filter(produtor=user).exists())
        create_response = self.client.post(
            reverse("dashboard:farm_create_api"),
            {
                "name": "Fazenda Pós-Cadastro",
                "cep": "37000002",
                "state": "MG",
                "city": "Varginha",
                "district": "Zona Rural",
                "area": "18.5",
                "plot_count": 2,
            },
            content_type="application/json",
        )
        self.assertEqual(create_response.status_code, 201, create_response.content.decode())
        farm = Fazenda.objects.get(nome="Fazenda Pós-Cadastro")
        self.assertEqual(farm.membros.get(usuario=user).funcao, MembroFazenda.Funcao.PROPRIETARIO)
        self.assertEqual(farm.talhoes.count(), 2)

    def test_codigo_vincula_usuario_a_dados_compartilhados_e_nao_duplica_vinculo(self):
        product = Produto.objects.create(
            fazenda=self.farm,
            nome="Adubo compartilhado",
            categoria="Fertilizante",
            unidade="kg",
            quantidade_atual=25,
        )
        member = User.objects.create_user(
            username="new-member@example.com",
            email="new-member@example.com",
            password="test-password-123",
        )
        self.client.force_login(member)
        response = self.client.post(
            reverse("dashboard:farm_join_api"),
            {"access_code": self.farm.codigo_acesso.lower()},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        membership = MembroFazenda.objects.get(fazenda=self.farm, usuario=member)
        self.assertEqual(membership.funcao, MembroFazenda.Funcao.MEMBRO)
        self.assertEqual(membership.status, MembroFazenda.Status.ATIVO)
        self.assertEqual(
            self.client.get(reverse("dashboard:system_state_api")).json()["talhoes"][0]["name"],
            self.talhao.nome,
        )
        shared_stock = self.client.get(reverse("dashboard:estoque_produtos_api"))
        self.assertEqual(shared_stock.status_code, 200)
        self.assertEqual(shared_stock.json()["produtos"][0]["id"], product.id)

        duplicate = self.client.post(
            reverse("dashboard:farm_join_api"),
            {"access_code": self.farm.codigo_acesso},
            content_type="application/json",
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(MembroFazenda.objects.filter(fazenda=self.farm, usuario=member).count(), 1)
        rotate_code = self.client.post(
            reverse("dashboard:farm_access_code_api"),
            {},
            content_type="application/json",
        )
        self.assertEqual(rotate_code.status_code, 200)

    def test_codigo_invalido_mostra_erro_claro(self):
        member = User.objects.create_user(
            username="invalid-code@example.com",
            email="invalid-code@example.com",
            password="Senha123",
        )
        self.client.force_login(member)
        response = self.client.post(
            reverse("dashboard:farm_join_api"),
            {"access_code": "GCRP-XXXX-XXXX"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json()["message"],
            "Código de fazenda inválido. Verifique o código e tente novamente.",
        )

    def test_proprietario_pode_trocar_codigo_e_codigo_antigo_perde_validade(self):
        old_code = self.farm.codigo_acesso
        rotate = self.client.post(reverse("dashboard:farm_access_code_api"), {}, content_type="application/json")
        self.assertEqual(rotate.status_code, 200)
        self.farm.refresh_from_db()
        self.assertNotEqual(self.farm.codigo_acesso, old_code)

        member = User.objects.create_user(
            username="rotated-member@example.com",
            email="rotated-member@example.com",
            password="test-password-123",
        )
        self.client.force_login(member)
        old_code_response = self.client.post(
            reverse("dashboard:farm_join_api"),
            {"access_code": old_code},
            content_type="application/json",
        )
        self.assertEqual(old_code_response.status_code, 404)
        new_code_response = self.client.post(
            reverse("dashboard:farm_join_api"),
            {"access_code": self.farm.codigo_acesso},
            content_type="application/json",
        )
        self.assertEqual(new_code_response.status_code, 200)

    def test_vinculo_inativo_nao_concede_acesso_a_fazenda(self):
        inactive_user = User.objects.create_user(
            username="inactive@example.com",
            email="inactive@example.com",
            password="test-password-123",
        )
        MembroFazenda.objects.create(
            fazenda=self.farm,
            usuario=inactive_user,
            funcao=MembroFazenda.Funcao.PROPRIETARIO,
            status=MembroFazenda.Status.INATIVO,
        )
        self.client.force_login(inactive_user)
        farms = self.client.get(reverse("dashboard:farms_api"))
        state = self.client.get(reverse("dashboard:system_state_api"))
        self.assertEqual(farms.json()["farms"], [])
        self.assertIsNone(state.json()["farm"])

    def test_vinculo_membro_tem_funcao_valida_e_nao_pode_ser_alterada_por_api(self):
        member = User.objects.create_user(
            username="role-change@example.com",
            email="role-change@example.com",
            password="Senha123",
        )
        MembroFazenda.objects.create(
            fazenda=self.farm,
            usuario=member,
            funcao=MembroFazenda.Funcao.MEMBRO,
        )
        response = self.client.patch(
            reverse("dashboard:farm_member_api", args=[member.id]),
            {"role": "OWNER"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 405)
        self.assertEqual(
            MembroFazenda.objects.get(fazenda=self.farm, usuario=member).funcao,
            MembroFazenda.Funcao.MEMBRO,
        )

    def test_membros_que_entram_pelo_codigo_tem_acesso_completo(self):
        employee = User.objects.create_user(
            username="employee@example.com",
            email="employee@example.com",
            password="Senha123",
            first_name="Funcionário",
        )
        MembroFazenda.objects.create(
            fazenda=self.farm,
            usuario=employee,
            funcao=MembroFazenda.Funcao.MEMBRO,
        )
        self.client.force_login(employee)
        planning_response = self.client.post(
            reverse("dashboard:planejamento_create_api"),
            {
                "talhao_id": self.talhao.id,
                "produto": "Ureia",
                "data_planejada": "2026-09-02",
            },
            content_type="application/json",
        )
        self.assertEqual(planning_response.status_code, 201)
        talhao_response = self.client.post(
            reverse("dashboard:talhao_create_api"),
            {"nome": "Talhão proibido", "area": 2, "cultura": "Café", "latitude": -20.9, "longitude": -46.1},
            content_type="application/json",
        )
        self.assertEqual(talhao_response.status_code, 201)
        application_response = self.client.post(
            reverse("dashboard:application_create_api"),
            {
                "talhao_id": self.talhao.id,
                "produto": "Fertilizante",
                "data": "2026-09-02",
                "status": "REALIZADA",
            },
            content_type="application/json",
        )
        self.assertEqual(application_response.status_code, 201)

    def test_notificacoes_operacionais_sao_persistidas_por_usuario_e_podem_ser_lidas(self):
        member = User.objects.create_user(
            username="member@example.com",
            email="member@example.com",
            password="Senha123",
            first_name="Membro",
        )
        MembroFazenda.objects.create(
            fazenda=self.farm,
            usuario=member,
            funcao=MembroFazenda.Funcao.PROPRIETARIO,
        )
        create_response = self.client.post(
            reverse("dashboard:planejamento_create_api"),
            {
                "talhao_id": self.talhao.id,
                "produto": "Ureia",
                "data_planejada": "2026-09-02",
            },
            content_type="application/json",
        )
        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(
            NotificacaoFazenda.objects.filter(fazenda=self.farm, tipo=NotificacaoFazenda.Tipo.PLANEJAMENTO).count(),
            2,
        )
        self.client.force_login(member)
        notifications = self.client.get(reverse("dashboard:notifications_api")).json()
        self.assertEqual(notifications["unread_count"], 1)
        notification_id = notifications["notifications"][0]["id"]
        read_response = self.client.post(reverse("dashboard:notification_read_api", args=[notification_id]))
        self.assertEqual(read_response.status_code, 200)
        self.assertEqual(self.client.get(reverse("dashboard:notifications_api")).json()["unread_count"], 0)

    def test_proprietario_pode_remover_outro_e_nao_pode_remover_a_si_proprio(self):
        member = User.objects.create_user(username="remove@example.com", email="remove@example.com", password="Senha123")
        MembroFazenda.objects.create(fazenda=self.farm, usuario=member, funcao=MembroFazenda.Funcao.PROPRIETARIO)
        response = self.client.delete(reverse("dashboard:farm_member_api", args=[member.id]))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(MembroFazenda.objects.filter(fazenda=self.farm, usuario=member).exists())
        own_membership = self.client.delete(
            reverse("dashboard:farm_member_api", args=[self.owner.id])
        )
        self.assertEqual(own_membership.status_code, 400)
        self.assertTrue(MembroFazenda.objects.filter(fazenda=self.farm, usuario=self.owner).exists())

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        EMAIL_HOST="smtp.example.test",
        DEFAULT_FROM_EMAIL="conta@goldcrop.test",
    )
    def test_redefinicao_de_senha_envia_link_real_e_atualiza_credencial(self):
        response = self.client.post(
            reverse("dashboard:password_reset_api"),
            {"email": self.owner.email},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        reset_match = re.search(r"/conta/redefinir/([^/]+)/([^/\s]+)/", mail.outbox[0].body)
        self.assertIsNotNone(reset_match)
        reset_path = reverse(
            "dashboard:password_reset_confirm",
            args=[reset_match.group(1), reset_match.group(2)],
        )
        confirm_page = self.client.get(reset_path, follow=True)
        self.assertEqual(confirm_page.status_code, 200)
        reset_path = confirm_page.request["PATH_INFO"]
        changed = self.client.post(
            reset_path,
            {"new_password1": "SenhaNova123", "new_password2": "SenhaNova123"},
        )
        self.assertRedirects(changed, reverse("dashboard:password_reset_complete"))
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password("SenhaNova123"))

    @override_settings(EMAIL_HOST="", DEFAULT_FROM_EMAIL="")
    def test_redefinicao_de_senha_nao_simula_envio_sem_smtp(self):
        response = self.client.post(
            reverse("dashboard:password_reset_api"),
            {"email": self.owner.email},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(len(mail.outbox), 0)
