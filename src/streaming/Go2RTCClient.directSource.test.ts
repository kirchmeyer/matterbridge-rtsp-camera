import assert from 'node:assert/strict';
import { Go2RTCClient } from './Go2RTCClient.js';

const originalFetch = globalThis.fetch;
const requests: Array<{ url: URL; method: string }> = [];
const rtspUrl = 'rtsp://camera.example:8554/live?video=all&audio=all';

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    requests.push({ url, method });

    if (method === 'PUT' || method === 'DELETE') {
        throw new Error(`unexpected go2rtc mutation: ${method} ${url}`);
    }
    if (url.pathname === '/api/frame.jpeg') {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    }
    if (url.pathname === '/api/webrtc') {
        return new Response('v=0\r\n', { headers: { 'content-type': 'application/sdp' } });
    }
    return new Response(null, { status: 404 });
};

try {
    const client = new Go2RTCClient('http://go2rtc.example:1984');
    client.registerDirectSource('front-door', 'Front Door', rtspUrl);

    assert.deepEqual(await client.captureFrame('front-door'), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    assert.equal((await client.exchangeWebRtcOffer('front-door', 'v=0\r\n')).answerSdp, 'v=0\r\n');

    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url.pathname, '/api/frame.jpeg');
    assert.equal(requests[0]?.url.searchParams.get('src'), rtspUrl);
    assert.equal(requests[1]?.url.pathname, '/api/webrtc');
    assert.equal(requests[1]?.url.searchParams.get('src'), rtspUrl);
    assert.equal(requests[1]?.method, 'POST');
} finally {
    globalThis.fetch = originalFetch;
}

console.log('Go2RTCClient.directSource.test.ts: ok');