from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dashboard", "0014_parametrotecnicooperacao"),
    ]

    operations = [
        migrations.AlterField(
            model_name="eventocalendario",
            name="categoria",
            field=models.CharField(
                choices=[
                    ("APLICACAO", "Aplicação"),
                    ("PLANTIO", "Plantio"),
                    ("COLHEITA", "Colheita"),
                    ("FLORADA", "Florada"),
                    ("FORMACAO_FRUTOS", "Formação dos frutos"),
                    ("MATURACAO", "Maturação"),
                    ("POS_COLHEITA", "Pós-colheita"),
                    ("ADUBACAO", "Adubação"),
                    ("IRRIGACAO", "Irrigação"),
                    ("PULVERIZACAO", "Pulverização"),
                    ("MANEJO", "Manejo"),
                    ("INSPECAO", "Inspeção"),
                    ("MANUTENCAO", "Manutenção"),
                    ("COMPRA", "Compra"),
                    ("VENDA", "Venda"),
                    ("REUNIAO", "Reunião"),
                    ("VISITA_TECNICA", "Visita técnica"),
                    ("TAREFA", "Tarefa"),
                    ("OUTRO", "Outro"),
                ],
                default="TAREFA",
                max_length=20,
            ),
        ),
    ]
