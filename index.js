//Import
import fetch from 'node-fetch';
import express from 'express';
const app = express();

app.get('/count', async (req, res) => {
    res.set({
        'content-type': 'image/png',
        'cache-control': 'max-age=0, no-cache, no-store, must-revalidate'
    })

    const img = await ((await fetch('https://counter9.stat.ovh/private/compteurdevisite.php?c=dzct1uqm5lpgwmqn18387dkn26w125w5'))).arrayBuffer();

    res.end(new Uint8Array(img), 'binary');
});

app.listen(80, () => console.log('Ready!'));
