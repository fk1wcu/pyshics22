/**
 * app.js — 파일 업로드, 이미지/영상 처리, 색상 세그멘테이션
 */

// DOM 요소 (나중에 초기화됨)
let uploadArea, fileInput, imageArea, firstPhotoBtn, lastPhotoBtn, eyedropperBtn, startBtn;
let firstColorBox, lastColorBox, firstColorInfo, lastColorInfo;
let firstColorHex, lastColorHex;
let eyedropperSizeSlider, eyedropperSizeDisplay;

// 현재 프레임 관리
let currentFrames = [];
let currentFrameIndex = 0;
let colorPickMode = null;
let activeSlot = 'first';

// 추출된 색상 저장
let firstColor = { r: null, g: null, b: null, hsv: null };
let lastColor = { r: null, g: null, b: null, hsv: null };

// 프레임 추출 로딩 타이머
let frameLoadingTimer = null;

// DOM 요소 초기화 함수
function initializeDOMElements() {
  uploadArea = document.getElementById('uploadArea');
  fileInput = document.getElementById('fileInput');
  imageArea = document.querySelector('.image-area');
  firstPhotoBtn = document.querySelector('.first-photo-btn');
  lastPhotoBtn = document.querySelector('.last-photo-btn');
  eyedropperBtn = document.querySelector('.eyedropper-btn');
  startBtn = document.querySelector('.figma-button');
  firstColorBox = document.getElementById('firstColorBox');
  lastColorBox = document.getElementById('lastColorBox');
  firstColorInfo = document.getElementById('firstColorInfo');
  lastColorInfo = document.getElementById('lastColorInfo');
  firstColorHex = document.getElementById('firstColorHex');
  lastColorHex = document.getElementById('lastColorHex');

  // 시작 버튼 → 세그멘테이션 수행 후 save.html로 이동
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (firstColor.hsv === null || lastColor.hsv === null) {
        alert('첫 번째 색상과 마지막 색상을 모두 선택해주세요');
        return;
      }
      if (currentFrames.length === 0) {
        alert('영상을 먼저 업로드해주세요 (단일 이미지는 그래프 생성에 사용할 수 없습니다)');
        return;
      }
      await runSegmentation();
    });
  }

  if (uploadArea) {
    uploadArea.addEventListener('click', () => {
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.type.startsWith('image/')) {
          loadImage(file);
        } else if (file.type.startsWith('video/')) {
          extractVideoFrames(file);
        }
      }
    });
  }

  // 드래그 & 드롭
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '#D9D9D9';
      uploadArea.style.backgroundColor = '#333333';
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.borderColor = '#464549';
      uploadArea.style.backgroundColor = '#232121';
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '#464549';
      uploadArea.style.backgroundColor = '#232121';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          loadImage(file);
        } else if (file.type.startsWith('video/')) {
          extractVideoFrames(file);
        }
      }
    });
  }

  if (firstPhotoBtn) {
    firstPhotoBtn.addEventListener('click', () => {
      goToFirstFrame();
      activeSlot = 'first';
      activateColorPick('first');
    });
  }
  if (lastPhotoBtn) {
    lastPhotoBtn.addEventListener('click', () => {
      goToLastFrame();
      activeSlot = 'last';
      activateColorPick('last');
    });
  }

  if (firstColorBox) {
    firstColorBox.addEventListener('click', () => {
      activeSlot = 'first';
      activateColorPick('first');
    });
  }
  if (lastColorBox) {
    lastColorBox.addEventListener('click', () => {
      activeSlot = 'last';
      activateColorPick('last');
    });
  }

  if (eyedropperBtn) {
    eyedropperBtn.addEventListener('click', () => {
      activateColorPick(activeSlot);
    });
  }

  eyedropperSizeSlider = document.getElementById('eyedropperSize');
  eyedropperSizeDisplay = document.getElementById('eyedropperSizeDisplay');
  if (eyedropperSizeSlider) {
    eyedropperSizeSlider.addEventListener('input', () => {
      const v = eyedropperSizeSlider.value;
      if (eyedropperSizeDisplay) eyedropperSizeDisplay.textContent = `${v}×${v}`;
    });
  }

  if (imageArea) {
    imageArea.addEventListener('click', (e) => {
      if (!colorPickMode) return;
      if (e.target.closest('.image-area__nav')) return;

      let frameImg = document.getElementById('frameImage');
      if (!frameImg) frameImg = imageArea.querySelector('img');
      if (!frameImg || !frameImg.naturalWidth) return;

      const slot = colorPickMode;
      const rect = imageArea.getBoundingClientRect();

      const containerAspect = rect.width / rect.height;
      const imageAspect = frameImg.naturalWidth / frameImg.naturalHeight;
      let displayedWidth, displayedHeight, offsetX, offsetY;
      if (imageAspect > containerAspect) {
        displayedWidth = rect.width;
        displayedHeight = rect.width / imageAspect;
        offsetX = 0;
        offsetY = (rect.height - displayedHeight) / 2;
      } else {
        displayedHeight = rect.height;
        displayedWidth = rect.height * imageAspect;
        offsetX = (rect.width - displayedWidth) / 2;
        offsetY = 0;
      }

      const relX = e.clientX - rect.left - offsetX;
      const relY = e.clientY - rect.top - offsetY;

      if (relX < 0 || relX > displayedWidth || relY < 0 || relY > displayedHeight) {
        colorPickMode = null;
        imageArea.style.cursor = 'default';
        imageArea.classList.remove('image-area--picking');
        if (eyedropperBtn) eyedropperBtn.classList.remove('eyedropper-btn--active');
        return;
      }

      const cx = Math.floor(relX / displayedWidth * frameImg.naturalWidth);
      const cy = Math.floor(relY / displayedHeight * frameImg.naturalHeight);

      const canvas = document.createElement('canvas');
      canvas.width = frameImg.naturalWidth;
      canvas.height = frameImg.naturalHeight;
      const ctx = canvas.getContext('2d');

      try {
        ctx.drawImage(frameImg, 0, 0);
      } catch (err) {
        console.error('drawImage 실패:', err);
        return;
      }

      const size = eyedropperSizeSlider ? parseInt(eyedropperSizeSlider.value) : 1;
      const half = Math.floor(size / 2);
      const sx = Math.max(0, cx - half);
      const sy = Math.max(0, cy - half);
      const sw = Math.min(frameImg.naturalWidth - sx, size);
      const sh = Math.min(frameImg.naturalHeight - sy, size);

      let imageData;
      try {
        imageData = ctx.getImageData(sx, sy, sw, sh);
      } catch (err) {
        console.error('getImageData 실패:', err);
        return;
      }

      let totalR = 0, totalG = 0, totalB = 0;
      const pixelCount = sw * sh;
      for (let i = 0; i < imageData.data.length; i += 4) {
        totalR += imageData.data[i];
        totalG += imageData.data[i + 1];
        totalB += imageData.data[i + 2];
      }
      const r = Math.round(totalR / pixelCount);
      const g = Math.round(totalG / pixelCount);
      const b = Math.round(totalB / pixelCount);

      const hsv = rgbToHsv(r, g, b);
      const hex = rgbToHex(r, g, b);
      const cv  = hsvToOpenCV(hsv);

      const infoHTML =
        `H: ${hsv.h}°<span class="opencv-val">cv ${cv.h}</span><br>` +
        `S: ${hsv.s}%<span class="opencv-val">cv ${cv.s}</span><br>` +
        `V: ${hsv.v}%<span class="opencv-val">cv ${cv.v}</span>`;

      if (slot === 'first') {
        if (firstColorBox) firstColorBox.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        if (firstColorInfo) firstColorInfo.innerHTML = infoHTML;
        if (firstColorHex) firstColorHex.textContent = hex;
        firstColor = { r, g, b, hsv, hex, cv };
      } else if (slot === 'last') {
        if (lastColorBox) lastColorBox.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        if (lastColorInfo) lastColorInfo.innerHTML = infoHTML;
        if (lastColorHex) lastColorHex.textContent = hex;
        lastColor = { r, g, b, hsv, hex, cv };
      }

      updateHsvDisplay(hsv);

      colorPickMode = null;
      imageArea.style.cursor = 'default';
      imageArea.classList.remove('image-area--picking');
      if (eyedropperBtn) eyedropperBtn.classList.remove('eyedropper-btn--active');
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDOMElements);
} else {
  initializeDOMElements();
}

// =====================================================
// ===== 프레임 추출 로딩 아이콘 =====
// =====================================================

function ensureLoadingStyles() {
  if (document.getElementById('frameLoadingStyle')) return;
  const style = document.createElement('style');
  style.id = 'frameLoadingStyle';
  style.textContent = `
    #frameLoadingIcon {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      pointer-events: none;
      font-family: 'Pretendard Variable', sans-serif;
    }
    .frame-loading-spinner {
      width: 52px;
      height: 52px;
      border: 4px solid rgba(255, 255, 255, 0.12);
      border-top-color: #FFA500;
      border-radius: 50%;
      animation: frameSpinAnim 0.8s linear infinite;
    }
    .frame-loading-text {
      font-size: 13px;
      color: #ccc;
      letter-spacing: -0.1px;
    }
    @keyframes frameSpinAnim {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

function showFrameLoadingIcon() {
  if (!imageArea) return;
  if (document.getElementById('frameLoadingIcon')) return;

  ensureLoadingStyles();

  // 절대 위치 기준 잡기
  const cs = getComputedStyle(imageArea);
  if (cs.position === 'static') imageArea.style.position = 'relative';

  const icon = document.createElement('div');
  icon.id = 'frameLoadingIcon';
  icon.innerHTML = `
    <div class="frame-loading-spinner"></div>
    <div class="frame-loading-text">프레임 추출 중...</div>
  `;
  imageArea.appendChild(icon);
}

function hideFrameLoadingIcon() {
  const icon = document.getElementById('frameLoadingIcon');
  if (icon) icon.remove();
}

function startFrameLoadingTimer() {
  clearFrameLoadingTimer();
  frameLoadingTimer = setTimeout(() => {
    showFrameLoadingIcon();
  }, 5000); // 5초 후 표시
}

function clearFrameLoadingTimer() {
  if (frameLoadingTimer) {
    clearTimeout(frameLoadingTimer);
    frameLoadingTimer = null;
  }
  hideFrameLoadingIcon();
}

// =====================================================
// ===== 색상 세그멘테이션 =====
// =====================================================

async function runSegmentation() {
  const overlay = createLoadingOverlay();
  document.body.appendChild(overlay);
  await new Promise(r => setTimeout(r, 30));

  const fH = firstColor.hsv.h;
  const lH = lastColor.hsv.h;
  const sMin = Math.min(firstColor.hsv.s, lastColor.hsv.s);
  const sMax = Math.max(firstColor.hsv.s, lastColor.hsv.s);
  const vMin = Math.min(firstColor.hsv.v, lastColor.hsv.v);
  const vMax = Math.max(firstColor.hsv.v, lastColor.hsv.v);

  const hMinLinear = Math.min(fH, lH);
  const hMaxLinear = Math.max(fH, lH);
  const hueWraps = (hMaxLinear - hMinLinear) > 180;
  const hMin = hMinLinear;
  const hMax = hMaxLinear;

  const pixelCounts = [];
  let totalPixels = 0;

  for (let i = 0; i < currentFrames.length; i++) {
    updateProgress(overlay, i + 1, currentFrames.length);
    const result = await processFrame(
      currentFrames[i],
      hMin, hMax, hueWraps,
      sMin, sMax, vMin, vMax
    );
    pixelCounts.push(result.matchCount);
    totalPixels = result.totalPixels;
    await new Promise(r => setTimeout(r, 0));
  }

  sessionStorage.setItem('segmentationData', JSON.stringify({
    pixelCounts,
    totalPixels,
    frameCount: currentFrames.length,
    firstHsv: firstColor.hsv,
    lastHsv: lastColor.hsv,
    firstHex: firstColor.hex,
    lastHex: lastColor.hex,
    firstRgb: { r: firstColor.r, g: firstColor.g, b: firstColor.b },
    lastRgb:  { r: lastColor.r,  g: lastColor.g,  b: lastColor.b },
    hueWraps,
    range: { hMin, hMax, sMin, sMax, vMin, vMax },
    timestamp: Date.now()
  }));

  overlay.remove();
  window.location.href = 'save.html';
}

function processFrame(frameDataUrl, hMin, hMax, hueWraps, sMin, sMax, vMin, vMax) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const totalPixels = data.length / 4;
      let matchCount = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        const v = max * 100;
        if (v < vMin || v > vMax) continue;

        const s = max === 0 ? 0 : (delta / max) * 100;
        if (s < sMin || s > sMax) continue;

        let h = 0;
        if (delta !== 0) {
          if (max === r) {
            h = ((g - b) / delta) + (g < b ? 6 : 0);
          } else if (max === g) {
            h = ((b - r) / delta) + 2;
          } else {
            h = ((r - g) / delta) + 4;
          }
          h *= 60;
        }

        if (hueWraps) {
          if (h > hMin && h < hMax) continue;
        } else {
          if (h < hMin || h > hMax) continue;
        }

        matchCount++;
      }

      resolve({ matchCount, totalPixels });
    };
    img.onerror = () => resolve({ matchCount: 0, totalPixels: 0 });
    img.src = frameDataUrl;
  });
}

function createLoadingOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'segmentationOverlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.85);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    z-index: 9999; color: #fff;
    font-family: 'Pretendard Variable', sans-serif;
  `;

  const title = document.createElement('div');
  title.textContent = '색상 세그멘테이션 진행 중...';
  title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 16px;';

  const progress = document.createElement('div');
  progress.id = 'segmentationProgress';
  progress.textContent = '0 / 0';
  progress.style.cssText = 'font-size: 13px; color: #aaa; margin-bottom: 20px;';

  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'width: 320px; height: 6px; background: #333; border-radius: 3px; overflow: hidden;';

  const bar = document.createElement('div');
  bar.id = 'segmentationBar';
  bar.style.cssText = 'width: 0%; height: 100%; background: #FFA500; transition: width 0.1s ease;';

  barWrap.appendChild(bar);
  overlay.appendChild(title);
  overlay.appendChild(progress);
  overlay.appendChild(barWrap);
  return overlay;
}

function updateProgress(overlay, current, total) {
  const progress = overlay.querySelector('#segmentationProgress');
  const bar = overlay.querySelector('#segmentationBar');
  if (progress) progress.textContent = `${current} / ${total}`;
  if (bar) bar.style.width = `${(current / total) * 100}%`;
}

// =====================================================
// ===== 이미지/영상 로드 =====
// =====================================================

function loadImage(file) {
  // 진행 중이던 영상 로딩 타이머가 있으면 정리
  clearFrameLoadingTimer();

  const reader = new FileReader();
  reader.onload = (e) => {
    const imageSrc = e.target.result;
    const svg = imageArea.querySelector('svg');
    if (svg) svg.style.display = 'none';
    clearImageArea();
    const img = document.createElement('img');
    img.src = imageSrc;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    imageArea.appendChild(img);
    currentFrames = [];
  };
  reader.readAsDataURL(file);
}

function extractVideoFrames(file) {
  const video = document.createElement('video');
  const reader = new FileReader();

  // 5초 넘기면 로딩 아이콘 표시
  startFrameLoadingTimer();

  reader.onload = (e) => {
    video.src = e.target.result;
    video.addEventListener('loadedmetadata', () => {
      const frames = [];
      const svg = imageArea.querySelector('svg');
      if (svg) svg.style.display = 'none';
      clearImageArea();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');

      const frameDuration = 0.5;
      let currentTime = 0;

      function extractNextFrame() {
        if (currentTime < video.duration) {
          video.currentTime = currentTime;
          video.addEventListener('seeked', () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL());
            currentTime += frameDuration;
            if (currentTime < video.duration) extractNextFrame();
            else displayFrames(frames);
          }, { once: true });
        } else {
          displayFrames(frames);
        }
      }
      extractNextFrame();
    });
  };
  reader.readAsDataURL(file);
}

