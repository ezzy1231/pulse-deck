import type { TouchPointState } from '../types';

const SONY_VENDOR = 0x054c;
const DUALSENSE_PID = 0x0ce6;
const DUALSENSE_EDGE_PID = 0x0df2;
const GYRO_PER_DEG = 1024;
const CALIBRATION_SAMPLES = 80;
const USB_REPORT_ID = 0x01;
const BT_REPORT_ID = 0x31;
const OUTPUT_REPORT_ID = 0x02;
const OUTPUT_LENGTH = 47;
const OUTPUT_INTERVAL_MS = 16;
const FLAG0_RUMBLE = 0x03;
const FLAG0_RIGHT_TRIGGER = 0x04;
const FLAG0_LEFT_TRIGGER = 0x08;
const FLAG1_LIGHTBAR = 0x04;
const FLAG1_PLAYER_LEDS = 0x10;
const FLAG2_LIGHTBAR_SETUP = 0x02;
const LIGHTBAR_SETUP_OUT = 0x02;
const PLAYER_LED_INSTANT = 0x20;

export type TriggerEffect = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const TRIGGER_OFF: TriggerEffect = [0x05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export function triggerFeedback(start: number, end: number, force: number): TriggerEffect {
  return [0x21, start | (end << 3), force, 0, 0, 0, 0, 0, 0, 0, 0];
}

export function triggerVibration(
  start: number,
  end: number,
  force: number,
  frequency: number,
): TriggerEffect {
  return [0x26, start | (end << 3), force, frequency, 0, 0, 0, 0, 0, 0, 0];
}

export interface HidSnapshot {
  connected: boolean;
  transport: 'usb' | 'bt';
  reportHz: number;
  l3: boolean;
  r3: boolean;
  touchpad: boolean;
  touch: { f1: TouchPointState; f2: TouchPointState };
  gyro: { pitchDeg: number; rollDeg: number; active: boolean };
}

export class DualSenseHID {
  private device: HIDDevice | null = null;
  private connectedFlag = false;
  private reportHz = 0;
  private lastAt = 0;
  private lastHexAt = 0;
  private calibCount = 0;
  private biasX = 0;
  private biasZ = 0;
  private calibrated = false;
  private smoothPitch = 0;
  private smoothRoll = 0;
  private ring: string[] = [];
  private outTimer = 0;
  private outDirty = false;
  private motorLeft = 0;
  private motorRight = 0;
  private lightbar: [number, number, number] = [0, 0, 0];
  private playerMask = 0;
  private triggerL: TriggerEffect = [...TRIGGER_OFF];
  private triggerR: TriggerEffect = [...TRIGGER_OFF];

  snapshot: HidSnapshot = {
    connected: false,
    transport: 'usb',
    reportHz: 0,
    l3: false,
    r3: false,
    touchpad: false,
    touch: {
      f1: { x: 0, y: 0, active: false },
      f2: { x: 0, y: 0, active: false },
    },
    gyro: { pitchDeg: 0, rollDeg: 0, active: false },
  };

  get connected(): boolean {
    return this.connectedFlag;
  }

  getHexLog(): string {
    return this.ring.length > 0 ? this.ring.join('\n') : 'no reports yet';
  }

  setRumble(left: number, right: number): void {
    const l = Math.max(0, Math.min(255, Math.round(left)));
    const r = Math.max(0, Math.min(255, Math.round(right)));
    if (l === this.motorLeft && r === this.motorRight) return;
    this.motorLeft = l;
    this.motorRight = r;
    this.outDirty = true;
  }

  setLightbar(red: number, green: number, blue: number): void {
    const r = Math.max(0, Math.min(255, Math.round(red)));
    const g = Math.max(0, Math.min(255, Math.round(green)));
    const b = Math.max(0, Math.min(255, Math.round(blue)));
    if (r === this.lightbar[0] && g === this.lightbar[1] && b === this.lightbar[2]) return;
    this.lightbar = [r, g, b];
    this.outDirty = true;
  }

  setPlayerLeds(mask: number): void {
    const value = Math.max(0, Math.min(31, Math.round(mask)));
    if (value === this.playerMask) return;
    this.playerMask = value;
    this.outDirty = true;
  }

  setTrigger(side: 'L' | 'R', effect: TriggerEffect): void {
    const current = side === 'L' ? this.triggerL : this.triggerR;
    let same = true;
    for (let i = 0; i < 11; i++) {
      if (current[i] !== effect[i]) {
        same = false;
        break;
      }
    }
    if (same) return;
    const copy: TriggerEffect = [...effect];
    if (side === 'L') this.triggerL = copy;
    else this.triggerR = copy;
    this.outDirty = true;
  }

  private startOutputLoop(): void {
    if (this.outTimer) return;
    this.outTimer = window.setInterval(() => this.flushOutput(), OUTPUT_INTERVAL_MS);
  }

  private flushOutput(): void {
    if (!this.outDirty || !this.connectedFlag || !this.device) return;
    this.outDirty = false;
    const data = new Uint8Array(OUTPUT_LENGTH);
    data[0] = FLAG0_RUMBLE | FLAG0_RIGHT_TRIGGER | FLAG0_LEFT_TRIGGER;
    data[1] = FLAG1_LIGHTBAR | FLAG1_PLAYER_LEDS;
    data[2] = this.motorRight;
    data[3] = this.motorLeft;
    data.set(this.triggerR, 10);
    data.set(this.triggerL, 21);
    data[38] = FLAG2_LIGHTBAR_SETUP;
    data[41] = LIGHTBAR_SETUP_OUT;
    data[43] = this.playerMask | PLAYER_LED_INSTANT;
    data[44] = this.lightbar[0];
    data[45] = this.lightbar[1];
    data[46] = this.lightbar[2];
    try {
      void this.device.sendReport(OUTPUT_REPORT_ID, data).catch(() => {});
    } catch {
      return;
    }
  }

  async reconnect(): Promise<boolean> {
    const hid = navigator.hid;
    if (!hid) return false;
    try {
      const devices = await hid.getDevices();
      const device = devices.find(
        (item) =>
          item.vendorId === SONY_VENDOR &&
          (item.productId === DUALSENSE_PID || item.productId === DUALSENSE_EDGE_PID),
      );
      if (!device) return false;
      await this.attach(device);
      return this.connectedFlag;
    } catch {
      return false;
    }
  }

  async requestConnect(): Promise<boolean> {
    const hid = navigator.hid;
    if (!hid) return false;
    try {
      const devices = await hid.requestDevice({
        filters: [
          { vendorId: SONY_VENDOR, productId: DUALSENSE_PID },
          { vendorId: SONY_VENDOR, productId: DUALSENSE_EDGE_PID },
        ],
      });
      const device = devices[0];
      if (!device) return false;
      await this.attach(device);
      return this.connectedFlag;
    } catch {
      return false;
    }
  }

  private async attach(device: HIDDevice): Promise<void> {
    if (this.device === device && this.connectedFlag) return;
    this.detach();
    try {
      if (!device.opened) await device.open();
    } catch {
      return;
    }
    this.device = device;
    this.connectedFlag = true;
    this.resetCalibration();
    device.addEventListener('inputreport', this.onReport);
    this.snapshot.connected = true;
    this.outDirty = true;
    this.startOutputLoop();
  }

  private detach(): void {
    if (this.device) {
      this.device.removeEventListener('inputreport', this.onReport);
      void this.device.close().catch(() => {});
    }
    this.device = null;
    this.connectedFlag = false;
    this.snapshot.connected = false;
    this.snapshot.reportHz = 0;
    this.reportHz = 0;
    this.lastAt = 0;
  }

  private resetCalibration(): void {
    this.calibCount = 0;
    this.biasX = 0;
    this.biasZ = 0;
    this.calibrated = false;
    this.smoothPitch = 0;
    this.smoothRoll = 0;
    this.ring = [];
  }

  private onReport = (event: HIDInputReportEvent): void => {
    if (event.reportId !== USB_REPORT_ID) {
      if (event.reportId === BT_REPORT_ID) this.snapshot.transport = 'bt';
      return;
    }
    const data = event.data;
    if (data.byteLength < 40) return;
    const now = performance.now();
    if (this.lastAt > 0) {
      const dt = now - this.lastAt;
      if (dt > 0) {
        const hz = 1000 / dt;
        this.reportHz = this.reportHz > 0 ? this.reportHz * 0.95 + hz * 0.05 : hz;
      }
    }
    this.lastAt = now;
    const snapshot = this.snapshot;
    snapshot.reportHz = Math.round(this.reportHz);
    const buttonsA = data.getUint8(8);
    const buttonsB = data.getUint8(9);
    snapshot.l3 = (buttonsA & 0x40) !== 0;
    snapshot.r3 = (buttonsA & 0x80) !== 0;
    snapshot.touchpad = (buttonsB & 0x02) !== 0;
    const gyroX = data.getInt16(15, true);
    const gyroZ = data.getInt16(19, true);
    if (!this.calibrated) {
      this.biasX += gyroX;
      this.biasZ += gyroZ;
      this.calibCount += 1;
      if (this.calibCount >= CALIBRATION_SAMPLES) {
        this.biasX /= this.calibCount;
        this.biasZ /= this.calibCount;
        this.calibrated = true;
      }
    } else {
      const pitch = (gyroX - this.biasX) / GYRO_PER_DEG;
      const roll = (gyroZ - this.biasZ) / GYRO_PER_DEG;
      this.smoothPitch += (pitch - this.smoothPitch) * 0.25;
      this.smoothRoll += (roll - this.smoothRoll) * 0.25;
      snapshot.gyro.pitchDeg = this.smoothPitch;
      snapshot.gyro.rollDeg = this.smoothRoll;
    }
    snapshot.gyro.active = snapshot.l3 || snapshot.r3;
    this.readTouch(data, 32, snapshot.touch.f1);
    this.readTouch(data, 36, snapshot.touch.f2);
    if (now - this.lastHexAt > 80) {
      this.lastHexAt = now;
      let hex = `01:`;
      for (let i = 0; i < data.byteLength; i++) {
        hex += ` ${data.getUint8(i).toString(16).padStart(2, '0')}`;
      }
      this.ring.push(hex);
      if (this.ring.length > 6) this.ring.shift();
    }
  };

  private readTouch(data: DataView, offset: number, point: TouchPointState): void {
    const contact = data.getUint8(offset);
    point.active = (contact & 0x80) !== 0;
    point.x = data.getUint8(offset + 1) | ((data.getUint8(offset + 2) & 0x0f) << 8);
    point.y = (data.getUint8(offset + 2) >> 4) | (data.getUint8(offset + 3) << 4);
  }
}

let instance: DualSenseHID | null = null;

export function getDualSense(): DualSenseHID {
  if (!instance) instance = new DualSenseHID();
  return instance;
}
