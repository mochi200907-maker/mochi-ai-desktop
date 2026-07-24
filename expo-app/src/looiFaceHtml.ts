// Self-contained Mochi face canvas HTML for the Expo WebView.
// All face expressions, animations, and music notes are rendered here.
// React Native controls the face via injectJavaScript:
//   currentExpression = 'HAPPY';
//   robotState = 'SPEAKING';   // IDLE | LISTENING | THINKING | SPEAKING | PLAYING_MUSIC
export const LOOI_FACE_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;min-height:100%;background:#000;overflow:hidden;touch-action:none}
  body{height:100dvh}
  canvas{position:fixed;top:0;left:0;width:100%;height:100%}
  #video-overlay{display:none;position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.96);flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}
  #video-overlay.open{display:flex}
  #video-frame{width:min(94vw,calc((100dvh - 104px)*16/9));max-width:100%;max-height:calc(100dvh - 104px);aspect-ratio:16/9;border:1px solid #ff4fd888;border-radius:14px;background:#050509}
  #tiktok-video{display:none;width:min(94vw,calc((100dvh - 104px)*9/16));max-width:100%;max-height:calc(100dvh - 104px);aspect-ratio:9/16;border:1px solid #ff4fd888;border-radius:14px;background:#050509;object-fit:contain}
  #video-title{max-width:90%;color:#ffb8f0;font:600 14px system-ui;text-align:center}
  #video-stop{background:#ff4fd8;color:#170013;border:0;border-radius:24px;padding:11px 26px;font:800 14px system-ui}
  @media (max-height:520px){
    #video-overlay{gap:6px}
    #video-frame{width:min(94vw,calc((100dvh - 88px)*16/9));max-height:calc(100dvh - 88px)}
    #tiktok-video{width:min(94vw,calc((100dvh - 88px)*9/16));max-height:calc(100dvh - 88px)}
    #video-title{font-size:12px}
    #video-stop{padding:8px 20px;font-size:13px}
  }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

function viewportSize(){
  const visual=window.visualViewport;
  return {
    width:Math.max(1,Math.round(visual?.width||document.documentElement.clientWidth||window.innerWidth)),
    height:Math.max(1,Math.round(visual?.height||document.documentElement.clientHeight||window.innerHeight)),
  };
}
function resize(){
  const size=viewportSize();
  canvas.width=size.width;
  canvas.height=size.height;
}
window.addEventListener('resize',resize);
window.visualViewport?.addEventListener('resize',resize);
window.visualViewport?.addEventListener('scroll',resize);
resize();

// ── Controlled from React Native via injectJavaScript ─────────
let currentExpression = 'IDLE'; // IDLE HAPPY ANGRY SAD WINK MUSIC NEWS BURGER JUICE CAMERA
let robotState = 'IDLE';        // IDLE LISTENING THINKING SPEAKING PLAYING_MUSIC

// ── Mouth ─────────────────────────────────────────────────────
let mouthOpen = 0, mouthTarget = 0;

function updateMouth(){
  if(robotState==='SPEAKING'){
    const t=Date.now()*0.001;
    mouthTarget=Math.max(0,Math.sin(t*12)*0.35+Math.sin(t*7.5)*0.25+0.18);
  } else if(currentExpression==='BURGER'||currentExpression==='JUICE'){
    mouthTarget=(Math.sin(Date.now()*0.012)+1)*0.4;
  } else {
    mouthTarget=0;
  }
  const spd=mouthTarget>mouthOpen?0.7:0.5;
  mouthOpen+=(mouthTarget-mouthOpen)*spd;
  if(mouthOpen<0.01)mouthOpen=0;
}

function drawCuteMouth(cx,cy){
  const isEating=(currentExpression==='BURGER'||currentExpression==='JUICE');
  if(robotState!=='SPEAKING'&&!isEating)return;
  ctx.save();
  ctx.translate(cx,cy+120);
  const w=36+mouthOpen*18;
  const h=Math.max(4,mouthOpen*22);
  ctx.shadowColor='#00d2ff';ctx.shadowBlur=10;
  ctx.strokeStyle='#3ad8ff';ctx.fillStyle='#081033';ctx.lineWidth=4;ctx.lineCap='round';
  ctx.beginPath();ctx.ellipse(0,0,w*0.5,h*0.6,0,0,Math.PI*2);
  ctx.fill();ctx.stroke();
  ctx.restore();
}

