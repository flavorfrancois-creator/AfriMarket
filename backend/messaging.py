"""Message templates (FR/EN/ES), sending through in-app + email; admin-configured email / SMS / WhatsApp providers."""
import asyncio
import logging
import os
import re
import smtplib
from email.message import EmailMessage
from html import escape
from typing import Optional

import httpx
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db, new_id, now_iso
from rbac import require_module

logger = logging.getLogger("messaging")
router = APIRouter(prefix="/api")
LANGS = ("fr", "en", "es")
_cipher = Fernet(os.environ["EMAIL_ENCRYPTION_KEY"].encode())

# key, audience, label, variables, {lang: (subject, body)}
T = [
    # ---------- Authentication ----------
    ("auth_verify_email", "auth", "Vérification de l'adresse e-mail", ["name", "code"], {
        "fr": ("Votre code de vérification", "Bonjour {name},\nVotre code de vérification est : {code}\nIl expire dans 30 minutes."),
        "en": ("Your verification code", "Hello {name},\nYour verification code is: {code}\nIt expires in 30 minutes."),
        "es": ("Su código de verificación", "Hola {name},\nSu código de verificación es: {code}\nCaduca en 30 minutos.")}),
    ("auth_otp", "auth", "Code OTP de connexion (2FA)", ["name", "code"], {
        "fr": ("Votre code de connexion", "Bonjour {name},\nVotre code de connexion est : {code}\nIl expire dans 10 minutes. Ne le partagez avec personne."),
        "en": ("Your login code", "Hello {name},\nYour login code is: {code}\nIt expires in 10 minutes. Never share it."),
        "es": ("Su código de acceso", "Hola {name},\nSu código de acceso es: {code}\nCaduca en 10 minutos. No lo comparta.")}),
    ("auth_password_reset", "auth", "Réinitialisation du mot de passe", ["name", "link"], {
        "fr": ("Réinitialisez votre mot de passe", "Bonjour {name},\nPour choisir un nouveau mot de passe, ouvrez ce lien : {link}\nIl expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message."),
        "en": ("Reset your password", "Hello {name},\nTo choose a new password, open this link: {link}\nIt expires in 1 hour. If you did not request it, ignore this message."),
        "es": ("Restablezca su contraseña", "Hola {name},\nPara elegir una nueva contraseña, abra este enlace: {link}\nCaduca en 1 hora. Si no lo solicitó, ignore este mensaje.")}),
    ("auth_password_changed", "auth", "Mot de passe modifié", ["name"], {
        "fr": ("Votre mot de passe a été modifié", "Bonjour {name},\nLe mot de passe de votre compte vient d'être modifié. Si ce n'est pas vous, contactez-nous immédiatement."),
        "en": ("Your password was changed", "Hello {name},\nYour account password was just changed. If this wasn't you, contact us immediately."),
        "es": ("Su contraseña fue modificada", "Hola {name},\nLa contraseña de su cuenta acaba de cambiar. Si no fue usted, contáctenos de inmediato.")}),
    ("auth_new_login", "auth", "Alerte nouvelle connexion", ["name", "ip", "device", "date"], {
        "fr": ("Nouvelle connexion à votre compte", "Bonjour {name},\nNouvelle connexion le {date} depuis {device} (IP {ip}). Si ce n'est pas vous, changez votre mot de passe."),
        "en": ("New sign-in to your account", "Hello {name},\nNew sign-in on {date} from {device} (IP {ip}). If this wasn't you, change your password."),
        "es": ("Nuevo inicio de sesión", "Hola {name},\nNuevo inicio de sesión el {date} desde {device} (IP {ip}). Si no fue usted, cambie su contraseña.")}),
    ("auth_account_approved", "auth", "Compte partenaire validé", ["name"], {
        "fr": ("Votre compte est validé", "Bonjour {name},\nVotre compte a été validé par l'administrateur. Vous pouvez maintenant vous connecter."),
        "en": ("Your account is approved", "Hello {name},\nYour account has been approved. You can now sign in."),
        "es": ("Su cuenta ha sido validada", "Hola {name},\nSu cuenta ha sido validada. Ya puede iniciar sesión.")}),
    ("auth_account_rejected", "auth", "Inscription refusée", ["name"], {
        "fr": ("Votre inscription n'a pas été retenue", "Bonjour {name},\nVotre demande d'inscription n'a pas été validée. Contactez-nous pour plus d'informations."),
        "en": ("Your registration was declined", "Hello {name},\nYour registration request was not approved. Contact us for more information."),
        "es": ("Su registro fue rechazado", "Hola {name},\nSu solicitud de registro no fue aprobada. Contáctenos para más información.")}),
    ("auth_account_suspended", "auth", "Compte suspendu", ["name"], {
        "fr": ("Votre compte est suspendu", "Bonjour {name},\nVotre compte a été suspendu par un administrateur."),
        "en": ("Your account is suspended", "Hello {name},\nYour account has been suspended by an administrator."),
        "es": ("Su cuenta está suspendida", "Hola {name},\nSu cuenta ha sido suspendida por un administrador.")}),
    ("auth_account_reactivated", "auth", "Compte réactivé", ["name"], {
        "fr": ("Votre compte est réactivé", "Bonjour {name},\nVotre compte est de nouveau actif."),
        "en": ("Your account is reactivated", "Hello {name},\nYour account is active again."),
        "es": ("Su cuenta está reactivada", "Hola {name},\nSu cuenta vuelve a estar activa.")}),
    # ---------- Clients ----------
    ("client_order_confirmed", "client", "Commande confirmée", ["name", "ref", "total"], {
        "fr": ("Commande {ref} confirmée", "Bonjour {name},\nMerci pour votre commande {ref} d'un montant de {total}. Nous vous tiendrons informé de chaque étape."),
        "en": ("Order {ref} confirmed", "Hello {name},\nThank you for your order {ref} ({total}). We will keep you informed at every step."),
        "es": ("Pedido {ref} confirmado", "Hola {name},\nGracias por su pedido {ref} ({total}). Le informaremos en cada etapa.")}),
    ("client_order_approved", "client", "Commande approuvée par la boutique", ["ref"], {
        "fr": ("Commande {ref} approuvée", "Votre commande {ref} a été approuvée par la boutique."),
        "en": ("Order {ref} approved", "Your order {ref} was approved by the shop."),
        "es": ("Pedido {ref} aprobado", "Su pedido {ref} fue aprobado por la tienda.")}),
    ("client_order_preparing", "client", "Commande en préparation", ["ref"], {
        "fr": ("Commande {ref} en préparation", "Votre commande {ref} est en cours de préparation."),
        "en": ("Order {ref} being prepared", "Your order {ref} is being prepared."),
        "es": ("Pedido {ref} en preparación", "Su pedido {ref} está en preparación.")}),
    ("client_order_ready", "client", "Commande prête à expédier", ["ref"], {
        "fr": ("Commande {ref} prête", "Votre commande {ref} est prête et sera bientôt expédiée."),
        "en": ("Order {ref} ready", "Your order {ref} is ready and will ship soon."),
        "es": ("Pedido {ref} listo", "Su pedido {ref} está listo y se enviará pronto.")}),
    ("client_order_shipped", "client", "Commande expédiée", ["ref", "carrier", "tracking"], {
        "fr": ("Commande {ref} expédiée", "Votre commande {ref} est expédiée avec {carrier}. N° de suivi : {tracking}."),
        "en": ("Order {ref} shipped", "Your order {ref} shipped with {carrier}. Tracking number: {tracking}."),
        "es": ("Pedido {ref} enviado", "Su pedido {ref} fue enviado con {carrier}. Número de seguimiento: {tracking}.")}),
    ("client_parcel_at_relay", "client", "Colis arrivé à un point relais (étape)", ["ref", "location"], {
        "fr": ("Votre colis {ref} progresse", "Colis {ref} : arrivé à {location}."),
        "en": ("Your parcel {ref} is on its way", "Parcel {ref}: arrived at {location}."),
        "es": ("Su paquete {ref} avanza", "Paquete {ref}: llegó a {location}.")}),
    ("client_parcel_available", "client", "Colis disponible au point relais", ["ref", "location", "code"], {
        "fr": ("Votre colis {ref} vous attend", "Votre colis {ref} est disponible au point relais {location}. Confirmez la réception avec votre code {code}."),
        "en": ("Your parcel {ref} is waiting for you", "Your parcel {ref} is available at the relay point {location}. Confirm receipt with your code {code}."),
        "es": ("Su paquete {ref} le espera", "Su paquete {ref} está disponible en el punto de recogida {location}. Confirme la recepción con su código {code}.")}),
    ("client_parcel_local_courier", "client", "Colis remis au livreur local", ["ref", "courier", "phone", "code"], {
        "fr": ("Votre colis {ref} est en livraison", "Votre colis {ref} a été remis au livreur local {courier} ({phone}). Confirmez la réception avec votre code {code}."),
        "en": ("Your parcel {ref} is out for delivery", "Your parcel {ref} was handed to local courier {courier} ({phone}). Confirm receipt with your code {code}."),
        "es": ("Su paquete {ref} está en reparto", "Su paquete {ref} fue entregado al repartidor local {courier} ({phone}). Confirme la recepción con su código {code}.")}),
    ("client_order_delivered", "client", "Commande livrée", ["ref"], {
        "fr": ("Commande {ref} livrée", "Votre commande {ref} est livrée. Merci de votre confiance !"),
        "en": ("Order {ref} delivered", "Your order {ref} has been delivered. Thank you!"),
        "es": ("Pedido {ref} entregado", "Su pedido {ref} ha sido entregado. ¡Gracias!")}),
    ("client_order_cancelled", "client", "Commande annulée et remboursée", ["ref", "refund"], {
        "fr": ("Commande {ref} annulée", "Votre commande {ref} est annulée. Montant remboursé sur votre solde : {refund}."),
        "en": ("Order {ref} cancelled", "Your order {ref} is cancelled. Amount refunded to your balance: {refund}."),
        "es": ("Pedido {ref} cancelado", "Su pedido {ref} fue cancelado. Importe reembolsado a su saldo: {refund}.")}),
    ("client_customs_due", "client", "Douane à payer à la livraison", ["ref", "amount"], {
        "fr": ("Douane à régler – commande {ref}", "Des frais de douane de {amount} seront à régler à la livraison de votre commande {ref}."),
        "en": ("Customs due – order {ref}", "Customs fees of {amount} are payable on delivery of your order {ref}."),
        "es": ("Aduana a pagar – pedido {ref}", "Los gastos de aduana de {amount} se pagarán a la entrega de su pedido {ref}.")}),
    ("client_earnings_validated", "client", "Gains validés", ["amount"], {
        "fr": ("Vos gains sont disponibles", "Vos gains de {amount} ont été validés et sont disponibles sur votre solde."),
        "en": ("Your earnings are available", "Your earnings of {amount} were validated and are now available."),
        "es": ("Sus ganancias están disponibles", "Sus ganancias de {amount} fueron validadas y están disponibles.")}),
    ("client_earnings_rejected", "client", "Gains refusés", ["amount", "reason"], {
        "fr": ("Gains refusés", "Vos gains de {amount} n'ont pas été validés. Motif : {reason}."),
        "en": ("Earnings rejected", "Your earnings of {amount} were not validated. Reason: {reason}."),
        "es": ("Ganancias rechazadas", "Sus ganancias de {amount} no fueron validadas. Motivo: {reason}.")}),
    ("client_withdrawal_processed", "client", "Retrait traité", ["amount", "status"], {
        "fr": ("Votre demande de retrait", "Votre demande de retrait de {amount} est : {status}."),
        "en": ("Your withdrawal request", "Your withdrawal request of {amount} is: {status}."),
        "es": ("Su solicitud de retiro", "Su solicitud de retiro de {amount} está: {status}.")}),
    # ---------- Merchants ----------
    ("merchant_new_order", "merchant", "Nouvelle commande", ["ref", "total", "customer"], {
        "fr": ("Nouvelle commande {ref}", "Nouvelle commande {ref} de {customer} pour {total}. Pensez à l'approuver rapidement."),
        "en": ("New order {ref}", "New order {ref} from {customer} for {total}. Please approve it quickly."),
        "es": ("Nuevo pedido {ref}", "Nuevo pedido {ref} de {customer} por {total}. Apruébelo rápidamente.")}),
    ("merchant_payment_received", "merchant", "Paiement reçu", ["ref", "amount"], {
        "fr": ("Paiement reçu – {ref}", "Le paiement de {amount} pour la commande {ref} a été reçu."),
        "en": ("Payment received – {ref}", "Payment of {amount} for order {ref} was received."),
        "es": ("Pago recibido – {ref}", "Se recibió el pago de {amount} del pedido {ref}.")}),
    ("merchant_order_cancelled", "merchant", "Commande annulée", ["ref"], {
        "fr": ("Commande {ref} annulée", "La commande {ref} a été annulée. Le stock a été restauré."),
        "en": ("Order {ref} cancelled", "Order {ref} was cancelled. Stock has been restored."),
        "es": ("Pedido {ref} cancelado", "El pedido {ref} fue cancelado. El stock fue restaurado.")}),
    ("merchant_parcel_picked", "merchant", "Colis pris en charge / en route", ["ref", "location"], {
        "fr": ("Colis {ref} en route", "Le colis {ref} est en route : {location}."),
        "en": ("Parcel {ref} on its way", "Parcel {ref} is on its way: {location}."),
        "es": ("Paquete {ref} en camino", "El paquete {ref} está en camino: {location}.")}),
    ("merchant_parcel_available", "merchant", "Colis disponible au point relais", ["ref", "location"], {
        "fr": ("Colis {ref} au point relais", "Le colis {ref} est disponible pour le client au point relais {location}."),
        "en": ("Parcel {ref} at relay point", "Parcel {ref} is available for the customer at {location}."),
        "es": ("Paquete {ref} en punto de recogida", "El paquete {ref} está disponible para el cliente en {location}.")}),
    ("merchant_order_delivered", "merchant", "Colis livré", ["ref"], {
        "fr": ("Commande {ref} livrée", "La commande {ref} a été remise au client."),
        "en": ("Order {ref} delivered", "Order {ref} was delivered to the customer."),
        "es": ("Pedido {ref} entregado", "El pedido {ref} fue entregado al cliente.")}),
    ("merchant_payout_credited", "merchant", "Reversement crédité", ["ref", "amount"], {
        "fr": ("Reversement crédité", "Reversement de {amount} crédité pour la commande {ref}."),
        "en": ("Payout credited", "Payout of {amount} credited for order {ref}."),
        "es": ("Pago acreditado", "Pago de {amount} acreditado por el pedido {ref}.")}),
    ("merchant_product_approved", "merchant", "Produit approuvé", ["product"], {
        "fr": ("Produit approuvé", "Votre produit « {product} » est approuvé et visible en boutique."),
        "en": ("Product approved", "Your product \"{product}\" is approved and visible."),
        "es": ("Producto aprobado", "Su producto «{product}» fue aprobado y está visible.")}),
    ("merchant_product_rejected", "merchant", "Produit refusé / retiré", ["product", "reason"], {
        "fr": ("Produit refusé", "Votre produit « {product} » a été refusé ou retiré. Motif : {reason}."),
        "en": ("Product rejected", "Your product \"{product}\" was rejected or removed. Reason: {reason}."),
        "es": ("Producto rechazado", "Su producto «{product}» fue rechazado o retirado. Motivo: {reason}.")}),
    ("merchant_low_stock", "merchant", "Stock faible", ["product", "stock"], {
        "fr": ("Stock faible : {product}", "Il ne reste que {stock} unité(s) de « {product} »."),
        "en": ("Low stock: {product}", "Only {stock} unit(s) of \"{product}\" left."),
        "es": ("Stock bajo: {product}", "Solo quedan {stock} unidad(es) de «{product}».")}),
    ("merchant_shop_suspended", "merchant", "Boutique suspendue", ["shop", "reason"], {
        "fr": ("Boutique suspendue", "Votre boutique « {shop} » est suspendue. Motif : {reason}."),
        "en": ("Shop suspended", "Your shop \"{shop}\" is suspended. Reason: {reason}."),
        "es": ("Tienda suspendida", "Su tienda «{shop}» está suspendida. Motivo: {reason}.")}),
    ("merchant_shop_reactivated", "merchant", "Boutique réactivée", ["shop"], {
        "fr": ("Boutique réactivée", "Votre boutique « {shop} » est de nouveau active."),
        "en": ("Shop reactivated", "Your shop \"{shop}\" is active again."),
        "es": ("Tienda reactivada", "Su tienda «{shop}» vuelve a estar activa.")}),
    # ---------- Carriers ----------
    ("carrier_new_parcel", "carrier", "Nouveau colis confié", ["ref", "shop", "destination"], {
        "fr": ("Nouveau colis {ref}", "Un nouveau colis {ref} de {shop} vous est confié, destination : {destination}."),
        "en": ("New parcel {ref}", "A new parcel {ref} from {shop} is assigned to you, destination: {destination}."),
        "es": ("Nuevo paquete {ref}", "Se le asignó un nuevo paquete {ref} de {shop}, destino: {destination}.")}),
    ("carrier_parcel_ready", "carrier", "Colis prêt à enlever", ["ref", "shop", "address"], {
        "fr": ("Colis {ref} prêt à enlever", "Le colis {ref} est prêt à être enlevé chez {shop} ({address})."),
        "en": ("Parcel {ref} ready for pickup", "Parcel {ref} is ready for pickup at {shop} ({address})."),
        "es": ("Paquete {ref} listo para recoger", "El paquete {ref} está listo para recoger en {shop} ({address}).")}),
    ("carrier_delivery_late", "carrier", "Retard de livraison", ["ref"], {
        "fr": ("Retard : colis {ref}", "Le colis {ref} a dépassé sa date de livraison prévue. Merci de mettre à jour sa position."),
        "en": ("Delay: parcel {ref}", "Parcel {ref} is past its expected delivery date. Please update its position."),
        "es": ("Retraso: paquete {ref}", "El paquete {ref} superó su fecha de entrega prevista. Actualice su posición.")}),
    ("carrier_parcel_delivered", "carrier", "Colis livré", ["ref"], {
        "fr": ("Colis {ref} livré", "Le colis {ref} a été remis au client."),
        "en": ("Parcel {ref} delivered", "Parcel {ref} was delivered to the customer."),
        "es": ("Paquete {ref} entregado", "El paquete {ref} fue entregado al cliente.")}),
    # ---------- Relay points ----------
    ("relay_parcel_incoming", "relay", "Colis en approche", ["ref", "carrier"], {
        "fr": ("Colis {ref} en approche", "Le colis {ref} est en route vers votre point relais ({carrier})."),
        "en": ("Parcel {ref} incoming", "Parcel {ref} is on its way to your relay point ({carrier})."),
        "es": ("Paquete {ref} en camino", "El paquete {ref} va hacia su punto de recogida ({carrier}).")}),
    ("relay_parcel_to_handover", "relay", "Colis à remettre au client", ["ref", "customer"], {
        "fr": ("Colis {ref} à remettre", "Le colis {ref} est à remettre à {customer}. Vérifiez son code de réception."),
        "en": ("Parcel {ref} to hand over", "Parcel {ref} must be handed to {customer}. Check their reception code."),
        "es": ("Paquete {ref} a entregar", "El paquete {ref} debe entregarse a {customer}. Verifique su código.")}),
    ("relay_parcel_not_collected", "relay", "Colis non retiré", ["ref", "days"], {
        "fr": ("Colis {ref} non retiré", "Le colis {ref} n'a pas été retiré depuis {days} jour(s)."),
        "en": ("Parcel {ref} not collected", "Parcel {ref} has not been collected for {days} day(s)."),
        "es": ("Paquete {ref} no recogido", "El paquete {ref} no ha sido recogido desde hace {days} día(s).")}),
    ("relay_change_decision", "relay", "Modification de point relais traitée", ["point", "decision"], {
        "fr": ("Modification de point relais", "Votre demande de modification pour « {point} » a été {decision}."),
        "en": ("Relay point change", "Your change request for \"{point}\" was {decision}."),
        "es": ("Modificación de punto de recogida", "Su solicitud de modificación para «{point}» fue {decision}.")}),
]
DEFAULTS = {k: {"key": k, "audience": a, "label": l, "variables": v,
                "content": {lg: {"subject": s, "body": b} for lg, (s, b) in c.items()}} for k, a, l, v, c in T}
