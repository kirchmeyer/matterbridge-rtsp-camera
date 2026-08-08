const adoptionEvents = new Set<string>();

function endpointKey(cameraId: string, kind: string): string {
    return `${cameraId}:${kind}`;
}

/**
 * Permanent per-process log marker for the first hub interaction seen on a bridged camera.
 * Helps distinguish "endpoint exists on the bridge" from "controller created and uses the child".
 */
export function logHubEndpointAdoption(cameraId: string, kind: string, detail?: string): void {
    const key = endpointKey(cameraId, kind);
    if (adoptionEvents.has(key)) return;
    adoptionEvents.add(key);

    const suffix = detail ? ` ${detail}` : '';
    console.log(`Hub adopted bridged camera=${cameraId} signal=${kind}${suffix}`);
}
