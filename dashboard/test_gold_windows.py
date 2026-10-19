import json
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .agronomy import evaluate_operation
from .models import ColetaMeteorologica, Fazenda, ParametroTecnicoOperacao, RecomendacaoJanela, Talhao
from .weather import WeatherProviderError, get_forecast_collection


def weather_fixture(now, *, timezone_name="America/Sao_Paulo", hours=220):
    local_now = now.astimezone(ZoneInfo(timezone_name))
    first = local_now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=36)
    times = [(first + timedelta(hours=index)).strftime("%Y-%m-%dT%H:%M") for index in range(hours)]
    values = {
        "temperature_2m": [22.0] * hours,
        "relative_humidity_2m": [60.0] * hours,
        "dew_point_2m": [14.0] * hours,
        "precipitation": [0.0] * hours,
        "precipitation_probability": [0.0] * hours,
        "wind_speed_10m": [5.0] * hours,
        "wind_direction_10m": [180.0] * hours,
        "wind_gusts_10m": [8.0] * hours,
        "et0_fao_evapotranspiration": [0.1] * hours,
        "shortwave_radiation": [300.0] * hours,
        "sunshine_duration": [3600.0] * hours,
        "soil_temperature_6cm": [20.0] * hours,
        "soil_temperature_18cm": [19.0] * hours,
        "soil_moisture_3_to_9cm": [0.25] * hours,
        "soil_moisture_9_to_27cm": [0.28] * hours,
    }
    return {
        "latitude": -20.9,
        "longitude": -46.1,
        "timezone": timezone_name,
        "hourly": {"time": times, **values},
        "daily": {"time": [time[:10] for time in times[::24]]},
        "current": {"time": times[36], "temperature_2m": 22.0},
    }


def plot_context(**changes):
    context = {"cultura": "Café", "variedade": "Catuaí", "tipo_solo": "Latossolo"}
    context.update(changes)
    return context


class AgronomyRulesTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.weather = weather_fixture(self.now)

    def evaluate(self, operation, criteria, weather=None, plot=None):
        return evaluate_operation(
            operation,
            plot or plot_context(),
            weather if weather is not None else self.weather,
            criteria,
            self.now,
        )

    def test_defensive_label_limit_is_a_hard_block(self):
        self.weather["hourly"]["wind_speed_10m"] = [22.0] * len(self.weather["hourly"]["time"])
        result = self.evaluate("FITOSSANITARIA", {
            "produto": "Produto teste",
            "metodo_aplicacao": "Pulverização terrestre",
            "rotulo_confirmado": True,
            "limites_rotulo_completos": True,
            "fonte_referencia": "Rótulo do produto teste",
            "data_verificacao": self.now.astimezone(ZoneInfo("America/Sao_Paulo")).date().isoformat(),
            "intervalo_sem_chuva_h": 0,
            "limites_rotulo": {"vento_max_kmh": 10},
        })
        self.assertTrue(result["windows"])
        self.assertTrue(all(window["classificacao"] == "DESFAVORAVEL" for window in result["windows"]))
        self.assertTrue(all(any("viola o limite do rótulo" in risk for risk in window["riscos"]) for window in result["windows"]))

    def test_missing_product_and_weather_data_return_insufficient(self):
        missing_criteria = self.evaluate("FITOSSANITARIA", {})
        self.assertEqual(missing_criteria["windows"][0]["classificacao"], "DADOS_INSUFICIENTES")
        self.assertIn("rótulo/bula", missing_criteria["windows"][0]["justificativa"])

        incomplete_label = self.evaluate("FITOSSANITARIA", {
            "produto": "Produto teste",
            "metodo_aplicacao": "Pulverização terrestre",
            "rotulo_confirmado": True,
            "limites_rotulo_completos": False,
            "fonte_referencia": "Rótulo do produto teste",
            "data_verificacao": self.now.astimezone(ZoneInfo("America/Sao_Paulo")).date().isoformat(),
            "intervalo_sem_chuva_h": 0,
            "limites_rotulo": {"vento_max_kmh": 35},
        })
        self.assertEqual(incomplete_label["windows"][0]["classificacao"], "DADOS_INSUFICIENTES")
        self.assertIn("todas as restrições meteorológicas", incomplete_label["windows"][0]["justificativa"])

        self.weather["hourly"]["wind_gusts_10m"] = [None] * len(self.weather["hourly"]["time"])
        missing_weather = self.evaluate("FITOSSANITARIA", {
            "produto": "Produto teste",
            "metodo_aplicacao": "Pulverização terrestre",
            "rotulo_confirmado": True,
            "limites_rotulo_completos": True,
            "fonte_referencia": "Rótulo do produto teste",
            "data_verificacao": self.now.astimezone(ZoneInfo("America/Sao_Paulo")).date().isoformat(),
            "intervalo_sem_chuva_h": 0,
            "limites_rotulo": {"vento_max_kmh": 35},
        })
        self.assertEqual(missing_weather["windows"][0]["classificacao"], "DADOS_INSUFICIENTES")
        self.assertNotIn("chance de sucesso", missing_weather["proveniencia"]["confianca_meteorologica"])

    def test_finds_alternative_windows_in_local_timezone(self):
        wind = self.weather["hourly"]["wind_speed_10m"]
        for index in range(38, len(wind)):
            wind[index] = 20.0
        result = self.evaluate("FITOSSANITARIA", {
            "produto": "Produto teste",
            "metodo_aplicacao": "Pulverização terrestre",
            "rotulo_confirmado": True,
            "limites_rotulo_completos": True,
            "fonte_referencia": "Rótulo do produto teste",
            "data_verificacao": self.now.astimezone(ZoneInfo("America/Sao_Paulo")).date().isoformat(),
            "intervalo_sem_chuva_h": 0,
            "limites_rotulo": {"vento_max_kmh": 10},
        })
        favorable = [window for window in result["windows"] if window["classificacao"] == "FAVORAVEL"]
        self.assertTrue(favorable)
        self.assertEqual(favorable[0]["inicio"].tzinfo.key, "America/Sao_Paulo")
        self.assertGreater(favorable[0]["inicio"], self.now)

    def test_planting_never_treats_missing_soil_estimate_as_a_measurement(self):
        del self.weather["hourly"]["soil_temperature_6cm"]
        result = self.evaluate("PLANTIO", {
            "estagio": "semeadura",
            "drenagem": "Boa",
            "temperatura_solo_min_c": 18,
            "temperatura_solo_max_c": 25,
            "chuva_min_24h_mm": 0,
        })
        self.assertEqual(result["windows"][0]["classificacao"], "DADOS_INSUFICIENTES")
        self.assertIn("estimativa", result["windows"][0]["riscos"][0].lower())

    def test_mechanized_operation_requires_trafficability_and_uses_rain_history(self):
        criteria = {
            "tipo_operacao": "Tráfego de máquinas",
            "max_chuva_24h_mm": 4,
            "condicao_trafegabilidade": "trafegavel",
            "relevo": "plano",
        }
        result = self.evaluate("MECANIZADA", criteria)
        self.assertEqual(result["windows"][0]["classificacao"], "FAVORAVEL")
        self.assertEqual(result["windows"][0]["inicio"].tzinfo.key, "America/Sao_Paulo")

        criteria["condicao_trafegabilidade"] = "nao_trafegavel"
        blocked = self.evaluate("MECANIZADA", criteria)
        self.assertEqual(blocked["windows"][0]["classificacao"], "DESFAVORAVEL")

    def test_invalid_criterion_ranges_are_rejected(self):
        with self.assertRaisesMessage(ValueError, "não pode exceder"):
            self.evaluate("PLANTIO", {
                "estagio": "plantio",
                "drenagem": "Boa",
                "temperatura_solo_min_c": 25,
                "temperatura_solo_max_c": 15,
                "chuva_min_24h_mm": 0,
            })

    def test_future_label_verification_date_is_rejected(self):
        tomorrow = self.now.astimezone(ZoneInfo("America/Sao_Paulo")).date() + timedelta(days=1)
        with self.assertRaisesMessage(ValueError, "não pode estar no futuro"):
            self.evaluate("FITOSSANITARIA", {
                "produto": "Produto teste",
                "metodo_aplicacao": "Pulverização terrestre",
                "rotulo_confirmado": True,
                "limites_rotulo_completos": True,
                "fonte_referencia": "Rótulo do produto teste",
                "data_verificacao": tomorrow.isoformat(),
                "intervalo_sem_chuva_h": 0,
                "limites_rotulo": {"vento_max_kmh": 10},
            })


class GoldWindowsApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="janelas@example.com", password="test-password")
        self.farm = Fazenda.objects.create(
            produtor=self.user,
            nome="Fazenda Janela",
            cep="37000000",
            estado="MG",
            cidade="Varginha",
            bairro="Zona Rural",
            area_hectares=10,
            quantidade_talhoes=1,
            culturas=["Café"],
        )
        self.plot = Talhao.objects.create(
            fazenda=self.farm,
            nome="Talhão A",
            cultura="Café",
            variedade="Catuaí",
            tipo_solo="Latossolo",
            latitude=Decimal("-20.900000"),
            longitude=Decimal("-46.100000"),
        )
        self.client.force_login(self.user)
        self.now = timezone.now()
        self.weather = weather_fixture(self.now)
        self.collection = ColetaMeteorologica.objects.create(
            fazenda=self.farm,
            talhao=self.plot,
            fonte="open-meteo",
            coletada_em=self.now,
            latitude=self.plot.latitude,
            longitude=self.plot.longitude,
            timezone="America/Sao_Paulo",
            dados_brutos={"provider_payload": self.weather},
        )
        self.criteria = {
            "produto": "Fertilizante teste",
            "metodo_aplicacao": "Superficial",
            "max_chuva_24h_mm": 5,
            "temperatura_max_c": 35,
        }

    def evaluate(self, weather=None, collection=None):
        return self.client.post(
            reverse("dashboard:gold_windows_api"),
            {
                "operation": "ADUBACAO",
                "plot_id": self.plot.id,
                "criteria": self.criteria,
            } | ({"refresh_weather": True} if weather else {}),
            content_type="application/json",
        )

    def schedule(self, recommendation):
        timezone_name = recommendation["dataQuality"]["fuso_horario"]
        plot_timezone = ZoneInfo(timezone_name)
        start = datetime.fromisoformat(recommendation["windowStart"]).astimezone(plot_timezone)
        end = datetime.fromisoformat(recommendation["windowEnd"]).astimezone(plot_timezone)
        return self.client.post(
            reverse("dashboard:calendar_events_api"),
            {
                "title": "Teste de janela · Talhão A",
                "description": recommendation["explanation"],
                "date": start.date().isoformat(),
                "start_time": start.strftime("%H:%M"),
                "end_time": "23:59" if end.date() != start.date() else end.strftime("%H:%M"),
                "all_day": False,
                "category": "ADUBACAO",
                "status": "PLANEJADA",
                "priority": "MEDIA",
                "plot_id": self.plot.id,
                "recommendation_id": recommendation["id"],
            },
            content_type="application/json",
        )

    def test_shared_forecast_endpoint_is_persisted_and_cached(self):
        self.collection.delete()
        payload = self.weather

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps(payload).encode("utf-8")

        with patch("dashboard.weather.urlopen", return_value=FakeResponse()) as open_url:
            first, _, refreshed = get_forecast_collection(self.plot)
            second, _, cached = get_forecast_collection(self.plot)
        self.assertTrue(refreshed)
        self.assertFalse(cached)
        self.assertEqual(first.id, second.id)
        self.assertEqual(open_url.call_count, 1)
        self.assertEqual(first.dados_horarios["timestamps"], payload["hourly"]["time"])

    def test_historical_reanalysis_is_persisted_and_cached_separately(self):
        historical_date = timezone.localdate() - timedelta(days=3)
        payload = {
            "latitude": float(self.plot.latitude),
            "longitude": float(self.plot.longitude),
            "timezone": "America/Sao_Paulo",
            "hourly": {"time": [f"{historical_date.isoformat()}T00:00"], "precipitation": [2.5]},
            "daily": {
                "time": [historical_date.isoformat()],
                "precipitation_sum": [2.5],
                "temperature_2m_min": [15],
                "temperature_2m_max": [24],
            },
        }

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps(payload).encode("utf-8")

        query = {
            "talhao_id": self.plot.id,
            "start": historical_date.isoformat(),
            "end": historical_date.isoformat(),
        }
        with patch("dashboard.weather.urlopen", return_value=FakeResponse()) as open_url:
            first = self.client.get(reverse("dashboard:weather_history_api"), query)
            second = self.client.get(reverse("dashboard:weather_history_api"), query)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["data_kind"], "reanálise meteorológica modelada; não equivale a observação local")
        self.assertEqual(first.json()["daily"]["precipitation_sum"], [2.5])
        self.assertEqual(open_url.call_count, 1)
        self.assertEqual(ColetaMeteorologica.objects.filter(fonte="open-meteo-archive").count(), 1)

    def test_recommendations_are_persisted_without_duplicate_or_legacy_deletion(self):
        response = self.evaluate()
        self.assertEqual(response.status_code, 201)
        first = response.json()["recommendations"]
        self.assertTrue(first)
        first_ids = {item["id"] for item in first}
        self.assertTrue(all(item["adequacyIndex"] is None for item in first))
        self.assertEqual(RecomendacaoJanela.objects.count(), len(first))

        repeated = self.evaluate()
        self.assertEqual(repeated.status_code, 201)
        self.assertEqual({item["id"] for item in repeated.json()["recommendations"]}, first_ids)
        self.assertEqual(RecomendacaoJanela.objects.count(), len(first))

    def test_fresh_integrated_recommendation_can_be_scheduled(self):
        evaluated = self.evaluate()
        recommendation = next(
            item for item in evaluated.json()["recommendations"]
            if item["classification"] == "FAVORAVEL"
        )
        scheduled = self.schedule(recommendation)
        self.assertEqual(scheduled.status_code, 201, scheduled.content)

    def test_stale_integrated_recommendation_cannot_be_scheduled(self):
        evaluated = self.evaluate()
        recommendation = next(
            item for item in evaluated.json()["recommendations"]
            if item["classification"] == "FAVORAVEL"
        )
        stored = RecomendacaoJanela.objects.get(pk=recommendation["id"])
        collection = stored.coleta
        collection.coletada_em = self.now - timedelta(minutes=5)
        collection.save(update_fields=["coletada_em"])
        ColetaMeteorologica.objects.create(
            fazenda=self.farm,
            talhao=self.plot,
            fonte="open-meteo",
            coletada_em=self.now,
            latitude=self.plot.latitude,
            longitude=self.plot.longitude,
            timezone="America/Sao_Paulo",
            dados_brutos={"provider_payload": self.weather},
        )
        scheduled = self.schedule(recommendation)
        self.assertEqual(scheduled.status_code, 400)
        self.assertIn("foi substituída", scheduled.json()["message"])

    def test_technical_parameters_are_saved_and_retrieved_with_source_and_date(self):
        verified_on = timezone.localdate()
        parameters = {
            "produto": "Defensivo teste",
            "metodo_aplicacao": "Pulverização terrestre",
            "rotulo_confirmado": True,
            "limites_rotulo_completos": True,
            "fonte_referencia": "Rótulo oficial consultado",
            "data_verificacao": verified_on.isoformat(),
            "intervalo_sem_chuva_h": 2,
            "limites_rotulo": {"vento_max_kmh": 12},
        }
        saved = self.client.post(
            reverse("dashboard:gold_window_parameters_api"),
            {
                "operation": "FITOSSANITARIA",
                "product": "Defensivo teste",
                "method": "Pulverização terrestre",
                "source": "Rótulo oficial consultado",
                "verified_on": verified_on.isoformat(),
                "parameters": parameters,
            },
            content_type="application/json",
        )
        self.assertEqual(saved.status_code, 201, saved.content)
        listed = self.client.get(reverse("dashboard:gold_window_parameters_api"), {
            "operation": "FITOSSANITARIA",
            "product": "Defensivo teste",
            "method": "Pulverização terrestre",
        })
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["parameters"][0]["source"], "Rótulo oficial consultado")
        self.assertEqual(listed.json()["parameters"][0]["verified_on"], verified_on.isoformat())
        self.assertEqual(ParametroTecnicoOperacao.objects.filter(fazenda=self.farm).count(), 1)

    def test_a_changed_forecast_persists_a_new_snapshot_and_notifies_members(self):
        initial = self.evaluate()
        self.assertEqual(initial.status_code, 201)
        self.weather["hourly"]["temperature_2m"] = [50.0] * len(self.weather["hourly"]["time"])
        refreshed_collection = ColetaMeteorologica.objects.create(
            fazenda=self.farm,
            talhao=self.plot,
            fonte="open-meteo",
            coletada_em=self.now + timedelta(minutes=1),
            latitude=self.plot.latitude,
            longitude=self.plot.longitude,
            timezone="America/Sao_Paulo",
            dados_brutos={"provider_payload": self.weather},
        )
        with patch(
            "dashboard.views.get_forecast_collection",
            return_value=(refreshed_collection, self.weather, True),
        ):
            changed = self.client.post(
                reverse("dashboard:gold_windows_api"),
                {
                    "operation": "ADUBACAO",
                    "plot_id": self.plot.id,
                    "criteria": self.criteria,
                },
                content_type="application/json",
            )
        self.assertEqual(changed.status_code, 201)
        self.assertGreater(RecomendacaoJanela.objects.count(), len(initial.json()["recommendations"]))
        self.assertTrue(self.farm.notificacoes.exists())
        listing = self.client.get(reverse("dashboard:gold_windows_api"))
        previous_id = initial.json()["recommendations"][0]["id"]
        previous = next(item for item in listing.json()["recommendations"] if item["id"] == previous_id)
        self.assertFalse(previous["weather_is_current"])

    def test_weather_provider_failure_keeps_old_records_and_creates_no_recommendation(self):
        initial = self.evaluate()
        recommendation_ids = {item["id"] for item in initial.json()["recommendations"]}
        self.collection.coletada_em = self.now - timedelta(minutes=61)
        self.collection.save(update_fields=["coletada_em"])
        with patch(
            "dashboard.views.get_forecast_collection",
            side_effect=WeatherProviderError("A previsão Open-Meteo está temporariamente indisponível."),
        ):
            response = self.client.post(
                reverse("dashboard:gold_windows_api"),
                {
                    "operation": "ADUBACAO",
                    "plot_id": self.plot.id,
                    "criteria": self.criteria,
                    "refresh_weather": True,
                },
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            set(RecomendacaoJanela.objects.values_list("id", flat=True)),
            recommendation_ids,
        )
        history = self.client.get(reverse("dashboard:gold_windows_api")).json()
        old_item = next(item for item in history["recommendations"] if item["id"] in recommendation_ids)
        self.assertFalse(old_item["weather_is_current"])

    def test_result_records_observed_conditions_against_forecast_hour(self):
        response = self.evaluate()
        recommendation = response.json()["recommendations"][0]
        performed_at = recommendation["windowStart"]
        performed_moment = datetime.fromisoformat(performed_at)
        with patch(
            "dashboard.views.timezone.now",
            return_value=performed_moment + timedelta(hours=1),
        ):
            result = self.client.post(
                reverse("dashboard:gold_window_result_api", args=[recommendation["id"]]),
                {
                    "status": "REALIZADA",
                    "performed_at": performed_at,
                    "observed_conditions": {
                        "temperature_2m": 23,
                        "precipitation": 1,
                        "wind_speed_10m": 7,
                    },
                    "reported_outcome": "Execução registrada pelo produtor.",
                },
                content_type="application/json",
            )
        self.assertEqual(result.status_code, 201)
        observed = result.json()["result"]["observed_conditions"]
        self.assertEqual(observed["forecast_comparison"]["temperature_2m"]["forecast"], 22)
        self.assertEqual(observed["forecast_comparison"]["temperature_2m"]["difference"], 1)

    def test_member_cannot_analyze_a_plot_from_another_farm(self):
        other_user = User.objects.create_user(username="outro@example.com", password="test-password")
        other_farm = Fazenda.objects.create(
            produtor=other_user,
            nome="Outra fazenda",
            cep="37000000",
            estado="MG",
            cidade="Varginha",
            bairro="Zona Rural",
            area_hectares=5,
            quantidade_talhoes=1,
            culturas=["Café"],
        )
        other_plot = Talhao.objects.create(fazenda=other_farm, nome="Outro talhão", cultura="Café")
        response = self.client.post(
            reverse("dashboard:gold_windows_api"),
            {"operation": "ADUBACAO", "plot_id": other_plot.id, "criteria": self.criteria},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
