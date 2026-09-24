import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { usePrivateClient } from "@/context/PrivateClientContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ShoppingCart, Search, User, Menu, Store, LayoutDashboard, LogOut } from "lucide-react";

export function PublicHeader() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { active, client, clear } = usePrivateClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(`/products?q=${encodeURIComponent(q)}`);
  };

  const dashPath = () => {
    if (!user) return "/login";
    if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return "/admin";
    if (user.role === "MERCHANT") return "/merchant";
    return "/account";
  };

  const nav = [
    { to: "/", label: t("home") },
    { to: "/products", label: t("products") },
    { to: "/shops", label: t("shops") },
    { to: "/products?promo=1", label: t("promos") },
  ];

  return (
    <header className="sticky top-0 z-50 glass border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" data-testid="mobile-menu-btn">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <nav className="mt-8 flex flex-col gap-1">
              {nav.map((n) => (
                <Link key={n.to} to={n.to} className="px-3 py-2 rounded-lg hover:bg-accent font-medium" data-testid={`m-nav-${n.label}`}>
                  {n.label}
                </Link>
              ))}
              <Link to="/register?role=merchant" className="px-3 py-2 rounded-lg hover:bg-accent font-medium text-primary">
                {t("become_merchant")}
              </Link>
            </nav>
          </SheetContent>
        </Sheet>

        <Link to="/" className="flex items-center gap-2 shrink-0" data-testid="logo-link">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground grid place-items-center font-display font-extrabold">A</div>
          <span className="font-display font-extrabold text-lg hidden sm:block">{t("app_name")}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-2">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-accent hover:text-primary transition-colors" data-testid={`nav-${n.label}`}>
              {n.label}
            </Link>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="flex-1 max-w-md ml-auto hidden sm:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search_ph")}
              className="pl-9 rounded-full h-10"
              data-testid="header-search-input"
            />
          </div>
        </form>

        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
          <LanguageSwitcher compact />

          <Link to="/cart" className="relative" data-testid="cart-link">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ShoppingCart className="w-5 h-5" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 grid place-items-center rounded-full">
                  {count}
                </span>
              )}
            </Button>
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" data-testid="user-menu-btn">
                  <User className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm">
                  <div className="font-medium truncate">{user.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(dashPath())} data-testid="menu-dashboard">
                  <LayoutDashboard className="w-4 h-4 mr-2" /> {t("dashboard")}
                </DropdownMenuItem>
                {user.role === "CLIENT" && (
                  <DropdownMenuItem onClick={() => navigate("/register?role=merchant")}>
                    <Store className="w-4 h-4 mr-2" /> {t("become_merchant")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { logout(); navigate("/"); }} data-testid="menu-logout">
                  <LogOut className="w-4 h-4 mr-2" /> {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" className="rounded-full hidden sm:inline-flex" onClick={() => navigate("/login")} data-testid="login-btn">
                {t("login")}
              </Button>
              <Button className="rounded-full" onClick={() => navigate("/register")} data-testid="register-btn">
                {t("register")}
              </Button>
            </>
          )}
        </div>
      </div>
      {active && (
        <div className="bg-primary text-primary-foreground text-sm" data-testid="private-client-banner">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-2">
            <span className="truncate">🧾 Commande pour votre client : <strong>{client?.name}</strong> — au prix client simple</span>
            <button onClick={clear} className="underline shrink-0 text-xs font-medium" data-testid="disable-private-client">Désactiver</button>
          </div>
        </div>
      )}
    </header>
  );
}
