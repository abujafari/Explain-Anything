/**
 * Generate simple placeholder icons for the extension
 * Run with: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Simple PNG generator for solid color with question mark
function createIcon(size) {
  // Create a simple PNG with a colored background
  // This is a minimal PNG structure
  
  const width = size;
  const height = size;
  
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);  // bit depth
  ihdrData.writeUInt8(6, 9);  // color type (RGBA)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdrData);
  
  // Create image data (purple gradient with question mark shape)
  const rawData = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = width * 0.4;
  
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      // Distance from center
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Circle background
      if (dist <= radius) {
        // Gradient purple
        const t = dist / radius;
        const r = Math.round(102 + (118 - 102) * t); // 667eea to 764ba2
        const g = Math.round(126 + (75 - 126) * t);
        const b = Math.round(234 + (162 - 234) * t);
        
        // Simple question mark pattern
        const relX = (x - centerX) / radius;
        const relY = (y - centerY) / radius;
        
        let isQuestionMark = false;
        
        // Question mark shape (simplified)
        // Top arc
        if (relY >= -0.7 && relY <= -0.2) {
          const arcDist = Math.sqrt(relX * relX + (relY + 0.45) * (relY + 0.45));
          if (arcDist >= 0.2 && arcDist <= 0.4 && (relX >= 0 || relY <= -0.4)) {
            isQuestionMark = true;
          }
        }
        // Stem
        if (relX >= -0.1 && relX <= 0.1 && relY >= -0.2 && relY <= 0.2) {
          isQuestionMark = true;
        }
        // Dot
        if (relY >= 0.4 && relY <= 0.6 && relX >= -0.1 && relX <= 0.1) {
          isQuestionMark = true;
        }
        
        if (isQuestionMark) {
          rawData.push(255, 255, 255, 255); // White
        } else {
          rawData.push(r, g, b, 255);
        }
      } else {
        // Transparent outside circle
        rawData.push(0, 0, 0, 0);
      }
    }
  }
  
  // Compress with zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  
  const idatChunk = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xffffffff;
  const table = makeCrcTable();
  
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const table = new Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[i] = c;
  }
  return table;
}

// Generate icons
const assetsDir = path.join(__dirname, '..', 'assets');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const sizes = [16, 48, 128];

sizes.forEach(size => {
  const icon = createIcon(size);
  const filePath = path.join(assetsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, icon);
  console.log(`Created ${filePath}`);
});

console.log('Icons generated successfully!');

