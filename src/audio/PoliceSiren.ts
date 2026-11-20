/** Synthesized two-tone police siren + optional rain bed. */
export class PoliceSiren {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private oscA: OscillatorNode | null = null
  private oscB: OscillatorNode | null = null
  private gain: GainNode | null = null
  private lfo: OscillatorNode | null = null
  private lfoGain: GainNode | null = null
  private rain: AudioBufferSourceNode | null = null
  private rainGain: GainNode | null = null
  private rainFilter: BiquadFilterNode | null = null
  private started = false

  async ensure() {
    if (this.started) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.1
    this.master.connect(this.ctx.destination)

    this.gain = this.ctx.createGain()
    this.gain.gain.value = 0
    this.gain.connect(this.master)

    this.oscA = this.ctx.createOscillator()
    this.oscA.type = 'sawtooth'
    this.oscA.frequency.value = 680
    this.oscB = this.ctx.createOscillator()
    this.oscB.type = 'triangle'
    this.oscB.frequency.value = 920

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 900
    filter.Q.value = 2.5

    this.lfo = this.ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = 1.6
    this.lfoGain = this.ctx.createGain()
    this.lfoGain.gain.value = 220
    this.lfo.connect(this.lfoGain)
    this.lfoGain.connect(this.oscA.frequency)
    this.lfoGain.connect(this.oscB.frequency)

    this.oscA.connect(filter)
    this.oscB.connect(filter)
    filter.connect(this.gain)
    this.oscA.start()
    this.oscB.start()
    this.lfo.start()

    // Rain noise bed
    const len = this.ctx.sampleRate * 2
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.35
    this.rain = this.ctx.createBufferSource()
    this.rain.buffer = buf
    this.rain.loop = true
    this.rainGain = this.ctx.createGain()
    this.rainGain.gain.value = 0
    this.rainFilter = this.ctx.createBiquadFilter()
    this.rainFilter.type = 'highpass'
    this.rainFilter.frequency.value = 900
    this.rain.connect(this.rainFilter)
    this.rainFilter.connect(this.rainGain)
    this.rainGain.connect(this.master)
    this.rain.start()

    this.started = true
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  update(active: boolean, intensity = 1) {
    if (!this.ctx || !this.gain || !this.lfo) return
    const t = this.ctx.currentTime
    this.gain.gain.setTargetAtTime(active ? 0.045 * Math.min(1.4, intensity) : 0, t, 0.12)
    this.lfo.frequency.setTargetAtTime(1.2 + intensity * 0.8, t, 0.2)
  }

  setRain(on: boolean) {
    if (!this.ctx || !this.rainGain) return
    this.rainGain.gain.setTargetAtTime(on ? 0.028 : 0, this.ctx.currentTime, 0.4)
  }

  stop() {
    try {
      this.oscA?.stop()
      this.oscB?.stop()
      this.lfo?.stop()
      this.rain?.stop()
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.started = false
  }
}
