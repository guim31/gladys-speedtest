// -----------------------------------------------------------------------------
// Device registry.
//
// Each device type lives in its own file and exposes the same shape:
//   - key                        : short identifier (used in logs)
//   - deviceExternalId(gladys)   : the device external_id (for dispatch)
//   - buildDevice(gladys, config): the discovery payload sent to Gladys
//   - startPush(gladys, config)   (optional): internal scheduler, returns a
//     cleanup function (Gladys never polls this device: should_poll false)
//   - onDeviceCreated(gladys)     (optional): the device was just added
//   - actions                     (optional): manifest action handlers, keyed
//     by the action `key` declared in gladys-assistant-integration.json
//
// This integration publishes a single virtual device: the internet connection.
// -----------------------------------------------------------------------------

import { speedtest } from './speedtest.js';

export const DEVICE_BLUEPRINTS = [speedtest];

/**
 * Build the discovery payload for Gladys (all devices).
 */
export function buildDiscoveredDevices(gladys, config) {
  return DEVICE_BLUEPRINTS.map((bp) => bp.buildDevice(gladys, config));
}

/**
 * Find the blueprint that owns a given device, from its external_id
 * (used to route onDeviceCreated to the right device).
 */
export function findBlueprintByDevice(gladys, device) {
  return DEVICE_BLUEPRINTS.find((bp) => bp.deviceExternalId(gladys) === device.external_id);
}
