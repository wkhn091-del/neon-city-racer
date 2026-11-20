/**
 * Rapier native DynamicRayCastVehicleController — ported from
 * isaac-mason/sketches (pmndrs-endorsed pattern for @react-three/rapier).
 * https://github.com/isaac-mason/sketches/.../use-vehicle-controller.ts
 */
import type { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat'
import {
  useAfterPhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { type RefObject, useEffect, useRef } from 'react'
import * as THREE from 'three'

export type WheelInfo = {
  axleCs: THREE.Vector3
  suspensionRestLength: number
  suspensionStiffness: number
  maxSuspensionTravel: number
  frictionSlip: number
  sideFrictionStiffness: number
  position: THREE.Vector3
  radius: number
}

const up = new THREE.Vector3(0, 1, 0)
const _steerQ = new THREE.Quaternion()
const _spinQ = new THREE.Quaternion()

/** Arcade street-racer wheel layout — Z-forward chassis, ~4.5 m car */
export const STREET_WHEELS: WheelInfo[] = [
  {
    position: new THREE.Vector3(-0.9, 0.18, 1.25),
    axleCs: new THREE.Vector3(-1, 0, 0),
    suspensionRestLength: 0.18,
    suspensionStiffness: 38,
    maxSuspensionTravel: 0.28,
    frictionSlip: 2.2,
    sideFrictionStiffness: 1.4,
    radius: 0.34,
  },
  {
    position: new THREE.Vector3(0.9, 0.18, 1.25),
    axleCs: new THREE.Vector3(-1, 0, 0),
    suspensionRestLength: 0.18,
    suspensionStiffness: 38,
    maxSuspensionTravel: 0.28,
    frictionSlip: 2.2,
    sideFrictionStiffness: 1.4,
    radius: 0.34,
  },
  {
    position: new THREE.Vector3(-0.92, 0.18, -1.28),
    axleCs: new THREE.Vector3(-1, 0, 0),
    suspensionRestLength: 0.18,
    suspensionStiffness: 40,
    maxSuspensionTravel: 0.28,
    frictionSlip: 2.0,
    sideFrictionStiffness: 1.2,
    radius: 0.34,
  },
  {
    position: new THREE.Vector3(0.92, 0.18, -1.28),
    axleCs: new THREE.Vector3(-1, 0, 0),
    suspensionRestLength: 0.18,
    suspensionStiffness: 40,
    maxSuspensionTravel: 0.28,
    frictionSlip: 2.0,
    sideFrictionStiffness: 1.2,
    radius: 0.34,
  },
]

export function useRapierVehicle(
  chassisRef: RefObject<RapierRigidBody | null>,
  wheelsRef: RefObject<(THREE.Object3D | null)[]>,
  wheelsInfo: WheelInfo[] = STREET_WHEELS,
) {
  const { world } = useRapier()
  const vehicleController = useRef<DynamicRayCastVehicleController | null>(null)

  useEffect(() => {
    const chassis = chassisRef.current
    if (!chassis) return

    const vehicle = world.createVehicleController(chassis)
    const suspensionDirection = { x: 0, y: -1, z: 0 }

    for (const [index, wheel] of wheelsInfo.entries()) {
      vehicle.addWheel(
        wheel.position,
        suspensionDirection,
        wheel.axleCs,
        wheel.suspensionRestLength,
        wheel.radius,
      )
      vehicle.setWheelSuspensionStiffness(index, wheel.suspensionStiffness)
      vehicle.setWheelMaxSuspensionTravel(index, wheel.maxSuspensionTravel)
      vehicle.setWheelFrictionSlip(index, wheel.frictionSlip)
      vehicle.setWheelSideFrictionStiffness(index, wheel.sideFrictionStiffness)
    }

    vehicleController.current = vehicle
    return () => {
      vehicleController.current = null
      world.removeVehicleController(vehicle)
    }
  }, [chassisRef, wheelsInfo, world])

  useAfterPhysicsStep((stepWorld) => {
    const controller = vehicleController.current
    const wheels = wheelsRef.current
    if (!controller || !wheels) return

    controller.updateVehicle(stepWorld.timestep)

    for (let index = 0; index < wheels.length; index++) {
      const wheel = wheels[index]
      if (!wheel) continue
      const axle = controller.wheelAxleCs(index) ?? { x: -1, y: 0, z: 0 }
      const connection = controller.wheelChassisConnectionPointCs(index)?.y ?? 0
      const suspension = controller.wheelSuspensionLength(index) ?? 0
      const steering = controller.wheelSteering(index) ?? 0
      const rotationRad = controller.wheelRotation(index) ?? 0

      wheel.position.y = connection - suspension
      _steerQ.setFromAxisAngle(up, steering)
      _spinQ.setFromAxisAngle(new THREE.Vector3(axle.x, axle.y, axle.z), rotationRad)
      wheel.quaternion.multiplyQuaternions(_steerQ, _spinQ)
    }
  })

  return { vehicleController }
}
