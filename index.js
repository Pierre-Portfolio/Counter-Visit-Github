//Import
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const port = process.env.PORT || 3000;
const COUNTER_URL = 'https://counter9.stat.ovh/private/compteurdevisite.php?c=dzct1uqm5lpgwmqn18387dkn26w125w5';
const FETCH_TIMEOUT = 3 * 60 * 1000; // 3 minutes

const app = express();

// Security headers
app.use(helmet());

// Rate limiting: 60 requests / minute / IP
app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
}));

app.get('/count', async (req, res) => {
    res.set({
        'content-type': 'image/png',
        'cache-control': 'max-age=0, no-cache, no-store, must-revalidate'
    });

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        let response;
        try {
            response = await fetch(COUNTER_URL, { signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            return res.status(502).end(`Upstream counter service returned ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        return res.end(buffer, 'binary');
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
