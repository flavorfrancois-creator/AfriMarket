import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const SIDE_IMG = "https://images.unsplash.com/photo-1751374858042-b8b9ff8480aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwyfHxhZnJpY2FuJTIwYnVzaW5lc3MlMjBwZW9wbGV8ZW58MHx8fHwxNzg5OTczNjMxfDA&ixlib=rb-4.1.0&q=85";

function AuthShell({ children, title, sub }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img src={SIDE_IMG} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-neutral-950/50" />
        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary grid place-items-center font-display font-extrabold">A</div>
            <span className="font-display font-extrabold text-xl">AfriMarket</span>
          </Link>
          <div>
            <h2 className="text-3xl font-display font-extrabold leading-tight">La marketplace multi-boutiques de l'Afrique</h2>
            <p className="text-neutral-300 mt-3 max-w-sm">Vendez, achetez, gagnez des bonus. Multi-devises et Mobile Money.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground grid place-items-center font-display font-extrabold">A</div>
            <span className="font-display font-extrabold text-lg">AfriMarket</span>
          </Link>
          <h1 className="text-2xl font-display font-extrabold">{title}</h1>
          {sub && <p className="text-muted-foreground text-sm mt-1 mb-6">{sub}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

function redirectFor(user) {
  const staff = ["SUPER_ADMIN", "ADMIN", "SHOP_ADMIN", "PRODUCT_MANAGER", "ORDER_MANAGER", "MODERATOR", "ACCOUNTANT"];
  if (staff.includes(user.role)) return "/admin";
  if (user.role === "MERCHANT") return "/merchant";
  return "/account";
}

export function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState(null); // {challenge_id, channel, dev_code}
  const [code, setCode] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (data.require_2fa) {
        setChallenge(data);
        if (data.dev_code) toast.info(`Code de vérification (démo) : ${data.dev_code}`);
      } else {
        login(data.token, data.user);
        navigate(redirectFor(data.user));
      }
    } catch (err) {
      setError(apiErr(err));
    } finally {
      setLoading(false);
    }
  };

  const verify2fa = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/auth/2fa/verify", { challenge_id: challenge.challenge_id, code });
      login(data.token, data.user);
      navigate(redirectFor(data.user));
    } catch (err) {
      setError(apiErr(err));
    } finally {
      setLoading(false);
    }
  };

  const channelLabel = { email: "e-mail", sms: "SMS", whatsapp: "WhatsApp" };

  if (challenge) {
    return (
      <AuthShell title="Vérification en deux étapes" sub={`Saisissez le code envoyé par ${channelLabel[challenge.channel] || challenge.channel}`}>
        <form onSubmit={verify2fa} className="space-y-4">
          <div>
            <Label htmlFor="otp">Code de vérification</Label>
            <Input id="otp" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required data-testid="twofa-code" className="mt-1 tracking-[0.4em] text-center text-lg" placeholder="000000" />
          </div>
          {error && <div className="text-sm text-destructive" data-testid="twofa-error">{error}</div>}
          <Button type="submit" className="w-full rounded-full h-11" disabled={loading} data-testid="twofa-submit">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Vérifier
          </Button>
          <button type="button" onClick={() => { setChallenge(null); setCode(""); setError(""); }} className="text-sm text-muted-foreground hover:text-primary w-full text-center" data-testid="twofa-back">
            Retour à la connexion
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("login")} sub="Accédez à votre compte AfriMarket">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="password">{t("password")}</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" className="mt-1" />
        </div>
        {error && <div className="text-sm text-destructive" data-testid="login-error">{error}</div>}
        <Button type="submit" className="w-full rounded-full h-11" disabled={loading} data-testid="login-submit">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{t("login")}
        </Button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-primary" data-testid="forgot-link">{t("forgot_password")}</Link>
          <Link to="/register" className="text-muted-foreground hover:text-primary">{t("register")}</Link>
        </div>
      </form>
    </AuthShell>
  );
}

