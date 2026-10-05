import json
import hashlib
import re
import secrets
import smtplib
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import (
    ColetaMeteorologica, ConviteFazenda, ExecucaoAplicacao, Fazenda, MembroFazenda,
    NotificacaoFazenda, PerfilProdutor, PlanejamentoAplicacao, RecomendacaoJanela,
    SensorIoT, Talhao, Produto, MovimentacaoEstoque, generate_farm_access_code,
)


def _json_body(request):
    try:
        return json.loads(request.body)
    except (TypeError, json.JSONDecodeError):
        return None


def _error(message, status=400, field_errors=None):
    data = {"ok": False, "message": message}
    if field_errors:
        data["field_errors"] = field_errors
    return JsonResponse(data, status=status)


def _protected_page(request, template):
    if not request.user.is_authenticated:
        return redirect(f"/login/?next={request.path}")
    perfil = getattr(request.user, "perfil", None)
    fazenda = _current_farm(request)
    nome = perfil.nome_completo if perfil else request.user.get_full_name() or request.user.username
    membership = _membership(fazenda, request.user) if fazenda else None
    return render(request, template, {"auth_user_data": {
        "name": nome,
        "initials": "".join(part[0] for part in nome.split()[:2]).upper(),
        "email": request.user.email,
        "phone": perfil.telefone if perfil else "",
        "role": membership.get_funcao_display() if membership else "",
        "farm": fazenda.nome if fazenda else "Sem fazenda cadastrada",
    }})


def home(request): return _protected_page(request, "dashboard.html")
def calendario_view(request): return _protected_page(request, "calendario.html")
def talhoes_view(request): return _protected_page(request, "talhoes.html")
def fazenda_view(request): return _protected_page(request, "fazenda.html")
def sensores_view(request): return _protected_page(request, "sensores.html")
def aplicacoes_view(request): return _protected_page(request, "aplicacoes.html")
def historico_view(request): return _protected_page(request, "historico.html")
def configuracoes_view(request): return _protected_page(request, "configuracoes.html")
def estoque_view(request): return _protected_page(request, "estoque.html")


def login_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard:dashboard")
    return render(request, "login.html")


def cadastro_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard:dashboard")
    return render(request, "cadastro.html")


def _current_farm(request):
    if not request.user.is_authenticated:
        return None
    farms = _accessible_farms(request.user)
    selected_id = request.session.get("current_farm_id")
    if selected_id:
        farm = farms.filter(pk=selected_id).first()
        if farm:
            _membership(farm, request.user)
            return farm
        request.session.pop("current_farm_id", None)
    farm = farms.first()
    if farm:
        _membership(farm, request.user)
        request.session["current_farm_id"] = farm.id
    return farm


def _accessible_farms(user):
    return Fazenda.objects.filter(
        Q(membros__usuario=user, membros__status=MembroFazenda.Status.ATIVO)
        | (Q(produtor=user) & ~Q(membros__usuario=user))
    ).distinct().order_by("nome", "id")


def _membership(farm, user):
    if not farm or not user.is_authenticated:
        return None
    membership = MembroFazenda.objects.filter(fazenda=farm, usuario=user).first()
    if membership:
        return membership if membership.status == MembroFazenda.Status.ATIVO else None
    if farm.produtor_id == user.id:
        membership, _ = MembroFazenda.objects.get_or_create(
            fazenda=farm,
            usuario=user,
            defaults={"funcao": MembroFazenda.Funcao.PROPRIETARIO},
        )
        return membership
    return None


FARM_PERMISSIONS = {
    "view": {
        MembroFazenda.Funcao.PROPRIETARIO,
        MembroFazenda.Funcao.GERENTE,
        MembroFazenda.Funcao.TECNICO,
        MembroFazenda.Funcao.FUNCIONARIO,
    },
    "manage": {MembroFazenda.Funcao.PROPRIETARIO, MembroFazenda.Funcao.GERENTE},
    "plan": {MembroFazenda.Funcao.PROPRIETARIO, MembroFazenda.Funcao.GERENTE, MembroFazenda.Funcao.TECNICO},
    "record": {
        MembroFazenda.Funcao.PROPRIETARIO,
        MembroFazenda.Funcao.GERENTE,
        MembroFazenda.Funcao.TECNICO,
        MembroFazenda.Funcao.FUNCIONARIO,
    },
    "team": {MembroFazenda.Funcao.PROPRIETARIO},
}


def _has_farm_permission(farm, user, permission):
    membership = _membership(farm, user)
    return bool(membership and membership.funcao in FARM_PERMISSIONS[permission])


def _create_farm_notification(farm, actor, kind, title, message):
    _membership(farm, farm.produtor)
    member_ids = farm.membros.values_list("usuario_id", flat=True)
    NotificacaoFazenda.objects.bulk_create([
        NotificacaoFazenda(
            fazenda=farm,
            destinatario_id=user_id,
            ator=actor,
            tipo=kind,
            titulo=title,
            mensagem=message,
        )
        for user_id in member_ids
    ])


def _role_json(membership):
    return {
        "id": membership.usuario_id,
        "name": membership.usuario.get_full_name() or membership.usuario.username,
        "email": membership.usuario.email,
        "role": membership.funcao,
        "role_label": membership.get_funcao_display(),
        "status": membership.status,
        "status_label": membership.get_status_display(),
    }


@require_http_methods(["GET", "POST"])
def farms_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farms = _accessible_farms(request.user)
    if request.method == "POST":
        data = _json_body(request)
        if not isinstance(data, dict):
            return _error("Seleção de fazenda inválida.")
        try:
            farm_id = int(data.get("farm_id"))
        except (TypeError, ValueError):
            return _error("Selecione uma fazenda válida.")
        farm = farms.filter(pk=farm_id).first()
        if not farm:
            return _error("Você não tem acesso a essa fazenda.", 403)
        request.session["current_farm_id"] = farm.id
        return JsonResponse({"ok": True, "selected_farm_id": farm.id})

    current_id = _current_farm(request)
    return JsonResponse({
        "ok": True,
        "selected_farm_id": current_id.id if current_id else None,
        "farms": [{
            "id": farm.id,
            "name": farm.nome,
            "area": float(farm.area_hectares),
            "culture": farm.culturas[0] if farm.culturas else "",
            "talhoes": farm.talhoes.filter(ativo=True).count(),
            "role": _membership(farm, request.user).get_funcao_display(),
        } for farm in farms],
    })


@require_POST
def farm_create_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Dados da fazenda inválidos.")

    name = str(data.get("name", "")).strip()
    cep = re.sub(r"\D", "", str(data.get("cep", "")))
    state = str(data.get("state", "")).strip().upper()
    city = str(data.get("city", "")).strip()
    district = str(data.get("district", "")).strip()
    address = str(data.get("address", "")).strip()
    culture = str(data.get("culture", "")).strip()
    farm_type = str(data.get("farm_type", Fazenda.TipoCultivo.CONVENCIONAL))
    irrigation = str(data.get("irrigation", Fazenda.Irrigacao.GOTEJAMENTO))
    try:
        area = Decimal(str(data.get("area", "")))
        plot_count = int(data.get("plot_count", 0))
    except (InvalidOperation, TypeError, ValueError):
        return _error("Informe uma área e uma quantidade de talhões válidas.")
    if not name or len(name) > 150 or len(cep) != 8 or len(state) != 2 or not city or not district:
        return _error("Preencha nome, CEP, estado, cidade e bairro da fazenda.")
    if area <= 0 or plot_count < 1:
        return _error("Informe uma área maior que zero e ao menos um talhão.")
    if farm_type not in Fazenda.TipoCultivo.values or irrigation not in Fazenda.Irrigacao.values:
        return _error("Selecione um tipo de cultivo e irrigação válidos.")

    try:
        with transaction.atomic():
            farm = Fazenda(
                produtor=request.user,
                nome=name,
                cep=cep,
                estado=state,
                cidade=city,
                bairro=district,
                endereco=address,
                area_hectares=area,
                quantidade_talhoes=plot_count,
                culturas=[culture] if culture else [],
                tipo_cultivo=farm_type,
                irrigacao=irrigation,
            )
            farm.full_clean()
            farm.save()
            MembroFazenda.objects.create(
                fazenda=farm,
                usuario=request.user,
                funcao=MembroFazenda.Funcao.PROPRIETARIO,
            )
            Talhao.objects.bulk_create([
                Talhao(fazenda=farm, nome=f"Talhão {index:02d}")
                for index in range(1, plot_count + 1)
            ])
    except (IntegrityError, ValidationError):
        return _error("Não foi possível criar a fazenda. Verifique os dados e tente outro nome.")

    request.session["current_farm_id"] = farm.id
    return JsonResponse({"ok": True, "name": farm.nome}, status=201)


