from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone

from .models import ColetaMeteorologica, ExecucaoAplicacao, Fazenda, RecomendacaoJanela, Talhao
from .pesticides import (
    evaluate_meteorological_windows,
    evaluate_pesticide_windows,
    weather_selection_score,
)


SAO_PAULO = ZoneInfo("America/Sao_Paulo")


def sample_weather(now, *, count=6):
    timestamps = [(now + timedelta(hours=index)).isoformat() for index in range(count)]
    return {
        "source": "open-meteo",
        "fetched_at": now.isoformat(),
        "timezone": "America/Sao_Paulo",
        "hourly": {
            "timestamps": timestamps,
            "values": {
                "temperature_2m": [22.0] * count,
                "relative_humidity_2m": [65.0] * count,
                "precipitation_probability": [0.0] * count,
                "precipitation": [0.0] * count,
                "wind_speed_10m": [5.0] * count,
                "wind_gusts_10m": [8.0] * count,
            },
        },
    }


def sample_label(**overrides):
    label = {
        "product": "Produto de teste",
        "label_confirmed": True,
        "max_wind_speed": 10,
        "max_wind_gusts": 15,
        "min_temperature": 10,
        "max_temperature": 30,
        "min_relative_humidity": 40,
        "max_relative_humidity": 90,
        "rain_free_hours": 2,
    }
    return {**label, **overrides}


