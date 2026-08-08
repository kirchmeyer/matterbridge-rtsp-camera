const SENSITIVE_QUERY_KEYS = new Set(['password', 'pass', 'pwd', 'token']);

/** Remove outer ffmpeg: wrapper and return the nested source URL when present. */
export function unwrapStreamSourceUrl(source: string): string {
    const value = String(source ?? '').trim();
    if (!value.startsWith('ffmpeg:')) return value;

    const inner = value.slice('ffmpeg:'.length);
    const hashIndex = inner.indexOf('#');
    return hashIndex === -1 ? inner : inner.slice(0, hashIndex);
}

/** Parse a stream source URL, including nested URLs inside ffmpeg: wrappers. */
export function parseStreamSourceUrl(source: string): URL | null {
    const unwrapped = unwrapStreamSourceUrl(source);
    if (!/^[a-z]+:\/\//i.test(unwrapped)) return null;

    try {
        return new URL(unwrapped);
    } catch {
        return null;
    }
}

/** Hostname of a stream source URL, if one can be parsed safely. */
export function streamSourceHostname(source: string): string | undefined {
    return parseStreamSourceUrl(source)?.hostname.toLowerCase() || undefined;
}

/** Whether the source contains inline credentials or credential-like query parameters. */
export function streamSourceHasSensitiveCredentials(source: string): boolean {
    const parsed = parseStreamSourceUrl(source);
    if (!parsed) return false;
    if (parsed.password) return true;

    for (const [key, value] of parsed.searchParams.entries()) {
        if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) && value) {
            return true;
        }
    }

    return false;
}

export function redactSensitiveQueryParams(parsed: URL): URL {
    for (const [key, value] of parsed.searchParams.entries()) {
        if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) && value) {
            parsed.searchParams.set(key, '***');
        }
    }
    return parsed;
}