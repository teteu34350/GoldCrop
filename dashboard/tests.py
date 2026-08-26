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

    def test_coleta_e_recomendacao_sao_persistidas(self):
        collection = self.client.post(reverse("dashboard:weather_ingest_api"), {"fetchedAt": "2026-08-26T12:00:00Z", "location": {"latitude": -20.89, "longitude": -46.08, "timezone": "America/Sao_Paulo"}, "current": {}, "hourly": {}, "daily": {}, "soil": {}}, content_type="application/json")
        self.assertEqual(collection.status_code, 201)
        recommendation = self.client.post(reverse("dashboard:recommendations_ingest_api"), {"recommendations": [{"date": "2026-08-27", "windowStart": "2026-08-27T10:00:00Z", "windowEnd": "2026-08-27T14:00:00Z", "adequacyIndex": 82, "classification": "goldenWindow", "confidence": 0.9, "decision": "APPLY"}]}, content_type="application/json")
        self.assertEqual(recommendation.status_code, 201)
        self.assertEqual(RecomendacaoJanela.objects.count(), 1)
        self.assertEqual(ColetaMeteorologica.objects.count(), 1)
