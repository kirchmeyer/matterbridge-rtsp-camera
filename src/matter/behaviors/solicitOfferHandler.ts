import { Logger } from '@matter/general';
import { WebRtcTransportProvider } from '@matter/types/clusters/web-rtc-transport-provider';
import { StreamUsage } from '@matter/types';

const logger = Logger.get('MatterWebRtc');

/**
 * SmartThings may invoke SolicitOffer on reconnect. This bridge uses go2rtc as a
 * passive WebRTC answerer, so live view is established via ProvideOffer instead.
 * Return a valid response without deferred offer so the hub can proceed.
 */
export function buildSolicitOfferResponse(
    sessionId: number,
    request: WebRtcTransportProvider.SolicitOfferRequest,
): WebRtcTransportProvider.SolicitOfferResponse {
    const videoStreamId = request.videoStreams?.[0] ?? request.videoStreamId ?? 1;
    const audioStreamId = request.audioStreams?.[0] ?? request.audioStreamId ?? null;

    logger.info(
        `SolicitOffer session=${sessionId} streamUsage=${request.streamUsage ?? StreamUsage.LiveView} `
        + `videoStreamId=${videoStreamId} (hub should use ProvideOffer for media)`,
    );

    return new WebRtcTransportProvider.SolicitOfferResponse({
        webRtcSessionId: sessionId,
        deferredOffer: true,
        videoStreamId,
        audioStreamId,
    });
}
