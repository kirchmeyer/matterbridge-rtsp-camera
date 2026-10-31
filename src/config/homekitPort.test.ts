import assert from 'node:assert/strict';
import { assertDistinctPorts, parseHomeKitPort } from './homekitPort.js';

assert.equal(parseHomeKitPort(undefined, 'a'), undefined, 'no port: the library picks one, as before');
assert.equal(parseHomeKitPort(null, 'a'), undefined);
assert.equal(parseHomeKitPort('', 'a'), undefined);
assert.equal(parseHomeKitPort(51827, 'a'), 51827);
assert.equal(parseHomeKitPort(1024, 'a'), 1024);
assert.equal(parseHomeKitPort(65535, 'a'), 65535);
for (const bad of [0, 80, 1023, 65536, 51827.5, -1, '51827', NaN, true, {}, []]) {
    assert.throws(() => parseHomeKitPort(bad, 'a'), /homekitPort/, `refused: ${String(bad)}`);
}
assert.throws(() => parseHomeKitPort(80, 'door'), /Camera door /, 'it says which camera');

assertDistinctPorts([{ id: 'a' }, { id: 'b' }]);
assertDistinctPorts([{ id: 'a', homekitPort: 51827 }, { id: 'b', homekitPort: 51828 }, { id: 'c' }]);
assert.throws(() => assertDistinctPorts([{ id: 'a', homekitPort: 51827 }, { id: 'b', homekitPort: 51827 }]), /both set to HomeKit port 51827/);

console.log('homekit port tests passed');
