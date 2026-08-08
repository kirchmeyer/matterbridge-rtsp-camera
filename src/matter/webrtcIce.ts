import { WebRtcTransportDefinitions } from '@matter/types/clusters/web-rtc-transport-definitions';
import type { Go2RtcIceServer } from '../streaming/Go2RTCClient.js';

export function mapMatterIceServers(
    iceServers?: WebRtcTransportDefinitions.IceServer[],
): Go2RtcIceServer[] | undefined {
    if (!iceServers?.length) return undefined;

    const mapped = iceServers
        .map(s => ({
            urls: s.urLs ?? [],
            username: s.username,
            credential: s.credential,
        }))
        .filter(s => s.urls.length > 0);

    return mapped.length ? mapped : undefined;
}

/** Parse a=candidate lines from SDP into Matter IceCandidate objects. */
export function parseSdpIceCandidates(sdp: string): WebRtcTransportDefinitions.IceCandidate[] {
    const results: WebRtcTransportDefinitions.IceCandidate[] = [];
    let currentMid: string | null = null;
    let mLineIndex = -1;

    for (const line of sdp.split(/\r?\n/)) {
        if (line.startsWith('m=')) {
            mLineIndex++;
            currentMid = null;
        }
        if (line.startsWith('a=mid:')) {
            currentMid = line.slice(6);
        }
        if (line.startsWith('a=candidate:')) {
            results.push(new WebRtcTransportDefinitions.IceCandidate({
                candidate: line.slice(2),
                sdpMid: currentMid,
                sdpmLineIndex: mLineIndex >= 0 ? mLineIndex : null,
            }));
        }
    }

    return results;
}

/**
 * Keep only the bridge LAN host UDP candidate before sending to the Matter hub.
 * go2rtc also filters at source; this guards against trickle lines still in SDP.
 */
export function filterLocalBridgeCandidates(
    candidates: WebRtcTransportDefinitions.IceCandidate[],
    opts?: { host?: string; port?: string },
): WebRtcTransportDefinitions.IceCandidate[] {
    const host = opts?.host;
    const port = opts?.port ?? '8555';
    const ranked = candidates
        .filter(candidate => {
            const line = candidate.candidate;
            if (!/\btyp host\b/i.test(line)) return false;
            if (!/\bUDP\b/i.test(line)) return false;
            if (host && !line.includes(host)) return false;
            if (!(line.includes(` ${port} `) || line.endsWith(` ${port}`))) return false;

            const parts = line.trim().split(/\s+/);
            return parts[1] === '1';
        })
        .map(candidate => {
            const parts = candidate.candidate.trim().split(/\s+/);
            const priority = Number(parts[3] ?? 0);
            const hasUfrag = /\bufrag\b/i.test(candidate.candidate);
            return { candidate, priority, hasUfrag };
        })
        .sort((left, right) => {
            if (left.hasUfrag !== right.hasUfrag) {
                return left.hasUfrag ? -1 : 1;
            }
            return right.priority - left.priority;
        });

    return ranked.length > 0 ? [ranked[0].candidate] : [];
}