class PesticideDecisionTests(SimpleTestCase):
    def setUp(self):
        self.now = datetime(2025, 1, 15, 9, tzinfo=SAO_PAULO)
        self.weather = sample_weather(self.now)

    def test_recommends_only_hours_matching_label_limits(self):
        result = evaluate_pesticide_windows(self.weather, sample_label(), now=self.now)

        self.assertEqual(result["classification"], "favorable")
        self.assertTrue(result["next_opportunity"])
        self.assertEqual(result["next_opportunity"]["start"], self.now.isoformat())
        self.assertEqual(result["windows"][0]["classification"], "favorable")
        self.assertEqual(result["confidence"], "limited")

    def test_label_limits_are_mandatory_and_never_compensated(self):
        self.weather["hourly"]["values"]["wind_gusts_10m"][0] = 18

        result = evaluate_pesticide_windows(self.weather, sample_label(), now=self.now)

        self.assertEqual(result["windows"][0]["classification"], "unfavorable")
        self.assertIn("Rajadas acima do limite informado na bula.", result["windows"][0]["restrictions"])
        self.assertEqual(result["next_opportunity"]["start"], (self.now + timedelta(hours=1)).isoformat())

    def test_missing_bula_confirmation_returns_insufficient_data(self):
        result = evaluate_pesticide_windows(
            self.weather,
            sample_label(label_confirmed=False),
            now=self.now,
        )

        self.assertEqual(result["classification"], "insufficient")
        self.assertIsNone(result["next_opportunity"])
        self.assertTrue(any("Confirme" in message for message in result["missing"]))

    def test_missing_limits_are_not_replaced_with_universal_thresholds(self):
        label = sample_label(max_wind_speed=None, max_wind_gusts=None, min_temperature=None, max_temperature=None,
                             min_relative_humidity=None, max_relative_humidity=None)

        result = evaluate_pesticide_windows(self.weather, label, now=self.now)

        self.assertEqual(result["classification"], "attention")
        self.assertIn("Sem limite específico informado na bula", result["windows"][0]["risks"][0])

    def test_rain_during_required_rain_free_interval_is_unfavorable(self):
        self.weather["hourly"]["values"]["precipitation"][2] = 0.2

        result = evaluate_pesticide_windows(self.weather, sample_label(), now=self.now)

        self.assertEqual(result["windows"][0]["classification"], "unfavorable")
        self.assertIn("Precipitação prevista durante o período analisado.", result["windows"][0]["restrictions"])

    def test_rain_probability_without_predicted_amount_is_attention(self):
        self.weather["hourly"]["values"]["precipitation_probability"][1] = 35

        result = evaluate_pesticide_windows(self.weather, sample_label(), now=self.now)

        self.assertEqual(result["windows"][0]["classification"], "attention")
        self.assertTrue(result["windows"][0]["risks"])

    def test_missing_weather_variables_return_insufficient_not_zero(self):
        del self.weather["hourly"]["values"]["wind_gusts_10m"]

        result = evaluate_pesticide_windows(self.weather, sample_label(), now=self.now)

        self.assertEqual(result["classification"], "insufficient")
        self.assertIn("Rajadas de vento", result["missing"])

    def test_stale_forecast_is_not_used_as_a_recommendation(self):
        self.weather["fetched_at"] = (self.now - timedelta(hours=13)).isoformat()

        result = evaluate_pesticide_windows(self.weather, sample_label(), now=self.now)

        self.assertEqual(result["classification"], "insufficient")
        self.assertIn("previsão atualizada", result["missing"])

    def test_hours_keep_the_talhao_timezone_and_alternative_is_future(self):
        self.weather["hourly"]["values"]["wind_speed_10m"][0] = 15

        result = evaluate_pesticide_windows(self.weather, sample_label(), now=self.now)

        self.assertEqual(result["windows"][0]["start"], "2025-01-15T09:00:00-03:00")
        self.assertEqual(result["next_opportunity"]["start"], "2025-01-15T10:00:00-03:00")
        self.assertEqual(result["days"][0]["date"], "2025-01-15")

    def test_invalid_label_range_returns_insufficient(self):
        result = evaluate_pesticide_windows(
            self.weather,
            sample_label(min_temperature=35, max_temperature=20),
            now=self.now,
        )

        self.assertEqual(result["classification"], "insufficient")
        self.assertIn("A temperatura mínima da bula não pode exceder a máxima.", result["missing"])

    def test_weather_selection_prefers_complete_fresh_forecast_over_newer_incomplete_one(self):
        now = datetime(2025, 1, 15, 9, tzinfo=SAO_PAULO)
        complete = sample_weather(now - timedelta(hours=2))
        incomplete = sample_weather(now - timedelta(minutes=5))
        del incomplete["hourly"]["values"]["wind_gusts_10m"]

        self.assertGreater(
            weather_selection_score(complete, now=now),
            weather_selection_score(incomplete, now=now),
        )

    def test_stale_weather_is_never_ranked_as_fresh(self):
        stale = sample_weather(self.now - timedelta(hours=13))

        self.assertEqual(weather_selection_score(stale, now=self.now)[0], 0)


