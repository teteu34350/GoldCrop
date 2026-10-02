from datetime import date, datetime, time

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from .models import ColetaMeteorologica, ExecucaoAplicacao, Fazenda, PerfilProdutor, PlanejamentoAplicacao, RecomendacaoJanela, Talhao


class CadastroELoginApiTests(TestCase):
    def setUp(self):
        self.payload = {
            "nome": "Maria da Silva", "email": "maria@example.com", "telefone": "(35) 99999-1234",
            "senha": "Senha123", "nome_fazenda": "Fazenda Horizonte", "cep": "37000-000",
            "estado": "MG", "cidade": "Varginha", "bairro": "Zona Rural", "endereco": "BR 491 km 10",
            "area_hectares": 120.5, "quantidade_talhoes": 8, "culturas": ["Café Arábica"],
            "tipo_cultivo": "Convencional", "irrigacao": "Gotejamento",
        }

    def test_cadastro_cria_usuario_perfil_e_fazenda_e_autentica(self):
        response = self.client.post(reverse("dashboard:cadastro_api"), self.payload, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="maria@example.com")
        self.assertTrue(user.check_password("Senha123"))
        self.assertEqual(PerfilProdutor.objects.get(usuario=user).telefone, "35999991234")
        fazenda = Fazenda.objects.get(produtor=user)
        self.assertEqual(fazenda.cep, "37000000")
        self.assertEqual(fazenda.culturas, ["Café Arábica"])
        self.assertEqual(fazenda.talhoes.count(), 8)
        self.assertEqual(int(self.client.session["_auth_user_id"]), user.id)

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
        self.assertEqual(response.json()["redirect_url"], "/dashboard/")


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
        self.assertEqual(state.json()["talhoes"][0]["name"], "Talhão 01")

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