UNTRIGGERED = set()
CRITICAL = {"auth_otp", "auth_verify_email", "auth_password_reset"}
_tasks = set()


class _Safe(dict):
    def __missing__(self, k):
        return "{" + k + "}"


async def get_template(key: str) -> dict:
    base = DEFAULTS[key]
    over = await db.message_templates.find_one({"key": key}, {"_id": 0}) or {}
    content = {lg: {**base["content"][lg], **(over.get("content", {}).get(lg) or {})} for lg in LANGS}
    return {**base, "content": content, "enabled": True if key in CRITICAL else over.get("enabled", True),
            "email_enabled": True if key in CRITICAL else over.get("email_enabled", True), "customized": bool(over),
            "scheduled_only": key in UNTRIGGERED, "critical": key in CRITICAL}


async def render(key: str, lang: str, vars: dict) -> Optional[dict]:
    t = await get_template(key)
    if not t["enabled"]:
        return None
    c = t["content"].get(lang if lang in LANGS else "fr") or t["content"]["fr"]
    v = _Safe({k: ("" if val is None else val) for k, val in vars.items()})
    return {"subject": c["subject"].format_map(v), "body": c["body"].format_map(v), "email": t["email_enabled"]}


def _html(body: str) -> str:
    from emailer import _wrap
    return _wrap("".join(f"<p>{escape(line)}</p>" for line in body.split("\n") if line.strip()))


