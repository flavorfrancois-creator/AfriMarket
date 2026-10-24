# Here are your Instructions
# Relais SMS sur téléphone Android

La plateforme AfriMarket peut envoyer les codes OTP de connexion par les téléphones relais configurés par pays et par carte SIM. L'application Android correspondante se trouve dans le dépôt séparé `mobile-serveur`; son guide d'installation et son API sont documentés dans `backend/sms_relay.py` et ce dépôt mobile.

Dans le tableau d'administration, ouvrir **Authentification & information → Téléphones relais SMS** pour créer les comptes relais, modifier leur mot de passe, les supprimer et affecter une SIM disponible à chaque pays. Modifier le mot de passe révoque les sessions ouvertes; la suppression retire aussi les affectations SIM et l'historique SMS du téléphone. Le téléphone utilise le numéro, le mot de passe et la clé de connexion créés par l'administration. Une affectation active n'est utilisée que si le téléphone est en ligne; sinon le fournisseur SMS existant est utilisé.

Les notifications du tableau de bord sont cliquables et ouvrent l'écran correspondant. Les notifications de commande ouvrent la commande concernée et la mettent en évidence dans les listes du client, du commerçant ou du transporteur.
