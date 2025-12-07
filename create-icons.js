const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Create icons directory
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create a 16x16 circle icon
function createCircle(color, filename) {
  const canvas = createCanvas(16, 16);
  const ctx = canvas.getContext('2d');
  
  ctx.beginPath();
  ctx.arc(8, 8, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(iconsDir, filename), buffer);
  console.log('Created', filename);
}

// Create a globe icon for main app
function createGlobe() {
  const canvas = createCanvas(16, 16);
  const ctx = canvas.getContext('2d');
  
  // Circle outline
  ctx.beginPath();
  ctx.arc(8, 8, 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  
  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(2, 8);
  ctx.lineTo(14, 8);
  ctx.stroke();
  
  // Vertical line  
  ctx.beginPath();
  ctx.moveTo(8, 2);
  ctx.lineTo(8, 14);
  ctx.stroke();
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(iconsDir, 'globe.png'), buffer);
  console.log('Created globe.png');
}

createGlobe();
createCircle('#007AFF', 'blue.png');
createCircle('#34C759', 'green.png');
createCircle('#FF9500', 'orange.png');
createCircle('#FF2D55', 'pink.png');
createCircle('#AF52DE', 'purple.png');
createCircle('#6B7280', 'gray.png');
console.log('All icons created!');