async def send_message(user_id: str, key: str, vars: dict, link: str = None, ntype: str = "INFO"):
    """In-app notification + e-mail, rendered in the recipient's language. Never raises."""
    from business import notify
    from emailer import send_email
    try:
        from bson import ObjectId
        u = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        u = None
    if not u:
        return
    vars = {"name": u.get("name", ""), **vars}
    msg = await render(key, u.get("language") or "fr", vars)
    if not msg:
        return
    await notify(user_id, ntype, msg["subject"], msg["body"].replace("\n", " "), link)
    if msg["email"] and u.get("email"):
        task = asyncio.create_task(send_email(to=u["email"], subject=msg["subject"], html=_html(msg["body"])))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)


async def send_to_users(query: dict, key: str, vars: dict, link: str = None, ntype: str = "INFO"):
    for u in await db.users.find(query, {"_id": 1}).to_list(200):
        await send_message(str(u["_id"]), key, vars, link, ntype)


async def auth_email(to: str, key: str, vars: dict, lang: str = "fr"):
    from emailer import send_email
    msg = await render(key, lang, vars)
    if msg and msg["email"]:
        return await send_email(to=to, subject=msg["subject"], html=_html(msg["body"]))
    return False


# ---------------- Custom email provider ----------------
def _enc(v: str) -> str:
    return _cipher.encrypt(v.encode()).decode()


