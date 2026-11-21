from django.test import TestCase

# Create your tests here.
import json
import os
from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from django.urls import reverse

from dashboard.models import (
    ColetaMeteorologica, EventoCalendario, ExecucaoAplicacao, Fazenda,
    MovimentacaoEstoque, Produto, RecomendacaoJanela, Talhao,
)
from .models import AssistenteUso, EquipamentoAgricola, LancamentoFinanceiro, ServicoFazenda


class GestaoWorkflowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='owner@example.com', password='Senha12345')
        self.farm = Fazenda.objects.create(
            produtor=self.user,
            nome='Fazenda Teste',
            cep='37000000',
            estado='MG',
            cidade='Varginha',
            bairro='Zona Rural',
            area_hectares=10,
            quantidade_talhoes=1,
            culturas=['Café'],
            tipo_cultivo='Convencional',
            irrigacao='Gotejamento',
        )
        self.seed_product = Produto.objects.create(
            fazenda=self.farm,
            nome='Semente de milho',
            categoria='Sementes',
            unidade='kg',
            quantidade_atual=Decimal('320'),
            estoque_minimo=Decimal('100'),
        )
        self.client.force_login(self.user)

    def post_json(self, url_name, payload):
        return self.client.post(
            reverse(url_name),
            data=json.dumps(payload),
            content_type='application/json',
        )

    def test_financial_entry_persists_and_is_farm_scoped(self):
        response = self.post_json('gestao:financeiro_api', {
            'tipo': 'DESPESA',
            'titulo': 'Diesel',
            'categoria': 'Combustível',
            'valor': '350.00',
            'data': '2026-11-21',
        })

        self.assertEqual(response.status_code, 201)
        entry = LancamentoFinanceiro.objects.get()
        self.assertEqual(entry.fazenda, self.farm)
        self.assertEqual(entry.valor, Decimal('350.00'))

        listing = self.client.get(reverse('gestao:financeiro_api'))
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()['lancamentos'][0]['titulo'], 'Diesel')

    def test_ai_financial_write_requires_confirmation(self):
        proposal = self.post_json('gestao:assistente_api', {
            'message': 'Tive uma despesa de R$ 350 com diesel',
        })

        self.assertEqual(proposal.status_code, 200)
        self.assertTrue(proposal.json()['confirmation_required'])
        self.assertEqual(LancamentoFinanceiro.objects.count(), 0)

        confirmed = self.post_json('gestao:assistente_api', {'action': 'confirm'})
        self.assertEqual(confirmed.status_code, 200)
        self.assertTrue(confirmed.json()['saved'])
        self.assertEqual(LancamentoFinanceiro.objects.get().valor, Decimal('350'))

    def test_ai_stock_zero_uses_stock_ledger_and_confirmation(self):
        proposal = self.post_json('gestao:assistente_api', {
            'message': 'Zere todas as sementes do meu estoque',
        })

        self.assertEqual(proposal.status_code, 200)
        self.assertTrue(proposal.json()['confirmation_required'])
        self.seed_product.refresh_from_db()
        self.assertEqual(self.seed_product.quantidade_atual, Decimal('320'))

        confirmed = self.post_json('gestao:assistente_api', {'action': 'confirm'})
        self.assertEqual(confirmed.status_code, 200)
        self.seed_product.refresh_from_db()
        self.assertEqual(self.seed_product.quantidade_atual, Decimal('0'))
        movement = MovimentacaoEstoque.objects.get()
        self.assertEqual(movement.produto, self.seed_product)
        self.assertEqual(movement.tipo, MovimentacaoEstoque.Tipo.SAIDA)
        self.assertEqual(movement.quantidade, Decimal('320'))

    def test_ai_stock_entry_requires_confirmation_and_updates_inventory_ledger(self):
        fertilizer = Produto.objects.create(
            fazenda=self.farm,
            nome='Fertilizante NPK 20-05-20',
            categoria='Fertilizantes',
            unidade='kg',
            quantidade_atual=Decimal('100'),
        )
        proposal = self.post_json('gestao:assistente_api', {
            'message': 'Adicione 500 Kg de Fertilizante NPK 20-05-20 no estoque',
        })

        self.assertEqual(proposal.status_code, 200)
        self.assertTrue(proposal.json()['confirmation_required'])
        fertilizer.refresh_from_db()
        self.assertEqual(fertilizer.quantidade_atual, Decimal('100'))
        self.assertEqual(MovimentacaoEstoque.objects.count(), 0)

        confirmed = self.post_json('gestao:assistente_api', {'action': 'confirm'})

        self.assertEqual(confirmed.status_code, 200)
        self.assertTrue(confirmed.json()['saved'])
        fertilizer.refresh_from_db()
        self.assertEqual(fertilizer.quantidade_atual, Decimal('600'))
        movement = MovimentacaoEstoque.objects.get()
        self.assertEqual(movement.produto, fertilizer)
        self.assertEqual(movement.tipo, MovimentacaoEstoque.Tipo.ENTRADA)
        self.assertEqual(movement.quantidade, Decimal('500'))

    def test_ai_stock_entry_asks_for_a_registered_product_name(self):
        response = self.post_json('gestao:assistente_api', {
            'message': 'Adicione 500 Kg de trabalho no estoque',
        })

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json().get('confirmation_required', False))
        self.assertIn(
            'informe o nome exatamente como está cadastrado',
            response.json()['reply'].casefold(),
        )
        self.assertNotIn('acesse o módulo', response.json()['reply'].lower())
        self.assertEqual(MovimentacaoEstoque.objects.count(), 0)

    def test_ai_coffee_variety_and_area_queries_use_active_farm_records(self):
        Talhao.objects.create(
            fazenda=self.farm, nome='Talhão 01', cultura='Café',
            variedade='Mundo Novo', area_hectares=Decimal('4.5'),
        )
        Talhao.objects.create(
            fazenda=self.farm, nome='Talhão 02', cultura='Café',
            variedade='Catuaí', area_hectares=Decimal('2.5'),
        )
        other_farm = Fazenda.objects.create(
            produtor=self.user, nome='Outra Fazenda', cep='37000001',
            estado='MG', cidade='Varginha', bairro='Zona Rural',
            area_hectares=5, quantidade_talhoes=1, culturas=['Café'],
            tipo_cultivo='Convencional', irrigacao='Gotejamento',
        )
        session = self.client.session
        session['current_farm_id'] = self.farm.id
        session.save()
        Talhao.objects.create(
            fazenda=other_farm, nome='Talhão alheio', cultura='Café',
            variedade='Bourbon', area_hectares=Decimal('50'),
        )

        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            varieties = self.post_json('gestao:assistente_api', {
                'message': 'Quais variedades de café estão cadastradas?',
            })
            area = self.post_json('gestao:assistente_api', {
                'message': 'Qual é a área plantada nos talhões?',
            })

        self.assertEqual(varieties.status_code, 200)
        self.assertIn('Mundo Novo', varieties.json()['reply'])
        self.assertIn('Catuaí', varieties.json()['reply'])
        self.assertNotIn('Bourbon', varieties.json()['reply'])
        self.assertEqual(area.status_code, 200)
        self.assertIn('7 ha', area.json()['reply'])
        openrouter.assert_not_called()

    def test_ai_coffee_yield_query_does_not_invent_production_values(self):
        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            response = self.post_json('gestao:assistente_api', {
                'message': 'Qual foi a produtividade em sacas?',
            })

        self.assertEqual(response.status_code, 200)
        self.assertIn('não há registros estruturados de produção', response.json()['reply'].casefold())
        openrouter.assert_not_called()

    def test_ai_coffee_calendar_query_lists_upcoming_flowering(self):
        flowering = EventoCalendario.objects.create(
            fazenda=self.farm,
            titulo='Florada do Talhão 01',
            data=timezone.localdate() + timedelta(days=4),
            categoria=EventoCalendario.Categoria.FLORADA,
            status=EventoCalendario.Status.PLANEJADA,
        )
        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            response = self.post_json('gestao:assistente_api', {
                'message': 'Quando será a florada?',
            })

        self.assertEqual(response.status_code, 200)
        self.assertIn(flowering.titulo, response.json()['reply'])
        openrouter.assert_not_called()

    def test_ai_application_history_is_filtered_by_plot_and_farm(self):
        talhao = Talhao.objects.create(
            fazenda=self.farm, nome='Talhão 01', cultura='Café',
        )
        ExecucaoAplicacao.objects.create(
            fazenda=self.farm,
            talhao=talhao,
            produto='Fertilizante foliar',
            tipo_insumo='Fertilizante',
            data_aplicacao=timezone.localdate() - timedelta(days=2),
            status=ExecucaoAplicacao.Status.REALIZADA,
        )
        other_farm = Fazenda.objects.create(
            produtor=self.user, nome='Outra Fazenda', cep='37000001',
            estado='MG', cidade='Varginha', bairro='Zona Rural',
            area_hectares=5, quantidade_talhoes=1, culturas=['Café'],
            tipo_cultivo='Convencional', irrigacao='Gotejamento',
        )
        ExecucaoAplicacao.objects.create(
            fazenda=other_farm,
            produto='Aplicação privada',
            data_aplicacao=timezone.localdate(),
        )

        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            response = self.post_json('gestao:assistente_api', {
                'message': 'Qual o histórico de aplicações no Talhão 01?',
            })

        self.assertEqual(response.status_code, 200)
        self.assertIn('Fertilizante foliar', response.json()['reply'])
        self.assertNotIn('Aplicação privada', response.json()['reply'])
        openrouter.assert_not_called()

    def test_ai_adubation_query_uses_the_latest_gold_window_recommendation(self):
        talhao = Talhao.objects.create(
            fazenda=self.farm, nome='Talhão 01', cultura='Café',
        )
        today = timezone.localdate()
        now = timezone.now()
        old_collection = ColetaMeteorologica.objects.create(
            fazenda=self.farm, talhao=talhao,
            coletada_em=now - timedelta(hours=2),
            latitude=Decimal('-20.89'), longitude=Decimal('-46.08'),
        )
        latest_collection = ColetaMeteorologica.objects.create(
            fazenda=self.farm, talhao=talhao,
            coletada_em=now,
            latitude=Decimal('-20.89'), longitude=Decimal('-46.08'),
        )
        old_date = today + timedelta(days=1)
        best_date = today + timedelta(days=2)
        for collection, recommendation_date, score in (
            (old_collection, old_date, 99),
            (latest_collection, best_date, 82),
        ):
            start = timezone.make_aware(datetime.combine(recommendation_date, time(7)))
            RecomendacaoJanela.objects.create(
                fazenda=self.farm,
                talhao=talhao,
                coleta=collection,
                data=recommendation_date,
                inicio=start,
                fim=start.replace(hour=10),
                adequacao=score,
                classificacao='favorable',
                confianca=Decimal('0.9'),
                decisao='APPLY',
            )

        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            response = self.post_json('gestao:assistente_api', {
                'message': 'Qual é o melhor dia dessa semana para fazer a adubação?',
            })

        self.assertEqual(response.status_code, 200)
        self.assertIn(best_date.strftime('%d/%m/%Y'), response.json()['reply'])
        self.assertIn('07:00 às 10:00', response.json()['reply'])
        self.assertIn('Talhão 01', response.json()['reply'])
        self.assertIn('IEA 82%', response.json()['reply'])
        self.assertNotIn(old_date.strftime('%d/%m/%Y'), response.json()['reply'])
        openrouter.assert_not_called()

    def test_ai_adubation_query_reports_when_gold_window_has_no_recommendation(self):
        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            response = self.post_json('gestao:assistente_api', {
                'message': 'Qual o melhor dia da semana para adubar?',
            })

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            'não há recomendação favorável da janela de adubação',
            response.json()['reply'].casefold(),
        )
        openrouter.assert_not_called()

    def test_ai_inventory_questions_distinguish_balances_from_low_stock(self):
        low_product = Produto.objects.create(
            fazenda=self.farm,
            nome='Adubo orgânico',
            categoria='Fertilizantes',
            unidade='kg',
            quantidade_atual=Decimal('5'),
            estoque_minimo=Decimal('20'),
        )

        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            inventory = self.post_json('gestao:assistente_api', {
                'message': 'Me diga como está meu estoque',
            })
            low_stock = self.post_json('gestao:assistente_api', {
                'message': 'Quais produtos estão abaixo do mínimo?',
            })

        self.assertEqual(inventory.status_code, 200)
        self.assertIn('Semente de milho: 320 kg', inventory.json()['reply'])
        self.assertIn('Adubo orgânico: 5 kg', inventory.json()['reply'])
        self.assertEqual(low_stock.status_code, 200)
        self.assertIn(low_product.nome, low_stock.json()['reply'])
        self.assertNotIn(self.seed_product.nome, low_stock.json()['reply'])
        openrouter.assert_not_called()

    def test_ai_service_and_equipment_queries_use_farm_records(self):
        ServicoFazenda.objects.create(
            fazenda=self.farm, nome='Colheita', tipo=ServicoFazenda.Tipo.CONTRATADO,
            data=timezone.localdate(), status=ServicoFazenda.Status.PENDENTE,
        )
        ServicoFazenda.objects.create(
            fazenda=self.farm, nome='Transporte', tipo=ServicoFazenda.Tipo.PRESTADO,
            data=timezone.localdate(), status=ServicoFazenda.Status.CONCLUIDO,
        )
        EquipamentoAgricola.objects.create(
            fazenda=self.farm, nome='Trator', tipo='Trator',
            status=EquipamentoAgricola.Status.MANUTENCAO,
        )
        EquipamentoAgricola.objects.create(
            fazenda=self.farm, nome='Pulverizador', tipo='Implemento',
            status=EquipamentoAgricola.Status.OPERACIONAL,
        )

        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            pending = self.post_json('gestao:assistente_api', {
                'message': 'Quais serviços estão pendentes?',
            })
            maintenance = self.post_json('gestao:assistente_api', {
                'message': 'Quais equipamentos estão em manutenção?',
            })

        self.assertEqual(pending.status_code, 200)
        self.assertIn('Colheita', pending.json()['reply'])
        self.assertIn('Pendente', pending.json()['reply'])
        self.assertEqual(maintenance.status_code, 200)
        self.assertIn('Trator', maintenance.json()['reply'])
        self.assertIn('manutenção', maintenance.json()['reply'].casefold())
        openrouter.assert_not_called()

    def test_ai_monthly_expense_query_uses_local_records_only(self):
        today = timezone.localdate()
        LancamentoFinanceiro.objects.create(
            fazenda=self.farm, tipo=LancamentoFinanceiro.Tipo.DESPESA,
            titulo='Diesel', categoria='Combustível', valor=Decimal('100'),
            data=today,
        )
        LancamentoFinanceiro.objects.create(
            fazenda=self.farm, tipo=LancamentoFinanceiro.Tipo.COMPRA,
            titulo='Sementes', categoria='Insumos', valor=Decimal('30'),
            data=today,
        )
        LancamentoFinanceiro.objects.create(
            fazenda=self.farm, tipo=LancamentoFinanceiro.Tipo.DESPESA,
            titulo='Despesa do mês passado', categoria='Outros', valor=Decimal('999'),
            data=today.replace(day=1) - timedelta(days=1),
        )
        LancamentoFinanceiro.objects.create(
            fazenda=self.farm, tipo=LancamentoFinanceiro.Tipo.DESPESA,
            titulo='Lançamento futuro', categoria='Outros', valor=Decimal('999'),
            data=today + timedelta(days=2),
        )

        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            response = self.post_json('gestao:assistente_api', {
                'message': 'Me diga quanto gastei este mês',
            })
            no_period = self.post_json('gestao:assistente_api', {
                'message': 'Quanto gastei?',
            })

        self.assertEqual(response.status_code, 200)
        self.assertIn('R$ 130,00', response.json()['reply'])
        self.assertNotIn('999', response.json()['reply'])
        self.assertIn('R$ 130,00', no_period.json()['reply'])
        self.assertNotIn('999', no_period.json()['reply'])
        openrouter.assert_not_called()

    def test_ai_finance_category_queries_and_followups_use_the_previous_period(self):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        LancamentoFinanceiro.objects.create(
            fazenda=self.farm, tipo=LancamentoFinanceiro.Tipo.COMPRA,
            titulo='Adubo para lavoura', categoria='Fertilizantes',
            valor=Decimal('350'), data=today,
        )
        LancamentoFinanceiro.objects.create(
            fazenda=self.farm, tipo=LancamentoFinanceiro.Tipo.DESPESA,
            titulo='Defensivos', categoria='Defensivos',
            valor=Decimal('125'), data=today,
        )
        LancamentoFinanceiro.objects.create(
            fazenda=self.farm, tipo=LancamentoFinanceiro.Tipo.COMPRA,
            titulo='Adubo antigo', categoria='Fertilizantes',
            valor=Decimal('800'), data=month_start - timedelta(days=1),
        )

        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            fertilizer = self.post_json('gestao:assistente_api', {
                'message': 'Quanto gastei com fertilizantes este mês?',
            })
            fertilizer_without_period = self.post_json('gestao:assistente_api', {
                'message': 'Quanto gastei com fertilizantes?',
            })
            defensives = self.post_json('gestao:assistente_api', {
                'message': 'E com defensivos?',
            })
            comparison = self.post_json('gestao:assistente_api', {
                'message': 'Qual foi o maior gasto?',
            })

        self.assertIn('R$ 350,00', fertilizer.json()['reply'])
        self.assertIn('R$ 350,00', fertilizer_without_period.json()['reply'])
        self.assertNotIn('R$ 1.150,00', fertilizer_without_period.json()['reply'])
        self.assertIn('R$ 125,00', defensives.json()['reply'])
        self.assertIn('fertilizantes', comparison.json()['reply'])
        self.assertIn('R$ 350,00', comparison.json()['reply'])
        openrouter.assert_not_called()

    def test_ai_local_query_cache_is_farm_scoped_and_invalidated_on_plot_changes(self):
        first = self.post_json('gestao:assistente_api', {
            'message': 'Quais talhões estão cadastrados?',
        })
        self.assertIn('Não encontrei talhões ativos', first.json()['reply'])

        with self.captureOnCommitCallbacks(execute=True):
            Talhao.objects.create(
                fazenda=self.farm, nome='Talhão Novo', cultura='Café',
                variedade='Mundo Novo',
            )
        refreshed = self.post_json('gestao:assistente_api', {
            'message': 'Quais talhões estão cadastrados?',
        })
        cached = self.post_json('gestao:assistente_api', {
            'message': 'Quais talhões estão cadastrados?',
        })

        self.assertIn('Talhão Novo', refreshed.json()['reply'])
        self.assertEqual(refreshed.json()['reply'], cached.json()['reply'])
        self.assertEqual(
            AssistenteUso.objects.filter(resolucao=AssistenteUso.Resolucao.LOCAL).count(),
            2,
        )
        self.assertEqual(
            AssistenteUso.objects.filter(resolucao=AssistenteUso.Resolucao.CACHE).count(),
            1,
        )

    def test_ai_does_not_cache_stock_balances(self):
        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            first = self.post_json('gestao:assistente_api', {
                'message': 'Me diga como está meu estoque',
            })
            self.seed_product.quantidade_atual = Decimal('280')
            self.seed_product.save(update_fields=['quantidade_atual'])
            second = self.post_json('gestao:assistente_api', {
                'message': 'Me diga como está meu estoque',
            })

        self.assertIn('320 kg', first.json()['reply'])
        self.assertIn('280 kg', second.json()['reply'])
        self.assertEqual(
            AssistenteUso.objects.filter(resolucao=AssistenteUso.Resolucao.CACHE).count(),
            0,
        )
        openrouter.assert_not_called()

    def test_ai_complex_question_sends_only_relevant_farm_data_to_openrouter(self):
        Talhao.objects.create(
            fazenda=self.farm, nome='Talhão 01', cultura='Café',
            area_hectares=Decimal('5'),
        )
        LancamentoFinanceiro.objects.create(
            fazenda=self.farm, tipo=LancamentoFinanceiro.Tipo.DESPESA,
            titulo='Fertilizante aplicado', categoria='Fertilizantes',
            valor=Decimal('240'), data=timezone.localdate(),
        )
        other_farm = Fazenda.objects.create(
            produtor=self.user, nome='Fazenda Não Selecionada', cep='37000001',
            estado='MG', cidade='Varginha', bairro='Zona Rural',
            area_hectares=5, quantidade_talhoes=1, culturas=['Café'],
            tipo_cultivo='Convencional', irrigacao='Gotejamento',
        )
        LancamentoFinanceiro.objects.create(
            fazenda=other_farm, tipo=LancamentoFinanceiro.Tipo.DESPESA,
            titulo='Fertilizante particular', categoria='Fertilizantes',
            valor=Decimal('999'), data=timezone.localdate(),
        )
        session = self.client.session
        session['current_farm_id'] = self.farm.id
        session.save()
        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}):
            stock = self.post_json('gestao:assistente_api', {
                'message': 'Me diga como está meu estoque',
            })
        self.assertIn('Semente de milho', stock.json()['reply'])
        response_body = json.dumps({
            'choices': [{'message': {'content': 'Os dados registrados mostram R$ 240.'}}],
            'usage': {'prompt_tokens': 123, 'completion_tokens': 14},
        }).encode()
        with patch('gestao.views.urllib.request.urlopen') as openrouter, patch.dict(
            os.environ, {'OPENROUTER_API_KEY': 'test-only-key'},
        ):
            openrouter.return_value.__enter__.return_value.read.return_value = response_body
            response = self.post_json('gestao:assistente_api', {
                'message': 'Relacione meus gastos com fertilizantes e a área dos talhões para análise.',
            })

        self.assertEqual(response.status_code, 200)
        request_payload = json.loads(openrouter.call_args.args[0].data.decode())
        user_content = request_payload['messages'][-1]['content']
        self.assertIn('"finance"', user_content)
        self.assertIn('"plots"', user_content)
        self.assertIn('"expenses_and_purchases":"240"', user_content)
        self.assertNotIn('Fazenda Não Selecionada', user_content)
        self.assertNotIn('Fertilizante particular', user_content)
        self.assertNotIn('Semente de milho', user_content)
        usage = AssistenteUso.objects.get(resolucao=AssistenteUso.Resolucao.OPENROUTER)
        self.assertEqual(usage.tokens_entrada, 123)
        self.assertEqual(usage.tokens_saida, 14)

    def test_ai_conversation_context_is_not_reused_for_another_farm(self):
        other_farm = Fazenda.objects.create(
            produtor=self.user, nome='Outra Fazenda', cep='37000001',
            estado='MG', cidade='Varginha', bairro='Zona Rural',
            area_hectares=5, quantidade_talhoes=1, culturas=['Café'],
            tipo_cultivo='Convencional', irrigacao='Gotejamento',
        )
        session = self.client.session
        session['current_farm_id'] = self.farm.id
        session.save()
        response_body = json.dumps({
            'choices': [{'message': {'content': 'Resposta geral'}}],
        }).encode()
        with patch('gestao.views.urllib.request.urlopen') as openrouter, patch.dict(
            os.environ, {'OPENROUTER_API_KEY': 'test-only-key'},
        ):
            openrouter.return_value.__enter__.return_value.read.return_value = response_body
            first = self.post_json('gestao:assistente_api', {
                'message': 'Qual sua sugestão para organização da lavoura? Minha anotação secreta.',
            })
            session = self.client.session
            session['current_farm_id'] = other_farm.id
            session.save()
            self.post_json('gestao:assistente_api', {
                'message': 'O que você recomenda para organização geral da lavoura?',
            })

        self.assertEqual(first.status_code, 200)
        request_payload = json.loads(openrouter.call_args_list[-1].args[0].data.decode())
        self.assertNotIn('Minha anotação secreta', json.dumps(request_payload))
        self.assertNotIn('Fazenda Teste', json.dumps(request_payload))

    def test_ai_rejects_stock_confirmation_if_balance_changed(self):
        proposal = self.post_json('gestao:assistente_api', {
            'message': 'Zere todas as sementes do meu estoque',
        })
        self.assertTrue(proposal.json()['confirmation_required'])

        self.seed_product.quantidade_atual = Decimal('300')
        self.seed_product.save(update_fields=['quantidade_atual'])
        confirmed = self.post_json('gestao:assistente_api', {'action': 'confirm'})

        self.assertEqual(confirmed.status_code, 409)
        self.seed_product.refresh_from_db()
        self.assertEqual(self.seed_product.quantidade_atual, Decimal('300'))
        self.assertEqual(MovimentacaoEstoque.objects.count(), 0)

    def test_ai_activity_write_requires_confirmation_and_uses_farm_plot(self):
        talhao = Talhao.objects.create(fazenda=self.farm, nome='Talhão 01', cultura='Café')
        proposal = self.post_json('gestao:assistente_api', {
            'message': 'Planeje a florada do Talhão 01',
        })

        self.assertEqual(proposal.status_code, 200)
        self.assertTrue(proposal.json()['confirmation_required'])
        self.assertEqual(EventoCalendario.objects.count(), 0)

        confirmed = self.post_json('gestao:assistente_api', {'action': 'confirm'})
        self.assertEqual(confirmed.status_code, 200)
        activity = EventoCalendario.objects.get()
        self.assertEqual(activity.fazenda, self.farm)
        self.assertEqual(activity.talhao, talhao)
        self.assertEqual(activity.categoria, EventoCalendario.Categoria.FLORADA)
        self.assertEqual(activity.status, EventoCalendario.Status.PLANEJADA)

    def test_ai_plans_coffee_operations_in_the_matching_calendar_categories(self):
        cases = (
            ('Planeje a pós-colheita', EventoCalendario.Categoria.POS_COLHEITA),
            ('Registre a aplicação de adubo', EventoCalendario.Categoria.ADUBACAO),
            ('Planeje o controle fitossanitário', EventoCalendario.Categoria.PULVERIZACAO),
        )
        for message, category in cases:
            with self.subTest(message=message):
                proposal = self.post_json('gestao:assistente_api', {'message': message})
                self.assertEqual(proposal.status_code, 200)
                self.assertTrue(proposal.json()['confirmation_required'])

                confirmed = self.post_json('gestao:assistente_api', {'action': 'confirm'})
                self.assertEqual(confirmed.status_code, 200)
                self.assertEqual(EventoCalendario.objects.latest('id').categoria, category)

    def test_general_openrouter_message_does_not_include_farm_data(self):
        response_body = json.dumps({
            'choices': [{'message': {'content': 'Resposta geral'}}],
        }).encode()
        with patch('gestao.views.urllib.request.urlopen') as mock_response, patch.dict(
            os.environ, {'OPENROUTER_API_KEY': 'test-only-key'},
        ):
            mock_response.return_value.__enter__.return_value.read.return_value = response_body
            response = self.post_json('gestao:assistente_api', {'message': 'Como organizar o plantio?'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['reply'], 'Resposta geral')
        request_payload = json.loads(mock_response.call_args.args[0].data.decode())
        self.assertEqual(
            request_payload['messages'][-1]['content'],
            'Pergunta atual: Como organizar o plantio?',
        )
        self.assertNotIn('Fazenda Teste', json.dumps(request_payload))
        self.assertNotIn('Semente de milho', json.dumps(request_payload))

    def test_assistant_pages_render_under_goldcrop_navigation(self):
        pages = ('financeiro', 'safras', 'servicos', 'equipamentos', 'registros', 'relatorios', 'assistente')
        for page in pages:
            with self.subTest(page=page):
                response = self.client.get(reverse(f'gestao:{page}'))
                self.assertEqual(response.status_code, 200)
        self.assertContains(self.client.get(reverse('gestao:assistente')), 'Assistente IA')
        self.assertContains(self.client.get(reverse('gestao:assistente')), 'Confirmar e salvar')
        dashboard = self.client.get(reverse('dashboard:dashboard'))
        self.assertContains(dashboard, 'Resumo deste mês')
        self.assertContains(dashboard, 'gc-ai-launcher')
        self.assertContains(dashboard, 'dashboardFinanceMovements')
        self.assertContains(dashboard, 'gc-mobile-nav')
        self.assertContains(dashboard, 'gc-nav-group')
        self.assertContains(dashboard, '?pergunta=')
        self.assertNotContains(dashboard, 'nav-pecuaria')
        self.assertNotContains(dashboard, 'Resumo da criação')

    def test_reports_include_five_recent_financial_movements_for_current_farm(self):
        today = timezone.localdate()
        entries = []
        for days_ago in range(6):
            entries.append(LancamentoFinanceiro.objects.create(
                fazenda=self.farm,
                tipo=LancamentoFinanceiro.Tipo.RECEITA if days_ago == 0 else LancamentoFinanceiro.Tipo.DESPESA,
                titulo=f'Lançamento {days_ago}',
                categoria='Teste',
                valor=Decimal('10'),
                data=today - timedelta(days=days_ago),
            ))
        other_farm = Fazenda.objects.create(
            produtor=self.user,
            nome='Outra Fazenda',
            cep='37000001',
            estado='MG',
            cidade='Varginha',
            bairro='Zona Rural',
            area_hectares=5,
            quantidade_talhoes=1,
            culturas=['Café'],
            tipo_cultivo='Convencional',
            irrigacao='Gotejamento',
        )
        LancamentoFinanceiro.objects.create(
            fazenda=other_farm,
            tipo=LancamentoFinanceiro.Tipo.RECEITA,
            titulo='Movimentação de outra fazenda',
            categoria='Teste',
            valor=Decimal('999'),
            data=today,
        )

        response = self.client.get(reverse('gestao:relatorios_api'))

        self.assertEqual(response.status_code, 200)
        recent = response.json()['movimentacoes_recentes']
        self.assertEqual(len(recent), 5)
        self.assertEqual([row['titulo'] for row in recent], [entry.titulo for entry in entries[:5]])
        self.assertNotIn('Movimentação de outra fazenda', [row['titulo'] for row in recent])

    def test_safra_servico_equipamento_e_atividade_uses_current_farm(self):
        talhao = Talhao.objects.create(fazenda=self.farm, nome='Talhão 01', cultura='Café')
        safra = self.post_json('gestao:safras_api', {
            'cultura': 'Café',
            'ano_safra': '2026/2027',
            'area_hectares': '8.5',
            'talhoes': [talhao.id],
        })
        servico = self.post_json('gestao:servicos_api', {
            'nome': 'Colheita',
            'tipo': 'CONTRATADO',
            'data': '2026-11-21',
            'valor': '900',
        })
        equipment = self.post_json('gestao:equipamentos_api', {
            'nome': 'Trator',
            'tipo': 'Trator',
            'status': 'OPERACIONAL',
        })
        activity = self.post_json('gestao:registros_api', {
            'titulo': 'Aplicação no talhão',
            'categoria': 'APLICACAO',
            'data': '2026-11-21',
            'talhao_id': talhao.id,
        })

        self.assertEqual(safra.status_code, 201)
        self.assertEqual(servico.status_code, 201)
        self.assertEqual(equipment.status_code, 201)
        self.assertEqual(activity.status_code, 201)
        self.assertEqual(self.farm.safras.count(), 1)
        self.assertEqual(self.farm.servicos.count(), 1)
        self.assertEqual(self.farm.equipamentos.count(), 1)
        self.assertEqual(self.farm.eventos_calendario.count(), 1)

    def test_safra_api_rejects_noncoffee_culture(self):
        response = self.post_json('gestao:safras_api', {
            'cultura': 'Milho',
            'ano_safra': '2026/2027',
            'area_hectares': '8.5',
            'talhoes': [],
        })

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.farm.safras.count(), 0)