// ── Blink ─────────────────────────────────────────────────────
let nextBlinkAt=Date.now()+1500+Math.random()*2500;
let blinkStartAt=0;
const BLINK_DUR=220;

function getBlinkScale(){
  const now=Date.now();
  if(blinkStartAt===0&&now>=nextBlinkAt){
    blinkStartAt=now;
    nextBlinkAt=now+BLINK_DUR+2000+Math.random()*3000;
  }
  if(blinkStartAt===0)return 1.0;
  const elapsed=now-blinkStartAt;
  if(elapsed>=BLINK_DUR){blinkStartAt=0;return 1.0;}
  return 0.05+0.95*Math.abs(Math.cos((elapsed/BLINK_DUR)*Math.PI));
}

// ── Wink ──────────────────────────────────────────────────────
let winkProgress=0,winkPhase='none',winkHoldTimer=0;

function updateWink(){
  if(currentExpression==='WINK'&&winkPhase==='none')winkPhase='closing';
  if(winkPhase==='closing'){
    winkProgress+=0.08;
    if(winkProgress>=1){winkProgress=1;winkPhase='held';winkHoldTimer=30;}
  } else if(winkPhase==='held'){
    if(--winkHoldTimer<=0)winkPhase='opening';
  } else if(winkPhase==='opening'){
    winkProgress-=0.08;
    if(winkProgress<=0){winkProgress=0;winkPhase='none';if(currentExpression==='WINK')currentExpression='IDLE';}
  }
}

// ── Gaze ──────────────────────────────────────────────────────
let gazeX=0,gazeY=0,gazeTargetX=0,gazeTargetY=0,gazeTimer=0;

function updateGaze(){
  if(--gazeTimer<=0){
    const straight=Math.random()<0.3;
    gazeTargetX=straight?0:(Math.random()-0.5)*40;
    gazeTargetY=straight?0:(Math.random()-0.5)*15;
    gazeTimer=80+Math.random()*180;
  }
  gazeX+=(gazeTargetX-gazeX)*0.04;
  gazeY+=(gazeTargetY-gazeY)*0.04;
}

// ── Music notes ───────────────────────────────────────────────
const NOTES=['♩','♪','♫','♬'];
let musicNotes=[];

function updateMusicNotes(cx,cy){
  if(currentExpression==='MUSIC'&&(robotState==='PLAYING_MUSIC'||robotState==='SPEAKING')){
    if(Math.random()<0.06){
      musicNotes.push({
        x:cx+(Math.random()-0.5)*300,
        y:cy-60,
        vy:-1.2-Math.random()*1.8,
        opacity:0.9,
        note:NOTES[Math.floor(Math.random()*4)],
        size:18+Math.floor(Math.random()*14),
        drift:(Math.random()-0.5)*0.9,
      });
    }
  }
  musicNotes=musicNotes.filter(n=>n.opacity>0);
  musicNotes.forEach(n=>{n.y+=n.vy;n.x+=n.drift;n.opacity-=0.010;});
}

function drawMusicNotes(){
  musicNotes.forEach(n=>{
    ctx.save();
    ctx.globalAlpha=Math.max(0,n.opacity);
    ctx.fillStyle='#00d2ff';
    ctx.font=n.size+'px sans-serif';
    ctx.textAlign='center';
    ctx.shadowColor='#00d2ff';ctx.shadowBlur=12;
    ctx.fillText(n.note,n.x,n.y);
    ctx.restore();
  });
}

// ── Eye drawing ───────────────────────────────────────────────
function drawEye(x,y,r,isLeft,blinkScale){
  ctx.save();ctx.translate(x,y);ctx.scale(1,blinkScale);
  const isHappy=(currentExpression==='HAPPY');
  let cyan='#3ad8ff',dark='#121da0';
  if(currentExpression==='ANGRY'){cyan='#ff3a3a';dark='#a01212';}
  if(!isLeft&&winkProgress>0)ctx.scale(1,1-winkProgress*0.95);
  if(currentExpression==='SAD'){
    ctx.beginPath();ctx.arc(0,15,r,Math.PI*1.15,Math.PI*1.85);
    ctx.lineWidth=18;ctx.strokeStyle=cyan;ctx.shadowColor=cyan;ctx.shadowBlur=14;
    ctx.lineCap='round';ctx.stroke();ctx.restore();return;
  }
  _drawNormalEye(r,cyan,dark,isHappy);
  ctx.restore();
}