def _dec(v: str) -> str:
    return _cipher.decrypt(v.encode()).decode()


async def custom_send(to: str, subject: str, html: str) -> Optional[bool]:
    """Send through the admin-configured provider. None = no custom provider enabled."""
    cfg = await db.email_settings.find_one({"_id": "email_settings"})
    if not cfg or not cfg.get("enabled") or cfg.get("provider") not in ("resend", "smtp"):
        return None
    try:
        if cfg["provider"] == "resend":
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as c:
                r = await c.post("https://api.resend.com/emails", json={
                    "from": cfg["from_email"], "to": [to], "subject": subject, "html": html},
                    headers={"Authorization": f"Bearer {_dec(cfg['resend_api_key_ct'])}",
                             "Content-Type": "application/json", "User-Agent": "afrimarket-email/1.0"})
            if r.is_error:
                raise RuntimeError(f"Resend {r.status_code}")
        else:
            await asyncio.to_thread(_smtp_send, cfg, to, subject, html)
        await _log("email", cfg["provider"], to, subject, "SENT")
        return True
    except Exception as e:
        logger.error("Custom email failed: %s", e)
        await _log("email", cfg["provider"], to, subject, "FAILED")
        return False


def _smtp_send(cfg, to, subject, html):
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = cfg["from_email"], to, subject
    msg.set_content(re.sub(r"<[^>]+>", "", html))
    msg.add_alternative(html, subtype="html")
    pw = _dec(cfg["smtp_password_ct"])
    if cfg.get("smtp_starttls", True):
        with smtplib.SMTP(cfg["smtp_host"], int(cfg["smtp_port"]), timeout=10) as s:
            s.starttls()
            s.login(cfg["smtp_username"], pw)
            s.send_message(msg)
    else:
        with smtplib.SMTP_SSL(cfg["smtp_host"], int(cfg["smtp_port"]), timeout=10) as s:
            s.login(cfg["smtp_username"], pw)
            s.send_message(msg)


