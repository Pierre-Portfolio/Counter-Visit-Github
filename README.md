<h1 align="center">
  <img src="./assets/header.png" alt="Header" />
</h1>
<img src="./assets/star.gif" alt="star" />

---

# Compteur de visites GitHub — Proxy personnalisé

## Aperçu
Petit serveur Node.js / Express qui relaie l'image d'un compteur de visites vers ton profil ou tes dépôts GitHub. Tu intègres une simple balise `<img>` pointant sur la route `/count`, et le serveur va chercher l'image du compteur en amont, l'incrémente à **chaque visite** (aucun cache) et la renvoie. Le proxy masque l'URL et le token du service de comptage, et reste robuste même quand le service amont est lent ou indisponible.

## Fonctionnalités

### Proxy du compteur
- Route **`GET /count`** : récupère l'image du compteur en amont et la relaie au client
- **Incrément à chaque visite** : aucun cache en mémoire, le compteur monte réellement à chaque chargement de l'image
- Le **content-type** de l'amont est transmis tel quel (PNG, GIF, etc.)
- En-têtes `Cache-Control: no-cache, no-store, must-revalidate` — le navigateur ne sert jamais une version mise en cache

### Robustesse
- **Diffusion en streaming** via `stream.pipeline()` : l'image est relayée au fil de l'eau, et toute erreur (amont cassé, timeout, client qui coupe) détruit proprement les deux flux
- **Délai end-to-end de 15 s** (connexion + transfert) : un amont qui distille les octets à l'infini est coupé net
- **Plafond de 2 Mo** sur le corps relayé : au-delà, le flux amont est interrompu
- **Pixel PNG transparent de secours** : si l'amont est injoignable ou répond mal, une image 1×1 transparente est renvoyée — jamais d'icône « image cassée » dans ta page
- Codes d'erreur cohérents : **504** sur timeout, **502** sur amont invalide

### Sécurité
- **Rate-limit** : 60 requêtes / minute / IP (`express-rate-limit`)
- **En-têtes de sécurité** : `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, et `X-Frame-Options: DENY` sur toutes les routes **sauf `/count`** (l'image est faite pour être embarquée)
- **Empreinte masquée** : en-tête `X-Powered-By` désactivé
- **`trust proxy` configurable** (`TRUST_PROXY`) : l'IP cliente est résolue correctement derrière un reverse proxy (Render, Heroku, etc.) pour un rate-limit fiable

## Technologies
- **Node.js ≥ 18** (`fetch` natif, Web Streams)
- **Express 5.2.1**
- **express-rate-limit 8.5.2**
- API natives `node:stream` (`Readable.fromWeb`) et `node:stream/promises` (`pipeline`)
- Hébergement statique-friendly sur PaaS (Render / Heroku / etc.)

## Installation

```bash
git clone https://github.com/Pierre-Portfolio/counter-visit-github.git
cd counter-visit-github
npm install
npm start
```

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
# Port d'écoute du serveur (défaut : 3000)
PORT=3000

# Confiance accordée aux reverse proxies pour résoudre l'IP cliente.
# Nombre de sauts, "true"/"false", ou un mot-clé Express. Défaut : 1
TRUST_PROXY=1
```

## Endpoints

```text
GET /count   → Image du compteur (PNG/GIF amont, ou pixel transparent de secours)
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
