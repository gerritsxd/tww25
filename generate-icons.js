// Generate PWA icons using Node.js Canvas
const fs = require('fs');
const { createCanvas } = require('canvas');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, size, size);
  
  // Gradient circle
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  gradient.addColorStop(0, '#00f5d4');
  gradient.addColorStop(1, '#0a0a0f');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2.5, 0, Math.PI * 2);
  ctx.fill();
  
  // Main dot
  ctx.fillStyle = '#00f5d4';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/8, 0, Math.PI * 2);
  ctx.fill();
  
  // Glow effect (multiple layers)
  for (let i = 0; i < 3; i++) {
    ctx.shadowBlur = size/10 + i * 5;
    ctx.shadowColor = '#00f5d4';
    ctx.fillStyle = `rgba(0, 245, 212, ${0.8 - i * 0.2})`;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/8, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Text "TWW"
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size/5}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('TWW', size/2, size - size/10);
  
  // Save to file
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`public/icon-${size}.png`, buffer);
  console.log(`✅ Generated icon-${size}.png`);
}

// Check if canvas is installed
try {
  require('canvas');
  generateIcon(192);
  generateIcon(512);
  console.log('\n🎉 Icons generated successfully!');
  console.log('📁 Files: public/icon-192.png, public/icon-512.png');
} catch (err) {
  console.log('⚠️  canvas package not installed.');
  console.log('📝 Please open generate-icons.html in your browser instead.');
  console.log('   Then download the icons by clicking the buttons.');
}