async def _log(channel, provider, to, subject, status):
    masked = to[:2] + "***" + to[to.find("@"):] if "@" in to else to[:3] + "***"
    await db.message_log.insert_one({"id": new_id(), "channel": channel, "provider": provider, "to": masked,
                                     "subject": subject[:120], "status": status, "at": now_iso()})


async def send_sms_like(channel: str, phone: str, country: str, text: str) -> str:
    """SMS / WhatsApp: picks the enabled provider for the country. Sending is SIMULATED (logged only)."""
    p = await db.comm_providers.find_one({"channel": channel, "enabled": True, "countries": country}) or \
        await db.comm_providers.find_one({"channel": channel, "enabled": True, "countries": []})
    status = "SIMULATED" if p else "NO_PROVIDER"
    await _log(channel, p["name"] if p else None, phone or "", re.sub(r"\d", "•", text[:60]), status)
    return status


# ---------------- Admin API ----------------
class EmailSettingsReq(BaseModel):
    provider: str = "none"
    enabled: bool = False
    from_email: Optional[str] = ""
    resend_api_key: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_starttls: bool = True


class ProviderReq(BaseModel):
    channel: Optional[str] = None
    name: Optional[str] = None
    provider_type: Optional[str] = None
    countries: Optional[list] = None
    sender: Optional[str] = None
    api_url: Optional[str] = None
    account_id: Optional[str] = None
    api_key: Optional[str] = None
    enabled: Optional[bool] = None


