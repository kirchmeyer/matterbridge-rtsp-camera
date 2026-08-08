import {
  bridgedNode,
  camera,
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  type PlatformConfig,
  type PlatformMatterbridge,
} from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import { CameraRequirements } from 'matterbridge/matter/devices';
import { Go2RTCClient } from './streaming/Go2RTCClient.js';
import { MatterCameraAvStreamManagementServer } from './matter/behaviors/MatterCameraAvStreamManagementServer.js';
import { MatterWebRtcTransportProviderServer } from './matter/behaviors/MatterWebRtcTransportProviderServer.js';
import { streamContext } from './matter/behaviors/streamContext.js';
import { cameraAvStreamDefaults } from './matter/devices/cameraAvStreamDefaults.js';
import { appConfig } from './config/app.js';
import { HomeKitCameraPublisher, homeKitStoragePath } from './HomeKitCameraPublisher.js';

export type CameraProtocol = 'matter' | 'homekit';

export interface CameraConfig {
  id: string;
  name: string;
  rtspUrl: string;
}

export interface CameraPlatformConfig extends PlatformConfig {
  mode?: CameraProtocol;
  go2rtcUrl?: string;
  homekitPin?: string;
  cameras: CameraConfig[];
}

export default function initializePlugin(
  matterbridge: PlatformMatterbridge,
  log: AnsiLogger,
  config: PlatformConfig,
): MatterbridgeCameraPlatform {
  return new MatterbridgeCameraPlatform(matterbridge, log, config as CameraPlatformConfig);
}

export class MatterbridgeCameraPlatform extends MatterbridgeDynamicPlatform {
  private readonly mode: CameraProtocol;
  private readonly go2rtc?: Go2RTCClient;
  private homekit?: HomeKitCameraPublisher;

  constructor(
    matterbridge: PlatformMatterbridge,
    log: AnsiLogger,
    override config: CameraPlatformConfig,
  ) {
    super(matterbridge, log, config);
    if (!this.verifyMatterbridgeVersion('3.10.4')) {
      throw new Error(`matterbridge-rtsp-camera requires Matterbridge 3.10.4 or newer`);
    }
    this.mode = config.mode ?? 'matter';
    if (this.mode !== 'matter' && this.mode !== 'homekit') {
      throw new Error(`mode must be either matter or homekit`);
    }
    if (this.mode === 'matter') {
      if (!config.go2rtcUrl?.trim()) throw new Error('go2rtcUrl is required in Matter mode');
      this.go2rtc = new Go2RTCClient(config.go2rtcUrl);
      streamContext.go2rtc = this.go2rtc;
    } else {
      this.homekit = new HomeKitCameraPublisher(
        homeKitStoragePath(matterbridge.homeDirectory),
        config.homekitPin ?? '031-45-154',
        log,
      );
    }
  }

  override async onStart(reason?: string): Promise<void> {
    await this.ready;
    this.log.info(`Starting ${this.config.name}: ${reason ?? 'startup'}`);

    const cameras = (this.config.cameras ?? []).map(cameraConfig => this.validateCameraConfig(cameraConfig));
    if (this.mode === 'homekit') {
      await this.homekit!.start(cameras);
      return;
    }

    appConfig.matterHost = '';
    appConfig.go2rtcUrl = this.config.go2rtcUrl!;
    await this.go2rtc!.waitUntilReady(10, 1_000);

    for (const cameraConfig of cameras) {
      this.go2rtc.registerDirectSource(cameraConfig.id, cameraConfig.name, cameraConfig.rtspUrl);
      const endpoint = this.createCameraEndpoint(cameraConfig);
      await this.registerDevice(endpoint);
      this.setSelectDevice(cameraConfig.id, cameraConfig.name);
    }
  }

  private validateCameraConfig(cameraConfig: CameraConfig): CameraConfig {
    const id = cameraConfig.id.trim();
    const name = cameraConfig.name.trim();
    const rtspUrl = cameraConfig.rtspUrl.trim();

    if (!id || !name || !rtspUrl) {
      throw new Error('Each camera requires non-empty id, name, and rtspUrl values');
    }
    if (!rtspUrl.startsWith('rtsp://') && !rtspUrl.startsWith('rtsps://')) {
      throw new Error(`Camera ${id} has an unsupported stream URL`);
    }
    return { id, name, rtspUrl };
  }

  private createCameraEndpoint(cameraConfig: CameraConfig): MatterbridgeEndpoint {
    const { id, name } = cameraConfig;
    const endpoint = new MatterbridgeEndpoint([camera, bridgedNode], { id }, this.config.debug)
      .createDefaultBridgedDeviceBasicInformationClusterServer(
        name,
        id.slice(0, 32),
        0xfff1,
        'Matterbridge Camera',
        'RTSP Camera',
      )
      .addRequiredClusterServers();

    endpoint.behaviors.inject(MatterCameraAvStreamManagementServer, cameraAvStreamDefaults());
    endpoint.behaviors.inject(MatterWebRtcTransportProviderServer);
    endpoint.behaviors.inject(CameraRequirements.WebRtcTransportRequestorClient);
    return endpoint;
  }

  override async onConfigure(): Promise<void> {
    await super.onConfigure();
  }

  override async onShutdown(reason?: string): Promise<void> {
    this.log.info(`Stopping ${this.config.name}: ${reason ?? 'shutdown'}`);
    await this.homekit?.stop();
    await super.onShutdown(reason);
  }
}