@require_POST
def farm_join_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Código da fazenda inválido.")
    access_code = str(data.get("access_code", "")).strip().upper()
    if not re.fullmatch(r"GC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}", access_code):
        return _error("Informe um código de fazenda válido.")

    try:
        with transaction.atomic():
            farm = Fazenda.objects.select_for_update().filter(codigo_acesso=access_code).first()
            if farm is None:
                return _error("Não foi encontrada uma fazenda com esse código.", 404)
            membership = MembroFazenda.objects.filter(fazenda=farm, usuario=request.user).first()
            if membership and membership.status == MembroFazenda.Status.ATIVO:
                return _error("Você já faz parte desta fazenda.", 409)
            if membership:
                membership.status = MembroFazenda.Status.ATIVO
                membership.funcao = MembroFazenda.Funcao.FUNCIONARIO
                membership.save(update_fields=["status", "funcao", "atualizado_em"])
            else:
                MembroFazenda.objects.create(
                    fazenda=farm,
                    usuario=request.user,
                    funcao=MembroFazenda.Funcao.FUNCIONARIO,
                    status=MembroFazenda.Status.ATIVO,
                )
    except IntegrityError:
        return _error("Você já faz parte desta fazenda.", 409)

    request.session["current_farm_id"] = farm.id
    _create_farm_notification(
        farm, request.user, NotificacaoFazenda.Tipo.MEMBRO, "Novo membro",
        f"{request.user.get_full_name() or request.user.email} entrou na fazenda pelo código.",
    )
    return JsonResponse({"ok": True, "farm_name": farm.nome}, status=200)


@require_POST
def farm_access_code_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.", 404)
    membership = _membership(farm, request.user)
    if not membership or membership.funcao != MembroFazenda.Funcao.PROPRIETARIO:
        return _error("Somente o proprietário pode gerar um novo código.", 403)

    for _ in range(3):
        farm.codigo_acesso = generate_farm_access_code()
        try:
            farm.save(update_fields=["codigo_acesso"])
            return JsonResponse({"ok": True, "access_code": farm.codigo_acesso})
        except IntegrityError:
            continue
    return _error("Não foi possível gerar um código único. Tente novamente.", 503)


@require_POST
def farm_settings_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.")
    if not _has_farm_permission(farm, request.user, "manage"):
        return _error("Seu perfil não pode alterar os dados desta fazenda.", 403)
    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Dados da fazenda inválidos.")
    name = str(data.get("name", "")).strip()
    culture = str(data.get("culture", "")).strip()
    try:
        area = Decimal(str(data.get("area", "")))
        if not name or len(name) > 150 or area <= 0:
            raise InvalidOperation
        farm.nome = name
        farm.area_hectares = area
        farm.culturas = [culture] if culture else []
        farm.full_clean()
        farm.save(update_fields=["nome", "area_hectares", "culturas", "atualizada_em"])
    except (InvalidOperation, TypeError, ValueError, ValidationError, IntegrityError):
        return _error("Informe nome e área válidos para a fazenda.")
    return JsonResponse({
        "ok": True,
        "farm": {
            "id": farm.id,
            "name": farm.nome,
            "area": float(farm.area_hectares),
            "culture": farm.culturas[0] if farm.culturas else "",
        },
    })


@require_GET
def farm_team_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return JsonResponse({"ok": True, "members": [], "invitations": []})
    members = farm.membros.select_related("usuario").all()
    invitations = farm.convites.filter(
        status=ConviteFazenda.Status.PENDENTE,
        expira_em__gt=timezone.now(),
    ).select_related("convidado_por")
    return JsonResponse({
        "ok": True,
        "access_code": farm.codigo_acesso if _has_farm_permission(farm, request.user, "team") else None,
        "members": [_role_json(member) for member in members],
        "invitations": [{
            "id": invitation.id,
            "email": invitation.email,
            "role": invitation.funcao,
            "role_label": invitation.get_funcao_display(),
            "expires_at": invitation.expira_em.isoformat(),
        } for invitation in invitations],
    })


@require_http_methods(["PATCH", "DELETE"])
def farm_member_api(request, user_id):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.")
    if not _has_farm_permission(farm, request.user, "team"):
        return _error("Somente o proprietário pode gerenciar a equipe.", 403)
    member = farm.membros.filter(usuario_id=user_id).first()
    if not member:
        return _error("Membro não encontrado nesta fazenda.", 404)
    if member.funcao == MembroFazenda.Funcao.PROPRIETARIO:
        return _error("O proprietário não pode ser removido da própria fazenda.", 400)
    if request.method == "PATCH":
        data = _json_body(request)
        role = data.get("role") if isinstance(data, dict) else None
        allowed_roles = {
            MembroFazenda.Funcao.GERENTE,
            MembroFazenda.Funcao.TECNICO,
            MembroFazenda.Funcao.FUNCIONARIO,
        }
        if role not in allowed_roles:
            return _error("Selecione uma função válida.")
        member.funcao = role
        member.save(update_fields=["funcao", "atualizado_em"])
        return JsonResponse({"ok": True, "member": _role_json(member)})
    member.delete()
    return JsonResponse({"ok": True, "removed_user_id": user_id})


@require_http_methods(["POST", "DELETE"])
def farm_invitation_api(request, invitation_id=None):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.")
    if not _has_farm_permission(farm, request.user, "team"):
        return _error("Somente o proprietário pode gerenciar a equipe.", 403)
    if request.method == "DELETE":
        invitation = farm.convites.filter(pk=invitation_id, status=ConviteFazenda.Status.PENDENTE).first()
        if not invitation:
            return _error("Convite pendente não encontrado.", 404)
        invitation.status = ConviteFazenda.Status.REVOGADO
        invitation.save(update_fields=["status"])
        return JsonResponse({"ok": True, "revoked_id": invitation.id})

    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Dados do convite inválidos.")
    email = str(data.get("email", "")).strip().lower()
    role = str(data.get("role", ""))
    try:
        validate_email(email)
    except ValidationError:
        return _error("Informe um e-mail válido.", field_errors={"email": "Informe um e-mail válido."})
    allowed_roles = {
        MembroFazenda.Funcao.GERENTE,
        MembroFazenda.Funcao.TECNICO,
        MembroFazenda.Funcao.FUNCIONARIO,
    }
    if role not in allowed_roles:
        return _error("Selecione uma função válida.")
    if farm.membros.filter(usuario__email__iexact=email).exists():
        return _error("Este usuário já faz parte da equipe.")
    if farm.convites.filter(email__iexact=email, status=ConviteFazenda.Status.PENDENTE, expira_em__gt=timezone.now()).exists():
        return _error("Já existe um convite pendente para este e-mail.")
    if not settings.EMAIL_HOST or not settings.DEFAULT_FROM_EMAIL or (settings.EMAIL_USE_TLS and settings.EMAIL_USE_SSL):
        return _error("O envio de convites não está disponível: configure EMAIL_HOST e DEFAULT_FROM_EMAIL no ambiente.", 503)

    token = secrets.token_urlsafe(32)
    invitation_url = request.build_absolute_uri(reverse("dashboard:accept_invitation", args=[token]))
    role_label = dict(MembroFazenda.Funcao.choices)[role]
    message = (
        f"Você foi convidado para participar da fazenda {farm.nome} no GoldCrop como {role_label}.\n\n"
        f"Para aceitar o convite e acessar a fazenda, abra este link:\n{invitation_url}\n\n"
        "O convite expira em 7 dias. Se você não esperava este e-mail, ignore-o."
    )
    try:
        with transaction.atomic():
            invitation = ConviteFazenda.objects.create(
                fazenda=farm,
                email=email,
                funcao=role,
                token_digest=hashlib.sha256(token.encode("utf-8")).hexdigest(),
                convidado_por=request.user,
                expira_em=timezone.now() + timedelta(days=7),
            )
            sent_count = send_mail(
                f"Convite para a fazenda {farm.nome} no GoldCrop",
                message,
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )
            if sent_count != 1:
                raise RuntimeError("O servidor de e-mail não confirmou o envio.")
    except (OSError, RuntimeError, smtplib.SMTPException, ValueError) as error:
        return _error(f"Não foi possível enviar o convite por e-mail: {error}", 503)

    return JsonResponse({
        "ok": True,
        "invitation": {
            "id": invitation.id,
            "email": invitation.email,
            "role": invitation.funcao,
            "role_label": invitation.get_funcao_display(),
            "expires_at": invitation.expira_em.isoformat(),
        },
    }, status=201)