class TemplateReq(BaseModel):
    content: Optional[dict] = None
    enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None


def _email_public(d: dict) -> dict:
    return {"provider": d.get("provider", "none"), "enabled": d.get("enabled", False), "from_email": d.get("from_email", ""),
            "smtp_host": d.get("smtp_host"), "smtp_port": d.get("smtp_port", 587), "smtp_username": d.get("smtp_username"),
            "smtp_starttls": d.get("smtp_starttls", True),
            "has_resend_key": bool(d.get("resend_api_key_ct")), "has_smtp_password": bool(d.get("smtp_password_ct")),
            "updated_at": d.get("updated_at")}


def _provider_public(p: dict) -> dict:
    out = {k: v for k, v in p.items() if k not in ("_id", "api_key_ct")}
    out["has_api_key"] = bool(p.get("api_key_ct"))
    return out


@router.get("/admin/comm/email")
async def get_email_settings(user: dict = Depends(require_module("settings"))):
    return {"email": _email_public(await db.email_settings.find_one({"_id": "email_settings"}) or {})}


@router.put("/admin/comm/email")
async def save_email_settings(req: EmailSettingsReq, user: dict = Depends(require_module("settings"))):
    from business import audit_log
    if req.provider not in ("none", "resend", "smtp"):
        raise HTTPException(status_code=400, detail="Fournisseur invalide")
    old = await db.email_settings.find_one({"_id": "email_settings"}) or {}
    doc = {"_id": "email_settings", "provider": req.provider, "enabled": bool(req.enabled),
           "from_email": (req.from_email or "").strip(), "smtp_host": (req.smtp_host or "").strip() or None,
           "smtp_port": int(req.smtp_port or 587), "smtp_username": (req.smtp_username or "").strip() or None,
           "smtp_starttls": bool(req.smtp_starttls), "updated_at": now_iso(),
           "resend_api_key_ct": _enc(req.resend_api_key.strip()) if req.resend_api_key else old.get("resend_api_key_ct"),
           "smtp_password_ct": _enc(req.smtp_password) if req.smtp_password else old.get("smtp_password_ct")}
    if doc["enabled"] and doc["provider"] != "none" and not doc["from_email"]:
        raise HTTPException(status_code=400, detail="Adresse d'expédition requise")
    if doc["enabled"] and doc["provider"] == "resend" and not doc["resend_api_key_ct"]:
        raise HTTPException(status_code=400, detail="Clé API Resend requise")
    if doc["enabled"] and doc["provider"] == "smtp" and not (doc["smtp_host"] and doc["smtp_username"] and doc["smtp_password_ct"]):
        raise HTTPException(status_code=400, detail="Serveur, identifiant et mot de passe SMTP requis")
    await db.email_settings.replace_one({"_id": "email_settings"}, doc, upsert=True)
    await audit_log(user, "UPDATE_EMAIL_PROVIDER", "settings", "email", None, f"{doc['provider']} enabled={doc['enabled']}")
    return {"email": _email_public(doc)}


