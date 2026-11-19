export class EngineAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engine: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private turbo: OscillatorNode | null = null
  private turboGain: GainNode | null = null
  private screech: OscillatorNode | null = null
  private screechGain: GainNode | null = null
  private started = false

  async ensure() {
    if (this.started) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.12
    this.master.connect(this.ctx.destination)

    this.engine = this.ctx.createOscillator()
    this.engine.type = 'sawtooth'
    this.engineGain = this.ctx.createGain()
    this.engineGain.gain.value = 0.0
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    this.engine.connect(filter)
    filter.connect(this.engineGain)
    this.engineGain.connect(this.master)
    this.engine.start()

    this.turbo = this.ctx.createOscillator()
    this.turbo.type = 'triangle'
    this.turboGain = this.ctx.createGain()
    this.turboGain.gain.value = 0
    this.turbo.connect(this.turboGain)
    this.turboGain.connect(this.master)
    this.turbo.start()

    this.screech = this.ctx.createOscillator()
    this.screech.type = 'square'
    this.screechGain = this.ctx.createGain()
    this.screechGain.gain.value = 0
    const screechFilter = this.ctx.createBiquadFilter()
    screechFilter.type = 'bandpass'
    screechFilter.frequency.value = 1400
    this.screech.connect(screechFilter)
    screechFilter.connect(this.screechGain)
    this.screechGain.connect(this.master)
    this.screech.start()

    this.started = true
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  update(rpm: number, boosting: boolean, drifting: boolean) {
    if (!this.ctx || !this.engine || !this.engineGain || !this.turbo || !this.turboGain || !this.screech || !this.screechGain) return
    const t = this.ctx.currentTime
    const freq = 55 + (rpm / 8000) * 220
    this.engine.frequency.setTargetAtTime(freq, t, 0.05)
    this.engineGain.gain.setTargetAtTime(0.04 + (rpm / 8000) * 0.1, t, 0.08)
    this.turbo.frequency.setTargetAtTime(boosting ? 380 : 180, t, 0.05)
    this.turboGain.gain.setTargetAtTime(boosting ? 0.05 : 0.0, t, 0.05)
    this.screech.frequency.setTargetAtTime(drifting ? 900 + Math.random() * 200 : 400, t, 0.02)
    this.screechGain.gain.setTargetAtTime(drifting ? 0.035 : 0.0, t, 0.04)
  }

  stop() {
    try {
      this.engine?.stop()
      this.turbo?.stop()
      this.screech?.stop()
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.started = false
  }
}
