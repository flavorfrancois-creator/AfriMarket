import "@/index.css";
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { PrivateClientProvider } from "@/context/PrivateClientContext";
import { PublicLayout, ProtectedRoute } from "@/components/common";

import Home from "@/pages/Home";
import { Products, Shops, ShopDetail, ProductDetail, Cart, Checkout, StaticPage } from "@/pages/Public";
import { Login, Register, ForgotPassword, ResetPassword } from "@/pages/Auth";
import {
  ClientLayout, ClientOverview, ClientOrders, ClientWallet, ClientWithdrawals,
  ClientInvitation, ClientProfile, ClientFavorites, ClientPrivateClient, ClientScan,
} from "@/pages/Client";
import {
  MerchantLayout, MerchantOnboarding, MerchantOverview, MerchantProducts, MerchantOrders,
  MerchantCustomers, MerchantStock, MerchantStats, MerchantPromotions, MerchantLoyalty,
  MerchantOpportunities, MerchantSettings,
} from "@/pages/Merchant";
import {
  AdminLayout, AdminOverview, AdminShops, AdminUsers, AdminWithdrawals, AdminOrders,
  AdminAudit, AdminCountries, AdminStaff, AdminSecurity, AdminApprovals, AdminLoginJournal,
  AdminProducts, AdminReports, AdminPayouts, AdminCarriers, AdminReporting, AdminGlobalSettings, AdminEarnings,
} from "@/pages/Admin";

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <CartProvider>
          <PrivateClientProvider>
          <Toaster position="top-right" richColors />
          <BrowserRouter>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/products" element={<Products />} />
                <Route path="/products/:id" element={<ProductDetail />} />
                <Route path="/shops" element={<Shops />} />
                <Route path="/shops/:id" element={<ShopDetail />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/faq" element={<StaticPage kind="faq" />} />
                <Route path="/contact" element={<StaticPage kind="contact" />} />
                <Route path="/terms" element={<StaticPage kind="terms" />} />
                <Route path="/privacy" element={<StaticPage kind="privacy" />} />
              </Route>

              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route element={<ProtectedRoute roles={["CLIENT", "MERCHANT", "ADMIN", "SUPER_ADMIN"]} />}>
                <Route element={<PublicLayout />}>
                  <Route path="/checkout" element={<Checkout />} />
                </Route>
              </Route>

              {/* Client */}
              <Route element={<ProtectedRoute roles={["CLIENT"]} />}>
                <Route path="/account" element={<ClientLayout />}>
                  <Route index element={<ClientOverview />} />
                  <Route path="orders" element={<ClientOrders />} />
                  <Route path="favorites" element={<ClientFavorites />} />
                  <Route path="private-client" element={<ClientPrivateClient />} />
                  <Route path="scan" element={<ClientScan />} />
                  <Route path="wallet" element={<ClientWallet />} />
                  <Route path="withdrawals" element={<ClientWithdrawals />} />
                  <Route path="invitation" element={<ClientInvitation />} />
                  <Route path="profile" element={<ClientProfile />} />
                </Route>
              </Route>

              {/* Merchant */}
              <Route element={<ProtectedRoute roles={["MERCHANT"]} />}>
                <Route path="/merchant/onboarding" element={<MerchantOnboarding />} />
                <Route path="/merchant" element={<MerchantLayout />}>
                  <Route index element={<MerchantOverview />} />
                  <Route path="products" element={<MerchantProducts />} />
                  <Route path="orders" element={<MerchantOrders />} />
                  <Route path="customers" element={<MerchantCustomers />} />
                  <Route path="opportunities" element={<MerchantOpportunities />} />
                  <Route path="stock" element={<MerchantStock />} />
                  <Route path="stats" element={<MerchantStats />} />
                  <Route path="loyalty" element={<MerchantLoyalty />} />
                  <Route path="promotions" element={<MerchantPromotions />} />
                  <Route path="settings" element={<MerchantSettings />} />
                </Route>
              </Route>

              {/* Admin & staff (Module 1 & 9 RBAC) */}
              <Route element={<ProtectedRoute roles={["ADMIN", "SUPER_ADMIN", "SHOP_ADMIN", "PRODUCT_MANAGER", "ORDER_MANAGER", "MODERATOR", "ACCOUNTANT"]} />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminOverview />} />
                  <Route path="shops" element={<AdminShops />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="reporting" element={<AdminReporting />} />
                  <Route path="withdrawals" element={<AdminWithdrawals />} />
                  <Route path="payouts" element={<AdminPayouts />} />
                  <Route path="earnings" element={<AdminEarnings />} />
                  <Route path="approvals" element={<AdminApprovals />} />
                  <Route path="staff" element={<AdminStaff />} />
                  <Route path="security" element={<AdminSecurity />} />
                  <Route path="journal" element={<AdminLoginJournal />} />
                  <Route path="countries" element={<AdminCountries />} />
                  <Route path="settings-global" element={<AdminGlobalSettings />} />
                  <Route path="carriers" element={<AdminCarriers />} />
                  <Route path="audit" element={<AdminAudit />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
          </PrivateClientProvider>
        </CartProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
