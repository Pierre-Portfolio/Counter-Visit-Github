//Import
import express from 'express';
import rateLimit from 'express-rate-limit';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const port = process.env.PORT || 3000;

// Upstream counter image. Required: no default is baked in, so the provider can
// be swapped without a commit and no token ends up in the repository.
const COUNTER_URL = process.env.COUNTER_URL;

// Two separate deadlines. The first covers name resolution + connect + response
// headers, and is short so a dead upstream fails fast instead of parking a
// socket for the whole transfer budget. The second covers the body transfer.
const HEADERS_TIMEOUT = 3 * 1000;
const BODY_TIMEOUT = 15 * 1000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB ceiling on the relayed body

// 1x1 transparent PNG served when the upstream counter can't be reached, so an
// <img> tag pointing at /count never shows a broken-image icon.
const FALLBACK_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);

if (!COUNTER_URL) {
    console.warn('COUNTER_URL is not set: /count will only serve the fallback pixel.');
}

const app = express();

// Hide the framework fingerprint.
app.disable('x-powered-by');

// Number of reverse proxies to trust when resolving the client IP for rate
// limiting. Defaults to false: trusting a proxy that isn't there lets any
// client forge X-Forwarded-For and get a fresh rate-limit bucket per request.
// Set TRUST_PROXY=1 (or the real hop count) when deploying behind Render/Heroku.
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

// Minimal security headers (no extra dependency).
app.use((req, res, next) => {
    res.set({
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer'
    });
    // X-Frame-Options: DENY would forbid framing, but /count is an image meant
    // to be embedded elsewhere, so only apply it to the other (non-image) routes.
    if (req.path !== '/count') {
        res.set('x-frame-options', 'DENY');
    }
    next();
});

// Rate limiting: 60 requests / minute / IP
app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
}));

app.get('/count', async (req, res) => {
    if (!COUNTER_URL) {
        return sendFallback(res, 503);
    }

    const controller = new AbortController();
    // Aborting the signal also errors the body stream mid-transfer, so a slow
    // upstream that drips bytes forever is still cut off.
    let timer = setTimeout(() => controller.abort(), HEADERS_TIMEOUT);
    const done = () => clearTimeout(timer);

    let response;
    try {
        response = await fetch(COUNTER_URL, { signal: controller.signal });
        // Headers are in: swap the short connect deadline for the transfer one.
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), BODY_TIMEOUT);

        const contentType = response.headers.get('content-type') || '';
        // Reject an oversized body before any header is written, so the client
        // gets the fallback pixel rather than a truncated image. Bodies without
        // a declared length are still capped mid-stream below.
        const declaredBytes = Number(response.headers.get('content-length'));
        const tooLarge = Number.isFinite(declaredBytes) && declaredBytes > MAX_IMAGE_BYTES;

        if (!response.ok || !contentType.startsWith('image/') || !response.body || tooLarge) {
            done();
            await discard(response);
            return sendFallback(res, 502);
        }

        res.set({
            'content-type': contentType,
            'cache-control': 'max-age=0, no-cache, no-store, must-revalidate'
        });

        const upstream = Readable.fromWeb(response.body);
        let bytes = 0;

        // Stop relaying if the upstream body exceeds the size ceiling. Destroying
        // with an error makes pipeline() reject so the response is torn down too.
        upstream.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_IMAGE_BYTES) {
                upstream.destroy(new Error('upstream image exceeds size limit'));
            }
        });

        // pipeline() propagates errors and destroys both streams on any failure —
        // a broken/oversized upstream, the transfer deadline abort, or the client
        // hanging up (res 'close') — so nothing is left dangling.
        await pipeline(upstream, res);
        done();
    } catch (err) {
        done();
        controller.abort();
        await discard(response);
        console.warn(`/count failed: ${err.name}: ${err.message}`);
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

// Error handler: keeps Express from rendering its default HTML page (which
// leaks a stack trace outside production) on an unexpected throw.
app.use((err, req, res, next) => {
    console.error('unhandled error:', err);
    if (res.headersSent) {
        return res.destroy();
    }
    res.status(500).type('text/plain').send('Internal server error');
});

const server = app.listen(port, () => console.log(`server running on port ${port}`));

server.on('error', (err) => {
    console.error(`failed to start server: ${err.message}`);
    process.exit(1);
});

// Graceful shutdown: PaaS platforms send SIGTERM on redeploy, and closing the
// server lets in-flight responses finish instead of being cut mid-image.
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        console.log(`${signal} received, shutting down`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10 * 1000).unref();
    });
}

// Serve the transparent fallback pixel with the given status code.
function sendFallback(res, status) {
    res.status(status).set({
        'content-type': 'image/png',
        'cache-control': 'max-age=0, no-cache, no-store, must-revalidate'
    }).end(FALLBACK_PNG);
}

// Release an upstream body we won't relay: an unread fetch body keeps its
// socket alive until garbage collection.
async function discard(response) {
    try {
        await response?.body?.cancel();
    } catch {
        // The body may already be errored or locked; nothing left to release.
    }
}

// Parse TRUST_PROXY: a hop count (number), "false"/"true", or default false.
function parseTrustProxy(value) {
    if (value === undefined) return false;
    if (value === 'false') return false;
    if (value === 'true') return true;
    const hops = Number(value);
    return Number.isNaN(hops) ? value : hops;
}