def accept_invitation(request, token):
    token_digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    invitation = get_object_or_404(
        ConviteFazenda.objects.select_related("fazenda"),
        token_digest=token_digest,
        status=ConviteFazenda.Status.PENDENTE,
    )
    if invitation.expira_em <= timezone.now():
        invitation.status = ConviteFazenda.Status.REVOGADO
        invitation.save(update_fields=["status"])
        return HttpResponse("Este convite expirou. Solicite um novo convite ao proprietário.", status=410)

    invited_user = User.objects.filter(email__iexact=invitation.email).first()
    if request.user.is_authenticated and request.user.email.lower() != invitation.email.lower():
        return HttpResponse("Entre com a conta vinculada ao e-mail do convite.", status=403)
    if invited_user and not request.user.is_authenticated:
        request.session["pending_invitation_token"] = token
        return redirect(f"{reverse('dashboard:login')}?next={reverse('dashboard:accept_invitation', args=[token])}")

    if request.method == "GET":
        return render(request, "invitation_accept.html", {
            "invitation": invitation,
            "existing_account": invited_user is not None,
        })
    if request.method != "POST":
        return HttpResponse(status=405)

    user = request.user if request.user.is_authenticated else None
    created_user = False
    if user is None:
        name = str(request.POST.get("name", "")).strip()
        password = request.POST.get("password", "")
        if not name:
            return render(request, "invitation_accept.html", {
                "invitation": invitation,
                "existing_account": False,
                "error": "Informe seu nome completo.",
            }, status=400)
        try:
            validate_password(password)
        except ValidationError as error:
            return render(request, "invitation_accept.html", {
                "invitation": invitation,
                "existing_account": False,
                "error": " ".join(error.messages),
            }, status=400)
        if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
            return render(request, "invitation_accept.html", {
                "invitation": invitation,
                "existing_account": False,
                "error": "A senha deve ter pelo menos 8 caracteres, incluindo letras e números.",
            }, status=400)
        if User.objects.filter(Q(username__iexact=invitation.email) | Q(email__iexact=invitation.email)).exists():
            return HttpResponse("Já existe uma conta para este e-mail. Entre nessa conta para aceitar o convite.", status=409)
        user = None
        try:
            with transaction.atomic():
                first_name, *last_name = name.split(maxsplit=1)
                user = User.objects.create_user(
                    username=invitation.email,
                    email=invitation.email,
                    password=password,
                    first_name=first_name,
                    last_name=last_name[0] if last_name else "",
                )
                PerfilProdutor.objects.create(usuario=user, nome_completo=name, telefone="")
                created_user = True
        except IntegrityError:
            return HttpResponse("Não foi possível criar a conta. Tente novamente ou entre na conta existente.", status=409)

    try:
        with transaction.atomic():
            membership, created = MembroFazenda.objects.get_or_create(
                fazenda=invitation.fazenda,
                usuario=user,
                defaults={"funcao": invitation.funcao},
            )
            if not created:
                return HttpResponse("Esta conta já possui acesso à fazenda.", status=409)
            invitation.status = ConviteFazenda.Status.ACEITO
            invitation.aceito_em = timezone.now()
            invitation.save(update_fields=["status", "aceito_em"])
            _create_farm_notification(
                invitation.fazenda,
                user,
                NotificacaoFazenda.Tipo.MEMBRO,
                "Convite aceito",
                f"{user.get_full_name() or user.email} agora faz parte da equipe da fazenda.",
            )
    except IntegrityError:
        if created_user and user:
            user.delete()
        return HttpResponse("Não foi possível aceitar este convite. Solicite um novo ao proprietário.", status=409)

    request.session["current_farm_id"] = invitation.fazenda_id
    if created_user:
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    request.session.pop("pending_invitation_token", None)
    return redirect("dashboard:fazenda")


@require_GET
def notifications_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    notifications = NotificacaoFazenda.objects.filter(
        fazenda=farm,
        destinatario=request.user,
    ).select_related("ator")[:50] if farm else NotificacaoFazenda.objects.none()
    payload = [{
        "id": item.id,
        "type": item.tipo,
        "title": item.titulo,
        "message": item.mensagem,
        "actor": (item.ator.get_full_name() or item.ator.username) if item.ator else "",
        "created_at": item.criada_em.isoformat(),
        "read": item.lida_em is not None,
    } for item in notifications]
    return JsonResponse({
        "ok": True,
        "unread_count": sum(not item["read"] for item in payload),
        "notifications": payload,
    })


@require_POST
def notification_read_api(request, notification_id):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    notification = NotificacaoFazenda.objects.filter(
        pk=notification_id,
        fazenda=farm,
        destinatario=request.user,
    ).first() if farm else None
    if not notification:
        return _error("Notificação não encontrada.", 404)
    if notification.lida_em is None:
        notification.lida_em = timezone.now()
        notification.save(update_fields=["lida_em"])
    return JsonResponse({"ok": True, "id": notification.id, "read": True})


def _parse_datetime(value):
    if not value:
        return timezone.now()
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed


def _parse_coordinate(value, maximum):
    raw = str(value).strip().upper().replace(" ", "")
    direction = raw[-1] if raw and raw[-1] in "NSEW" else ""
    if direction:
        raw = raw[:-1]
    if re.fullmatch(r"-?\d{6}", raw):
        sign = -1 if raw.startswith("-") or direction in "SW" or not direction else 1
        digits = raw.lstrip("-")
        degrees, minutes, seconds = int(digits[:2]), int(digits[2:4]), int(digits[4:])
        if minutes >= 60 or seconds >= 60:
            raise ValueError
        coordinate = Decimal(degrees) + Decimal(minutes) / 60 + Decimal(seconds) / 3600
        coordinate *= sign
    else:
        coordinate = Decimal(raw)
    if not -maximum <= coordinate <= maximum:
        raise ValueError
    return coordinate


def _talhao_json(talhao):
    return {
        "id": talhao.id, "name": talhao.nome,
        "area": float(talhao.area_hectares) if talhao.area_hectares is not None else None,
        "culture": talhao.cultura, "variety": talhao.variedade, "age": talhao.idade_anos,
        "soil": talhao.tipo_solo, "sensor": talhao.codigo_sensor, "latitude": float(talhao.latitude) if talhao.latitude is not None else None,
        "longitude": float(talhao.longitude) if talhao.longitude is not None else None, "radius": talhao.raio_metros,
    }


def _application_json(application):
    return {
        "id": application.id, "talhao": application.talhao.nome if application.talhao else "",
        "talhao_id": application.talhao_id,
        "product": application.produto, "qty": str(application.quantidade or ""),
        "date": application.data_aplicacao.strftime("%d/%m/%Y"), "status": application.status,
        "result": {
            ExecucaoAplicacao.Status.REALIZADA: "Realizado",
            ExecucaoAplicacao.Status.CANCELADA: "Cancelado",
            ExecucaoAplicacao.Status.CONFIRMADA: "Confirmado",
            ExecucaoAplicacao.Status.PLANEJADA: "Planejado",
        }.get(application.status, application.status),
        "ieaPrev": application.iea_previsto,
        "created_by": (
            application.criado_por.get_full_name() or application.criado_por.username
            if application.criado_por else ""
        ),
        "farm_id": application.fazenda_id,
    }