function _drawNormalEye(r,cyan,dark,isHappy){
  if(isHappy){
    ctx.beginPath();ctx.arc(0,10,r,Math.PI,0,false);
    ctx.lineTo(r,16);ctx.lineTo(-r,16);ctx.closePath();
    ctx.fillStyle=dark;ctx.fill();
    ctx.beginPath();ctx.arc(0,0,r,Math.PI,0,false);
    ctx.lineTo(r,4);ctx.lineTo(-r,4);ctx.closePath();
    ctx.fillStyle=cyan;ctx.shadowColor=cyan;ctx.shadowBlur=12;ctx.fill();
  } else {
    ctx.beginPath();ctx.arc(0,8,r,0,Math.PI*2);
    ctx.fillStyle=dark;ctx.fill();
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);
    ctx.fillStyle=cyan;ctx.shadowColor=cyan;ctx.shadowBlur=12;ctx.fill();
  }
}

// ── Accessories ───────────────────────────────────────────────
function drawAccessories(cx,cy){
  const t=Date.now()*0.005;
  if(currentExpression==='MUSIC'){
    ctx.save();
    ctx.lineWidth=10;ctx.strokeStyle='#ffffff';ctx.fillStyle='#ffbc00';
    ctx.shadowColor='#00d2ff';ctx.shadowBlur=12;
    ctx.beginPath();ctx.arc(cx,cy-20,240,Math.PI*0.88,Math.PI*0.12,false);ctx.stroke();
    ctx.beginPath();ctx.roundRect(cx-275,cy-65,36,130,16);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.roundRect(cx+239,cy-65,36,130,16);ctx.fill();ctx.stroke();
    ctx.restore();
    drawMusicNotes();
  }
  if(currentExpression==='BURGER'){
    ctx.save();
    const cy2=Math.sin(t*2);
    ctx.font='64px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.translate(cx,cy+90+cy2*8);ctx.scale(1+cy2*0.08,1+cy2*0.08);
    ctx.fillText('🍔',0,0);ctx.restore();
  } else if(currentExpression==='JUICE'){
    ctx.save();
    const cy2=Math.cos(t*2);
    ctx.font='64px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.translate(cx,cy+95+cy2*5);ctx.fillText('🧃',0,0);ctx.restore();
  }
  if(currentExpression==='NEWS')drawNewsMic(cx,cy);
}

function drawNewsMic(cx,cy){
  ctx.save();ctx.translate(cx+75,cy+215);ctx.rotate(-0.3);
  const hw=24,hh=80;
  const hg=ctx.createLinearGradient(-hw/2,0,hw/2,0);
  hg.addColorStop(0,'#111');hg.addColorStop(0.4,'#555');hg.addColorStop(1,'#111');
  ctx.fillStyle=hg;ctx.beginPath();ctx.roundRect(-hw/2,0,hw,hh,5);ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.45)';ctx.lineWidth=2;
  for(let i=0;i<6;i++){const ry=14+i*11;ctx.beginPath();ctx.moveTo(-hw/2+3,ry);ctx.lineTo(hw/2-3,ry);ctx.stroke();}
  const by=hh*0.3;
  ctx.fillStyle='#c0392b';ctx.beginPath();ctx.roundRect(-hw/2,by,hw,15,2);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='bold 7px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('NEWS',0,by+7.5);
  const cw=27,ch=50;
  const cg=ctx.createLinearGradient(-cw/2,-ch,cw/2,0);
  cg.addColorStop(0,'#2a2a2a');cg.addColorStop(0.5,'#888');cg.addColorStop(1,'#3a3a3a');
  ctx.fillStyle=cg;ctx.beginPath();ctx.roundRect(-cw/2,-ch,cw,ch,[14,14,0,0]);ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=1.8;
  for(let i=0;i<5;i++){const ly=-ch+9+i*9;const hw2=(cw/2-3)*Math.sin(((i+1)/6)*Math.PI);ctx.beginPath();ctx.moveTo(-hw2,ly);ctx.lineTo(hw2,ly);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(0,-ch+5);ctx.lineTo(0,-5);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.08)';ctx.beginPath();ctx.ellipse(-cw*0.15,-ch*0.6,cw*0.2,ch*0.2,-0.3,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#222';ctx.fillRect(-cw/2-2,-6,cw+4,10);
  ctx.fillStyle='#666';ctx.fillRect(-cw/2,-4,cw,6);
  ctx.restore();
}

