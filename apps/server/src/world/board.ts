import {
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  avrInstruction,
  CPU,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from "avr8js";

import { FLASH_BYTES } from "./ihex";

/** ATmega328P is clocked at 16 MHz. One sim millisecond is 16 000 cycles. */
export const CPU_HZ = 16_000_000;
export const CYCLES_PER_MS = 16_000;
/** ATmega328P SRAM, not counting the 256-byte register/IO space. */
const SRAM_BYTES = 2048;

/** Written into that board's ring when its `.hex` is loaded again. */
export const FIRMWARE_RELOADED = "— firmware reloaded —\n";

/** Pending USART0 RX bytes. A send that does not fit is refused whole. */
export const RX_BACKLOG = 4 * 1024;

/**
 * One ATmega328P. `stepMillis` runs CYCLES_PER_MS of instructions, then
 * stops. The last instruction may pass that budget; `overshoot` is how
 * many extra cycles it used, and the next millisecond runs that many fewer.
 */
export class AvrBoard {
  readonly id: string;
  running = false;
  fault?: string;
  overshoot = 0;
  /** Bytes passed to USART0, one at a time, at the baud the firmware set. */
  rxAccepted = 0;
  private cpu: CPU | null = null;
  private usart: AVRUSART | null = null;
  /** Held so the port and timer hooks stay attached for the life of the CPU. */
  private peripherals: unknown[] = [];
  private rx: number[] = [];
  private tx = "";

  constructor(id: string) {
    this.id = id;
  }

  get rxQueued(): number {
    return this.rx.length;
  }

  load(program: Uint8Array) {
    if (program.length !== FLASH_BYTES) {
      this.stop("firmware image is the wrong size");
      return;
    }
    const words = new Uint16Array(FLASH_BYTES / 2);
    for (let i = 0; i < words.length; i++) {
      const lo = program[i * 2] ?? 0xff;
      const hi = program[i * 2 + 1] ?? 0xff;
      words[i] = lo | (hi << 8);
    }
    const cpu = new CPU(words, SRAM_BYTES);
    const peripherals = [
      new AVRIOPort(cpu, portBConfig),
      new AVRIOPort(cpu, portCConfig),
      new AVRIOPort(cpu, portDConfig),
      new AVRTimer(cpu, timer0Config),
      new AVRTimer(cpu, timer1Config),
      new AVRTimer(cpu, timer2Config),
    ];
    const usart = new AVRUSART(cpu, usart0Config, CPU_HZ);
    usart.onByteTransmit = (value) => {
      this.tx += String.fromCharCode(value & 0xff);
    };
    // The byte that just landed frees the shifter. The next queued byte
    // starts its own character time here, so a burst is not written at once.
    usart.onRxComplete = () => {
      this.pumpRx();
    };
    this.cpu = cpu;
    this.usart = usart;
    this.peripherals = peripherals;
    this.rx = [];
    this.tx = "";
    this.overshoot = 0;
    this.rxAccepted = 0;
    this.fault = undefined;
    this.running = true;
  }

  stop(fault: string) {
    this.running = false;
    this.fault = fault;
    this.cpu = null;
    this.usart = null;
    this.peripherals = [];
    this.rx = [];
    this.overshoot = 0;
  }

  takeTx(): string {
    const text = this.tx;
    this.tx = "";
    return text;
  }

  /** False when `text` does not fit. Nothing is queued in that case. */
  pushRx(text: string): boolean {
    if (!this.running) return false;
    const bytes = new TextEncoder().encode(text);
    if (this.rx.length + bytes.length > RX_BACKLOG) return false;
    for (const byte of bytes) this.rx.push(byte);
    return true;
  }

  stepMillis() {
    const cpu = this.cpu;
    // Ports and timers stay reachable from this object, not only from CPU hooks.
    if (!this.running || !cpu || this.peripherals.length === 0) return;
    const budget = CYCLES_PER_MS - this.overshoot;
    if (budget <= 0) {
      this.overshoot = -budget;
      return;
    }
    this.pumpRx();
    let ran = 0;
    while (ran < budget) {
      const before = cpu.cycles;
      avrInstruction(cpu);
      cpu.tick();
      const used = cpu.cycles - before;
      if (used <= 0) {
        this.stop("AVR instruction did not advance the cycle clock");
        return;
      }
      ran += used;
    }
    this.overshoot = ran - budget;
  }

  private pumpRx() {
    const usart = this.usart;
    if (!usart) return;
    while (this.rx.length > 0) {
      const next = this.rx[0];
      if (next === undefined) return;
      // False while RX is off (before Serial.begin) or a character is in flight.
      if (!usart.writeByte(next)) return;
      this.rx.shift();
      this.rxAccepted += 1;
    }
  }
}