function displayFrames(frames) {
  // 프레임 추출 완료 → 로딩 아이콘/타이머 정리
  clearFrameLoadingTimer();

  currentFrames = frames;
  currentFrameIndex = 0;

  const container = document.createElement('div');
  container.className = 'image-area__frames-container';

  const frameImg = document.createElement('img');
  frameImg.className = 'image-area__frame';
  frameImg.id = 'frameImage';
  frameImg.src = frames[currentFrameIndex];
  container.appendChild(frameImg);

  const navContainer = document.createElement('div');
  navContainer.className = 'image-area__nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'image-area__nav-btn image-area__nav-btn--prev';
  prevBtn.innerHTML = '‹';
  prevBtn.addEventListener('click', () => goToPreviousFrame());

  const nextBtn = document.createElement('button');
  nextBtn.className = 'image-area__nav-btn image-area__nav-btn--next';
  nextBtn.innerHTML = '›';
  nextBtn.addEventListener('click', () => goToNextFrame());

  const counter = document.createElement('div');
  counter.className = 'image-area__counter';
  counter.id = 'frameCounter';
  counter.textContent = `${currentFrameIndex + 1} / ${frames.length}`;

  navContainer.appendChild(prevBtn);
  navContainer.appendChild(counter);
  navContainer.appendChild(nextBtn);
  container.appendChild(navContainer);
  imageArea.appendChild(container);
}