def _planejamento_json(planejamento):
    return {
        "id": planejamento.id,
        "talhao_id": planejamento.talhao_id,
        "talhao": planejamento.talhao.nome if planejamento.talhao else "",
        "produto": planejamento.produto,
        "tipo_aplicacao": planejamento.tipo_aplicacao,
        "dose": str(planejamento.dose) if planejamento.dose is not None else "",
        "unidade_dose": planejamento.unidade_dose,
        "data_planejada": planejamento.data_planejada.isoformat(),
        "horario_inicial": planejamento.horario_inicial.isoformat() if planejamento.horario_inicial else None,
        "horario_final": planejamento.horario_final.isoformat() if planejamento.horario_final else None,
        "responsavel": planejamento.responsavel,
        "status": planejamento.status,
        "recomendacao_id": planejamento.recomendacao_id,
        "observacoes": planejamento.observacoes,
    }


def _recommendation_json(recommendation):
    return {
        "id": recommendation.id, "talhao_id": recommendation.talhao_id,
        "date": recommendation.data.isoformat(),
        "windowStart": recommendation.inicio.isoformat(), "windowEnd": recommendation.fim.isoformat(),
        "adequacyIndex": recommendation.adequacao, "classification": recommendation.classificacao,
        "confidence": float(recommendation.confianca), "decision": recommendation.decisao,
        "factors": recommendation.fatores, "risks": recommendation.riscos,
        "dataQuality": recommendation.qualidade_dados, "metrics": recommendation.metricas,
        "next24h": recommendation.proximas_24h, "next48h": recommendation.proximas_48h,
    }


def system_state_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return JsonResponse({
            "ok": True, "farm": None, "talhoes": [], "applications": [],
            "planejamentos": [], "recommendations": [],
        })
    talhoes = list(farm.talhoes.filter(ativo=True))
    talhao_context = {}
    for talhao in talhoes:
        collection = talhao.coletas_meteorologicas.first()
        recommendations = list(collection.recomendacoes.all()) if collection else []
        talhao_context[talhao.id] = {
            "collection": collection,
            "recommendations": [_recommendation_json(item) for item in recommendations],
        }
    requested_talhao_id = request.GET.get("talhao_id")
    selected_context = talhao_context.get(int(requested_talhao_id)) if requested_talhao_id and requested_talhao_id.isdigit() else None
    latest_collection = selected_context["collection"] if selected_context else farm.coletas_meteorologicas.first()
    recommendations = latest_collection.recomendacoes.all() if latest_collection else RecomendacaoJanela.objects.none()
    owner_name = farm.produtor.get_full_name() or farm.produtor.username
    membership = _membership(farm, request.user)
    talhao_payload = []
    for talhao in talhoes:
        context = talhao_context[talhao.id]
        collection = context["collection"]
        serialized = _talhao_json(talhao)
        serialized["recommendations"] = context["recommendations"]
        serialized["weather"] = {
            "fetchedAt": collection.coletada_em.isoformat(),
            "location": {
                "latitude": float(collection.latitude),
                "longitude": float(collection.longitude),
                "timezone": collection.timezone,
            },
            "current": collection.dados_atuais,
            "hourly": collection.dados_horarios,
            "daily": collection.dados_diarios,
            "soil": collection.dados_solo_modelados,
        } if collection else None
        talhao_payload.append(serialized)
    return JsonResponse({
        "ok": True, "farm": {
            "id": farm.id, "name": farm.nome, "area": float(farm.area_hectares),
            "culture": farm.culturas[0] if farm.culturas else "", "city": farm.cidade,
            "state": farm.estado, "district": farm.bairro, "address": farm.endereco,
            "owner": owner_name, "sensors": SensorIoT.objects.filter(fazenda=farm, ativo=True).count(),
            "role": membership.funcao if membership else "",
            "role_label": membership.get_funcao_display() if membership else "",
            "permissions": {
                permission: _has_farm_permission(farm, request.user, permission)
                for permission in FARM_PERMISSIONS
            },
        },
        "talhoes": talhao_payload,
        "applications": [_application_json(item) for item in farm.aplicacoes.all()],
        "planejamentos": [_planejamento_json(item) for item in farm.planejamentos.select_related("talhao").all()],
        "recommendations": [_recommendation_json(item) for item in recommendations],
    })


@require_POST
def weather_ingest_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados meteorológicos ou fazenda inválidos.")
    location = data.get("location") or {}
    talhao_id = data.get("talhao_id", data.get("referenceTalhaoId"))
    talhao = farm.talhoes.filter(pk=talhao_id, ativo=True).first() if talhao_id is not None else None
    if talhao_id is not None and (talhao is None or talhao.latitude is None or talhao.longitude is None):
        return _error("Talhão não encontrado ou sem coordenadas na sua fazenda.", 404)
    latitude = talhao.latitude if talhao else location.get("latitude")
    longitude = talhao.longitude if talhao else location.get("longitude")
    if latitude is None or longitude is None:
        return _error("Informe as coordenadas do local da coleta.")
    collection = ColetaMeteorologica.objects.create(
        fazenda=farm, talhao=talhao, coletada_em=_parse_datetime(data.get("fetchedAt")),
        latitude=latitude, longitude=longitude, timezone=location.get("timezone", ""),
        dados_atuais=data.get("current", {}), dados_horarios=data.get("hourly", {}),
        dados_diarios=data.get("daily", {}), dados_solo_modelados=data.get("soil", {}), dados_brutos=data,
    )
    return JsonResponse({"ok": True, "collection_id": collection.id}, status=201)


@require_POST
def recommendations_ingest_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Recomendação ou fazenda inválida.")
    talhao_id = data.get("talhao_id")
    if talhao_id is not None:
        talhao = farm.talhoes.filter(pk=talhao_id, ativo=True).first()
        if talhao is None:
            return _error("Talhão não encontrado na sua fazenda.", 404)
        collection = talhao.coletas_meteorologicas.first()
    else:
        collection = farm.coletas_meteorologicas.first()
    if not collection:
        return _error("Salve a coleta meteorológica antes da recomendação.")
    recommendations = data.get("recommendations", [])
    old_signatures = {
        (
            item.data.isoformat(),
            timezone.localtime(item.inicio).isoformat(),
            timezone.localtime(item.fim).isoformat(),
            item.adequacao,
            item.decisao,
            json.dumps(item.metricas, sort_keys=True, separators=(",", ":")),
        )
        for item in collection.recomendacoes.all()
    }
    RecomendacaoJanela.objects.filter(coleta=collection).delete()
    created_recommendations = []
    for item in recommendations:
        inicio = _parse_datetime(item.get("windowStart"))
        fim = _parse_datetime(item.get("windowEnd"))
        created_recommendations.append(RecomendacaoJanela.objects.create(
            fazenda=farm, talhao=collection.talhao, coleta=collection, data=date.fromisoformat(item["date"]), inicio=inicio, fim=fim,
            adequacao=int(item.get("adequacyIndex", 0)), classificacao=item.get("classification", "unknown"),
            confianca=item.get("confidence", 0), decisao=item.get("decision", "INSUFFICIENT_DATA"),
            fatores=item.get("factors", {}), riscos=item.get("risks", {}), qualidade_dados=item.get("dataQuality", {}),
            metricas=item.get("metrics", {}), proximas_24h=item.get("next24h", {}), proximas_48h=item.get("next48h", {}),
        ))
    new_signatures = {
        (
            item.data.isoformat(),
            timezone.localtime(item.inicio).isoformat(),
            timezone.localtime(item.fim).isoformat(),
            item.adequacao,
            item.decisao,
            json.dumps(item.metricas, sort_keys=True, separators=(",", ":")),
        )
        for item in created_recommendations
    }
    if created_recommendations and new_signatures != old_signatures:
        best = max(created_recommendations, key=lambda item: item.adequacao)
        talhao_name = collection.talhao.nome if collection.talhao else farm.nome
        _create_farm_notification(
            farm,
            request.user,
            NotificacaoFazenda.Tipo.RECOMENDACAO,
            "Análise meteorológica atualizada",
            f"Nova recomendação para {talhao_name}: IEA {best.adequacao}%.",
        )
    return JsonResponse({
        "ok": True, "count": len(created_recommendations),
        "recommendations": [_recommendation_json(item) for item in created_recommendations],
    }, status=201)