@router.post("/admin/comm/email/test")
async def test_email(user: dict = Depends(require_module("settings"))):
    from emailer import send_email
    ok = await send_email(to=user["email"], subject="Test d'envoi AfriMarket",
                          html="<p>Ceci est un e-mail de test envoyé depuis Authentification et information.</p>")
    return {"sent": bool(ok), "to": user["email"]}


@router.get("/admin/comm/providers")
async def list_providers(user: dict = Depends(require_module("settings"))):
    rows = await db.comm_providers.find({}).sort([("channel", 1), ("name", 1)]).to_list(500)
    logs = await db.message_log.find({}, {"_id": 0}).sort("at", -1).to_list(30)
    return {"providers": [_provider_public(p) for p in rows], "log": logs}


@router.post("/admin/comm/providers")
async def create_provider(req: ProviderReq, user: dict = Depends(require_module("settings"))):
    from business import audit_log
    if req.channel not in ("sms", "whatsapp") or not (req.name or "").strip():
        raise HTTPException(status_code=400, detail="Canal (SMS/WhatsApp) et nom requis")
    doc = {"id": new_id(), "channel": req.channel, "name": req.name.strip(), "provider_type": req.provider_type or "Autre",
           "countries": [c for c in (req.countries or []) if c], "sender": req.sender or "", "api_url": req.api_url or "",
           "account_id": req.account_id or "", "api_key_ct": _enc(req.api_key) if req.api_key else None,
           "enabled": bool(req.enabled), "created_at": now_iso()}
    await db.comm_providers.insert_one(dict(doc))
    await audit_log(user, "CREATE_COMM_PROVIDER", "settings", doc["id"], None, f"{doc['channel']} {doc['name']}")
    return {"provider": _provider_public(doc)}


