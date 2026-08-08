import {
  Accessory,
  CameraController,
  Categories,
  Characteristic,
  H264Level,
  H264Profile,
  HAPStorage,
  MDNSAdvertiser,
  Service,
  SRTPCryptoSuites,
  StreamRequestTypes,
  type CameraStreamingDelegate,
  type HAPPincode,
  type MacAddress,
  type PrepareStreamCallback,
  type PrepareStreamRequest,
  type SnapshotRequest,
  type SnapshotRequestCallback,
  type StreamingRequest,
  type StreamRequestCallback,
  type StreamSessionIdentifier,
  uuid,
} from '@homebridge/hap-nodejs';
import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createSocket, type Socket } from 'node:dgram';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import ffmpegPackagePath from 'ffmpeg-for-homebridge';

export interface HomeKitCameraConfig {
  id: string;
  name: string;
  rtspUrl: string;
}

interface HomeKitLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

interface PendingSession {
  address: string;
  cryptoSuite: SRTPCryptoSuites;
  ipv6: boolean;
  keyAndSalt: Buffer;
  returnSocket: Socket;
  ssrc: number;
  targetPort: number;
}

interface ActiveSession {
  process: ChildProcess;
  returnSocket: Socket;
  timeout?: ReturnType<typeof setTimeout>;
}

const PIN_PATTERN = /^\d{3}-\d{2}-\d{3}$/;
const STREAM_IDLE_TIMEOUT_MS = 30_000;
const SNAPSHOT_TIMEOUT_MS = 15_000;
let configuredStoragePath: string | undefined;

function configureStorage(storagePath: string): void {
  if (configuredStoragePath === storagePath) return;
  if (configuredStoragePath) {
    throw new Error(`HomeKit storage is already configured at ${configuredStoragePath}`);
  }
  HAPStorage.setCustomStoragePath(storagePath);
  configuredStoragePath = storagePath;
}

function stableIdentity(id: string): { setupId: string; username: MacAddress } {
  const digest = createHash('sha256').update(`matterbridge-camera:${id}`).digest();
  digest[0] = ((digest[0] ?? 0) & 0xfe) | 0x02;
  const username = [...digest.subarray(0, 6)]
    .map(value => value.toString(16).padStart(2, '0').toUpperCase())
    .join(':') as MacAddress;
  return { setupId: digest.toString('hex').slice(12, 16).toUpperCase(), username };
}

function reserveUdpSocket(ipv6: boolean): Promise<{ port: number; socket: Socket }> {
  return new Promise((resolve, reject) => {
    const socket = createSocket(ipv6 ? 'udp6' : 'udp4');
    socket.once('error', reject);
    socket.bind(0, ipv6 ? '::' : '0.0.0.0', () => {
      socket.removeListener('error', reject);
      const address = socket.address();
      resolve({ port: address.port, socket });
    });
  });
}

function ffmpegPath(): string {
  if (ffmpegPackagePath) return ffmpegPackagePath;
  return 'ffmpeg';
}

class HomeKitStreamingDelegate implements CameraStreamingDelegate {
  private readonly pendingSessions = new Map<StreamSessionIdentifier, PendingSession>();
  private readonly activeSessions = new Map<StreamSessionIdentifier, ActiveSession>();
  controller?: CameraController;

  constructor(
    private readonly camera: HomeKitCameraConfig,
    private readonly log: HomeKitLogger,
  ) {}

  handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): void {
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-rtsp_transport', 'tcp', '-i', this.camera.rtspUrl,
      '-frames:v', '1',
      '-vf', `scale=${request.width}:${request.height}:force_original_aspect_ratio=decrease`,
      '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1',
    ];
    const child = spawn(ffmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`Snapshot timed out after ${SNAPSHOT_TIMEOUT_MS}ms`));
    }, SNAPSHOT_TIMEOUT_MS);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(error, error ? undefined : Buffer.concat(chunks));
    };

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('error', error => finish(error));
    child.once('exit', code => {
      if (code === 0 && chunks.length > 0) finish();
      else finish(new Error(`Snapshot failed (${code ?? 'signal'}): ${stderr.trim() || 'no image returned'}`));
    });
  }

  async prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): Promise<void> {
    try {
      this.stopSession(request.sessionID);
      const ipv6 = request.addressVersion === 'ipv6';
      const { port, socket } = await reserveUdpSocket(ipv6);
      const ssrc = CameraController.generateSynchronisationSource();
      this.pendingSessions.set(request.sessionID, {
        address: request.targetAddress,
        cryptoSuite: request.video.srtpCryptoSuite,
        ipv6,
        keyAndSalt: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
        returnSocket: socket,
        ssrc,
        targetPort: request.video.port,
      });
      callback(undefined, {
        video: {
          port,
          ssrc,
          srtp_key: request.video.srtp_key,
          srtp_salt: request.video.srtp_salt,
        },
      });
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void {
    if (request.type === StreamRequestTypes.START) {
      this.startStream(request, callback);
      return;
    }
    if (request.type === StreamRequestTypes.RECONFIGURE) {
      callback();
      return;
    }
    this.stopSession(request.sessionID);
    callback();
  }

  stopAll(): void {
    for (const sessionId of new Set([...this.pendingSessions.keys(), ...this.activeSessions.keys()])) {
      this.stopSession(sessionId);
    }
  }

  private startStream(request: Extract<StreamingRequest, { type: StreamRequestTypes.START }>, callback: StreamRequestCallback): void {
    const session = this.pendingSessions.get(request.sessionID);
    if (!session) {
      callback(new Error(`No prepared HomeKit session ${request.sessionID}`));
      return;
    }
    if (session.cryptoSuite !== SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80) {
      this.stopSession(request.sessionID);
      callback(new Error(`Unsupported HomeKit SRTP suite ${session.cryptoSuite}`));
      return;
    }

    this.pendingSessions.delete(request.sessionID);
    const video = request.video;
    const profile = ['baseline', 'main', 'high'][video.profile] ?? 'main';
    const level = ['3.1', '3.2', '4.0'][video.level] ?? '3.1';
    const packetSize = Math.max(188, Math.min(video.mtu || 1316, 1316));
    const targetAddress = session.ipv6 ? `[${session.address}]` : session.address;
    const scale = `scale=${video.width}:${video.height}:force_original_aspect_ratio=decrease,pad=${video.width}:${video.height}:(ow-iw)/2:(oh-ih)/2`;
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-rtsp_transport', 'tcp', '-i', this.camera.rtspUrl,
      '-map', '0:v:0', '-an', '-sn', '-dn',
      '-codec:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-profile:v', profile, '-level:v', level,
      '-r', String(video.fps), '-vf', scale,
      '-b:v', `${video.max_bit_rate}k`, '-bufsize', `${video.max_bit_rate * 2}k`,
      '-payload_type', String(video.pt), '-ssrc', String(session.ssrc),
      '-f', 'rtp',
      '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80',
      '-srtp_out_params', session.keyAndSalt.toString('base64'),
      `srtp://${targetAddress}:${session.targetPort}?rtcpport=${session.targetPort}&pkt_size=${packetSize}`,
    ];
    const child = spawn(ffmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let callbackSent = false;
    let stderr = '';
    const active: ActiveSession = { process: child, returnSocket: session.returnSocket };
    this.activeSessions.set(request.sessionID, active);

    const markActive = () => {
      if (active.timeout) clearTimeout(active.timeout);
      active.timeout = setTimeout(() => {
        this.log.info(`HomeKit stream inactive camera=${this.camera.id}; stopping`);
        this.controller?.forceStopStreamingSession(request.sessionID);
        this.stopSession(request.sessionID);
      }, STREAM_IDLE_TIMEOUT_MS);
    };

    session.returnSocket.on('message', markActive);
    session.returnSocket.on('error', error => {
      this.log.warn(`HomeKit RTCP error camera=${this.camera.id}: ${error.message}`);
      this.stopSession(request.sessionID);
    });
    child.once('spawn', () => {
      if (!callbackSent) {
        callbackSent = true;
        callback();
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', error => {
      if (!callbackSent) {
        callbackSent = true;
        callback(error);
      }
      this.stopSession(request.sessionID);
    });
    child.once('exit', code => {
      if (code && !callbackSent) {
        callbackSent = true;
        callback(new Error(`HomeKit FFmpeg failed (${code}): ${stderr.trim() || 'no output'}`));
      }
      this.stopSession(request.sessionID, false);
    });
    this.log.info(`HomeKit stream started camera=${this.camera.id} ${video.width}x${video.height}@${video.fps}`);
  }

  private stopSession(sessionId: StreamSessionIdentifier, killProcess = true): void {
    const pending = this.pendingSessions.get(sessionId);
    if (pending) {
      pending.returnSocket.close();
      this.pendingSessions.delete(sessionId);
    }
    const active = this.activeSessions.get(sessionId);
    if (!active) return;
    if (active.timeout) clearTimeout(active.timeout);
    active.returnSocket.close();
    this.activeSessions.delete(sessionId);
    if (killProcess && active.process.exitCode === null) active.process.kill('SIGKILL');
  }
}

interface PublishedCamera {
  accessory: Accessory;
  delegate: HomeKitStreamingDelegate;
}

export class HomeKitCameraPublisher {
  private readonly cameras: PublishedCamera[] = [];

  constructor(
    private readonly storagePath: string,
    private readonly pincode: string,
    private readonly log: HomeKitLogger,
  ) {
    if (!PIN_PATTERN.test(pincode)) {
      throw new Error('homekitPin must use the format 123-45-678');
    }
  }

  async start(configs: HomeKitCameraConfig[]): Promise<void> {
    await mkdir(this.storagePath, { recursive: true });
    configureStorage(this.storagePath);

    for (const config of configs) {
      const identity = stableIdentity(config.id);
      const accessory = new Accessory(config.name, uuid.generate(`matterbridge-camera:homekit:${config.id}`));
      const delegate = new HomeKitStreamingDelegate(config, this.log);
      const controller = new CameraController({
        cameraStreamCount: 2,
        delegate,
        streamingOptions: {
          supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
          video: {
            codec: {
              profiles: [H264Profile.BASELINE, H264Profile.MAIN, H264Profile.HIGH],
              levels: [H264Level.LEVEL3_1, H264Level.LEVEL3_2, H264Level.LEVEL4_0],
            },
            resolutions: [
              [320, 180, 15], [320, 240, 15], [640, 360, 30], [640, 480, 30],
              [1280, 720, 30], [1920, 1080, 30],
            ],
          },
        },
      });
      delegate.controller = controller;
      accessory.configureController(controller);
      accessory.getService(Service.AccessoryInformation)
        ?.setCharacteristic(Characteristic.Manufacturer, 'Matterbridge Camera')
        .setCharacteristic(Characteristic.Model, 'RTSP Camera')
        .setCharacteristic(Characteristic.SerialNumber, config.id.slice(0, 64));
      await accessory.publish({
        username: identity.username,
        pincode: this.pincode as HAPPincode,
        category: Categories.IP_CAMERA,
        setupID: identity.setupId,
        bind: '0.0.0.0',
        advertiser: MDNSAdvertiser.CIAO,
      });
      this.cameras.push({ accessory, delegate });
      this.log.info(`HomeKit camera published: ${config.name}; pairing code ${this.pincode}`);
      this.log.info(`HomeKit setup URI ${config.name}: ${accessory.setupURI()}`);
    }
  }

  async stop(): Promise<void> {
    for (const camera of this.cameras.splice(0)) {
      camera.delegate.stopAll();
      await camera.accessory.unpublish();
    }
  }
}

export function homeKitStoragePath(homeDirectory: string): string {
  return join(homeDirectory, 'matterbridge-camera', 'homekit');
}
