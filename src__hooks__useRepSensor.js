import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVICE_CANDIDATES, createDecoder, spreadTimes } from '../lib/witmotion';

// Web Bluetooth is Chrome/Edge only — Android and desktop. iOS Safari has no
// implementation, so every caller hides its UI rather than offering something
// that can never connect.
export const sensorSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.bluetooth;

/**
 * Holds the BLE link to a WT901BLE and feeds decoded samples to onSample.
 *
 * onSample is kept in a ref: it changes on every render of a component that
 * draws the samples, and re-subscribing to the characteristic each time would
 * drop frames.
 */
export default function useRepSensor(onSample) {
  // The last timestamp handed out, so a burst can never rewind the trace.
  const lastT = useRef(-Infinity);
  const [status, setStatus] = useState('idle'); // idle | connecting | linked | dropped | error
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');
  // null until asked: whether this device has a Bluetooth radio the browser can
  // see. On Android it goes false with the adapter switched off, which is the
  // difference between "nothing happened" and a reason.
  const [available, setAvailable] = useState(null);
  // What the device actually turned out to expose — reported, not assumed.
  const [found, setFound] = useState(null);

  const dev = useRef(null);
  const writeChar = useRef(null);
  const decoder = useRef(null);
  const notifyRef = useRef(null);
  const cb = useRef(onSample);
  cb.current = onSample;

  const onDrop = useRef(() => {
    setStatus('dropped');
    writeChar.current = null;
  });

  const connect = useCallback(async ({ all = false } = {}) => {
    setError('');
    if (!sensorSupported()) {
      setError('This browser has no Web Bluetooth. Chrome on Android, or a Chromium browser on desktop.');
      setStatus('error');
      return false;
    }
    try {
      setStatus('connecting');
      const ok = await navigator.bluetooth.getAvailability?.().catch(() => true);
      setAvailable(ok !== false);
      if (ok === false) {
        setError('No Bluetooth adapter available to this browser — switch Bluetooth on, then try again.');
        setStatus('error');
        return false;
      }
      // After a drop (out of range, sensor slept) the browser still holds the
      // device, so reconnect to it straight away instead of making the user
      // pick it from the chooser again. Only a page reload loses it.
      let device = null, server = null;
      if (!all && dev.current?.gatt) {
        try { server = await dev.current.gatt.connect(); device = dev.current; } catch { /* fall through to the chooser */ }
      }
      if (!device) {
        // The name filter keeps the chooser short; `all` is the escape hatch for a
        // device that advertises under something other than WT.
        device = await navigator.bluetooth.requestDevice(
          all
            ? { acceptAllDevices: true, optionalServices: SERVICE_CANDIDATES }
            : { filters: [{ namePrefix: 'WT' }], optionalServices: SERVICE_CANDIDATES }
        );
        if (device !== dev.current) device.addEventListener('gattserverdisconnected', () => onDrop.current());
        dev.current = device;
        server = await device.gatt.connect();
      }
      setDeviceName(device.name || 'unnamed');

      // Discover rather than assume. The published UUIDs were wrong once
      // already, and a service that carries a notify characteristic is what
      // this actually needs — whatever it calls itself.
      const services = await server.getPrimaryServices().catch(() => []);
      let notify = null, service = null;
      for (const s of services) {
        const chars = await s.getCharacteristics().catch(() => []);
        const n = chars.find((c) => c.properties.notify || c.properties.indicate);
        if (!n) continue;
        service = s;
        notify = n;
        writeChar.current = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse) || null;
        break;
      }
      if (!notify) {
        const seen = services.map((s) => s.uuid).join(', ') || 'none readable';
        throw new Error(`Connected, but no notify characteristic found. Services visible: ${seen}`);
      }
      setFound({ service: service.uuid, notify: notify.uuid, write: writeChar.current?.uuid || null });

      decoder.current = createDecoder();
      // A reconnect can hand back the same characteristic object; a second
      // listener on it would feed every sample twice.
      if (notifyRef.current) notifyRef.current.char.removeEventListener('characteristicvaluechanged', notifyRef.current.fn);
      const onValue = (e) => {
        const bytes = new Uint8Array(e.target.value.buffer);
        const samples = decoder.current.push(bytes, Date.now());
        // Arrival time is when the phone handed the frames over, not when the
        // sensor took them; spread them at the device's period instead.
        if (samples.length) {
          spreadTimes(samples, Date.now(), { after: lastT.current });
          lastT.current = samples[samples.length - 1].t;
        }
        cb.current?.(samples, bytes);
      };
      notify.addEventListener('characteristicvaluechanged', onValue);
      notifyRef.current = { char: notify, fn: onValue };
      await notify.startNotifications();

      setStatus('linked');
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      // Chrome raises NotFoundError for a cancelled chooser AND for an adapter
      // that's off, a missing scan permission, and a chooser that never opened.
      // Only the literal cancel is silent — treating the rest as a cancel leaves
      // the button looking dead, which is exactly how this failed the first time.
      if (err?.name === 'NotFoundError' && /cancel/i.test(msg)) {
        setStatus('idle');
        setError('Chooser dismissed. If you never saw a device list, Bluetooth or the Nearby devices permission is off.');
        return false;
      }
      setError(`${err?.name || 'Error'}: ${msg}`);
      setStatus('error');
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    try { dev.current?.gatt?.disconnect(); } catch { /* already gone */ }
    setStatus('idle');
  }, []);

  const send = useCallback(async (bytes) => {
    if (!writeChar.current) throw new Error('no write characteristic on this device');
    await writeChar.current.writeValue(Uint8Array.from(bytes));
  }, []);

  // Ask once on mount, so the screen can say the adapter is off before a tap
  // that would otherwise look like it did nothing.
  useEffect(() => {
    let live = true;
    navigator.bluetooth?.getAvailability?.()
      .then((ok) => live && setAvailable(ok))
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Don't leave a GATT connection open behind a closed screen — Android keeps
  // it alive and the next connect then fails as already-connected.
  useEffect(() => () => { try { dev.current?.gatt?.disconnect(); } catch { /* already gone */ } }, []);

  return {
    status, deviceName, error, available, found, connect, disconnect, send,
    stats: () => decoder.current?.stats() || { skipped: 0, badSum: 0, types: {} },
  };
}
