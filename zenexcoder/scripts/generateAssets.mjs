import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const outDir = path.resolve('assets');

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePng(size = 256) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 4;
      const dx = x - size / 2;
      const dy = y - size / 2;
      const distance = Math.sqrt(dx * dx + dy * dy) / (size / 2);
      const inside = distance < 0.86;
      raw[i] = inside ? 124 : 13;
      raw[i + 1] = inside ? Math.max(58, 168 - y / 2) : 13;
      raw[i + 2] = inside ? 237 : 13;
      raw[i + 3] = 255;
      const slash = Math.abs((x - 128) - (y - 128) * 0.38) < 16;
      if (inside && x > 86 && x < 172 && y > 68 && y < 188 && slash) {
        raw[i] = 245;
        raw[i + 1] = 245;
        raw[i + 2] = 245;
      }
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

await fs.mkdir(outDir, { recursive: true });
const png = makePng(256);
await fs.writeFile(path.join(outDir, 'icon.png'), png);

const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader[6] = 0;
icoHeader[7] = 0;
icoHeader[8] = 0;
icoHeader[9] = 0;
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(png.length, 14);
icoHeader.writeUInt32LE(22, 18);
await fs.writeFile(path.join(outDir, 'icon.ico'), Buffer.concat([icoHeader, png]));

const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns', 0, 'ascii');
icnsHeader.writeUInt32BE(16 + png.length, 4);
const icnsBlock = Buffer.alloc(8);
icnsBlock.write('ic08', 0, 'ascii');
icnsBlock.writeUInt32BE(8 + png.length, 4);
await fs.writeFile(path.join(outDir, 'icon.icns'), Buffer.concat([icnsHeader, icnsBlock, png]));
