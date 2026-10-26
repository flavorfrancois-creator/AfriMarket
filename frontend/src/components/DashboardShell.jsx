import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/lib/i18n";
import api, { apiErr } from "@/lib/api";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Menu, Bell, User, LogOut, Store, Home } from "lucide-react";

export const isPartnerRole = (role) => role === "RELAY_MANAGER" || role === "CARRIER_AGENT";

function SidebarContent({ nav, title, subtitle }) {
  const location = useLocation();
  const { user } = useAuth();
  const home = isPartnerRole(user?.role) ? nav[0].to : "/";
  return (
    <div className="flex flex-col h-full">
      <Link to={home} className="flex items-center gap-2 px-5 h-16 border-b border-border shrink-0">
        <img src="/africashop.png" alt="" className="w-8 h-8 rounded-lg object-contain" />
        <div className="leading-tight">
          <div className="font-display font-bold text-sm truncate max-w-[150px]">{title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
        </div>
      </Link>
      <ScrollArea className="flex-1">
        <nav className="p-3 flex flex-col gap-0.5">
          {nav.map((n) => {
            const active = location.pathname === n.to || (n.to !== nav[0].to && location.pathname.startsWith(n.to + "/"));
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                data-testid={`side-${n.testid}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="w-[18px] h-[18px]" /> {n.label}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
}

export function DashboardShell({ nav, title, subtitle, headerAction }) {
  const { user, logout, switchProfile } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const partner = isPartnerRole(user?.role);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const switchTo = async (profile) => {
    try {
      await switchProfile(profile);
      navigate(profile === "MERCHANT" ? "/merchant" : "/account");
    } catch {
      toast.error("Impossible de changer de profil. Veuillez réessayer.");
    }
  };
  const notificationDestinations = {
    ACCOUNT: partner ? "/partner/account" : "/account/security",
    ACCOUNT_DELETION: "/admin/account-deletions",
    ADMIN_MESSAGE: "/partner/messages",
    APPROVAL: "/admin/approvals",
    CATEGORY: "/merchant/products",
    CUSTOMER_TYPE: "/account/profile",
    EARNING_REJECTED: "/account/wallet",
    EARNING_VALIDATED: "/account/wallet",
    KYC: "/account/profile",
    NEW_ORDER: "/merchant/orders",
    ORDER_UPDATE: partner ? "/partner/parcels" : user?.role === "MERCHANT" ? "/merchant/orders" : "/account/orders",
    PARCEL: "/partner/parcels",
    PARTNER_SIGNUP: "/admin/logistics",
    PAYMENT: "/merchant/orders",
    PAYOUT: "/merchant",
    PRODUCT_MODERATION: "/merchant/products",
    PRODUCT_REPORT: "/admin/reports",
    REFERRAL: "/account/invitation",
    SECURITY: partner ? "/partner/account" : "/account/security",
    SHOP_APPROVED: "/merchant",
    SHOP_REJECTED: "/merchant",
    SHOP_SUBMITTED: "/admin/shops",
    STOCK: "/merchant/products",
    WITHDRAWAL: ["ADMIN", "SUPER_ADMIN"].includes(user?.role) ? "/admin/withdrawals" : "/account/withdrawals",
  };

  const loadNotifs = async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotifs(data.notifications);
      setUnread(data.unread);
    } catch {}
  };
  useEffect(() => { loadNotifs(); }, []);

  const markAll = async () => {
    await api.put("/notifications/read-all");
    loadNotifs();
  };

  const openNotification = async (notification) => {
    if (!notification.read) {
      setNotifs((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item));
      setUnread((count) => Math.max(0, count - 1));
      try {
        await api.put(`/notifications/${notification.id}/read`);
      } catch (e) {
        toast.error(apiErr(e));
      }
    }
    setNotificationsOpen(false);
    const target = notification.link || notificationDestinations[notification.type] || (
      partner ? "/partner" : ["ADMIN", "SUPER_ADMIN", "SHOP_ADMIN", "PRODUCT_MANAGER", "ORDER_MANAGER", "MODERATOR", "ACCOUNTANT"].includes(user?.role)
        ? "/admin" : user?.role === "MERCHANT" ? "/merchant" : "/account"
    );
    if (typeof target === "string" && target.startsWith("/") && !target.startsWith("//")) {
      navigate(target);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-border bg-card flex-col fixed inset-y-0 z-30">
        <SidebarContent nav={nav} title={title} subtitle={subtitle} />
      </aside>

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-16 bg-card border-b border-border flex items-center gap-2 px-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" data-testid="dash-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SidebarContent nav={nav} title={title} subtitle={subtitle} />
            </SheetContent>
          </Sheet>

          <div className="font-display font-bold text-lg truncate">{title}</div>

          <div className="ml-auto flex items-center gap-1.5">
            {headerAction}
            <LanguageSwitcher compact />
            {!partner && (
              <Button variant="ghost" size="icon" onClick={() => navigate("/")} title={t("home")} className="hidden sm:inline-flex" data-testid="dash-home">
                <Home className="w-5 h-5" />
              </Button>
            )}
            <DropdownMenu open={notificationsOpen} onOpenChange={(open) => { setNotificationsOpen(open); if (open) loadNotifs(); }}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" data-testid="notif-btn">
                  <Bell className="w-5 h-5" />
                  {unread > 0 && (
                    <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 grid place-items-center rounded-full">
                      {unread}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="font-semibold text-sm">{t("notifications")}</span>
                  {unread > 0 && <button onClick={markAll} className="text-xs text-primary" data-testid="mark-all-read">Tout lire</button>}
                </div>
                <DropdownMenuSeparator />
                <ScrollArea className="max-h-80">
                  {notifs.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("no_data")}</div>}
                  {notifs.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      onSelect={() => openNotification(n)}
                      className={`h-auto items-start whitespace-normal px-3 py-2 border-b border-border/50 ${!n.read ? "bg-accent/40" : ""}`}
                      data-testid={`notification-${n.id}`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{n.title}</div>
                        <div className="text-xs text-muted-foreground">{n.message}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" data-testid="dash-user-menu">
                  <User className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm">
                  <div className="font-medium truncate">{user?.name}</div>
                  <div className="text-xs text-muted-foreground">{user?.role}</div>
                </div>
                <DropdownMenuSeparator />
                {!partner && (
                  <DropdownMenuItem onClick={() => navigate("/")} data-testid="dash-marketplace">
                    <Store className="w-4 h-4 mr-2" /> Marketplace
                  </DropdownMenuItem>
                )}
                {user?.role === "CLIENT" && (user.profiles || []).includes("MERCHANT") && (
                  <DropdownMenuItem onClick={() => switchTo("MERCHANT")} data-testid="dash-switch-merchant">
                    <Store className="w-4 h-4 mr-2" /> Espace commerçant
                  </DropdownMenuItem>
                )}
                {user?.role === "MERCHANT" && (user.profiles || []).includes("CLIENT") && (
                  <DropdownMenuItem onClick={() => switchTo("CLIENT")} data-testid="dash-switch-client">
                    <User className="w-4 h-4 mr-2" /> Espace client
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => { logout(); navigate(partner ? "/login" : "/"); }} data-testid="dash-logout">
                  <LogOut className="w-4 h-4 mr-2" /> {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-[1400px] w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