@router.put("/admin/comm/providers/{pid}")
async def update_provider(pid: str, req: ProviderReq, user: dict = Depends(require_module("settings"))):
    upd = {k: v for k, v in req.model_dump(exclude={"api_key", "channel"}).items() if v is not None}
    if "countries" in upd:
        upd["countries"] = [c for c in upd["countries"] if c]
    if req.api_key:
        upd["api_key_ct"] = _enc(req.api_key)
    res = await db.comm_providers.update_one({"id": pid}, {"$set": upd}) if upd else None
    if res is not None and res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fournisseur introuvable")
    return {"provider": _provider_public(await db.comm_providers.find_one({"id": pid}))}


@router.delete("/admin/comm/providers/{pid}")
async def delete_provider(pid: str, user: dict = Depends(require_module("settings"))):
    res = await db.comm_providers.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fournisseur introuvable")
    return {"message": "Fournisseur supprimé"}


@router.get("/admin/comm/templates")
async def list_templates(user: dict = Depends(require_module("settings"))):
    return {"templates": [await get_template(k) for k in DEFAULTS], "languages": list(LANGS)}


@router.put("/admin/comm/templates/{key}")
async def update_template(key: str, req: TemplateReq, user: dict = Depends(require_module("settings"))):
    if key not in DEFAULTS:
        raise HTTPException(status_code=404, detail="Modèle introuvable")
    if key in CRITICAL and (req.enabled is False or req.email_enabled is False):
        raise HTTPException(status_code=400, detail="Ce message est indispensable à la connexion et ne peut pas être désactivé")
    upd = {}
    if req.content is not None:
        for lg, c in req.content.items():
            if lg in LANGS and isinstance(c, dict):
                for f in ("subject", "body"):
                    if isinstance(c.get(f), str):
                        if not c[f].strip():
                            raise HTTPException(status_code=400, detail="Objet et message ne peuvent pas être vides")
                        upd[f"content.{lg}.{f}"] = c[f][:4000]
    if req.enabled is not None:
        upd["enabled"] = bool(req.enabled)
    if req.email_enabled is not None:
        upd["email_enabled"] = bool(req.email_enabled)
    if upd:
        await db.message_templates.update_one({"key": key}, {"$set": {**upd, "updated_at": now_iso()}}, upsert=True)
    return {"template": await get_template(key)}


@router.post("/admin/comm/templates/{key}/reset")
async def reset_template(key: str, user: dict = Depends(require_module("settings"))):
    if key not in DEFAULTS:
        raise HTTPException(status_code=404, detail="Modèle introuvable")
    await db.message_templates.delete_one({"key": key})
    return {"template": await get_template(key)}
