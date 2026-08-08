import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
let matterSdkRequire = require;
try {
    matterSdkRequire = createRequire(import.meta.resolve('matterbridge/matter'));
} catch {
    // Standalone MatterCameras resolves the SDK from its own dependency tree.
}
const matterNodeEntry = matterSdkRequire.resolve('@matter/node');
const supervisionConfigPath = join(
    dirname(matterNodeEntry),
    '../esm/behavior/supervision/SupervisionConfig.js',
);
const { GlobalConfig, commandSupervisionConfigs } = matterSdkRequire(supervisionConfigPath);

const WEBRTC_COMMANDS = ['provideOffer', 'solicitOffer', 'provideAnswer', 'provideIceCandidates'];

/** Disable strict TLV validation for WebRTC commands (SmartThings sends partial sFrameConfig). */
export function disableWebRtcCommandValidation(constructor: Function) {
    const prototype = constructor.prototype;
    let map = commandSupervisionConfigs.get(prototype);
    if (map === undefined) {
        map = new Map();
        commandSupervisionConfigs.set(prototype, map);
    }

    for (const method of WEBRTC_COMMANDS) {
        let config = map.get(method);
        if (config === undefined) {
            config = new GlobalConfig();
            map.set(method, config);
        }
        config.supervision ??= {};
        config.supervision.validate = false;
    }
}
