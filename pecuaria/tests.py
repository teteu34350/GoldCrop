import json
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from dashboard.models import Fazenda, MovimentacaoEstoque, Produto

from .models import Alimentacao, Animal, Manejo, ProducaoLeite, Reproducao


class PecuariaApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="fazendeiro", password="senha-segura")
        self.farm = self.make_farm(self.user, "Fazenda Boa Vista")
        self.client.force_login(self.user)
        self.animal = Animal.objects.create(
            fazenda=self.farm,
            identificacao="023",
            categoria="VACA_LACTACAO",
            sexo="F",
            status="ATIVO",
        )

    @staticmethod
    def make_farm(user, name):
        return Fazenda.objects.create(
            produtor=user,
            nome=name,
            cep="12345678",
            estado="MG",
            cidade="Lavras",
            bairro="Centro",
            area_hectares=Decimal("10.00"),
            quantidade_talhoes=1,
        )

    def post_json(self, url, data):
        return self.client.post(url, json.dumps(data), content_type="application/json")

    def test_animal_crud_and_archive_preserve_history(self):
        response = self.post_json("/pecuaria/api/animais/", {
            "identificacao": "024",
            "nome": "Mimosa",
            "tipo": "LEITE",
            "categoria": "VACA_LACTACAO",
            "sexo": "F",
            "raca": "Holandesa",
            "peso": "450.5",
            "status": "ATIVO",
        })
        self.assertEqual(response.status_code, 201)
        animal_id = response.json()["animal"]["id"]
        response = self.client.patch(
            f"/pecuaria/api/animais/{animal_id}/",
            json.dumps({"nome": "Mimosa II"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["animal"]["nome"], "Mimosa II")

        production = self.post_json("/pecuaria/api/producao/", {
            "animal_id": animal_id,
            "data": date.today().isoformat(),
            "quantidade": "18.5",
            "ordenha": "MANHA",
        })
        self.assertEqual(production.status_code, 201)
        response = self.client.get(f"/pecuaria/api/animais/{animal_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["animal"]["historico"][0]["tipo"], "Produção de leite")

        archived = self.client.delete(f"/pecuaria/api/animais/{animal_id}/")
        self.assertEqual(archived.status_code, 200)
        self.assertTrue(Animal.objects.get(pk=animal_id).arquivado)
        self.assertEqual(ProducaoLeite.objects.filter(animal_id=animal_id).count(), 1)

    def test_module_page_uses_authenticated_farm_context(self):
        response = self.client.get("/pecuaria/")
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "pecuaria.html")
        self.assertContains(response, "Resumo do rebanho")
        self.assertContains(response, "Produção de leite")
        response = self.client.get(f"/pecuaria/animais/{self.animal.id}/")
        self.assertEqual(response.status_code, 200)

    def test_main_dashboard_renders_livestock_summary(self):
        response = self.client.get("/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "farmLivestockCount")
        self.assertContains(response, "pecuaria-dashboard.js")

    def test_production_and_dashboard_totals_are_farm_scoped(self):
        other_user = get_user_model().objects.create_user(username="outra", password="senha-segura")
        other_farm = self.make_farm(other_user, "Outra Fazenda")
        other_animal = Animal.objects.create(
            fazenda=other_farm, identificacao="999", categoria="VACA_LACTACAO",
            sexo="F", status="ATIVO",
        )
        response = self.post_json("/pecuaria/api/producao/", {
            "animal_id": other_animal.id,
            "data": date.today().isoformat(),
            "quantidade": "15",
        })
        self.assertEqual(response.status_code, 400)
        ProducaoLeite.objects.create(
            fazenda=self.farm, animal=self.animal, data=date.today(),
            quantidade=Decimal("20.00"),
        )
        response = self.client.get("/pecuaria/api/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["resumo"]["total_animais"], 1)
        self.assertEqual(response.json()["resumo"]["producao_hoje"], 20)
        self.assertEqual(response.json()["resumo"]["media_litros_vaca_dia"], 20)
        self.assertEqual(response.json()["fazenda"], self.farm.nome)
        self.assertEqual(len(response.json()["producao_diaria"]), 14)
        self.assertEqual(len(response.json()["producao_semanal"]), 12)
        self.assertEqual(len(response.json()["producao_mensal"]), 12)

    def test_production_period_filters_and_rejects_invalid_ranges(self):
        today = date.today()
        ProducaoLeite.objects.create(
            fazenda=self.farm, animal=self.animal, data=today,
            quantidade=Decimal("12.50"),
        )
        response = self.client.get(
            f"/pecuaria/api/producao/?inicio={today.isoformat()}&fim={today.isoformat()}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total_litros"], 12.5)
        self.assertEqual(response.json()["por_animal"][0]["animal"], self.animal.identificacao)
        response = self.client.get("/pecuaria/api/producao/?inicio=invalid")
        self.assertEqual(response.status_code, 400)

    def test_feeding_decrements_existing_stock_atomically(self):
        product = Produto.objects.create(
            fazenda=self.farm, nome="Ração", categoria="Alimentação",
            unidade="kg", quantidade_atual=Decimal("100"),
            estoque_minimo=Decimal("10"),
        )
        response = self.post_json("/pecuaria/api/alimentacao/", {
            "animal_id": self.animal.id,
            "produto_id": product.id,
            "tipo_alimento": "Ração",
            "quantidade": "20",
            "unidade": "kg",
            "data": date.today().isoformat(),
        })
        self.assertEqual(response.status_code, 201)
        product.refresh_from_db()
        self.assertEqual(product.quantidade_atual, Decimal("80"))
        movement = MovimentacaoEstoque.objects.get(produto=product)
        self.assertEqual(movement.tipo, MovimentacaoEstoque.Tipo.SAIDA)
        self.assertEqual(movement.motivo, "Consumo na pecuária")
        self.assertEqual(Alimentacao.objects.get().produto, product)

        rejected = self.post_json("/pecuaria/api/alimentacao/", {
            "produto_id": product.id,
            "tipo_alimento": "Ração",
            "quantidade": "200",
            "unidade": "kg",
            "data": date.today().isoformat(),
        })
        self.assertEqual(rejected.status_code, 400)
        product.refresh_from_db()
        self.assertEqual(product.quantidade_atual, Decimal("80"))
        self.assertEqual(MovimentacaoEstoque.objects.filter(produto=product).count(), 1)

    def test_manejo_consumption_also_updates_existing_stock(self):
        product = Produto.objects.create(
            fazenda=self.farm, nome="Vacina", categoria="Medicamento",
            unidade="dose", quantidade_atual=Decimal("12"),
            estoque_minimo=Decimal("2"),
        )
        response = self.post_json("/pecuaria/api/manejo/", {
            "animal_id": self.animal.id,
            "produto_id": product.id,
            "quantidade_produto": "2",
            "tipo": "VACINACAO",
            "data": date.today().isoformat(),
            "dosagem": "2 doses",
        })
        self.assertEqual(response.status_code, 201)
        product.refresh_from_db()
        self.assertEqual(product.quantidade_atual, Decimal("10"))
        self.assertEqual(MovimentacaoEstoque.objects.get(produto=product).motivo, "Consumo na pecuária")
        self.assertEqual(Manejo.objects.get().quantidade_produto, Decimal("2"))

    def test_reproduction_calculates_expected_birth_date(self):
        service_date = date.today()
        response = self.post_json("/pecuaria/api/reproducao/", {
            "animal_id": self.animal.id,
            "tipo": "INSEMINACAO",
            "data": service_date.isoformat(),
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.json()["reproducao"]["data_estimada_parto"],
            (service_date + timedelta(days=283)).isoformat(),
        )
        self.assertEqual(response.json()["reproducao"]["status_gestacao"], "PENDENTE")

    def test_unauthenticated_api_returns_json_error(self):
        self.client.logout()
        response = self.client.get("/pecuaria/api/dashboard/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["ok"], False)
