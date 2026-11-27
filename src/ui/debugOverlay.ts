import { TUNING } from '../data/tuning';

/** Rolling stats + the F3 overlay element. Text refreshes a few times per second to keep DOM churn low. */
export class DebugOverlay {
  visible = false;
  private frames = 0;
  private ticks = 0;
  private simMs = 0;
  private renderMs = 0;
  private maxFrameMs = 0;
  private windowStart = 0;
  private fps = 0;
  private simAvg = 0;
  private renderAvg = 0;
  private frameMax = 0;

  constructor(private readonly el: HTMLElement) {
    el.hidden = true;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
  }

  /** Record one rendered frame. */
  record(now: number, frameDtMs: number, ticks: number, simMs: number, renderMs: number): void {
    if (this.windowStart === 0) this.windowStart = now;
    this.frames++;
    this.ticks += ticks;
    this.simMs += simMs;
    this.renderMs += renderMs;
    this.maxFrameMs = Math.max(this.maxFrameMs, frameDtMs);
    const span = now - this.windowStart;
    if (span >= TUNING.debugRefreshMs) {
      this.fps = (this.frames * 1000) / span;
      this.simAvg = this.ticks > 0 ? this.simMs / this.ticks : 0;
      this.renderAvg = this.renderMs / this.frames;
      this.frameMax = this.maxFrameMs;
      this.frames = this.ticks = this.simMs = this.renderMs = this.maxFrameMs = 0;
      this.windowStart = now;
    }
  }

  /** Update the overlay text. `lines` are extra context lines (cursor, camera...). */
  draw(lines: readonly string[]): void {
    if (!this.visible) return;
    const text = [
      `fps     ${this.fps.toFixed(0).padStart(4)}   worst frame ${this.frameMax.toFixed(1)} ms`,
      `sim     ${this.simAvg.toFixed(2).padStart(6)} ms/tick  (budget 4)`,
      `render  ${this.renderAvg.toFixed(2).padStart(6)} ms/frame (budget 16)`,
      ...lines,
    ].join('\n');
    if (this.el.textContent !== text) this.el.textContent = text;
  }
}