@require_POST
def application_create_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados da aplicação ou fazenda inválidos.")
    if not _has_farm_permission(farm, request.user, "record"):
        return _error("Seu perfil não pode registrar aplicações nesta fazenda.", 403)
    talhao = farm.talhoes.filter(pk=data.get("talhao_id"), ativo=True).first() if data.get("talhao_id") is not None else farm.talhoes.filter(nome=data.get("talhao", ""), ativo=True).first()
    if talhao is None:
        return _error("Talhão não encontrado na sua fazenda.", 404)
    try:
        application_date = date.fromisoformat(data["data"])
    except (KeyError, TypeError, ValueError):
        return _error("Informe uma data de aplicação válida.")
    application_time = None
    if data.get("horario"):
        try: application_time = time.fromisoformat(data["horario"])
        except ValueError: return _error("Informe um horário válido.")
    status = str(data.get("status", ExecucaoAplicacao.Status.REALIZADA))
    status_aliases = {
        "REALIZADA": ExecucaoAplicacao.Status.REALIZADA,
        "PLANEJADA": ExecucaoAplicacao.Status.PLANEJADA,
        "CONFIRMADA": ExecucaoAplicacao.Status.CONFIRMADA,
        "CANCELADA": ExecucaoAplicacao.Status.CANCELADA,
    }
    status = status_aliases.get(status.upper(), status)
    if status not in ExecucaoAplicacao.Status.values:
        return _error("Informe um status de aplicação válido.")
    planejamento = None
    if data.get("planejamento_id"):
        planejamento = farm.planejamentos.filter(pk=data.get("planejamento_id")).first()
        if planejamento is None or planejamento.talhao_id != talhao.id:
            return _error("Planejamento não encontrado para este talhão.", 404)
    application = ExecucaoAplicacao.objects.create(
        fazenda=farm, talhao=talhao, planejamento=planejamento,
        recomendacao=planejamento.recomendacao if planejamento else None,
        iea_previsto=planejamento.recomendacao.adequacao if planejamento and planejamento.recomendacao else None,
        produto=str(data.get("produto", "")).strip(),
        tipo_insumo=str(data.get("tipo", "")), dose=str(data.get("dose", "")), quantidade=data.get("quantidade") or None,
        data_aplicacao=application_date, horario=application_time, observacoes=str(data.get("observacoes", "")),
        status=status, criado_por=request.user,
    )
    if planejamento and status == ExecucaoAplicacao.Status.REALIZADA:
        planejamento.status = PlanejamentoAplicacao.Status.EXECUTADA
        planejamento.save(update_fields=["status", "atualizado_em"])
    if application.status == ExecucaoAplicacao.Status.REALIZADA:
        _create_farm_notification(
            farm,
            request.user,
            NotificacaoFazenda.Tipo.APLICACAO,
            "Aplicação registrada",
            f"{request.user.get_full_name() or request.user.username} registrou {application.produto} em {talhao.nome}.",
        )
    return JsonResponse({"ok": True, "application": _application_json(application)}, status=201)


@require_POST
def planejamento_create_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados do planejamento ou fazenda inválidos.")
    if not _has_farm_permission(farm, request.user, "plan"):
        return _error("Seu perfil não pode planejar aplicações nesta fazenda.", 403)
    talhao_id = data.get("talhao_id")
    talhao = farm.talhoes.filter(pk=talhao_id).first() if talhao_id is not None else None
    if talhao is None:
        return _error("Talhão não encontrado ou não pertence à sua fazenda.", 404)
    try:
        data_planejada = date.fromisoformat(str(data.get("data_planejada")))
        horario_inicial = time.fromisoformat(str(data.get("horario_inicial"))) if data.get("horario_inicial") else None
        horario_final = time.fromisoformat(str(data.get("horario_final"))) if data.get("horario_final") else None
    except ValueError:
        return _error("Informe data e horários válidos para o planejamento.")
    recomendacao_id = data.get("recomendacao_id")
    recomendacao = None
    if recomendacao_id:
        recomendacao = farm.recomendacoes.filter(pk=recomendacao_id).first()
        if recomendacao and recomendacao.talhao_id != talhao.id:
            return _error("A recomendação selecionada pertence a outro talhão.", 400)
    dose = data.get("dose")
    try:
        dose_decimal = Decimal(str(dose)) if dose not in (None, "") else None
    except (InvalidOperation, ValueError):
        return _error("Dose do insumo inválida.")
    planejamento = PlanejamentoAplicacao.objects.create(
        fazenda=farm,
        talhao=talhao,
        recomendacao=recomendacao,
        produto=str(data.get("produto", "")).strip(),
        tipo_aplicacao=str(data.get("tipo_aplicacao", "")).strip(),
        dose=dose_decimal,
        unidade_dose=str(data.get("unidade_dose", "")).strip(),
        data_planejada=data_planejada,
        horario_inicial=horario_inicial,
        horario_final=horario_final,
        observacoes=str(data.get("observacoes", "")).strip(),
        responsavel=str(data.get("responsavel", "")).strip(),
        status=PlanejamentoAplicacao.Status.PLANEJADA,
        criado_por=request.user,
    )
    _create_farm_notification(
        farm,
        request.user,
        NotificacaoFazenda.Tipo.PLANEJAMENTO,
        "Aplicação planejada",
        f"{request.user.get_full_name() or request.user.username} planejou {planejamento.produto} para {talhao.nome} em {data_planejada:%d/%m/%Y}.",
    )
    return JsonResponse({"ok": True, "planejamento": _planejamento_json(planejamento)}, status=201)


@require_POST
def aplicacao_exec_api(request, planejamento_id):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Dados da execução inválidos.")
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.")
    if not _has_farm_permission(farm, request.user, "record"):
        return _error("Seu perfil não pode registrar aplicações nesta fazenda.", 403)
    planejamento = farm.planejamentos.filter(pk=planejamento_id).first()
    if not planejamento:
        return _error("Planejamento não encontrado na sua fazenda.", 404)
    try:
        data_real = date.fromisoformat(str(data.get("data_real")))
        horario_real = time.fromisoformat(str(data.get("horario_real"))) if data.get("horario_real") else None
    except ValueError:
        return _error("Informe data e horário reais válidos.")
    quantidade_planejada = data.get("quantidade_planejada")
    quantidade_realizada = data.get("quantidade_realizada")
    try:
        quantidade_realizada_valor = Decimal(str(quantidade_realizada)) if quantidade_realizada not in (None, "") else None
    except (InvalidOperation, ValueError):
        return _error("Quantidade realizada inválida.")
    try:
        quantidade_planejada_valor = Decimal(str(quantidade_planejada)) if quantidade_planejada not in (None, "") else None
    except (InvalidOperation, ValueError):
        return _error("Quantidade planejada inválida.")
    status = str(data.get("status", "EXECUTADA")).upper()
    if status not in {"PLANEJADA", "CONFIRMADA", "EXECUTADA", "CANCELADA"}:
        status = "EXECUTADA"
    app = ExecucaoAplicacao.objects.create(
        fazenda=farm,
        talhao=planejamento.talhao,
        planejamento=planejamento,
        recomendacao=planejamento.recomendacao,
        produto=planejamento.produto,
        tipo_insumo=planejamento.tipo_aplicacao,
        dose=f"{planejamento.dose} {planejamento.unidade_dose}".strip(),
        quantidade=quantidade_planejada_valor,
        quantidade_realizada=quantidade_realizada_valor,
        data_aplicacao=data_real,
        horario=horario_real,
        observacoes=str(data.get("observacoes", "")).strip(),
        iea_previsto=planejamento.recomendacao.adequacao if planejamento.recomendacao else None,
        criado_por=request.user,
        status=ExecucaoAplicacao.Status.REALIZADA if status == "EXECUTADA" else ExecucaoAplicacao.Status.CANCELADA if status == "CANCELADA" else ExecucaoAplicacao.Status.CONFIRMADA if status == "CONFIRMADA" else ExecucaoAplicacao.Status.PLANEJADA,
    )
    planejamento.status = PlanejamentoAplicacao.Status.EXECUTADA if status == "EXECUTADA" else PlanejamentoAplicacao.Status.CANCELADA if status == "CANCELADA" else PlanejamentoAplicacao.Status.CONFIRMADA
    planejamento.save(update_fields=["status", "atualizado_em"])
    if status == "EXECUTADA":
        _create_farm_notification(
            farm,
            request.user,
            NotificacaoFazenda.Tipo.APLICACAO,
            "Aplicação registrada",
            f"{request.user.get_full_name() or request.user.username} registrou {planejamento.produto} em {planejamento.talhao.nome if planejamento.talhao else farm.nome}.",
        )
    dentro_janela = planejamento.dentro_da_janela(data_real, horario_real)
    mensagem = "Aplicação realizada dentro da janela recomendada." if dentro_janela else "Aplicação realizada fora da janela recomendada."
    return JsonResponse({"ok": True, "app": _application_json(app), "dentro_janela": dentro_janela, "mensagem": mensagem}, status=201)


