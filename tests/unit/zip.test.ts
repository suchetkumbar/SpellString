import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, zipFiles } from '../../scripts/zip';

/** A minimal zip reader: walk the central directory and inflate each entry. */
function unzip(buf: Buffer): Map<string, Buffer> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(0);
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let k = 0; k < count; k++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const crc = buf.readUInt32LE(p + 16);
    const nlen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    expect(buf.readUInt32LE(local)).toBe(0x04034b50);
    const lnlen = buf.readUInt16LE(local + 26);
    const data = inflateRawSync(buf.subarray(local + 30 + lnlen, local + 30 + lnlen + csize));
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(crc);
    out.set(name, data);
    p += 46 + nlen;
  }
  return out;
}

describe('the itch.io zip writer', () => {
  it('computes standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('writes a valid archive that round-trips every file', () => {
    const files = [
      { name: 'index.html', data: Buffer.from('<!doctype html><title>x</title>') },
      { name: 'assets/a.js', data: Buffer.from('console.log(1);'.repeat(200)) },
      { name: 'fonts/empty.txt', data: Buffer.alloc(0) },
    ];
    const zip = zipFiles(files);
    const back = unzip(zip);
    expect([...back.keys()]).toEqual(files.map((f) => f.name));
    for (const f of files) expect(back.get(f.name)!.equals(f.data)).toBe(true);
    // Deterministic: the same input gives the same bytes.
    expect(zipFiles(files).equals(zip)).toBe(true);
  });
});
