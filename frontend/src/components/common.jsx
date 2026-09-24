import React from "react";
import { Outlet, Navigate } from "react-router-dom";
import { PublicHeader } from "@/components/PublicHeader";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

export function Loading({ full }) {
  return (
    <div className={`grid place-items-center ${full ? "min-h-screen" : "py-20"}`}>
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

export function ProtectedRoute({ roles }) {
  const { user } = useAuth();
  if (user === null) return <Loading full />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    const staff = ["SUPER_ADMIN", "ADMIN", "SHOP_ADMIN", "PRODUCT_MANAGER", "ORDER_MANAGER", "MODERATOR", "ACCOUNTANT"];
    const home = user.role === "MERCHANT" ? "/merchant" : (user.role === "CLIENT" ? "/account" : (staff.includes(user.role) ? "/admin" : "/"));
    return <Navigate to={home} replace />;
  }
  return <Outlet />;
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 stagger-in">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && (
          <span className={`w-9 h-9 rounded-lg grid place-items-center ${accent || "bg-primary/10 text-primary"}`}>
            <Icon className="w-[18px] h-[18px]" />
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-display font-bold font-mono">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="border border-dashed border-border rounded-xl py-16 px-6 text-center">
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      {description && <p className="text-muted-foreground text-sm mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
