// Generates icons/icon-192.png and icon-512.png (glowing orb) with no dependencies.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
function crc32(buf){let c,crc=~0;for(const b of buf){c=(crc^b)&255;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return ~crc>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function png(size){
  const raw=Buffer.alloc((size*4+1)*size);const c=size/2;
  for(let y=0;y<size;y++){raw[y*(size*4+1)]=0;for(let x=0;x<size;x++){
    const d=Math.hypot(x-c+.5,y-c+.5)/(size/2);let r=11,g=16,b=32;
    const glow=Math.max(0,1-d/0.8);const core=d<0.3?1:Math.max(0,1-(d-0.3)/0.05);
    r=r+(255-r)*Math.min(1,glow*1.3);g=g+(190-g)*Math.min(1,glow*1.1);b=b+(80-b)*glow*0.9;
    r=r+(255-r)*core;g=g+(246-g)*core;b=b+(214-b)*core;
    const i=y*(size*4+1)+1+x*4;raw[i]=r;raw[i+1]=g;raw[i+2]=b;raw[i+3]=255;}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
for(const s of [192,512])fs.writeFileSync(path.join(__dirname,'..','icons',`icon-${s}.png`),png(s));
console.log('icons written');