@require_GET
def analytics_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return JsonResponse({"ok": True, "period": {"start": None, "end": None}, "applications": {"total": 0, "executed": 0, "cancelled": 0, "inside_recommended_window": 0, "outside_recommended_window": 0}, "iea": {"average": 0}, "farm": {"monitored_area": 0.0}, "financial": {"potential_savings": None, "status": "insufficient_data"}, "talhoes": []})
    applications = farm.aplicacoes.all()
    total = applications.count()
    executed = applications.filter(status=ExecucaoAplicacao.Status.REALIZADA).count()
    cancelled = applications.filter(status=ExecucaoAplicacao.Status.CANCELADA).count()
    monitored_area = sum((float(t.area_hectares) if t.area_hectares else 0.0) for t in farm.talhoes.filter(ativo=True))
    avg_iea = 0
    if applications.exists():
        values = [float(app.iea_previsto) for app in applications.exclude(iea_previsto__isnull=True) if app.iea_previsto is not None]
        avg_iea = round(sum(values) / len(values), 2) if values else 0
    inside = 0
    outside = 0
    for app in applications.filter(status=ExecucaoAplicacao.Status.REALIZADA):
        if app.recomendacao:
            app_moment = datetime.combine(app.data_aplicacao, app.horario or time.min)
            if app_moment.tzinfo is None:
                app_moment = timezone.make_aware(app_moment, timezone.get_current_timezone())
            inicio = app.recomendacao.inicio
            fim = app.recomendacao.fim
            if inicio.tzinfo is None:
                inicio = timezone.make_aware(inicio, timezone.get_current_timezone())
            if fim.tzinfo is None:
                fim = timezone.make_aware(fim, timezone.get_current_timezone())
            if inicio <= app_moment <= fim:
                inside += 1
            else:
                outside += 1
        else:
            outside += 1
    analytics = {
        "ok": True,
        "period": {"start": None, "end": None},
        "applications": {
            "total": total,
            "executed": executed,
            "cancelled": cancelled,
            "inside_recommended_window": inside,
            "outside_recommended_window": outside,
        },
        "iea": {"average": avg_iea},
        "farm": {"monitored_area": round(monitored_area, 2)},
        "financial": {"potential_savings": None, "status": "insufficient_data"},
        "talhoes": [{"id": talhao.id, "name": talhao.nome, "area": float(talhao.area_hectares or 0), "farm_id": talhao.fazenda_id} for talhao in farm.talhoes.filter(ativo=True)],
    }
    return JsonResponse(analytics)


@require_POST
def talhao_create_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados do talhão ou fazenda inválidos.")
    if not _has_farm_permission(farm, request.user, "manage"):
        return _error("Seu perfil não pode gerenciar os talhões desta fazenda.", 403)
    try:
        latitude = _parse_coordinate(data.get("latitude"), 90)
        longitude = _parse_coordinate(data.get("longitude"), 180)
        talhao = Talhao.objects.create(
            fazenda=farm, nome=str(data.get("nome", "")).strip(), area_hectares=data.get("area") or None,
            cultura=str(data.get("cultura", "")).strip(), latitude=latitude, longitude=longitude,
            raio_metros=int(data.get("raio", 80)),
        )
    except (IntegrityError, InvalidOperation, TypeError, ValueError):
        return _error("Não foi possível cadastrar este talhão.")
    return JsonResponse({"ok": True, "talhao": _talhao_json(talhao)}, status=201)


@require_http_methods(["POST", "PUT"])
def talhao_update_api(request, talhao_id):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    farm = _current_farm(request)
    if not isinstance(data, dict) or not farm:
        return _error("Dados do talhão ou fazenda inválidos.")
    if not _has_farm_permission(farm, request.user, "manage"):
        return _error("Seu perfil não pode gerenciar os talhões desta fazenda.", 403)
    talhao = farm.talhoes.filter(pk=talhao_id).first()
    if not talhao:
        return _error("Talhão não encontrado.", 404)
    try:
        talhao.nome = str(data.get("nome", talhao.nome)).strip() or talhao.nome
        talhao.area_hectares = data.get("area") if data.get("area") is not None else talhao.area_hectares
        talhao.cultura = str(data.get("cultura", talhao.cultura)).strip() or talhao.cultura
        talhao.latitude = _parse_coordinate(data.get("latitude"), 90) if data.get("latitude") is not None else talhao.latitude
        talhao.longitude = _parse_coordinate(data.get("longitude"), 180) if data.get("longitude") is not None else talhao.longitude
        talhao.raio_metros = int(data.get("raio", talhao.raio_metros))
        talhao.save()
    except (IntegrityError, InvalidOperation, TypeError, ValueError):
        return _error("Não foi possível atualizar este talhão.")
    return JsonResponse({"ok": True, "talhao": _talhao_json(talhao)})


@require_http_methods(["POST", "DELETE"])
def talhao_delete_api(request, talhao_id):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.")
    if not _has_farm_permission(farm, request.user, "manage"):
        return _error("Seu perfil não pode gerenciar os talhões desta fazenda.", 403)
    talhao = farm.talhoes.filter(pk=talhao_id).first()
    if not talhao:
        return _error("Talhão não encontrado.", 404)
    talhao.delete()
    return JsonResponse({"ok": True, "deleted_id": talhao_id})


@require_POST
def profile_update_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Dados do perfil inválidos.")
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    phone = re.sub(r"\D", "", str(data.get("phone", "")))
    if not name or not email:
        return _error("Nome e e-mail são obrigatórios.")
    farm = _current_farm(request)
    if "farm" in data and farm and not _has_farm_permission(farm, request.user, "manage"):
        return _error("Seu perfil não pode alterar os dados desta fazenda.", 403)
    try:
        validate_email(email)
    except ValidationError:
        return _error("Informe um e-mail válido.")
    if User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).exclude(pk=request.user.pk).exists():
        return _error("Este e-mail já está vinculado a outro usuário.")
    request.user.first_name, *last_name = name.split(maxsplit=1)
    request.user.last_name = last_name[0] if last_name else ""
    request.user.email = email
    if "@" in request.user.username:
        request.user.username = email
    request.user.save(update_fields=["first_name", "last_name", "email", "username"])
    perfil, _ = PerfilProdutor.objects.get_or_create(usuario=request.user, defaults={"nome_completo": name, "telefone": phone})
    perfil.nome_completo = name
    perfil.telefone = phone or perfil.telefone
    perfil.save()
    if farm and data.get("farm"):
        farm.nome = str(data["farm"]).strip()
        farm.save(update_fields=["nome", "atualizada_em"])
    return JsonResponse({"ok": True, "name": name, "email": email, "phone": perfil.telefone, "farm": farm.nome if farm else "Sem fazenda cadastrada"})


@require_POST
def logout_api(request):
    logout(request)
    return redirect("dashboard:login")


@require_POST
def login_api(request):
    data = _json_body(request)
    if data is None:
        return _error("Dados de acesso inválidos.")
    identifier = str(data.get("email", "")).strip()
    password = str(data.get("password", ""))
    user_record = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()
    user = authenticate(request, username=user_record.username, password=password) if user_record else None
    if user is None:
        return _error("E-mail ou senha incorretos.", 401)
    pending_token = request.session.get("pending_invitation_token")
    login(request, user)
    if not data.get("remember_me"):
        request.session.set_expiry(0)
    redirect_url = "/dashboard/"
    if pending_token:
        invitation = ConviteFazenda.objects.filter(
            token_digest=hashlib.sha256(pending_token.encode("utf-8")).hexdigest(),
            status=ConviteFazenda.Status.PENDENTE,
            email__iexact=user.email,
        ).first()
        if invitation and invitation.expira_em > timezone.now():
            redirect_url = reverse("dashboard:accept_invitation", args=[pending_token])
        else:
            request.session.pop("pending_invitation_token", None)
    return JsonResponse({"ok": True, "redirect_url": redirect_url})


