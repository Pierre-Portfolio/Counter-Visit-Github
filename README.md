<h1 align="center">
  <img src="./assets/header.png" alt="Header" />
</h1>
<img src="./assets/star.gif" alt="star" />

---

# Compteur de visites GitHub — Proxy personnalisé

## Aperçu
Petit serveur Node.js / Express qui relaie l'image d'un compteur de visites vers ton profil ou tes dépôts GitHub. Tu intègres une simple balise `<img>` pointant sur la route `/count`, et le serveur va chercher l'image du compteur en amont, l'incrémente à **chaque visite** (aucun cache) et la renvoie. Le proxy masque l'URL et le token du service de comptage — fournis via la variable d'environnement `COUNTER_URL`, jamais en dur dans le code — et reste robuste même quand le service amont est lent ou indisponible.

## Fonctionnalités

### Proxy du compteur
- Route **`GET /count`** : récupère l'image du compteur en amont et la relaie au client
- **Incrément à chaque visite** : aucun cache en mémoire, le compteur monte réellement à chaque chargement de l'image
- Le **content-type** de l'amont est transmis tel quel (PNG, GIF, etc.)
- En-têtes `Cache-Control: no-cache, no-store, must-revalidate` — le navigateur ne sert jamais une version mise en cache

### Robustesse
- **Diffusion en streaming** via `stream.pipeline()` : l'image est relayée au fil de l'eau, et toute erreur (amont cassé, timeout, client qui coupe) détruit proprement les deux flux
- **Deux échéances distinctes** : **3 s** pour obtenir les en-têtes de l'amont (DNS + connexion), puis **15 s** pour le transfert du corps. Un amont mort échoue vite au lieu d'immobiliser une socket, et un amont qui distille les octets à l'infini est coupé net
- **Plafond de 2 Mo** sur le corps relayé : refusé d'emblée si le `Content-Length` annoncé dépasse la limite, interrompu en cours de flux sinon
- **Pixel PNG transparent de secours** : si l'amont est injoignable ou répond mal, une image 1×1 transparente est renvoyée — jamais d'icône « image cassée » dans ta page
- Codes d'erreur cohérents : **504** sur timeout, **502** sur amont invalide, **503** si `COUNTER_URL` n'est pas configurée
- **Arrêt propre** sur `SIGTERM` / `SIGINT` : les réponses en cours se terminent au lieu d'être coupées lors d'un redéploiement

### Sécurité
- **Rate-limit** : 60 requêtes / minute / IP (`express-rate-limit`)
- **En-têtes de sécurité** : `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, et `X-Frame-Options: DENY` sur toutes les routes **sauf `/count`** (l'image est faite pour être embarquée)
- **Empreinte masquée** : en-tête `X-Powered-By` désactivé
- **`trust proxy` désactivé par défaut** : faire confiance à un proxy absent laisse n'importe quel client forger `X-Forwarded-For` et obtenir un compteur de rate-limit neuf à chaque requête. Mets `TRUST_PROXY` au nombre réel de sauts (`1` sur Render/Heroku) uniquement quand l'app est réellement derrière un reverse proxy
- **Aucun secret dans le code** : l'URL du compteur et son token vivent dans `COUNTER_URL`
- **Pas de fuite de stack trace** : un throw inattendu renvoie un `500` en texte brut

## Technologies
- **Node.js ≥ 18** (`fetch` natif, Web Streams)
- **Express 5.2.1**
- **express-rate-limit 8.6.0**
- API natives `node:stream` (`Readable.fromWeb`) et `node:stream/promises` (`pipeline`)
- Hébergement statique-friendly sur PaaS (Render / Heroku / etc.)

## Installation

```bash
git clone https://github.com/Pierre-Portfolio/counter-visit-github.git
cd counter-visit-github
npm install
COUNTER_URL="https://ton-service-de-compteur/…" npm start
```

`COUNTER_URL` est **obligatoire** : c'est l'URL de l'image du compteur en amont (token compris). Sans elle, le serveur démarre quand même mais `/count` ne renvoie que le pixel de secours en `503`. Aucune valeur par défaut n'est codée en dur, ce qui permet de changer de fournisseur de compteur sans toucher au code.

Le serveur démarre sur le port **3000** par défaut. Intègre ensuite le compteur dans ton README ou ton profil :

```html
<img src="https://ton-domaine/count" alt="Visiteurs" />
```

## Structure du projet
```
Counter-Visit-Github/
  index.js          → Serveur Express (proxy /count + routes + fallback)
  package.json      → Dépendances et scripts
  package-lock.json → Versions verrouillées
  assets/
    header.png      → Bannière README
    star.gif        → Animation README
    result.png      → Aperçu du compteur
```

## Configuration (variables d'environnement)

```bash
# URL de l'image du compteur en amont, token compris. OBLIGATOIRE.
COUNTER_URL=https://ton-service-de-compteur/…

# Port d'écoute du serveur (défaut : 3000)
PORT=3000

# Confiance accordée aux reverse proxies pour résoudre l'IP cliente.
# Nombre de sauts, "true"/"false", ou un mot-clé Express. Défaut : false.
# À passer à 1 derrière Render / Heroku, sinon le rate-limit est contournable.
TRUST_PROXY=1
```

## Endpoints

```text
GET /count   → Image du compteur (PNG/GIF amont, ou pixel transparent de secours)
               200 amont OK · 502 amont invalide · 504 timeout · 503 COUNTER_URL absente
GET /        → Texte de santé : "Counter is running..."
*            → 404 "Not found"
```

## Aperçu de l'interface
<img src="./assets/result.png" alt="Counter" />

## Auteurs
- [@Jason](https://github.com/JasonDhose)
- [@Pierre](https://github.com/Pierre-Portfolio)

---

<p align="center">Projet réalisé en 2022 & mis à jour en 2026.</p>
