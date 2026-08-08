import { parseStreamSourceUrl, redactSensitiveQueryParams, unwrapStreamSourceUrl } from './streamSourceUrl.js';

/**
 * Redact credentials from an RTSP/RTSPS URL for safe logging and UI display.
 * Replaces `user:password@` with `***@` (mirrors matter-onvif-bridge).
 */
export function redactRtspUrl(url: string): string {
    if (!url) return '<empty-url>';

    if (url.startsWith('ffmpeg:')) {
        const inner = unwrapStreamSourceUrl(url);
        const suffix = url.slice(`ffmpeg:${inner}`.length);
        return `ffmpeg:${redactRtspUrl(inner)}${suffix}`;
    }

    try {
        const parsed = parseStreamSourceUrl(url) ?? new URL(url);
        if (parsed.username || parsed.password) {
            parsed.username = '***';
            parsed.password = '';
        }
        redactSensitiveQueryParams(parsed);
        return parsed.toString();
    } catch {
        return url
            .replace(/(rtsps?|rtmps?|https?):\/\/([^:@/?#\s]+):([^@/?#\s]+)@/gi, '$1://$2:***@')
            .replace(/([?&](?:password|pass|pwd|token)=)([^&#\s]+)/gi, '$1***');
    }
}

/** Inject or replace RTSP credentials (used after ONVIF GetStreamUri). */
export function injectRtspCredentials(rtspUrl: string, username: string, password: string): string {
    if (!username && !password) return rtspUrl;
    try {
        const parsed = new URL(rtspUrl);
        if (username) parsed.username = encodeURIComponent(username);
        if (password) parsed.password = encodeURIComponent(password);
        return parsed.toString();
    } catch {
        return rtspUrl;
    }
}

/** Redact RTSP credentials embedded in arbitrary log text (e.g. go2rtc error bodies). */
export function redactRtspInText(text: string): string {
    return text
        .replace(/((?:ffmpeg:)?(?:rtsps?|rtmps?|https?):\/\/)([^:@/?#\s]+):([^@/?#\s]+)@/gi, '$1$2:***@')
        .replace(/([?&](?:password|pass|pwd|token)=)([^&#\s]+)/gi, '$1***');
}
