//Import
import express from 'express';
import rateLimit from 'express-rate-limit';
import { Readable } from 'node:stream';

const port = process.env.PORT || 3000;
const COUNTER_URL = 'https://counter9.stat.ovh/private/compteurdevisite.php?c=dzct1uqm5lpgwmqn18387dkn26w125w5';
const FETCH_TIMEOUT = 3 * 60 * 1000; // 3 minutes

const app = express();

// Trust the first reverse proxy (Render/Heroku/etc.) so the client IP is
// resolved correctly for rate limiting.
app.set('trust proxy', 1);

// Rate limiting: 60 requests / minute / IP
app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
}));

app.get('/count', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        let response;
        try {
            response = await fetch(COUNTER_URL, { signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.startsWith('image/')) {
            return res.status(502).end('Unable to fetch counter image');
        }

        res.set({
            'content-type': contentType,
            'cache-control': 'max-age=0, no-cache, no-store, must-revalidate'
        });

        // Stream the upstream image straight to the client to avoid
        // buffering the whole body in memory.
        Readable.fromWeb(response.body).pipe(res);
    } catch (err) {
        const status = err.name === 'AbortError' ? 504 : 502;
        return res.status(status).end('Unable to fetch counter image');
    }
});

// Root route
app.get('/', (req, res) => {
    res.type('text/plain').send('Counter is running. Visit /count for the visitor counter image.');
});

// 404 handler
app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
});

app.listen(port, () => console.log("server running"));
