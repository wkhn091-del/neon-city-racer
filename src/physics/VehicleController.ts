import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'

export type WheelId = 'FL' | 'FR' | 'RL' | 'RR'

export type WheelConfig = {
  id: WheelId
  localPosition: THREE.Vector3
  isSteering: boolean
  isPowered: boolean
}

export type VehicleInput = {
  throttle: number
  steer: number
  brake: number
  drift: boolean
  boost: boolean
}

export type VehicleTelemetry = {
  speedKmh: number
  rpm: number
  nitro: number
  isDrifting: boolean
  isBoosting: boolean
  driftScoreDelta: number
  wheelSpin: Record<WheelId, number>
  wheelSteer: Record<WheelId, number>
  wheelTravel: Record<WheelId, number>
  skidPoints: THREE.Vector3[]
  smokePoints: THREE.Vector3[]
}

type RayHit = { timeOfImpact: number } | null

export type RaycastFn = (
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxToi: number,
  exclude?: RapierRigidBody | null,
) => RayHit

const WHEEL_RADIUS = 0.34
const REST_LENGTH = 0.38
const SPRING = 14000
const DAMPER = 4200
const RAY_EXTRA = 0.55
const MAX_STEER = 0.55
const ENGINE_FORCE = 11000
const BOOST_FORCE = 7000
const BRAKE_FORCE = 15000
const ROLLING = 18

export const DEFAULT_WHEELS: WheelConfig[] = [
  { id: 'FL', localPosition: new THREE.Vector3(-0.95, 0.05, 1.28), isSteering: true, isPowered: false },
  { id: 'FR', localPosition: new THREE.Vector3(0.95, 0.05, 1.28), isSteering: true, isPowered: false },
  { id: 'RL', localPosition: new THREE.Vector3(-0.97, 0.05, -1.28), isSteering: false, isPowered: true },
  { id: 'RR', localPosition: new THREE.Vector3(0.97, 0.05, -1.28), isSteering: false, isPowered: true },
]

export class VehicleController {
  nitro = 100
  private wheelSpin: Record<WheelId, number> = { FL: 0, FR: 0, RL: 0, RR: 0 }
  private wheelSteer: Record<WheelId, number> = { FL: 0, FR: 0, RL: 0, RR: 0 }
  private wheelTravel: Record<WheelId, number> = { FL: 0, FR: 0, RL: 0, RR: 0 }
  private driftCombo = 0
  private tmpOrigin = new THREE.Vector3()
  private tmpDir = new THREE.Vector3()
  private tmpForce = new THREE.Vector3()
  private tmpWorld = new THREE.Vector3()
  private forward = new THREE.Vector3()
  private right = new THREE.Vector3()
  private up = new THREE.Vector3()
  private vel = new THREE.Vector3()
  private localVel = new THREE.Vector3()
  private quat = new THREE.Quaternion()
  private invQuat = new THREE.Quaternion()

