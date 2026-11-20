export type RadioStation = 'off' | 'phonk' | 'synthwave' | 'lofi'

/** Fully procedural car radio — no external audio files. */
export class CarRadio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private stationGain: GainNode | null = null
  private duckGain: GainNode | null = null
  private nodes: AudioNode[] = []
  private timers: number[] = []
  private station: RadioStation = 'off'
  private started = false
  private step = 0

  async ensure() {
    if (this.started) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.11
    this.master.connect(this.ctx.destination)
    this.duckGain = this.ctx.createGain()
    this.duckGain.gain.value = 1
    this.duckGain.connect(this.master)
    this.stationGain = this.ctx.createGain()
    this.stationGain.gain.value = 0
    this.stationGain.connect(this.duckGain)
    this.started = true
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  setStation(station: RadioStation) {
    if (this.station === station) return
    this.stopStation()
    this.station = station
    if (!this.ctx || !this.stationGain) return
    this.stationGain.gain.setTargetAtTime(station === 'off' ? 0 : 1, this.ctx.currentTime, 0.08)
    if (station === 'phonk') this.startPhonk()
    else if (station === 'synthwave') this.startSynthwave()
    else if (station === 'lofi') this.startLofi()
  }

  /** Duck music when engine is screaming or a collision/impact spikes. */
  update(rpm: number, impact = 0) {
    if (!this.ctx || !this.duckGain || this.station === 'off') return
    const load = Math.min(1, Math.max(0, (rpm - 4000) / 4500) + impact * 1.4)
    const duck = 1 - load * 0.55
    this.duckGain.gain.setTargetAtTime(duck, this.ctx.currentTime, 0.05)
  }

  private osc(type: OscillatorType, freq: number, gain: number, dest: AudioNode) {
    if (!this.ctx) return null
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.value = gain
    o.connect(g)
    g.connect(dest)
    o.start()
    this.nodes.push(o, g)
    return { o, g }
  }

  private schedule(bpm: number, beatFn: (beat: number, t: number) => void) {
    if (!this.ctx) return
    const spb = 60 / bpm
    const tick = () => {
      if (!this.ctx || this.station === 'off') return
      const t = this.ctx.currentTime
      beatFn(this.step % 16, t)
      this.step++
      const id = window.setTimeout(tick, spb * 1000)
      this.timers.push(id)
    }
    tick()
  }

  private startPhonk() {
    if (!this.ctx || !this.stationGain) return
    const bass = this.ctx.createGain()
    bass.gain.value = 0.35
    bass.connect(this.stationGain)
    this.nodes.push(bass)
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 140
    filter.connect(bass)
    this.nodes.push(filter)

    this.schedule(140, (beat, t) => {
      const notes = [36.71, 36.71, 41.2, 36.71, 32.7, 32.7, 36.71, 41.2]
      const f = notes[beat % notes.length]
      const o = this.ctx!.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(f, t)
      const g = this.ctx!.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
      o.connect(g)
      g.connect(filter)
      o.start(t)
      o.stop(t + 0.3)
      if (beat % 4 === 0) this.kick(t, this.stationGain!)
      if (beat % 4 === 2) this.snare(t, this.stationGain!)
      if (beat % 2 === 1) this.hat(t, this.stationGain!, 0.04)
    })
  }

  private startSynthwave() {
    if (!this.ctx || !this.stationGain) return
    const arpGain = this.ctx.createGain()
    arpGain.gain.value = 0.12
    arpGain.connect(this.stationGain)
    this.nodes.push(arpGain)
    const delay = this.ctx.createDelay(0.4)
    delay.delayTime.value = 0.22
    const fb = this.ctx.createGain()
    fb.gain.value = 0.35
    arpGain.connect(delay)
    delay.connect(fb)
    fb.connect(delay)
    delay.connect(this.stationGain)
    this.nodes.push(delay, fb)

    this.schedule(110, (beat, t) => {
      const scale = [220, 277.18, 329.63, 369.99, 440, 493.88, 554.37, 659.25]
      const f = scale[beat % scale.length]
      const o = this.ctx!.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f, t)
      const g = this.ctx!.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.55, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      const ftr = this.ctx!.createBiquadFilter()
      ftr.type = 'lowpass'
      ftr.frequency.value = 1800
      o.connect(ftr)
      ftr.connect(g)
      g.connect(arpGain)
      o.start(t)
      o.stop(t + 0.2)
      if (beat % 4 === 0) this.kick(t, this.stationGain!)
      if (beat % 8 === 4) this.snare(t, this.stationGain!)
      this.hat(t, this.stationGain!, 0.03)
    })

    this.osc('triangle', 55, 0.08, this.stationGain)
  }

  private startLofi() {
    if (!this.ctx || !this.stationGain) return
    const chord = this.ctx.createGain()
    chord.gain.value = 0.08
    chord.connect(this.stationGain)
    this.nodes.push(chord)
    ;[196, 246.94, 293.66].forEach((f) => this.osc('triangle', f, 0.35, chord))

    // Soft noise bed
    const len = this.ctx.sampleRate * 2
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.15
    const noise = this.ctx.createBufferSource()
    noise.buffer = buf
    noise.loop = true
    const ng = this.ctx.createGain()
    ng.gain.value = 0.04
    const nf = this.ctx.createBiquadFilter()
    nf.type = 'bandpass'
    nf.frequency.value = 1200
    noise.connect(nf)
    nf.connect(ng)
    ng.connect(this.stationGain)
    noise.start()
    this.nodes.push(noise, ng, nf)

    this.schedule(78, (beat, t) => {
      if (beat % 4 === 0) this.kick(t, this.stationGain!, 0.35)
      if (beat % 4 === 2) this.snare(t, this.stationGain!, 0.2)
      if (beat % 2 === 0) this.hat(t, this.stationGain!, 0.025)
    })
  }

  private kick(t: number, dest: AudioNode, vol = 0.55) {
    if (!this.ctx) return
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    const g = this.ctx.createGain()
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    o.connect(g)
    g.connect(dest)
    o.start(t)
    o.stop(t + 0.22)
  }

  private snare(t: number, dest: AudioNode, vol = 0.28) {
    if (!this.ctx) return
    const len = this.ctx.sampleRate * 0.15
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    const f = this.ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 1200
    src.connect(f)
    f.connect(g)
    g.connect(dest)
    src.start(t)
    src.stop(t + 0.15)
  }

  private hat(t: number, dest: AudioNode, vol = 0.04) {
    if (!this.ctx) return
    const len = Math.floor(this.ctx.sampleRate * 0.04)
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
    const f = this.ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 6000
    src.connect(f)
    f.connect(g)
    g.connect(dest)
    src.start(t)
    src.stop(t + 0.05)
  }

  private stopStation() {
    this.timers.forEach((id) => clearTimeout(id))
    this.timers = []
    this.nodes.forEach((n) => {
      try {
        if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') (n as OscillatorNode).stop()
        n.disconnect()
      } catch {
        /* ignore */
      }
    })
    this.nodes = []
    this.step = 0
  }

  stop() {
    this.stopStation()
    try {
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.started = false
    this.station = 'off'
  }
}