@require_POST
def password_reset_api(request):
    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Informe um e-mail válido.")
    email = str(data.get("email", "")).strip().lower()
    if not email:
        return _error("Informe um e-mail válido.")
    if not settings.EMAIL_HOST or not settings.DEFAULT_FROM_EMAIL or (settings.EMAIL_USE_TLS and settings.EMAIL_USE_SSL):
        return _error("A redefinição de senha não está disponível: configure o serviço SMTP.", 503)
    form = PasswordResetForm({"email": email})
    if not form.is_valid():
        return _error("Informe um e-mail válido.")
    try:
        form.save(
            request=request,
            from_email=settings.DEFAULT_FROM_EMAIL,
            subject_template_name="registration/password_reset_subject.txt",
            email_template_name="registration/password_reset_email.txt",
            use_https=request.is_secure(),
        )
    except (OSError, smtplib.SMTPException, ValueError) as error:
        return _error(f"Não foi possível enviar as instruções de redefinição: {error}", 503)
    return JsonResponse({
        "ok": True,
        "message": "Se houver uma conta vinculada a este e-mail, as instruções serão enviadas.",
    })


@require_POST
def cadastro_api(request):
    data = _json_body(request)
    if not isinstance(data, dict):
        return _error("Dados do cadastro inválidos.")
    errors = {}

    def required(field, label):
        value = str(data.get(field, "")).strip()
        if not value:
            errors[field] = f"Informe {label}."
        return value

    nome = required("nome", "seu nome completo")
    email = required("email", "um e-mail").lower()
    telefone = re.sub(r"\D", "", str(data.get("telefone", "")))
    senha = str(data.get("senha", ""))
    skip_farm = data.get("skip_farm") is True
    nome_fazenda = "" if skip_farm else required("nome_fazenda", "o nome da fazenda")
    estado = "" if skip_farm else required("estado", "o estado").upper()
    cidade = "" if skip_farm else required("cidade", "a cidade")
    bairro = "" if skip_farm else required("bairro", "o bairro ou distrito")
    cep = "" if skip_farm else re.sub(r"\D", "", str(data.get("cep", "")))
    culturas = [] if skip_farm else data.get("culturas", [])
    tipo_cultivo = "" if skip_farm else str(data.get("tipo_cultivo", ""))
    irrigacao = "" if skip_farm else str(data.get("irrigacao", ""))
    funcao = "" if skip_farm else str(data.get("funcao", ""))
    if len(nome.split()) < 2: errors["nome"] = "Informe nome e sobrenome."
    try: validate_email(email)
    except ValidationError: errors["email"] = "Informe um e-mail válido."
    if len(telefone) not in (10, 11): errors["telefone"] = "Informe um telefone com DDD válido."
    if not skip_farm:
        if len(cep) != 8: errors["cep"] = "Informe um CEP válido."
        if len(estado) != 2: errors["estado"] = "Selecione uma UF válida."
        if not isinstance(culturas, list) or not culturas: errors["culturas"] = "Selecione ao menos uma cultura."
        if tipo_cultivo not in Fazenda.TipoCultivo.values: errors["tipo_cultivo"] = "Selecione um tipo de cultivo válido."
        if irrigacao not in Fazenda.Irrigacao.values: errors["irrigacao"] = "Selecione um sistema de irrigação válido."
        if funcao not in MembroFazenda.Funcao.values: errors["funcao"] = "Selecione sua função na fazenda."
        try:
            area = Decimal(str(data.get("area_hectares", "")))
            if area <= 0: raise InvalidOperation
        except (InvalidOperation, ValueError): errors["area_hectares"] = "Informe uma área maior que zero."
        try:
            talhoes = int(data.get("quantidade_talhoes", 0))
            if talhoes < 1: raise ValueError
        except (ValueError, TypeError): errors["quantidade_talhoes"] = "Informe ao menos um talhão."
    try: validate_password(senha)
    except ValidationError as exc: errors["senha"] = " ".join(exc.messages)
    if not re.search(r"[A-Za-z]", senha) or not re.search(r"\d", senha): errors["senha"] = "A senha deve ter letras e números."
    if errors:
        return _error("Revise os campos destacados.", field_errors=errors)
    if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
        return _error("Já existe uma conta com este e-mail.", field_errors={"email": "Este e-mail já está cadastrado."})
    try:
        with transaction.atomic():
            first_name, *last_name = nome.split(maxsplit=1)
            user = User.objects.create_user(username=email, email=email, password=senha, first_name=first_name, last_name=last_name[0] if last_name else "")
            PerfilProdutor.objects.create(usuario=user, nome_completo=nome, telefone=telefone)
            if not skip_farm:
                farm = Fazenda.objects.create(produtor=user, nome=nome_fazenda, cep=cep, estado=estado, cidade=cidade, bairro=bairro, endereco=str(data.get("endereco", "")).strip(), area_hectares=area, quantidade_talhoes=talhoes, culturas=culturas, tipo_cultivo=tipo_cultivo, irrigacao=irrigacao)
                MembroFazenda.objects.create(
                    fazenda=farm,
                    usuario=user,
                    funcao=funcao,
                )
                Talhao.objects.bulk_create([Talhao(fazenda=farm, nome=f"Talhão {index:02d}") for index in range(1, talhoes + 1)])
    except IntegrityError:
        return _error("Já existe uma conta ou fazenda com estes dados.")
    login(request, user)
    return JsonResponse({"ok": True, "redirect_url": "/dashboard/"}, status=201)


@require_http_methods(["GET", "POST"])
def estoque_produtos_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.", 404)
    if not _has_farm_permission(farm, request.user, "view"):
        return _error("Acesso negado.", 403)

    if request.method == "POST":
        if not _has_farm_permission(farm, request.user, "manage"):
            return _error("Acesso negado para gerenciar estoque.", 403)
        data = _json_body(request)
        if not data:
            return _error("Dados inválidos.")
            
        nome = str(data.get("nome", "")).strip()
        categoria = str(data.get("categoria", "")).strip()
        unidade = str(data.get("unidade", "")).strip()
        
        if not nome or not categoria or not unidade:
            return _error("Nome, categoria e unidade são obrigatórios.")
            
        try:
            estoque_minimo = Decimal(str(data.get("estoque_minimo", 0)))
        except (ValueError, TypeError, InvalidOperation):
            estoque_minimo = Decimal("0")
            
        produto = Produto.objects.create(
            fazenda=farm,
            nome=nome,
            categoria=categoria,
            unidade=unidade,
            estoque_minimo=estoque_minimo,
            local_armazenamento=str(data.get("local_armazenamento", "")).strip(),
            observacao=str(data.get("observacao", "")).strip(),
            quantidade_atual=Decimal("0")
        )
        
        # Opcional: Estoque inicial
        try:
            estoque_inicial = Decimal(str(data.get("estoque_inicial", 0)))
            if estoque_inicial > 0:
                with transaction.atomic():
                    MovimentacaoEstoque.objects.create(
                        produto=produto,
                        tipo=MovimentacaoEstoque.Tipo.ENTRADA,
                        quantidade=estoque_inicial,
                        motivo="Cadastro / Saldo Inicial",
                        data=timezone.now().date(),
                        observacao="Estoque inicial no momento do cadastro.",
                        criado_por=request.user
                    )
                    produto.quantidade_atual = estoque_inicial
                    produto.save()
        except (ValueError, TypeError, InvalidOperation):
            pass

        return JsonResponse({"ok": True, "produto_id": produto.id})

    # GET
    produtos = Produto.objects.filter(fazenda=farm, ativo=True).order_by("nome")
    return JsonResponse({
        "ok": True,
        "produtos": [{
            "id": p.id,
            "nome": p.nome,
            "categoria": p.categoria,
            "unidade": p.unidade,
            "estoque_minimo": float(p.estoque_minimo),
            "quantidade_atual": float(p.quantidade_atual),
            "local_armazenamento": p.local_armazenamento,
            "observacao": p.observacao,
            "status": "danger" if p.quantidade_atual == 0 else ("warning" if p.quantidade_atual <= p.estoque_minimo else "success")
        } for p in produtos]
    })