class MeteorologicalWindowTests(SimpleTestCase):
    def setUp(self):
        self.now = datetime(2025, 1, 15, 9, tzinfo=SAO_PAULO)
        self.weather = sample_weather(self.now, count=8)

    def test_groups_consecutive_hourly_conditions_and_requires_two_hours(self):
        result = evaluate_meteorological_windows(self.weather, now=self.now)

        self.assertEqual(result["windows"][0]["classification"], "favorable")
        self.assertEqual(result["windows"][0]["duration_hours"], 6)
        self.assertEqual(result["windows"][0]["start"], self.now.isoformat())
        self.assertEqual(result["minimum_window_hours"], 2)
        self.assertTrue(result["recommendation_notice"])

    def test_short_favorable_period_is_caution_not_a_recommendation(self):
        values = self.weather["hourly"]["values"]
        values["wind_speed_10m"][1] = 16
        result = evaluate_meteorological_windows(self.weather, now=self.now)

        self.assertEqual(result["windows"][0]["classification"], "attention")
        self.assertIn("duração mínima", result["windows"][0]["alerts"][0])
        self.assertEqual(result["next_opportunity"]["start"], (self.now + timedelta(hours=2)).isoformat())

    def test_evaluates_rain_after_each_application_hour(self):
        self.weather["hourly"]["values"]["precipitation_probability"][2] = 70
        result = evaluate_meteorological_windows(self.weather, now=self.now)

        self.assertEqual(result["hours"][0]["classification"], "unfavorable")
        self.assertIn("chuva", result["hours"][0]["alerts"][0])

    def test_weather_extremes_raise_caution_without_product_specific_limits(self):
        self.weather["hourly"]["values"]["temperature_2m"][0] = 34
        result = evaluate_meteorological_windows(self.weather, now=self.now)

        self.assertEqual(result["hours"][0]["classification"], "attention")
        self.assertIn("Temperatura", result["hours"][0]["alerts"][0])

    def test_missing_hourly_forecast_is_insufficient_not_favorable(self):
        del self.weather["hourly"]
        result = evaluate_meteorological_windows(self.weather, now=self.now)

        self.assertEqual(result["classification"], "insufficient")
        self.assertIn("previsão horária", result["missing"])
        self.assertEqual(result["windows"], [])

    def test_missing_required_hourly_values_are_insufficient(self):
        del self.weather["hourly"]["values"]["wind_gusts_10m"]
        result = evaluate_meteorological_windows(self.weather, now=self.now)

        self.assertEqual(result["hours"][0]["classification"], "insufficient")
        self.assertIn("Rajadas de vento", result["missing"])

    def test_stale_forecast_is_insufficient(self):
        self.weather["fetched_at"] = (self.now - timedelta(hours=13)).isoformat()
        result = evaluate_meteorological_windows(self.weather, now=self.now)

        self.assertEqual(result["classification"], "insufficient")
        self.assertIn("previsão atualizada", result["missing"])


class PesticideCalendarApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="pesticide-owner")
        self.farm = Fazenda.objects.create(
            produtor=self.owner,
            nome="Fazenda Teste",
            cep="37000000",
            estado="MG",
            cidade="Varginha",
            bairro="Zona Rural",
            area_hectares=10,
            quantidade_talhoes=1,
            culturas=["Café"],
        )
        self.talhao = Talhao.objects.create(
            fazenda=self.farm,
            nome="Talhão 1",
            cultura="Café",
            latitude=-20.89,
            longitude=-46.08,
        )
        self.client.force_login(self.owner)

    def test_calendar_page_is_protected_and_accessible_to_farm_owner(self):
        response = self.client.get(reverse("dashboard:pesticide_window"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Janela Fitossanitária")
        self.assertContains(response, "Janela de Ouro")
        self.assertContains(response, 'id="calendarTalhaoSelect"')
        self.assertContains(response, 'id="pesticideTimeline"')
        self.assertNotContains(response, 'id="pesticideLabelForm"')
        self.assertNotContains(response, 'name="max_wind_speed"')

    def test_api_returns_insufficient_when_no_saved_weather_exists(self):
        ExecucaoAplicacao.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            produto="Fungicida",
            tipo_insumo="Defensivo",
            data_aplicacao=datetime(2025, 1, 15).date(),
        )
        ExecucaoAplicacao.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            produto="Adubo",
            tipo_insumo="Fertilizante",
            data_aplicacao=datetime(2025, 1, 15).date(),
        )

        response = self.client.post(
            reverse("dashboard:pesticide_recommendations_api"),
            {"talhao_id": self.talhao.id, "product_label": sample_label()},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["classification"], "insufficient")
        self.assertEqual(response.json()["talhao_id"], self.talhao.id)
        self.assertFalse(response.json()["weather_complete"])
        self.assertEqual(
            [item["product"] for item in response.json()["operations"]["applications"]],
            ["Fungicida"],
        )

    def test_automatic_api_returns_insufficient_when_hourly_forecast_is_missing(self):
        now = timezone.now()
        ColetaMeteorologica.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            coletada_em=now,
            latitude=self.talhao.latitude,
            longitude=self.talhao.longitude,
            timezone="America/Sao_Paulo",
            dados_horarios={},
        )
        response = self.client.get(
            reverse("dashboard:pesticide_recommendations_api"),
            {"talhao_id": self.talhao.id},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["classification"], "insufficient")
        self.assertIn("previsão horária", response.json()["missing"])

    def test_automatic_api_uses_selected_talhao_coordinates_and_timezone(self):
        now = timezone.now()
        second_talhao = Talhao.objects.create(
            fazenda=self.farm,
            nome="Talhão 2",
            latitude=-21.2,
            longitude=-46.5,
        )
        for talhao, timezone_name in (
            (self.talhao, "America/Sao_Paulo"),
            (second_talhao, "America/Cuiaba"),
        ):
            weather = sample_weather(now.astimezone(ZoneInfo(timezone_name)), count=8)
            ColetaMeteorologica.objects.create(
                fazenda=self.farm,
                talhao=talhao,
                coletada_em=now,
                latitude=talhao.latitude,
                longitude=talhao.longitude,
                timezone=timezone_name,
                dados_atuais={"temperature_2m": 25},
                dados_horarios=weather["hourly"],
                dados_diarios={
                    "timestamps": ["2025-01-15"],
                    "values": {"precipitation_sum": [1.2]},
                },
            )

        response = self.client.get(
            reverse("dashboard:pesticide_recommendations_api"),
            {"talhao_id": second_talhao.id},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["talhao_id"], second_talhao.id)
        self.assertEqual(response.json()["weather"]["location"]["latitude"], -21.2)
        self.assertEqual(response.json()["timezone"], "America/Cuiaba")
        self.assertEqual(response.json()["weather"]["daily"]["values"]["precipitation_sum"], [1.2])

    def test_automatic_api_rejects_talhoes_outside_the_active_farm(self):
        response = self.client.get(
            reverse("dashboard:pesticide_recommendations_api"),
            {"talhao_id": 999999},
        )

        self.assertEqual(response.status_code, 404)

    def test_automatic_api_requires_authentication(self):
        self.client.logout()

        response = self.client.get(
            reverse("dashboard:pesticide_recommendations_api"),
            {"talhao_id": self.talhao.id},
        )

        self.assertEqual(response.status_code, 401)

    def test_api_marks_missing_plot_coordinates_as_not_refreshable(self):
        self.talhao.latitude = None
        self.talhao.longitude = None
        self.talhao.save(update_fields=["latitude", "longitude"])

        response = self.client.post(
            reverse("dashboard:pesticide_recommendations_api"),
            {"talhao_id": self.talhao.id, "product_label": sample_label()},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["weather_refreshable"])

    def test_api_evaluates_latest_weather_for_authorized_talhao(self):
        now = timezone.now()
        weather = sample_weather(now.astimezone(SAO_PAULO))
        ColetaMeteorologica.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            coletada_em=now,
            latitude=self.talhao.latitude,
            longitude=self.talhao.longitude,
            timezone="America/Sao_Paulo",
            dados_horarios=weather["hourly"],
        )

        response = self.client.post(
            reverse("dashboard:pesticide_recommendations_api"),
            {"talhao_id": self.talhao.id, "product_label": sample_label()},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["classification"], "favorable")
        self.assertEqual(response.json()["source"], "open-meteo")
        self.assertTrue(response.json()["weather_complete"])

    def test_api_selects_complete_forecast_for_current_plot_coordinates(self):
        now = timezone.now()
        complete_weather = sample_weather((now - timedelta(hours=2)).astimezone(SAO_PAULO))
        complete = ColetaMeteorologica.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            fonte="complete-forecast",
            coletada_em=now - timedelta(hours=2),
            latitude=self.talhao.latitude,
            longitude=self.talhao.longitude,
            timezone="America/Sao_Paulo",
            dados_horarios=complete_weather["hourly"],
        )
        incomplete_weather = sample_weather((now - timedelta(minutes=5)).astimezone(SAO_PAULO))
        del incomplete_weather["hourly"]["values"]["wind_gusts_10m"]
        ColetaMeteorologica.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            fonte="newer-incomplete-forecast",
            coletada_em=now - timedelta(minutes=5),
            latitude=self.talhao.latitude,
            longitude=self.talhao.longitude,
            timezone="America/Sao_Paulo",
            dados_horarios=incomplete_weather["hourly"],
        )
        ColetaMeteorologica.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            fonte="different-coordinates",
            coletada_em=now,
            latitude=self.talhao.latitude + 1,
            longitude=self.talhao.longitude,
            timezone="America/Sao_Paulo",
            dados_horarios=complete_weather["hourly"],
        )

        response = self.client.post(
            reverse("dashboard:pesticide_recommendations_api"),
            {"talhao_id": self.talhao.id, "product_label": sample_label()},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["weather_collection_id"], complete.id)
        self.assertEqual(response.json()["source"], "complete-forecast")
        self.assertTrue(response.json()["weather_complete"])
        self.assertEqual(response.json()["classification"], "favorable")

    def test_api_does_not_expose_other_farms_talhoes(self):
        other_user = User.objects.create_user(username="other-owner")
        other_farm = Fazenda.objects.create(
            produtor=other_user,
            nome="Outra Fazenda",
            cep="37000000",
            estado="MG",
            cidade="Varginha",
            bairro="Zona Rural",
            area_hectares=10,
            quantidade_talhoes=1,
            culturas=["Café"],
        )
        other_talhao = Talhao.objects.create(
            fazenda=other_farm,
            nome="Talhão privado",
            latitude=-20.89,
            longitude=-46.08,
        )

        response = self.client.post(
            reverse("dashboard:pesticide_recommendations_api"),
            {"talhao_id": other_talhao.id, "product_label": sample_label()},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 404)

    def test_api_requires_authentication(self):
        self.client.logout()

        response = self.client.post(
            reverse("dashboard:pesticide_recommendations_api"),
            {"talhao_id": self.talhao.id, "product_label": sample_label()},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)

    def test_refreshing_fertilizer_recommendations_preserves_other_operation_data(self):
        collection = ColetaMeteorologica.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            coletada_em=timezone.now(),
            latitude=self.talhao.latitude,
            longitude=self.talhao.longitude,
            timezone="America/Sao_Paulo",
            dados_horarios={},
        )
        pesticide_recommendation = RecomendacaoJanela.objects.create(
            fazenda=self.farm,
            talhao=self.talhao,
            coleta=collection,
            tipo_operacao=RecomendacaoJanela.Operacao.FITOSSANITARIA,
            data=datetime(2025, 1, 15).date(),
            inicio=datetime(2025, 1, 15, 9, tzinfo=SAO_PAULO),
            fim=datetime(2025, 1, 15, 10, tzinfo=SAO_PAULO),
            adequacao=70,
            classificacao="attention",
            confianca=0.7,
            decisao="REVIEW",
        )

        response = self.client.post(
            reverse("dashboard:recommendations_ingest_api"),
            {
                "talhao_id": self.talhao.id,
                "recommendations": [{
                    "date": "2025-01-15",
                    "windowStart": "2025-01-15T09:00:00-03:00",
                    "windowEnd": "2025-01-15T10:00:00-03:00",
                    "adequacyIndex": 80,
                    "classification": "favorable",
                    "confidence": 0.8,
                    "decision": "APPLY",
                }],
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        pesticide_recommendation.refresh_from_db()
        self.assertEqual(pesticide_recommendation.tipo_operacao, RecomendacaoJanela.Operacao.FITOSSANITARIA)
        fertilizer = RecomendacaoJanela.objects.get(tipo_operacao=RecomendacaoJanela.Operacao.ADUBACAO)
        self.assertEqual(fertilizer.adequacao, 80)

        state = self.client.get(reverse("dashboard:system_state_api")).json()
        self.assertEqual(
            [item["id"] for item in state["talhoes"][0]["recommendations"]],
            [fertilizer.id],
        )