// ── Camera animation ──────────────────────────────────────────
let cameraAnimPhase='none',cameraAnimY=320,cameraAnimTarget=0;

function drawCameraAccessory(cx,cy){
  if(cameraAnimPhase==='none')return;
  const spd=0.14;cameraAnimY+=(cameraAnimTarget-cameraAnimY)*spd;
  const bob=cameraAnimPhase==='held'?Math.sin(Date.now()*0.005)*4:0;
  ctx.save();ctx.translate(cx,cy+220+cameraAnimY+bob);
  const bw=130,bh=78,br=14,lensR=26;
  ctx.shadowColor='#00d2ff';ctx.shadowBlur=20;
  ctx.beginPath();ctx.roundRect(-bw/2,-bh/2,bw,bh,br);
  ctx.fillStyle='#1a1a2e';ctx.fill();ctx.strokeStyle='#00d2ff';ctx.lineWidth=2.5;ctx.stroke();
  ctx.beginPath();ctx.roundRect(-22,-bh/2-18,44,22,[8,8,0,0]);
  ctx.fillStyle='#1a1a2e';ctx.fill();ctx.strokeStyle='#00d2ff';ctx.lineWidth=2.5;ctx.stroke();
  ctx.shadowBlur=0;
  ctx.beginPath();ctx.arc(10,4,lensR+6,0,Math.PI*2);ctx.fillStyle='#0d0d1a';ctx.fill();ctx.strokeStyle='#3ad8ff';ctx.lineWidth=3;ctx.stroke();
  const lg=ctx.createRadialGradient(6,0,2,10,4,lensR);
  lg.addColorStop(0,'#2a4a8a');lg.addColorStop(0.5,'#0d1a3a');lg.addColorStop(1,'#020a1a');
  ctx.beginPath();ctx.arc(10,4,lensR,0,Math.PI*2);ctx.fillStyle=lg;ctx.fill();
  ctx.beginPath();ctx.ellipse(3,-4,lensR*0.45,lensR*0.28,-0.5,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.13)';ctx.fill();
  ctx.beginPath();ctx.arc(bw/2-20,-bh/2+10,7,0,Math.PI*2);ctx.fillStyle='#ff5e97';ctx.fill();
  ctx.beginPath();ctx.roundRect(-bw/2+12,-bh/2+10,18,10,4);ctx.fillStyle='#fffde7';ctx.shadowColor='#fff';ctx.shadowBlur=8;ctx.fill();ctx.shadowBlur=0;
  ctx.restore();
}

// ── Render loop ───────────────────────────────────────────────
function renderLoop(){
  updateWink();updateGaze();updateMouth();
  if(currentExpression==='CAMERA'){
    if(cameraAnimPhase==='none'){cameraAnimPhase='raising';cameraAnimY=320;cameraAnimTarget=0;}
    if(cameraAnimPhase==='raising'&&Math.abs(cameraAnimY-cameraAnimTarget)<2){cameraAnimPhase='held';cameraAnimY=0;}
  } else {
    if(cameraAnimPhase!=='none'){cameraAnimPhase='lowering';cameraAnimTarget=320;}
    if(cameraAnimPhase==='lowering'&&Math.abs(cameraAnimY-320)<2){cameraAnimPhase='none';cameraAnimY=320;}
  }
  if(currentExpression==='MUSIC')updateMusicNotes(canvas.width/2,canvas.height/2);

  ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);

  const cx=canvas.width/2,cy=canvas.height/2;
  // Keep the full face, headphones, and camera inside short landscape
  // screens instead of drawing a portrait-sized face and letting it crop.
  const faceScale=Math.min(
    1,
    Math.max(.35,(canvas.width-24)/640),
    Math.max(.35,(canvas.height-24)/560)
  );
  const R=110,OFF=190;
  const bs=getBlinkScale();

  ctx.save();
  ctx.translate(cx,cy);
  ctx.scale(faceScale,faceScale);
  ctx.save();ctx.translate(gazeX,gazeY);
  drawEye(-OFF,0,R,true,bs);
  drawEye(OFF,0,R,false,bs);
  drawCuteMouth(0,0);
  ctx.restore();

  drawAccessories(0,0);
  drawCameraAccessory(0,0);
  ctx.restore();

  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);

// Double-tap → tell React Native to toggle immersive mode
let _lt = 0;
document.addEventListener('touchend', function() {
  const now = Date.now();
  if (now - _lt < 320 && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage('DOUBLE_TAP');
  }
  _lt = now;
});

