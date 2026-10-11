export type CameraStatus = 'off' | 'requesting' | 'live' | 'denied' | 'unavailable' | 'error' | 'unsupported';

/**
 * Opens the webcam into a hidden <video>. Frames are only ever handed to the
 * in-browser face landmarker; they are never drawn, uploaded or stored.
 */
export class Camera {
  status: CameraStatus = 'off';
  video: HTMLVideoElement;
  private attempt = 0;
  private stream: MediaStream | null = null;
  onStatus: (s: CameraStatus) => void = () => {};

  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.setAttribute('aria-hidden', 'true');
    this.video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px;';
    document.body.appendChild(this.video);
  }

  private set(s: CameraStatus): void {
    this.status = s;
    this.onStatus(s);
  }

  async start(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.set('unsupported');
      return false;
    }
    this.stop();
    const attempt = ++this.attempt;
    this.set('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
      if (attempt !== this.attempt) { stream.getTracks().forEach(t => t.stop()); return false; }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      if (attempt !== this.attempt) { stream.getTracks().forEach(t => t.stop()); return false; }
      for (const track of this.stream.getVideoTracks()) {
        track.addEventListener('ended', () => this.set('unavailable'));
      }
      this.set('live');
      return true;
    } catch (err) {
      if (attempt !== this.attempt) return false;
      this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') this.set('denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') this.set('unavailable');
      else this.set('error');
      return false;
    }
  }

  get ready(): boolean {
    return this.status === 'live' && this.video.readyState >= 2 && this.video.videoWidth > 0;
  }

  stop(): void {
    this.attempt++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.set('off');
  }
}
