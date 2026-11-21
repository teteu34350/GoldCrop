from django.test import TestCase

# Create your tests here.
import json
import os
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from django.urls import reverse

from dashboard.models import EventoCalendario, Fazenda, MovimentacaoEstoque, Produto, Talhao
from pecuaria.models import Animal, ProducaoLeite

from .models import EquipamentoAgricola, LancamentoFinanceiro, ServicoFazenda


class GestaoWorkflowTests(TestCase):
    def setUp(self):
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

    def test_ai_animal_count_uses_active_farm_data_without_openrouter(self):
        Animal.objects.create(
            fazenda=self.farm, identificacao='VACA-01',
            categoria='VACA_LACTACAO', sexo='F',
        )
        Animal.objects.create(
            fazenda=self.farm, identificacao='VACA-02',
            categoria='VACA_SECA', sexo='F', status='VENDIDO',
        )
        Animal.objects.create(
            fazenda=self.farm, identificacao='BEZERRA-01',
            categoria='BEZERRA', sexo='F', arquivado=True,
        )
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
        Animal.objects.create(
            fazenda=other_farm, identificacao='VACA-03',
            categoria='VACA_LACTACAO', sexo='F',
        )

        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            for message, expected in (
                ('Quantos animais eu tenho?', '1 animal ativo'),
                ('Me diga quantas vacas eu tenho', '1 vaca ativa'),
            ):
                with self.subTest(message=message):
                    response = self.post_json('gestao:assistente_api', {'message': message})
                    self.assertEqual(response.status_code, 200)
                    self.assertIn(expected, response.json()['reply'])
        openrouter.assert_not_called()

    def test_ai_milk_production_queries_are_local_and_farm_scoped(self):
        today = timezone.localdate()
        ProducaoLeite.objects.create(
            fazenda=self.farm, data=today, quantidade=Decimal('12'),
        )
        ProducaoLeite.objects.create(
            fazenda=self.farm, data=today - timedelta(days=3), quantidade=Decimal('5'),
        )
        ProducaoLeite.objects.create(
            fazenda=self.farm,
            data=today.replace(day=1) - timedelta(days=1),
            quantidade=Decimal('100'),
        )
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
        ProducaoLeite.objects.create(
            fazenda=other_farm, data=today, quantidade=Decimal('50'),
        )

        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            response = self.post_json('gestao:assistente_api', {
                'message': 'Quantos litros de leite produziu esta semana?',
            })

        self.assertEqual(response.status_code, 200)
        self.assertIn('17 litros', response.json()['reply'])
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
        self.assertIn('1 serviço pendente registrado', pending.json()['reply'])
        self.assertEqual(maintenance.status_code, 200)
        self.assertIn('1 equipamento marcado', maintenance.json()['reply'])
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
            titulo='Lançamento futuro', categoria='Outros', valor=Decimal('999'),
            data=today + timedelta(days=2),
        )

        with patch.dict(os.environ, {'OPENROUTER_API_KEY': ''}), patch(
            'gestao.views.urllib.request.urlopen',
        ) as openrouter:
            response = self.post_json('gestao:assistente_api', {
                'message': 'Me diga quanto gastei este mês',
            })

        self.assertEqual(response.status_code, 200)
        self.assertIn('R$ 130,00', response.json()['reply'])
        self.assertNotIn('999', response.json()['reply'])
        openrouter.assert_not_called()

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
            'message': 'Plantei milho no Talhão 01',
        })

        self.assertEqual(proposal.status_code, 200)
        self.assertTrue(proposal.json()['confirmation_required'])
        self.assertEqual(EventoCalendario.objects.count(), 0)

        confirmed = self.post_json('gestao:assistente_api', {'action': 'confirm'})
        self.assertEqual(confirmed.status_code, 200)
        activity = EventoCalendario.objects.get()
        self.assertEqual(activity.fazenda, self.farm)
        self.assertEqual(activity.talhao, talhao)
        self.assertEqual(activity.categoria, EventoCalendario.Categoria.PLANTIO)

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
        self.assertEqual(request_payload['messages'][-1]['content'], 'Como organizar o plantio?')
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
