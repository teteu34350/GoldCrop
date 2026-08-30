from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from .models import ColetaMeteorologica, Fazenda, PerfilProdutor, RecomendacaoJanela, Talhao


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