// ── Camera overlay ────────────────────────────────────────────
// Called by React Native via injectJavaScript when expression === 'CAMERA'
let _camStream = null;

function triggerCamera() {
  const overlay = document.getElementById('cam-overlay');
  if (overlay && overlay.style.display !== 'none') return; // already open
  openCamera();
}

function openCamera() {
  const overlay = document.getElementById('cam-overlay');
  const video = document.getElementById('cam-video');
  if (!overlay || !video) return;

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    .then(function(stream) {
      _camStream = stream;
      video.srcObject = stream;
      video.play();
      overlay.style.display = 'flex';
    })
    .catch(function(err) {
      console.warn('Camera error:', err);
    });
}

function closeCamera(notify) {
  const overlay = document.getElementById('cam-overlay');
  const video = document.getElementById('cam-video');
  if (overlay) overlay.style.display = 'none';
  if (video) video.srcObject = null;
  if (_camStream) { _camStream.getTracks().forEach(function(t){ t.stop(); }); _camStream = null; }
  if (notify !== false && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage('CAMERA_CANCEL');
  }
}

function capturePhoto() {
  const video = document.getElementById('cam-video');
  const canvas = document.getElementById('cam-canvas');
  if (!video || !canvas) return;
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx2 = canvas.getContext('2d');
  ctx2.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  closeCamera(false); // don't send CAMERA_CANCEL — we're sending CAMERA_PHOTO instead
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage('CAMERA_PHOTO:' + dataUrl);
  }
}

// ── Video playback ────────────────────────────────────────────
function youtubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1);
    return parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
  } catch (_) {
    return null;
  }
}

function playVideo(url, title, provider) {
  const overlay = document.getElementById('video-overlay');
  const frame = document.getElementById('video-frame');
  const tiktokVideo = document.getElementById('tiktok-video');
  const label = document.getElementById('video-title');
  if (!overlay || !frame || !tiktokVideo) return;
  if (provider === 'tiktok') {
    frame.src = 'about:blank';
    frame.style.display = 'none';
    tiktokVideo.src = url;
    tiktokVideo.style.display = 'block';
    tiktokVideo.play().catch(function(err){ console.warn('TikTok autoplay blocked:', err.message); });
  } else {
    const id = youtubeId(url);
    if (!id) return;
    tiktokVideo.pause();
    tiktokVideo.removeAttribute('src');
    tiktokVideo.load();
    tiktokVideo.style.display = 'none';
    frame.style.display = 'block';
    frame.src = 'https://www.youtube.com/embed/' + encodeURIComponent(id)
      + '?autoplay=1&playsinline=1&rel=0';
  }
  if (label) label.textContent = title || 'Playing video';
  overlay.classList.add('open');
}

function stopVideo(notify) {
  const overlay = document.getElementById('video-overlay');
  const frame = document.getElementById('video-frame');
  const tiktokVideo = document.getElementById('tiktok-video');
  if (frame) frame.src = 'about:blank';
  if (tiktokVideo) {
    tiktokVideo.pause();
    tiktokVideo.removeAttribute('src');
    tiktokVideo.load();
    tiktokVideo.style.display = 'none';
  }
  if (frame) frame.style.display = 'block';
  if (overlay) overlay.classList.remove('open');
  if (notify !== false && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage('VIDEO_STOP');
  }
}
</script>

<!-- Camera overlay -->
<div id="cam-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:100;flex-direction:column;align-items:center;justify-content:center;gap:16px;">
  <video id="cam-video" autoplay playsinline style="width:90%;max-height:65vh;border-radius:16px;object-fit:cover;border:2px solid #00d2ff;"></video>
  <div style="display:flex;gap:20px;">
    <button onclick="capturePhoto()" style="background:#00d2ff;color:#000;border:none;border-radius:30px;padding:14px 36px;font-size:16px;font-weight:800;cursor:pointer;">📸 Capture</button>
    <button onclick="closeCamera()" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:30px;padding:14px 28px;font-size:15px;cursor:pointer;">Cancel</button>
  </div>
</div>
<canvas id="cam-canvas" style="display:none;"></canvas>
<div id="video-overlay">
  <iframe id="video-frame" title="Mochi video player"
    allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
  <video id="tiktok-video" playsinline controls loop></video>
  <div id="video-title"></div>
  <button id="video-stop" onclick="stopVideo()">■ Stop video</button>
</div>
</body>
</html>`;
