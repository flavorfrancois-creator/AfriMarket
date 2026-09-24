import React, { createContext, useContext, useState, useCallback } from "react";

const DICT = {
  fr: {
    app_name: "AfriMarket",
    tagline: "La marketplace multi-boutiques de l'Afrique",
    home: "Accueil", shops: "Boutiques", products: "Produits", promos: "Promotions",
    search: "Rechercher", search_ph: "Rechercher un produit, une boutique...",
    login: "Connexion", register: "Créer un compte", logout: "Déconnexion",
    cart: "Panier", checkout: "Commander", account: "Mon compte",
    dashboard: "Tableau de bord", my_orders: "Mes commandes", favorites: "Favoris",
    my_bonus: "Mes bonus", my_earnings: "Mes recettes", my_wallet: "Mon portefeuille",
    my_invitation: "Mon invitation", my_withdrawals: "Mes retraits", my_addresses: "Mes adresses",
    notifications: "Notifications", profile: "Profil", settings: "Paramètres",
    articles: "Articles", orders: "Commandes", customers: "Suivi client", opportunities: "Opportunités",
    stock: "Stocks", statistics: "Statistiques", loyalty: "Fidélités", deliveries: "Livraisons",
    users: "Utilisateurs", finances: "Finances", withdrawals: "Retraits", categories: "Catégories",
    countries_currencies: "Pays & Devises", security: "Sécurité", audit_log: "Journal d'audit",
    become_merchant: "Devenir commerçant", merchant_space: "Espace commerçant",
    admin_space: "Administration", client_space: "Espace client",
    add_to_cart: "Ajouter au panier", buy_now: "Acheter", view: "Voir", edit: "Modifier",
    delete: "Supprimer", save: "Enregistrer", cancel: "Annuler", submit: "Soumettre",
    approve: "Approuver", reject: "Rejeter", confirm: "Confirmer", back: "Retour",
    email: "E-mail", password: "Mot de passe", name: "Nom complet", phone: "Téléphone",
    country: "Pays", currency: "Monnaie", price: "Prix", quantity: "Quantité", total: "Total",
    status: "Statut", date: "Date", actions: "Actions", available: "Disponible", pending: "En attente",
    all: "Tous", loading: "Chargement...", no_data: "Aucune donnée", welcome: "Bienvenue",
    forgot_password: "Mot de passe oublié ?", reset_password: "Réinitialiser le mot de passe",
    revenue_today: "CA du jour", revenue_month: "CA du mois", avg_basket: "Panier moyen",
    out_of_stock: "En rupture", low_stock: "Stock faible", top_sellers: "Meilleures ventes",
    request_withdrawal: "Demander un retrait", amount: "Montant", balance_available: "Solde disponible",
    balance_pending: "Solde en attente", invite_code: "Code d'invitation", copy: "Copier",
    lang: "Langue", theme: "Thème",
  },
  en: {
    app_name: "AfriMarket",
    tagline: "Africa's multi-shop marketplace",
    home: "Home", shops: "Shops", products: "Products", promos: "Promotions",
    search: "Search", search_ph: "Search a product, a shop...",
    login: "Log in", register: "Sign up", logout: "Log out",
    cart: "Cart", checkout: "Checkout", account: "My account",
    dashboard: "Dashboard", my_orders: "My orders", favorites: "Favorites",
    my_bonus: "My bonuses", my_earnings: "My earnings", my_wallet: "My wallet",
    my_invitation: "My invitation", my_withdrawals: "My withdrawals", my_addresses: "My addresses",
    notifications: "Notifications", profile: "Profile", settings: "Settings",
    articles: "Articles", orders: "Orders", customers: "Customers", opportunities: "Opportunities",
    stock: "Stock", statistics: "Statistics", loyalty: "Loyalty", deliveries: "Deliveries",
    users: "Users", finances: "Finances", withdrawals: "Withdrawals", categories: "Categories",
    countries_currencies: "Countries & Currencies", security: "Security", audit_log: "Audit log",
    become_merchant: "Become a merchant", merchant_space: "Merchant space",
    admin_space: "Administration", client_space: "Client space",
    add_to_cart: "Add to cart", buy_now: "Buy now", view: "View", edit: "Edit",
    delete: "Delete", save: "Save", cancel: "Cancel", submit: "Submit",
    approve: "Approve", reject: "Reject", confirm: "Confirm", back: "Back",
    email: "Email", password: "Password", name: "Full name", phone: "Phone",
    country: "Country", currency: "Currency", price: "Price", quantity: "Quantity", total: "Total",
    status: "Status", date: "Date", actions: "Actions", available: "Available", pending: "Pending",
    all: "All", loading: "Loading...", no_data: "No data", welcome: "Welcome",
    forgot_password: "Forgot password?", reset_password: "Reset password",
    revenue_today: "Today's revenue", revenue_month: "Month revenue", avg_basket: "Avg. basket",
    out_of_stock: "Out of stock", low_stock: "Low stock", top_sellers: "Top sellers",
    request_withdrawal: "Request withdrawal", amount: "Amount", balance_available: "Available balance",
    balance_pending: "Pending balance", invite_code: "Invite code", copy: "Copy",
    lang: "Language", theme: "Theme",
  },
  es: {
    app_name: "AfriMarket",
    tagline: "El mercado multi-tienda de África",
    home: "Inicio", shops: "Tiendas", products: "Productos", promos: "Promociones",
    search: "Buscar", search_ph: "Buscar un producto, una tienda...",
    login: "Iniciar sesión", register: "Registrarse", logout: "Cerrar sesión",
    cart: "Carrito", checkout: "Pagar", account: "Mi cuenta",
    dashboard: "Panel", my_orders: "Mis pedidos", favorites: "Favoritos",
    my_bonus: "Mis bonos", my_earnings: "Mis ganancias", my_wallet: "Mi billetera",
    my_invitation: "Mi invitación", my_withdrawals: "Mis retiros", my_addresses: "Mis direcciones",
    notifications: "Notificaciones", profile: "Perfil", settings: "Ajustes",
    articles: "Artículos", orders: "Pedidos", customers: "Clientes", opportunities: "Oportunidades",
    stock: "Inventario", statistics: "Estadísticas", loyalty: "Fidelidad", deliveries: "Entregas",
    users: "Usuarios", finances: "Finanzas", withdrawals: "Retiros", categories: "Categorías",
    countries_currencies: "Países y Monedas", security: "Seguridad", audit_log: "Registro de auditoría",
    become_merchant: "Ser comerciante", merchant_space: "Espacio comerciante",
    admin_space: "Administración", client_space: "Espacio cliente",
    add_to_cart: "Añadir al carrito", buy_now: "Comprar", view: "Ver", edit: "Editar",
    delete: "Eliminar", save: "Guardar", cancel: "Cancelar", submit: "Enviar",
    approve: "Aprobar", reject: "Rechazar", confirm: "Confirmar", back: "Volver",
    email: "Correo", password: "Contraseña", name: "Nombre completo", phone: "Teléfono",
    country: "País", currency: "Moneda", price: "Precio", quantity: "Cantidad", total: "Total",
    status: "Estado", date: "Fecha", actions: "Acciones", available: "Disponible", pending: "Pendiente",
    all: "Todos", loading: "Cargando...", no_data: "Sin datos", welcome: "Bienvenido",
    forgot_password: "¿Olvidó su contraseña?", reset_password: "Restablecer contraseña",
    revenue_today: "Ventas de hoy", revenue_month: "Ventas del mes", avg_basket: "Cesta media",
    out_of_stock: "Sin stock", low_stock: "Stock bajo", top_sellers: "Más vendidos",
    request_withdrawal: "Solicitar retiro", amount: "Monto", balance_available: "Saldo disponible",
    balance_pending: "Saldo pendiente", invite_code: "Código de invitación", copy: "Copiar",
    lang: "Idioma", theme: "Tema",
  },
};

export const LANGS = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem("am_lang") || "fr");
  const change = useCallback((l) => {
    setLang(l);
    localStorage.setItem("am_lang", l);
  }, []);
  const t = useCallback((key) => (DICT[lang] && DICT[lang][key]) || DICT.fr[key] || key, [lang]);
  return <I18nContext.Provider value={{ lang, setLang: change, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