export function Register() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", confirm: "",
    role: sp.get("role") === "merchant" ? "MERCHANT" : "CLIENT",
    country: "", invite_code: "",
  });
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/config/countries").then((r) => setCountries(r.data.countries)).catch(() => {});
  }, []);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const selectedCurrency = countries.find((c) => c.name === form.country)?.currency;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) { setError("Les mots de passe ne correspondent pas"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        name: form.name, email: form.email, phone: form.phone, password: form.password,
        role: form.role, country: form.country, invite_code: form.invite_code || null,
      });
      login(data.token, data.user);
      toast.success("Compte créé !");
      navigate(form.role === "MERCHANT" ? "/merchant/onboarding" : "/account");
    } catch (err) {
      setError(apiErr(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t("register")} sub="Rejoignez la plateforme en quelques secondes">
      <div className="flex gap-2 mb-5 bg-muted p-1 rounded-full">
        {[["CLIENT", "Client"], ["MERCHANT", "Commerçant"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => upd("role", v)} data-testid={`role-${v}`}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors ${form.role === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            {l}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>{t("name")}</Label>
          <Input value={form.name} onChange={(e) => upd("name", e.target.value)} required data-testid="reg-name" className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("email")}</Label>
            <Input type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} required data-testid="reg-email" className="mt-1" />
          </div>
          <div>
            <Label>{t("phone")}</Label>
            <Input value={form.phone} onChange={(e) => upd("phone", e.target.value)} placeholder="+221..." data-testid="reg-phone" className="mt-1" />
          </div>
        </div>
        <div>
          <Label>{t("country")}</Label>
          <Select value={form.country} onValueChange={(v) => upd("country", v)}>
            <SelectTrigger className="mt-1" data-testid="reg-country"><SelectValue placeholder="Sélectionner un pays" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {countries.map((c) => (
                <SelectItem key={c.name} value={c.name}>{c.name} — {c.currency}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCurrency && <div className="text-xs text-muted-foreground mt-1">Monnaie : {selectedCurrency}</div>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("password")}</Label>
            <Input type="password" value={form.password} onChange={(e) => upd("password", e.target.value)} required data-testid="reg-password" className="mt-1" />
          </div>
          <div>
            <Label>Confirmer</Label>
            <Input type="password" value={form.confirm} onChange={(e) => upd("confirm", e.target.value)} required data-testid="reg-confirm" className="mt-1" />
          </div>
        </div>
        <div>
          <Label>Code d'invitation (optionnel)</Label>
          <Input value={form.invite_code} onChange={(e) => upd("invite_code", e.target.value)} placeholder="INVITE-XXXXXX" data-testid="reg-invite" className="mt-1" />
        </div>
        {error && <div className="text-sm text-destructive" data-testid="reg-error">{error}</div>}
        <Button type="submit" className="w-full rounded-full h-11" disabled={loading} data-testid="reg-submit">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{t("register")}
        </Button>
        <div className="text-sm text-center text-muted-foreground">
          Déjà un compte ? <Link to="/login" className="text-primary">{t("login")}</Link>
        </div>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await api.post("/auth/forgot-password", { email }); } catch {}
    setDone(true); setLoading(false);
  };
  return (
    <AuthShell title="Mot de passe oublié" sub="Recevez un lien de réinitialisation">
      {done ? (
        <div className="text-sm text-muted-foreground">
          Si cet e-mail est enregistré, un lien de réinitialisation a été envoyé.
          <div className="mt-4"><Link to="/login" className="text-primary">Retour à la connexion</Link></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="forgot-email" className="mt-1" />
          </div>
          <Button type="submit" className="w-full rounded-full h-11" disabled={loading} data-testid="forgot-submit">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Envoyer le lien
          </Button>
          <div className="text-sm text-center"><Link to="/login" className="text-primary">Retour à la connexion</Link></div>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const token = sp.get("token") || "";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Mot de passe réinitialisé");
      navigate("/login");
    } catch (err) {
      setError(apiErr(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthShell title="Réinitialiser le mot de passe" sub="Choisissez un nouveau mot de passe">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Nouveau mot de passe</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="reset-password" className="mt-1" />
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" className="w-full rounded-full h-11" disabled={loading || !token} data-testid="reset-submit">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Réinitialiser
        </Button>
        <div className="text-sm text-center"><Link to="/login" className="text-primary">Retour à la connexion</Link></div>
      </form>
    </AuthShell>
  );
}
