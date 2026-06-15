//Import
import express from 'express';
import rateLimit from 'express-rate-limit';
import { Readable } from 'node:stream';

const port = process.env.PORT || 3000;
const COUNTER_URL = 'https://counter9.stat.ovh/private/compteurdevisite.php?c=dzct1uqm5lpgwmqn18387dkn26w125w5';
const FETCH_TIMEOUT = 15 * 1000; // 15 seconds, end-to-end (connect + streaming)
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB ceiling on the relayed body

// 1x1 transparent PNG served when the upstream counter can't be reached, so an
// <img> tag pointing at /count never shows a broken-image icon.
const FALLBACK_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);

const app = express();

// Hide the framework fingerprint.
app.disable('x-powered-by');

// Trust the configured number of reverse proxies (Render/Heroku/etc.) so the
// client IP is resolved correctly for rate limiting. Configurable via
// TRUST_PROXY: a number of hops, or "false"/"true". Defaults to 1 hop.
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

// Minimal security headers (no extra dependency).
app.use((req, res, next) => {
    res.set({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer'
    });
    next();
});

// Rate limiting: 60 requests / minute / IP
app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
}));

app.get('/count', async (req, res) => {
    const controller = new AbortController();
    // End-to-end deadline: aborting the signal also errors the body stream
    // mid-transfer, so a slow upstream that drips bytes forever is still cut off.
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const done = () => clearTimeout(timeout);

    try {
        const response = await fetch(COUNTER_URL, { signal: controller.signal });

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.startsWith('image/') || !response.body) {
            done();
            return sendFallback(res, 502);
        }

        res.set({
            'content-type': contentType,
            'cache-control': 'max-age=0, no-cache, no-store, must-revalidate'
        });

        const upstream = Readable.fromWeb(response.body);
        let bytes = 0;

        const cleanup = () => {
            done();
            controller.abort();
            upstream.destroy();
        };

        // Stop relaying if the upstream body exceeds the size ceiling.
        upstream.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_IMAGE_BYTES) {
                cleanup();
                if (!res.headersSent) sendFallback(res, 502);
                else res.destroy();
            }
        });

        // Handle a broken upstream stream, even after headers have been sent.
        upstream.on('error', () => {
            cleanup();
            if (!res.headersSent) sendFallback(res, 502);
            else res.destroy();
        });

        // Client hung up: stop fetching and clear the deadline.
        res.on('close', cleanup);
        res.on('finish', done);

        upstream.pipe(res);
    } catch (err) {
        done();
        if (!res.headersSent) {
            sendFallback(res, err.name === 'AbortError' ? 504 : 502);
        } else {
            res.destroy();
        }
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

// Serve the transparent fallback pixel with the given status code.
function sendFallback(res, status) {
    res.status(status).set({
        'content-type': 'image/png',
        'cache-control': 'max-age=0, no-cache, no-store, must-revalidate'
    }).end(FALLBACK_PNG);
}

// Parse TRUST_PROXY: a hop count (number), "false"/"true", or default 1.
function parseTrustProxy(value) {
    if (value === undefined) return 1;
    if (value === 'false') return false;
    if (value === 'true') return true;
    const hops = Number(value);
    return Number.isNaN(hops) ? value : hops;
}
