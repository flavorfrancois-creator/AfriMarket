"""Static configuration data: African countries and their currencies."""

# name, iso2, currency code, currency name, symbol
COUNTRIES = [
    {"name": "Algérie", "iso2": "DZ", "currency": "DZD", "currency_name": "Dinar algérien", "symbol": "دج"},
    {"name": "Angola", "iso2": "AO", "currency": "AOA", "currency_name": "Kwanza", "symbol": "Kz"},
    {"name": "Bénin", "iso2": "BJ", "currency": "XOF", "currency_name": "Franc CFA BCEAO", "symbol": "CFA"},
    {"name": "Botswana", "iso2": "BW", "currency": "BWP", "currency_name": "Pula", "symbol": "P"},
    {"name": "Burkina Faso", "iso2": "BF", "currency": "XOF", "currency_name": "Franc CFA BCEAO", "symbol": "CFA"},
    {"name": "Burundi", "iso2": "BI", "currency": "BIF", "currency_name": "Franc burundais", "symbol": "FBu"},
    {"name": "Cabo Verde", "iso2": "CV", "currency": "CVE", "currency_name": "Escudo cap-verdien", "symbol": "$"},
    {"name": "Cameroun", "iso2": "CM", "currency": "XAF", "currency_name": "Franc CFA CEMAC", "symbol": "FCFA"},
    {"name": "République centrafricaine", "iso2": "CF", "currency": "XAF", "currency_name": "Franc CFA CEMAC", "symbol": "FCFA"},
    {"name": "Tchad", "iso2": "TD", "currency": "XAF", "currency_name": "Franc CFA CEMAC", "symbol": "FCFA"},
    {"name": "Comores", "iso2": "KM", "currency": "KMF", "currency_name": "Franc comorien", "symbol": "CF"},
    {"name": "République démocratique du Congo", "iso2": "CD", "currency": "CDF", "currency_name": "Franc congolais", "symbol": "FC"},
    {"name": "République du Congo", "iso2": "CG", "currency": "XAF", "currency_name": "Franc CFA CEMAC", "symbol": "FCFA"},
    {"name": "Côte d'Ivoire", "iso2": "CI", "currency": "XOF", "currency_name": "Franc CFA BCEAO", "symbol": "CFA"},
    {"name": "Djibouti", "iso2": "DJ", "currency": "DJF", "currency_name": "Franc djiboutien", "symbol": "Fdj"},
    {"name": "Égypte", "iso2": "EG", "currency": "EGP", "currency_name": "Livre égyptienne", "symbol": "£"},
    {"name": "Guinée équatoriale", "iso2": "GQ", "currency": "XAF", "currency_name": "Franc CFA CEMAC", "symbol": "FCFA"},
    {"name": "Érythrée", "iso2": "ER", "currency": "ERN", "currency_name": "Nakfa", "symbol": "Nfk"},
    {"name": "Eswatini", "iso2": "SZ", "currency": "SZL", "currency_name": "Lilangeni", "symbol": "E"},
    {"name": "Éthiopie", "iso2": "ET", "currency": "ETB", "currency_name": "Birr éthiopien", "symbol": "Br"},
    {"name": "Gabon", "iso2": "GA", "currency": "XAF", "currency_name": "Franc CFA CEMAC", "symbol": "FCFA"},
    {"name": "Gambie", "iso2": "GM", "currency": "GMD", "currency_name": "Dalasi", "symbol": "D"},
    {"name": "Ghana", "iso2": "GH", "currency": "GHS", "currency_name": "Cedi ghanéen", "symbol": "₵"},
    {"name": "Guinée", "iso2": "GN", "currency": "GNF", "currency_name": "Franc guinéen", "symbol": "FG"},
    {"name": "Guinée-Bissau", "iso2": "GW", "currency": "XOF", "currency_name": "Franc CFA BCEAO", "symbol": "CFA"},
    {"name": "Kenya", "iso2": "KE", "currency": "KES", "currency_name": "Shilling kényan", "symbol": "KSh"},
    {"name": "Lesotho", "iso2": "LS", "currency": "LSL", "currency_name": "Loti", "symbol": "L"},
    {"name": "Liberia", "iso2": "LR", "currency": "LRD", "currency_name": "Dollar libérien", "symbol": "$"},
    {"name": "Libye", "iso2": "LY", "currency": "LYD", "currency_name": "Dinar libyen", "symbol": "ل.د"},
    {"name": "Madagascar", "iso2": "MG", "currency": "MGA", "currency_name": "Ariary", "symbol": "Ar"},
    {"name": "Malawi", "iso2": "MW", "currency": "MWK", "currency_name": "Kwacha malawite", "symbol": "MK"},
    {"name": "Mali", "iso2": "ML", "currency": "XOF", "currency_name": "Franc CFA BCEAO", "symbol": "CFA"},
    {"name": "Mauritanie", "iso2": "MR", "currency": "MRU", "currency_name": "Ouguiya", "symbol": "UM"},
    {"name": "Maurice", "iso2": "MU", "currency": "MUR", "currency_name": "Roupie mauricienne", "symbol": "₨"},
    {"name": "Maroc", "iso2": "MA", "currency": "MAD", "currency_name": "Dirham marocain", "symbol": "د.م."},
    {"name": "Mozambique", "iso2": "MZ", "currency": "MZN", "currency_name": "Metical", "symbol": "MT"},
    {"name": "Namibie", "iso2": "NA", "currency": "NAD", "currency_name": "Dollar namibien", "symbol": "$"},
    {"name": "Niger", "iso2": "NE", "currency": "XOF", "currency_name": "Franc CFA BCEAO", "symbol": "CFA"},
    {"name": "Nigeria", "iso2": "NG", "currency": "NGN", "currency_name": "Naira", "symbol": "₦"},
    {"name": "Rwanda", "iso2": "RW", "currency": "RWF", "currency_name": "Franc rwandais", "symbol": "FRw"},
    {"name": "São Tomé-et-Príncipe", "iso2": "ST", "currency": "STN", "currency_name": "Dobra", "symbol": "Db"},
    {"name": "Sénégal", "iso2": "SN", "currency": "XOF", "currency_name": "Franc CFA BCEAO", "symbol": "CFA"},
    {"name": "Seychelles", "iso2": "SC", "currency": "SCR", "currency_name": "Roupie seychelloise", "symbol": "₨"},
    {"name": "Sierra Leone", "iso2": "SL", "currency": "SLE", "currency_name": "Leone", "symbol": "Le"},
    {"name": "Somalie", "iso2": "SO", "currency": "SOS", "currency_name": "Shilling somalien", "symbol": "Sh"},
    {"name": "Afrique du Sud", "iso2": "ZA", "currency": "ZAR", "currency_name": "Rand", "symbol": "R"},
    {"name": "Soudan du Sud", "iso2": "SS", "currency": "SSP", "currency_name": "Livre sud-soudanaise", "symbol": "£"},
    {"name": "Soudan", "iso2": "SD", "currency": "SDG", "currency_name": "Livre soudanaise", "symbol": "£"},
    {"name": "Tanzanie", "iso2": "TZ", "currency": "TZS", "currency_name": "Shilling tanzanien", "symbol": "TSh"},
    {"name": "Togo", "iso2": "TG", "currency": "XOF", "currency_name": "Franc CFA BCEAO", "symbol": "CFA"},
    {"name": "Tunisie", "iso2": "TN", "currency": "TND", "currency_name": "Dinar tunisien", "symbol": "د.ت"},
    {"name": "Ouganda", "iso2": "UG", "currency": "UGX", "currency_name": "Shilling ougandais", "symbol": "USh"},
    {"name": "Zambie", "iso2": "ZM", "currency": "ZMW", "currency_name": "Kwacha zambien", "symbol": "ZK"},
    {"name": "Zimbabwe", "iso2": "ZW", "currency": "ZWG", "currency_name": "Zimbabwe Gold", "symbol": "ZiG"},
]


def _build_currencies():
    seen = {}
    for c in COUNTRIES:
        if c["currency"] not in seen:
            seen[c["currency"]] = {
                "code": c["currency"],
                "name": c["currency_name"],
                "symbol": c["symbol"],
            }
    return list(seen.values())


CURRENCIES = _build_currencies()

CURRENCY_BY_CODE = {c["code"]: c for c in CURRENCIES}


def currency_for_country(name: str):
    for c in COUNTRIES:
        if c["name"] == name:
            return {"code": c["currency"], "name": c["currency_name"], "symbol": c["symbol"]}
    return {"code": "XOF", "name": "Franc CFA BCEAO", "symbol": "CFA"}
