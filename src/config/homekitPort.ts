/**
 * The TCP port a HomeKit camera listens on. Left out, the HomeKit library picks a free port at every start (the
 * default, and the port is advertised over mDNS, so pairing works either way); set, the camera keeps it across
 * restarts, which is what a firewall rule between networks needs.
 */
export function parseHomeKitPort(value: unknown, camera: string): number | undefined {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1024 || value > 65535) {
        throw new Error(`Camera ${camera} has a homekitPort that is not a whole number from 1024 to 65535`);
    }
    return value;
}

/** Two cameras cannot listen on the same port: said before anything is published. */
export function assertDistinctPorts(cameras: Array<{ id: string; homekitPort?: number }>): void {
    const seen = new Map<number, string>();
    for (const camera of cameras) {
        if (camera.homekitPort === undefined) {
            continue;
        }
        const other = seen.get(camera.homekitPort);
        if (other !== undefined) {
            throw new Error(`Cameras ${other} and ${camera.id} are both set to HomeKit port ${camera.homekitPort}`);
        }
        seen.set(camera.homekitPort, camera.id);
    }
}