function isLanHostCandidateLine(line: string, lanPrefix?: string): boolean {
    if (!/\btyp host\b/i.test(line)) return false;
    if (!/\bUDP\b/i.test(line)) return false;

    const parts = line.trim().split(/\s+/);
    const ip = parts[4];
    if (!ip) return false;

    if (lanPrefix) {
        return ip.startsWith(lanPrefix);
    }

    return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

/**
 * Strip srflx/relay/prflx/TCP hub candidates before go2rtc sees the offer.
 * SmartThings still gathers TURN/srflx for the phone, but those pairs never
 * nominate on LAN and waste the ICE checklist on the bridge.
 */
export function filterHubOfferToLanHostCandidates(sdp: string, opts?: { lanPrefix?: string }): string {
    const lines = sdp.split(/\r?\n/);
    const filtered: string[] = [];
    let removed = 0;

    for (const line of lines) {
        if (line.startsWith('a=candidate:')) {
            if (isLanHostCandidateLine(line, opts?.lanPrefix)) {
                filtered.push(line);
            } else {
                removed++;
            }
            continue;
        }
        filtered.push(line);
    }

    if (removed === 0) return sdp;
    return filtered.join('\r\n');
}

/**
 * Mark the hub as ice-lite in the offer copy passed to go2rtc only.
 * Per RFC 8445 / pion: when remote is lite and local is full, the answerer
 * (go2rtc) becomes the controlling agent and can send USE-CANDIDATE.
 * SmartThings was leaving host pairs at succeeded/nominated:false indefinitely.
 */
export function markRemoteIceLiteInOffer(sdp: string): string {
    if (/\ba=ice-lite\b/i.test(sdp)) return sdp;

    const lines = sdp.split(/\r?\n/);
    const out: string[] = [];
    let inserted = false;

    for (const line of lines) {
        out.push(line);
        if (!inserted && /^t=\d+\s+\d+/.test(line)) {
            out.push('a=ice-lite');
            inserted = true;
        }
    }

    if (!inserted) {
        out.splice(3, 0, 'a=ice-lite');
    }

    return out.join('\r\n');
}

export interface HubOfferDiagnostics {
    sdpChars: number;
    candidateCount: number;
    setupLines: string[];
    iceLite: boolean;
    fingerprintPrefix: string | null;
}

/** Summarize hub offer SDP for live-view debug logs. */
export function describeHubOffer(sdp: string): HubOfferDiagnostics {
    const setupLines = [...sdp.matchAll(/^a=setup:(\S+)/gm)].map(m => m[1] ?? '');
    const fp = sdp.match(/^a=fingerprint:(\S+)\s+(\S+)/m);
    return {
        sdpChars: sdp.length,
        candidateCount: parseSdpIceCandidates(sdp).length,
        setupLines,
        iceLite: /\ba=ice-lite\b/i.test(sdp),
        fingerprintPrefix: fp ? `${fp[1]} ${fp[2].slice(0, 16)}…` : null,
    };
}

export function formatHubOfferDiagnostics(d: HubOfferDiagnostics): string {
    return `sdp=${d.sdpChars}ch candidates=${d.candidateCount} setup=[${d.setupLines.join(',')}] `
        + `ice-lite=${d.iceLite} fp=${d.fingerprintPrefix ?? 'none'}`;
}

/** Summarize answer SDP setup lines (DTLS role hint). */
export function describeAnswerSetup(sdp: string): string {
    const lines = [...sdp.matchAll(/^a=setup:(\S+)/gm)].map(m => m[1] ?? '');
    return lines.length ? `answer-setup=[${lines.join(',')}]` : 'answer-setup=none';
}

/** Compact hub offers (Android SmartThings) use fewer candidates and smaller SDP. */
export const COMPACT_HUB_OFFER_MAX_CHARS = 5500;
export const COMPACT_HUB_OFFER_MAX_CANDIDATES = 16;

/** Android SmartThings offers are small with few candidates; iOS offers are larger. */
export function isCompactHubOffer(sdp: string): boolean {
    return sdp.length < COMPACT_HUB_OFFER_MAX_CHARS
        && parseSdpIceCandidates(sdp).length <= COMPACT_HUB_OFFER_MAX_CANDIDATES;
}

/** Ensure bridge candidates appear inline in the answer SDP (not only Matter trickle). */
export function embedLocalCandidatesInAnswerSdp(
    sdp: string,
    candidates: WebRtcTransportDefinitions.IceCandidate[],
): string {
    const trickle = candidates
        .map(c => c.candidate.trim())
        .filter(raw => raw && raw !== 'end-of-candidates')
        .map(raw => (raw.startsWith('candidate:') ? raw : `candidate:${raw}`));
    if (!trickle.length) return sdp;
    return appendTrickleCandidatesToSdp(sdp, trickle);
}

/** Prepare hub offer SDP for go2rtc: LAN host candidates only + ice-lite hint. */
export function prepareHubOfferForGo2rtc(sdp: string, opts?: { lanPrefix?: string }): string {
    return markRemoteIceLiteInOffer(filterHubOfferToLanHostCandidates(sdp, opts));
}

/** Rewrite SDP so only the preferred bridge LAN candidate is advertised to the hub. */
export function filterSdpToLocalBridgeCandidate(
    sdp: string,
    opts?: { host?: string; port?: string },
): string {
    const allowed = new Set(
        filterLocalBridgeCandidates(parseSdpIceCandidates(sdp), opts)
            .map(candidate => `a=${candidate.candidate}`),
    );

    if (allowed.size === 0) return sdp;

    const lines = sdp.split(/\r?\n/);
    const filtered: string[] = [];

    for (const line of lines) {
        if (!line.startsWith('a=candidate:')) {
            filtered.push(line);
            continue;
        }

        if (allowed.has(line.trim())) {
            filtered.push(line);
        }
    }

    return filtered.join('\r\n');
}

/** Append trickle candidates from go2rtc WebSocket into an SDP answer. */
export function appendTrickleCandidatesToSdp(sdp: string, trickleCandidates: string[]): string {
    if (!trickleCandidates.length) return sdp;

    const existing = new Set<string>();
    for (const line of sdp.split(/\r?\n/)) {
        if (line.startsWith('a=candidate:')) {
            existing.add(line);
        }
    }

    const additions: string[] = [];
    for (const raw of trickleCandidates) {
        const trimmed = raw.trim();
        if (!trimmed) continue;

        const line = trimmed.startsWith('a=candidate:')
            ? trimmed
            : trimmed.startsWith('candidate:')
                ? `a=${trimmed}`
                : `a=candidate:${trimmed}`;

        if (!existing.has(line)) {
            existing.add(line);
            additions.push(line);
        }
    }

    if (!additions.length) return sdp;

    const suffix = `${additions.join('\r\n')}\r\n`;
    return sdp.endsWith('\r\n') ? `${sdp}${suffix}` : `${sdp}\r\n${suffix}`;
}

/** Build WHEP trickle-ice-sdpfrag body from Matter ICE candidates. */
export function matterIceToSdpFrag(candidates: WebRtcTransportDefinitions.IceCandidate[]): string {
    const lines: string[] = [];

    for (const c of candidates) {
        const raw = c.candidate?.trim() ?? '';
        if (!raw || raw === 'end-of-candidates') {
            lines.push('a=end-of-candidates');
            continue;
        }
        const cand = raw.startsWith('candidate:') ? raw : `candidate:${raw}`;
        if (c.sdpMid != null) {
            lines.push(`a=mid:${c.sdpMid}`);
        } else if (c.sdpmLineIndex != null) {
            lines.push(`a=mid:${c.sdpmLineIndex}`);
        }
        lines.push(`a=${cand}`);
    }

    return `${lines.join('\r\n')}\r\n`;
}
