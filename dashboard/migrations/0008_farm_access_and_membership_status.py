import uuid
import secrets

import dashboard.models
import django.utils.timezone
from django.db import migrations, models


def populate_farm_identifiers_and_codes(apps, schema_editor):
    Fazenda = apps.get_model("dashboard", "Fazenda")
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    used_codes = set()
    for farm in Fazenda.objects.all().iterator():
        while True:
            code = "GC-" + "".join(secrets.choice(alphabet) for _ in range(8))
            if code not in used_codes:
                used_codes.add(code)
                break
        Fazenda.objects.filter(pk=farm.pk).update(
            identificador=uuid.uuid4(),
            codigo_acesso=code,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("dashboard", "0007_produto_movimentacaoestoque"),
    ]

    operations = [
        migrations.AddField(
            model_name="fazenda",
            name="identificador",
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.AddField(
            model_name="fazenda",
            name="codigo_acesso",
            field=models.CharField(editable=False, max_length=11, null=True),
        ),
        migrations.AddField(
            model_name="membrofazenda",
            name="status",
            field=models.CharField(
                choices=[("ACTIVE", "Ativo"), ("PENDING", "Pendente"), ("INACTIVE", "Inativo")],
                default="ACTIVE",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="membrofazenda",
            name="atualizado_em",
            field=models.DateTimeField(default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.RunPython(
            populate_farm_identifiers_and_codes,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="fazenda",
            name="identificador",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AlterField(
            model_name="fazenda",
            name="codigo_acesso",
            field=models.CharField(
                default=dashboard.models.generate_farm_access_code,
                editable=False,
                max_length=11,
                unique=True,
            ),
        ),
        migrations.AlterField(
            model_name="membrofazenda",
            name="atualizado_em",
            field=models.DateTimeField(auto_now=True),
        ),
    ]