@require_http_methods(["GET", "POST"])
def estoque_movimentacoes_api(request):
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.", 404)

    if request.method == "POST":
        if not _has_farm_permission(farm, request.user, "record"):
            return _error("Acesso negado para registrar movimentações.", 403)
        data = _json_body(request)
        if not data:
            return _error("Dados inválidos.")
            
        try:
            produto_id = int(data.get("produto_id"))
            produto = Produto.objects.get(id=produto_id, fazenda=farm, ativo=True)
        except (ValueError, TypeError, Produto.DoesNotExist):
            return _error("Produto não encontrado.")
            
        tipo = data.get("tipo")
        if tipo not in ["ENTRADA", "SAIDA"]:
            return _error("Tipo de movimentação inválido.")
            
        try:
            quantidade = Decimal(str(data.get("quantidade", 0)))
            if quantidade <= 0:
                return _error("Quantidade deve ser maior que zero.")
        except (ValueError, TypeError, InvalidOperation):
            return _error("Quantidade inválida.")
            
        motivo = str(data.get("motivo", "")).strip()
        if not motivo:
            return _error("Motivo é obrigatório.")
            
        try:
            data_mov = datetime.strptime(data.get("data", ""), "%Y-%m-%d").date()
        except ValueError:
            data_mov = timezone.now().date()
            
        talhao_id = data.get("talhao_id")
        talhao_obj = None
        if motivo == "Aplicação" and talhao_id:
            try:
                talhao_obj = Talhao.objects.get(id=int(talhao_id), fazenda=farm)
            except (ValueError, TypeError, Talhao.DoesNotExist):
                return _error("Talhão não encontrado.")
                
        try:
            with transaction.atomic():
                produto = Produto.objects.select_for_update().get(id=produto_id)
                
                if tipo == "SAIDA" and produto.quantidade_atual < quantidade:
                    return _error(f"Quantidade insuficiente. Estoque atual: {produto.quantidade_atual} {produto.unidade}")
                
                if tipo == "ENTRADA":
                    produto.quantidade_atual += quantidade
                else:
                    produto.quantidade_atual -= quantidade
                    
                produto.save()
                
                valor_str = data.get("valor", "")
                valor = None
                if valor_str:
                    try:
                        valor = Decimal(str(valor_str))
                    except (ValueError, TypeError, InvalidOperation):
                        pass
                
                mov = MovimentacaoEstoque.objects.create(
                    produto=produto,
                    tipo=tipo,
                    quantidade=quantidade,
                    motivo=motivo,
                    data=data_mov,
                    talhao=talhao_obj,
                    fornecedor=str(data.get("fornecedor", "")).strip(),
                    valor=valor,
                    observacao=str(data.get("observacao", "")).strip(),
                    criado_por=request.user
                )
                
                # Opcional: Se for aplicação e tiver talhão, registrar também em ExecucaoAplicacao para o histórico de aplicações
                if tipo == "SAIDA" and motivo == "Aplicação" and talhao_obj:
                    ExecucaoAplicacao.objects.create(
                        fazenda=farm,
                        talhao=talhao_obj,
                        status="done",
                        produto=produto.nome,
                        tipo_insumo=produto.categoria,
                        quantidade_realizada=quantidade,
                        data_aplicacao=data_mov,
                        observacoes=f"Registrado via módulo de Estoque. Movimentação #{mov.id}",
                        criado_por=request.user
                    )
                    
            return JsonResponse({"ok": True, "movimentacao_id": mov.id, "novo_estoque": float(produto.quantidade_atual)})
        except Exception as e:
            return _error("Erro ao registrar movimentação: " + str(e))

    # GET - Listar movimentações
    if not _has_farm_permission(farm, request.user, "view"):
        return _error("Acesso negado.", 403)
        
    movimentacoes = MovimentacaoEstoque.objects.filter(produto__fazenda=farm).select_related('produto', 'talhao', 'criado_por').order_by('-data', '-criado_em')[:100]
    
    return JsonResponse({
        "ok": True,
        "movimentacoes": [{
            "id": m.id,
            "produto_nome": m.produto.nome,
            "produto_unidade": m.produto.unidade,
            "produto_categoria": m.produto.categoria,
            "tipo": m.tipo,
            "quantidade": float(m.quantidade),
            "motivo": m.motivo,
            "data": m.data.isoformat(),
            "talhao_nome": m.talhao.nome if m.talhao else None,
            "observacao": m.observacao,
            "usuario": m.criado_por.get_full_name() or m.criado_por.username if m.criado_por else ""
        } for m in movimentacoes]
    })


@require_GET
def estoque_dashboard_api(request):
    from django.db.models import Count, Sum, F
    
    if not request.user.is_authenticated:
        return _error("Autenticação necessária.", 401)
    farm = _current_farm(request)
    if not farm:
        return _error("Fazenda não encontrada.", 404)
    if not _has_farm_permission(farm, request.user, "view"):
        return _error("Acesso negado.", 403)

    # 1. Resumo e Alertas
    produtos = Produto.objects.filter(fazenda=farm, ativo=True)
    total_produtos = produtos.count()
    
    # Avaliando estoques na memória para facilitar a lógica de status
    # já que não há muitos produtos, mas pode ser feito no BD
    alertas = []
    estoque_baixo = 0
    sem_estoque = 0
    
    for p in produtos:
        if p.quantidade_atual == 0:
            sem_estoque += 1
            alertas.append({
                "produto_id": p.id,
                "produto": p.nome,
                "quantidade": float(p.quantidade_atual),
                "estoque_minimo": float(p.estoque_minimo),
                "unidade": p.unidade,
                "situacao": "danger"
            })
        elif p.quantidade_atual <= p.estoque_minimo:
            estoque_baixo += 1
            alertas.append({
                "produto_id": p.id,
                "produto": p.nome,
                "quantidade": float(p.quantidade_atual),
                "estoque_minimo": float(p.estoque_minimo),
                "unidade": p.unidade,
                "situacao": "warning"
            })
            
    # 2. Categorias
    categorias_agrupadas = produtos.values('categoria').annotate(quantidade=Count('id')).order_by('-quantidade')
    categorias = [{"nome": c['categoria'], "quantidade": c['quantidade']} for c in categorias_agrupadas]

    # 3. Movimentações nos últimos 30 dias
    hoje = timezone.now().date()
    trinta_dias_atras = hoje - timedelta(days=30)
    movimentacoes_30d = MovimentacaoEstoque.objects.filter(
        produto__fazenda=farm,
        data__gte=trinta_dias_atras
    )
    
    entradas_agrupadas = movimentacoes_30d.filter(tipo="ENTRADA").values('data').annotate(total=Sum('quantidade')).order_by('data')
    saidas_agrupadas = movimentacoes_30d.filter(tipo="SAIDA").values('data').annotate(total=Sum('quantidade')).order_by('data')
    
    # 4. Consumo por Talhão (somente Saídas com motivo 'Aplicação' e com talhão definido)
    consumo = MovimentacaoEstoque.objects.filter(
        produto__fazenda=farm, 
        tipo="SAIDA", 
        motivo="Aplicação",
        talhao__isnull=False
    ).values('talhao__nome').annotate(total=Sum('quantidade')).order_by('-total')
    
    consumo_talhoes = [{"talhao": c['talhao__nome'], "quantidade": float(c['total'])} for c in consumo]

    # 5. Movimentações Recentes (últimas 8)
    recentes = MovimentacaoEstoque.objects.filter(produto__fazenda=farm).select_related('produto', 'talhao').order_by('-data', '-criado_em')[:8]
    movimentacoes_recentes = [{
        "id": m.id,
        "data": m.data.isoformat(),
        "produto": m.produto.nome,
        "tipo": m.tipo,
        "quantidade": float(m.quantidade),
        "unidade": m.produto.unidade,
        "motivo": m.motivo,
        "talhao": m.talhao.nome if m.talhao else None
    } for m in recentes]

    return JsonResponse({
        "ok": True,
        "resumo": {
            "total_produtos": total_produtos,
            "estoque_baixo": estoque_baixo,
            "sem_estoque": sem_estoque,
            "movimentacoes_30d": movimentacoes_30d.count()
        },
        "categorias": categorias,
        "alertas": alertas,
        "movimentacoes_periodo": {
            "entradas": [{"data": e['data'].isoformat(), "total": float(e['total'])} for e in entradas_agrupadas],
            "saidas": [{"data": s['data'].isoformat(), "total": float(s['total'])} for s in saidas_agrupadas]
        },
        "consumo_talhoes": consumo_talhoes,
        "movimentacoes_recentes": movimentacoes_recentes
    })