  step(
    body: RapierRigidBody,
    raycast: RaycastFn,
    input: VehicleInput,
    dt: number,
    wheels: WheelConfig[] = DEFAULT_WHEELS,
  ): VehicleTelemetry {
    const translation = body.translation()
    const rotation = body.rotation()
    this.quat.set(rotation.x, rotation.y, rotation.z, rotation.w)
    this.invQuat.copy(this.quat).invert()
    this.forward.set(0, 0, 1).applyQuaternion(this.quat)
    this.right.set(1, 0, 0).applyQuaternion(this.quat)
    this.up.set(0, 1, 0).applyQuaternion(this.quat)

    const linvel = body.linvel()
    this.vel.set(linvel.x, linvel.y, linvel.z)
    this.localVel.copy(this.vel).applyQuaternion(this.invQuat)
    const speed = this.vel.length()
    const speedKmh = speed * 3.6

    // Progressive steering + counter-steer assist when drifting
    const steerBase = input.steer * MAX_STEER * (1 - Math.min(speedKmh / 280, 0.75))
    const drifting = input.drift && Math.abs(this.localVel.x) > 2.2 && speedKmh > 20
    const counter = drifting ? THREE.MathUtils.clamp(-this.localVel.x * 0.04, -0.4, 0.4) : 0
    const steerAngle = steerBase + counter
    if (input.boost && this.nitro > 0) this.nitro = Math.max(0, this.nitro - 28 * dt)
    else this.nitro = Math.min(100, this.nitro + 8 * dt)
    const boosting = input.boost && this.nitro > 0

    const skidPoints: THREE.Vector3[] = []
    const smokePoints: THREE.Vector3[] = []

    for (const wheel of wheels) {
      this.tmpWorld.copy(wheel.localPosition).applyQuaternion(this.quat)
      this.tmpOrigin.set(
        translation.x + this.tmpWorld.x,
        translation.y + this.tmpWorld.y + 0.25,
        translation.z + this.tmpWorld.z,
      )
      this.tmpDir.set(0, -1, 0).applyQuaternion(this.quat)

      const maxLen = REST_LENGTH + WHEEL_RADIUS
      const hit = raycast(this.tmpOrigin, this.tmpDir, maxLen + RAY_EXTRA, body)

      let compression = 0
      let grounded = false
      let hitPoint = this.tmpOrigin.clone()

      if (hit && hit.timeOfImpact < maxLen) {
        grounded = true
        compression = maxLen - hit.timeOfImpact
        hitPoint = this.tmpOrigin.clone().addScaledVector(this.tmpDir, hit.timeOfImpact)
      }

      this.wheelTravel[wheel.id] = grounded ? THREE.MathUtils.clamp(compression, 0, REST_LENGTH) : 0
      const steer = wheel.isSteering ? steerAngle : drifting ? -steerAngle * 0.4 : 0
      this.wheelSteer[wheel.id] = steer
      if (!grounded) continue

      const suspVel = this.vel.dot(this.up)
      // Soft springs + hard clamp — no more trampoline off the deck
      const springForce = THREE.MathUtils.clamp(compression * SPRING - suspVel * DAMPER, -2500, 5500)
      this.tmpForce.copy(this.up).multiplyScalar(Math.max(0, springForce) * dt)
      body.applyImpulseAtPoint(
        { x: this.tmpForce.x, y: this.tmpForce.y, z: this.tmpForce.z },
        { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
        true,
      )

      const wheelQuat = this.quat
        .clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steer))
      const tireForward = new THREE.Vector3(0, 0, 1).applyQuaternion(wheelQuat)
      const tireRight = new THREE.Vector3(1, 0, 0).applyQuaternion(wheelQuat)
      const longSpeed = this.vel.dot(tireForward)
      const latSpeed = this.vel.dot(tireRight)

      let latGrip = 1
      if (drifting) latGrip = wheel.isSteering ? 0.65 : 0.2
      const latForce = -latSpeed * (2600 * latGrip)
      const engine =
        (wheel.isPowered ? input.throttle * ENGINE_FORCE : 0) +
        (wheel.isPowered && boosting ? BOOST_FORCE : 0) -
        input.brake * BRAKE_FORCE * Math.sign(longSpeed || 1) -
        longSpeed * ROLLING

      const eng = THREE.MathUtils.clamp(engine, -25000, 25000)
      const lat = THREE.MathUtils.clamp(latForce, -20000, 20000)
      this.tmpForce
        .copy(tireForward)
        .multiplyScalar(eng * dt)
        .addScaledVector(tireRight, lat * dt)
      body.applyImpulseAtPoint(
        { x: this.tmpForce.x, y: this.tmpForce.y, z: this.tmpForce.z },
        { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
        true,
      )

      this.wheelSpin[wheel.id] += (longSpeed / WHEEL_RADIUS) * dt

      if (drifting && Math.abs(latSpeed) > 2.5) {
        skidPoints.push(hitPoint.clone())
        smokePoints.push(hitPoint.clone().add(new THREE.Vector3(0, 0.12, 0)))
      }
    }

    if (this.up.y < 0.98) {
      const correct = new THREE.Vector3(0, 1, 0).cross(this.up).multiplyScalar(18 * dt)
      body.applyTorqueImpulse(correct, true)
      const av = body.angvel()
      body.setAngvel({ x: av.x * 0.85, y: av.y, z: av.z * 0.85 }, true)
    }

    let driftScoreDelta = 0
    if (drifting) {
      this.driftCombo += dt
      driftScoreDelta = Math.floor((8 + this.driftCombo * 14) * (1 + Math.abs(this.localVel.x) * 0.1))
    } else {
      this.driftCombo = Math.max(0, this.driftCombo - dt * 2)
    }

    return {
      speedKmh,
      rpm: 800 + Math.min(7000, Math.abs(this.localVel.z) * 180 + (boosting ? 900 : 0)),
      nitro: this.nitro,
      isDrifting: drifting,
      isBoosting: boosting,
      driftScoreDelta,
      wheelSpin: { ...this.wheelSpin },
      wheelSteer: { ...this.wheelSteer },
      wheelTravel: { ...this.wheelTravel },
      skidPoints,
      smokePoints,
    }
  }
}