function goToNextFrame() {
  if (currentFrames.length === 0) return;
  currentFrameIndex = (currentFrameIndex + 1) % currentFrames.length;
  updateFrameDisplay();
}
function goToPreviousFrame() {
  if (currentFrames.length === 0) return;
  currentFrameIndex = (currentFrameIndex - 1 + currentFrames.length) % currentFrames.length;
  updateFrameDisplay();
}
function goToFirstFrame() {
  if (currentFrames.length === 0) return;
  currentFrameIndex = 0;
  activeSlot = 'first';
  updateFrameDisplay();
}
function goToLastFrame() {
  if (currentFrames.length === 0) return;
  currentFrameIndex = currentFrames.length - 1;
  activeSlot = 'last';
  updateFrameDisplay();
}
function updateFrameDisplay() {
  const frameImg = document.getElementById('frameImage');
  const counter = document.getElementById('frameCounter');
  if (frameImg && currentFrames.length > 0) {
    frameImg.src = currentFrames[currentFrameIndex];
    if (counter) counter.textContent = `${currentFrameIndex + 1} / ${currentFrames.length}`;
  }
}

document.addEventListener('keydown', (e) => {
  if (currentFrames.length === 0) return;
  if (e.key === 'Enter' || e.key === 'ArrowRight') goToNextFrame();
  else if (e.key === 'ArrowLeft') goToPreviousFrame();
});

// =====================================================
// ===== 색상 추출 모드 / 변환 함수 =====
// =====================================================

function activateColorPick(slot) {
  let frameImg = document.getElementById('frameImage');
  if (!frameImg) frameImg = imageArea.querySelector('img');
  if (!frameImg || !frameImg.src) {
    alert('이미지를 먼저 로드해주세요');
    return;
  }
  colorPickMode = slot;
  imageArea.style.cursor = 'crosshair';
  imageArea.classList.add('image-area--picking');
  if (eyedropperBtn) eyedropperBtn.classList.add('eyedropper-btn--active');
}

function rgbToHex(r, g, b) {
  const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hsvToOpenCV(hsv) {
  return {
    h: Math.round(hsv.h / 2),
    s: Math.round(hsv.s * 255 / 100),
    v: Math.round(hsv.v * 255 / 100)
  };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0, s = 0, v = max;
  if (max !== 0) s = delta / max;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / delta + 2) / 6;
    else h = ((r - g) / delta + 4) / 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100)
  };
}

function updateHsvDisplay(hsv) {
  const labels = document.querySelectorAll('.hsv-display__label');
  if (labels[0]) labels[0].textContent = `H: ${hsv.h}°`;
  if (labels[1]) labels[1].textContent = `S: ${hsv.s}%`;
  if (labels[2]) labels[2].textContent = `V: ${hsv.v}%`;

  const hsvToRgb = (h, s, v) => {
    h = h / 360; s = s / 100; v = v / 100;
    const c = v * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = v - c;
    let r, g, b;
    if (h < 1/6)      { r = c; g = x; b = 0; }
    else if (h < 2/6) { r = x; g = c; b = 0; }
    else if (h < 3/6) { r = 0; g = c; b = x; }
    else if (h < 4/6) { r = 0; g = x; b = c; }
    else if (h < 5/6) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const colorPreview = document.getElementById('colorPreview');
  if (colorPreview) {
    colorPreview.style.backgroundColor = hsvToRgb(hsv.h, hsv.s, hsv.v);
  }
}

function clearImageArea() {
  const children = Array.from(imageArea.children);
  children.forEach(child => {
    if (child.tagName !== 'svg' &&
        child.className !== 'image-area__frames-container' &&
        child.id !== 'frameLoadingIcon') {
      if (child.tagName === 'IMG') child.remove();
    }
  });
  const frameContainer = imageArea.querySelector('.image-area__frames-container');
  if (frameContainer) frameContainer.remove();
}