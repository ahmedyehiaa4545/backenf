// ==================== Audio Chime Synthesis ====================
function playSuccessSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);
    
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.12); // E5
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.error('Failed to play success sound:', e);
  }
}

// ==================== State ====================
let audioFile = null;
let leftLogoFile = null;
let rightLogoFile = null;
let selectedAnimation = 'classic';
let captionTop = 68;
let customFontDataUrl = null;
let customFontName = null;

function loadGoogleFontCSS(fontName) {
  const id = `gfont-${fontName.replace(/\+/g, '-')}`;
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@400;600;700;900&display=swap`;
    document.head.appendChild(link);
  }
}

window.applyLiveFontPreview = function(fontKey) {
  let fontCSSName = "'Thmanyah', 'Cairo', sans-serif";
  let fontWeightOverride = '400';
  
  if (fontKey === 'thmanyah-regular') {
    fontCSSName = "'Thmanyah', 'Cairo', sans-serif";
    fontWeightOverride = '400';
  } else if (fontKey === 'thmanyah') {
    fontCSSName = "'Thmanyah', 'Cairo', sans-serif";
    fontWeightOverride = '400';
  } else if (fontKey === 'tajawal') {
    loadGoogleFontCSS('Tajawal');
    fontCSSName = "'Tajawal', 'Cairo', sans-serif";
  } else if (fontKey === 'almarai') {
    loadGoogleFontCSS('Almarai');
    fontCSSName = "'Almarai', 'Cairo', sans-serif";
  } else if (fontKey === 'noto-kufi') {
    loadGoogleFontCSS('Noto+Kufi+Arabic');
    fontCSSName = "'Noto Kufi Arabic', 'Cairo', sans-serif";
  } else if (fontKey === 'alexandria') {
    loadGoogleFontCSS('Alexandria');
    fontCSSName = "'Alexandria', 'Cairo', sans-serif";
  } else if (fontKey === 'changa') {
    loadGoogleFontCSS('Changa');
    fontCSSName = "'Changa', 'Cairo', sans-serif";
  } else if (fontKey === 'amiri') {
    loadGoogleFontCSS('Amiri');
    fontCSSName = "'Amiri', 'Cairo', sans-serif";
  } else if (fontKey === 'custom' && customFontName) {
    fontCSSName = `'${customFontName}', 'Cairo', sans-serif`;
  }

  let styleTag = document.getElementById('live-font-preview-style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'live-font-preview-style';
    document.head.appendChild(styleTag);
  }
  styleTag.innerHTML = `
    .segment-card, .segment-text, .word-chip, .word-input, #editor-segments, #transcription-text, .editable-word-btn,
    #caption-overlay, #caption-overlay *, .caption-word, .slide-wrapper, .preview-media-wrapper, .preview-media-wrapper * {
      font-family: ${fontCSSName} !important;
    }
  `;
};

window.handleFontFamilyChange = function(val) {
  const uploadSelect = document.getElementById('upload-font-family-select');
  const editorSelect = document.getElementById('font-family-select');
  if (uploadSelect && uploadSelect.value !== val) uploadSelect.value = val;
  if (editorSelect && editorSelect.value !== val) editorSelect.value = val;

  const customContainer = document.getElementById('custom-font-upload-container');
  const uploadCustomContainer = document.getElementById('upload-custom-font-upload-container');
  if (val === 'custom') {
    if (customContainer) customContainer.style.display = 'block';
    if (uploadCustomContainer) uploadCustomContainer.style.display = 'block';
    if (!customFontDataUrl) {
      const fileInput = document.getElementById('custom-font-file-input') || document.getElementById('upload-custom-font-file-input');
      if (fileInput) fileInput.click();
    }
  } else {
    if (customContainer) customContainer.style.display = 'none';
    if (uploadCustomContainer) uploadCustomContainer.style.display = 'none';
  }

  window.applyLiveFontPreview(val);
  if (typeof updateLiveCaptionOverlay === 'function' && typeof currentTime !== 'undefined') {
    updateLiveCaptionOverlay(currentTime);
  }
};

window.handleCustomFontUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const validExts = ['.ttf', '.otf', '.woff', '.woff2'];
  const fileName = file.name;
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

  if (!validExts.includes(ext)) {
    alert('الرجاء اختيار ملف خط بصيغة مدعومة (.ttf, .otf, .woff, .woff2)!');
    return;
  }

  const statusEl = document.getElementById('custom-font-status');
  const uploadStatusEl = document.getElementById('upload-custom-font-status');
  const msgText = `جارٍ تحميل الخط: ${fileName}...`;
  if (statusEl) statusEl.textContent = msgText;
  if (uploadStatusEl) uploadStatusEl.textContent = msgText;

  const reader = new FileReader();
  reader.onload = function(e) {
    customFontDataUrl = e.target.result;
    const cleanFontName = 'Custom_' + fileName.replace(/[^a-zA-Z0-9]/g, '_');
    customFontName = cleanFontName;

    try {
      const fontFace = new FontFace(cleanFontName, `url(${customFontDataUrl})`);
      fontFace.load().then(function(loadedFace) {
        document.fonts.add(loadedFace);
        const successMsg = `✅ تم رفع الخط وتفعيله بنجاح: <strong>${fileName}</strong>`;
        if (statusEl) statusEl.innerHTML = successMsg;
        if (uploadStatusEl) uploadStatusEl.innerHTML = successMsg;
        window.applyLiveFontPreview('custom');
      }).catch(function(err) {
        console.warn('FontFace API load warning:', err);
        const successMsg = `✅ تم رفع الخط بنجاح: <strong>${fileName}</strong>`;
        if (statusEl) statusEl.innerHTML = successMsg;
        if (uploadStatusEl) uploadStatusEl.innerHTML = successMsg;
        window.applyLiveFontPreview('custom');
      });
    } catch (err) {
      const successMsg = `✅ تم رفع الخط بنجاح: <strong>${fileName}</strong>`;
      if (statusEl) statusEl.innerHTML = successMsg;
      if (uploadStatusEl) uploadStatusEl.innerHTML = successMsg;
      window.applyLiveFontPreview('custom');
    }
  };
  reader.readAsDataURL(file);
};

let transcribeData = null; // Holds the JSON returned from /api/transcribe
let activeSegmentIndex = -1;
let currentTime = 0;

// ==================== UI View Elements ====================
const uploadState = document.getElementById('upload-state');
const loadingState = document.getElementById('loading-state');
const successState = document.getElementById('success-state');
const errorState = document.getElementById('error-state');

// ==================== Form Elements ====================
const formControls = document.getElementById('form-controls');
const submitBtn = document.getElementById('submit-btn');
const progressMsg = document.getElementById('progress-msg');
const errorMsg = document.getElementById('error-msg');
const outputVideo = document.getElementById('output-video');
const downloadLink = document.getElementById('download-link');
let apiUrl = window.location.origin.includes('hf.space')
  ? window.location.origin
  : 'https://rekaption2-production.up.railway.app';
let audioApiUrl = 'https://youtube-audio-backend-production-a2d5.up.railway.app';
const apiUrlInput = document.getElementById('api-url');
if (apiUrlInput) {
  apiUrlInput.value = apiUrl;
  apiUrlInput.addEventListener('input', function() {
    apiUrl = this.value.trim().replace(/\/$/, '');
  });
}

// ==================== Visitor Analytics & Tracking ====================
let visitorId = localStorage.getItem('visitor_id');
let isNewVisitor = false;
if (!visitorId) {
  visitorId = 'visitor_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  localStorage.setItem('visitor_id', visitorId);
  isNewVisitor = true;
}

// ==================== Firebase Firestore Persistent System ====================
let isSuspended = false;

async function syncUserWithFirestore(user) {
  if (!window.firebaseDb) {
    console.warn("Firestore is not initialized yet.");
    return null;
  }
  try {
    const userRef = window.firebaseDb.collection('users').doc(user.uid);
    const doc = await userRef.get();
    if (doc.exists) {
      return doc.data();
    } else {
      const newUserData = {
        uid: user.uid,
        email: user.email,
        name: user.displayName || user.email,
        whatsapp: null,
        is_active: true,
        renders_count: 0,
        created_at: new Date().toISOString()
      };
      await userRef.set(newUserData);
      return newUserData;
    }
  } catch (err) {
    console.error("Error syncing user with Firestore:", err);
    return null;
  }
}

async function trackEventFirestore(eventType, isNew = false) {
  if (!window.firebaseDb) {
    // Retry once when Firebase finishes initializing
    setTimeout(() => {
      if (window.firebaseDb) {
        window.firebaseDb.collection('analytics').add({
          visitor_id: visitorId,
          event_type: eventType,
          is_new: isNew,
          timestamp: new Date().toISOString()
        }).catch(e => console.warn(e));
      }
    }, 2000);
    return;
  }
  try {
    await window.firebaseDb.collection('analytics').add({
      visitor_id: visitorId,
      event_type: eventType,
      is_new: isNew,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.warn("Failed to track event in Firestore:", err);
  }
}

// Track Visit Event on load
trackEventFirestore('visit', isNewVisitor);
fetch(`${apiUrl.replace(/\/$/, '')}/api/track`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    visitor_id: visitorId,
    event_type: 'visit',
    is_new: isNewVisitor
  })
}).catch(err => console.warn('Tracking visit failed:', err));

// Log Firebase Analytics Event
try {
  window.logFirebaseEvent?.('visit', { is_new: isNewVisitor, visitor_id: visitorId });
} catch (_) {}

function trackAction(eventType) {
  trackEventFirestore(eventType, false);
  fetch(`${apiUrl.replace(/\/$/, '')}/api/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitor_id: visitorId,
      event_type: eventType,
      is_new: false
    })
  }).catch(err => console.warn(`Tracking event ${eventType} failed:`, err));

  try {
    window.logFirebaseEvent?.(eventType === 'upload' ? 'upload_media' : 'render_video', { visitor_id: visitorId });
  } catch (_) {}
}

// ==================== Admin Dashboard UI Functions ====================
let adminToken = '';

function openAdminModal() {
  document.getElementById('admin-modal').style.display = 'flex';
  document.getElementById('admin-login-screen').style.display = 'block';
  document.getElementById('admin-dashboard-screen').style.display = 'none';
  document.getElementById('admin-login-error').style.display = 'none';
}

function closeAdminModal() {
  document.getElementById('admin-modal').style.display = 'none';
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-password').value;
  const errorDiv = document.getElementById('admin-login-error');
  
  errorDiv.style.display = 'none';
  
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      throw new Error('بيانات الدخول غير صحيحة');
    }
    
    const data = await response.json();
    adminToken = data.token;
    
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-dashboard-screen').style.display = 'block';
    
    refreshAdminStats();
  } catch (err) {
    errorDiv.textContent = err.message || 'بيانات الدخول غير صحيحة';
    errorDiv.style.display = 'block';
  }
}

async function refreshAdminStats() {
  if (!adminToken) return;
  fetchSystemKeysBackend();
  if (!window.firebaseDb) {
    alert("برجاء الانتظار، جاري تهيئة قاعدة بيانات فايربيز...");
    return;
  }
  
  try {
    // 1. Fetch all users from Firestore
    const usersSnapshot = await window.firebaseDb.collection('users').orderBy('created_at', 'desc').get();
    const usersList = [];
    usersSnapshot.forEach(doc => {
      usersList.push(doc.data());
    });
    
    // 2. Fetch all analytics events from Firestore
    const analyticsSnapshot = await window.firebaseDb.collection('analytics').orderBy('timestamp', 'desc').get();
    const eventsList = [];
    analyticsSnapshot.forEach(doc => {
      eventsList.push(doc.data());
    });
    
    // Calculate Stats
    const totalVisits = eventsList.filter(e => e.event_type === 'visit').length;
    const newVisits = eventsList.filter(e => e.event_type === 'visit' && e.is_new === true).length;
    const returningVisits = eventsList.filter(e => e.event_type === 'visit' && e.is_new !== true).length;
    const totalUploads = eventsList.filter(e => e.event_type === 'upload').length;
    const totalRenders = eventsList.filter(e => e.event_type === 'render').length;
    const totalUsers = usersList.length;
    
    // Update Badge UI
    document.getElementById('stat-total-visits').textContent = totalVisits;
    document.getElementById('stat-new-visits').textContent = newVisits;
    document.getElementById('stat-returning-visits').textContent = returningVisits;
    document.getElementById('stat-total-uploads').textContent = totalUploads;
    document.getElementById('stat-total-renders').textContent = totalRenders;
    
    const statTotalUsers = document.getElementById('stat-total-users');
    if (statTotalUsers) {
      statTotalUsers.textContent = totalUsers;
    }
    
    // 3. Update Events Log Table (Recent 50)
    const tbody = document.getElementById('admin-events-log-body');
    tbody.innerHTML = '';
    
    const recentEvents = eventsList.slice(0, 50);
    if (recentEvents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding: 30px; text-align: center; color: rgba(255,255,255,0.4);">لا توجد أحداث مسجلة بعد</td></tr>`;
    } else {
      recentEvents.forEach(e => {
        const timeStr = e.timestamp ? new Date(e.timestamp).toLocaleString('ar-EG') : '';
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        
        let typeBadge = '';
        if (e.event_type === 'visit') {
          typeBadge = '<span style="color: #a78bfa;">👁️ زيارة للموقع</span>';
        } else if (e.event_type === 'upload') {
          typeBadge = '<span style="color: #fbbf24;">📤 تفريغ صوتي (رفع)</span>';
        } else if (e.event_type === 'render') {
          typeBadge = '<span style="color: #f472b6;">🎬 رندرة فيديو</span>';
        }
        
        const userBadge = e.is_new 
          ? '<span style="background: rgba(16, 185, 129, 0.1); color: #34d399; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 600;">زائر جديد</span>'
          : '<span style="background: rgba(59, 130, 246, 0.1); color: #60a5fa; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 600;">زائر متكرر</span>';
        
        tr.innerHTML = `
          <td style="padding: 12px 15px; font-family: monospace; color: rgba(255,255,255,0.4); font-size: 11px;">${e.visitor_id ? e.visitor_id.substring(0, 8) : ''}</td>
          <td style="padding: 12px 15px; font-weight: 600;">${typeBadge}</td>
          <td style="padding: 12px 15px;">${userBadge}</td>
          <td style="padding: 12px 15px; color: rgba(255,255,255,0.5); font-size: 11px;">${timeStr}</td>
        `;
        tbody.appendChild(tr);
      });
    }
    
    // 4. Update Users Log Table (Recent 50)
    const usersTbody = document.getElementById('admin-users-log-body');
    if (usersTbody) {
      usersTbody.innerHTML = '';
      if (usersList.length === 0) {
        usersTbody.innerHTML = `<tr><td colspan="7" style="padding: 30px; text-align: center; color: rgba(255,255,255,0.4);">لا يوجد أعضاء مسجلين بعد</td></tr>`;
      } else {
        const recentUsers = usersList.slice(0, 50);
        recentUsers.forEach(u => {
          const timeStr = u.created_at ? new Date(u.created_at).toLocaleString('ar-EG') : '';
          const is_active = u.is_active !== false;
          const statusText = is_active ? '<span style="color:#10b981; font-weight:bold;">نشط</span>' : '<span style="color:#ef4444; font-weight:bold;">موقوف</span>';
          const btnText = is_active ? 'إيقاف 🚫' : 'تفعيل ✅';
          const btnColor = is_active ? '#ef4444' : '#10b981';
          const btnBg = is_active ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)';
          const btnBorder = is_active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)';
          
          const rendersCount = u.renders_count !== undefined ? u.renders_count : 0;
          
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
          tr.innerHTML = `
            <td style="padding: 12px 15px; font-weight: 600;">${u.name || ''}</td>
            <td style="padding: 12px 15px; color: rgba(255,255,255,0.6);">${u.email || ''}</td>
            <td style="padding: 12px 15px; color: var(--purple-accent); font-weight: 600; text-align: center;">${u.whatsapp || 'غير مسجل'}</td>
            <td style="padding: 12px 15px; color: rgba(255,255,255,0.5); font-size: 11px;">${timeStr}</td>
            <td style="padding: 12px 15px; text-align: center; color: #fbbf24; font-weight: bold;">${rendersCount}</td>
            <td style="padding: 12px 15px; text-align: center;">${statusText}</td>
            <td style="padding: 12px 15px; text-align: center;">
              <button onclick="toggleUserStatus('${u.uid}', ${is_active})" style="padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; color: ${btnColor}; background: ${btnBg}; border: 1px solid ${btnBorder};">
                ${btnText}
              </button>
            </td>
          `;
          usersTbody.appendChild(tr);
        });
      }
    }
  } catch (err) {
    console.error("Error refreshing stats from Firestore:", err);
    alert('حدث خطأ أثناء جلب البيانات من فايربيز: ' + err.message);
  }
}

window.toggleUserStatus = async function(uid, is_active) {
  if (!confirm(`هل أنت متأكد من تغيير حالة هذا الحساب؟`)) return;
  try {
    if (!window.firebaseDb) {
      alert("قاعدة بيانات فايربيز غير جاهزة بعد");
      return;
    }
    await window.firebaseDb.collection('users').doc(uid).update({
      is_active: !is_active
    });
    refreshAdminStats();
  } catch (err) {
    alert('حدث خطأ أثناء تعديل حالة الحساب: ' + err.message);
  }
};

function handleAdminLogout() {
  adminToken = '';
  document.getElementById('admin-email').value = '';
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-login-screen').style.display = 'block';
  document.getElementById('admin-dashboard-screen').style.display = 'none';
}

// ==================== Upload Tab Handling ====================
let currentUploadSource = 'local';

window.switchUploadTab = function(tab) {
  const localBtn = document.getElementById('tab-local');
  const youtubeBtn = document.getElementById('tab-youtube');
  const localContent = document.getElementById('tab-content-local');
  const youtubeContent = document.getElementById('tab-content-youtube');
  
  if (tab === 'local') {
    if (localBtn) {
      localBtn.style.background = 'rgba(255,255,255,0.05)';
      localBtn.style.borderColor = 'rgba(255,255,255,0.1)';
      localBtn.style.color = '#fff';
    }
    if (youtubeBtn) {
      youtubeBtn.style.background = 'transparent';
      youtubeBtn.style.borderColor = 'transparent';
      youtubeBtn.style.color = 'rgba(255,255,255,0.6)';
    }
    if (localContent) localContent.style.display = 'block';
    if (youtubeContent) youtubeContent.style.display = 'none';
    currentUploadSource = 'local';
    
    if (submitBtn) {
      if (audioFile) {
        submitBtn.disabled = false;
      } else {
        submitBtn.disabled = true;
      }
    }
  } else {
    if (youtubeBtn) {
      youtubeBtn.style.background = 'rgba(255,255,255,0.05)';
      youtubeBtn.style.borderColor = 'rgba(255,255,255,0.1)';
      youtubeBtn.style.color = '#fff';
    }
    if (localBtn) {
      localBtn.style.background = 'transparent';
      localBtn.style.borderColor = 'transparent';
      localBtn.style.color = 'rgba(255,255,255,0.6)';
    }
    if (localContent) localContent.style.display = 'none';
    if (youtubeContent) youtubeContent.style.display = 'block';
    currentUploadSource = 'youtube';
    
    const ytInput = document.getElementById('youtube-url-input');
    const ytUrl = ytInput ? ytInput.value.trim() : '';
    if (submitBtn) {
      if (ytUrl) {
        submitBtn.disabled = false;
      } else {
        submitBtn.disabled = true;
      }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const ytInput = document.getElementById('youtube-url-input');
  if (ytInput) {
    ytInput.addEventListener('input', function() {
      if (currentUploadSource === 'youtube') {
        submitBtn.disabled = !this.value.trim();
      }
    });
  }
});

// ==================== Audio Dropzone Handling ====================
const audioInput = document.getElementById('audio-input');
const audioDropzone = document.getElementById('audio-dropzone');
const audioLabel = document.getElementById('audio-label');

audioInput.addEventListener('change', function() {
  if (this.files && this.files[0]) {
    handleAudioSelect(this.files[0]);
  }
});

audioDropzone.addEventListener('dragover', function(e) {
  e.preventDefault();
  this.classList.add('active');
});
audioDropzone.addEventListener('dragleave', function() {
  if (!audioFile) this.classList.remove('active');
});
audioDropzone.addEventListener('drop', function(e) {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleAudioSelect(e.dataTransfer.files[0]);
    audioInput.files = e.dataTransfer.files;
  }
});

function handleAudioSelect(file) {
  audioFile = file;
  audioLabel.textContent = file.name;
  audioDropzone.classList.add('active');
  submitBtn.disabled = false;
}

// ==================== Logo Upload & Preview Handling ====================
const leftLogoInput = document.getElementById('left-logo-input');
const rightLogoInput = document.getElementById('right-logo-input');
const leftLogoContent = document.getElementById('left-logo-content');
const rightLogoContent = document.getElementById('right-logo-content');

leftLogoInput.addEventListener('change', function() {
  if (this.files && this.files[0]) {
    leftLogoFile = this.files[0];
    showLogoPreview(leftLogoContent, leftLogoFile, 'left');
    const reader = new FileReader();
    reader.onload = (e) => { window.leftLogoBase64Global = e.target.result; };
    reader.readAsDataURL(leftLogoFile);
  }
});

rightLogoInput.addEventListener('change', function() {
  if (this.files && this.files[0]) {
    rightLogoFile = this.files[0];
    showLogoPreview(rightLogoContent, rightLogoFile, 'right');
    const reader = new FileReader();
    reader.onload = (e) => { window.rightLogoBase64Global = e.target.result; };
    reader.readAsDataURL(rightLogoFile);
  }
});

function showLogoPreview(container, file, side) {
  const url = URL.createObjectURL(file);
  container.innerHTML = `
    <img src="${url}" class="preview-thumbnail" alt="${side} logo preview" />
    <button type="button" class="clear-btn" onclick="event.stopPropagation(); clearLogo('${side}')">&times;</button>
  `;
}

window.clearLogo = function(side) {
  if (side === 'left') {
    leftLogoFile = null;
    window.leftLogoBase64Global = null;
    leftLogoInput.value = '';
    leftLogoContent.innerHTML = `
      <span class="file-box-icon">🖼️</span>
      <span class="file-box-text">شعار أعلى اليسار</span>
    `;
  } else {
    rightLogoFile = null;
    window.rightLogoBase64Global = null;
    rightLogoInput.value = '';
    rightLogoContent.innerHTML = `
      <span class="file-box-icon">🖼️</span>
      <span class="file-box-text">شعار أعلى اليمين</span>
    `;
  }
};

// ==================== Animation Styles Selection & Synchronization ====================
window.selectUploadAnimation = function(el) {
  document.querySelectorAll('.upload-anim-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedAnimation = el.dataset.anim;
  
  // Sync to editor animation cards
  const editorCard = document.querySelector(`.anim-card[data-anim="${selectedAnimation}"]`);
  if (editorCard) {
    document.querySelectorAll('.anim-card').forEach(c => c.classList.remove('selected'));
    editorCard.classList.add('selected');
  }
};

window.selectAnimation = function(el) {
  document.querySelectorAll('.anim-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedAnimation = el.dataset.anim;
  
  // Sync to upload animation cards
  const uploadCard = document.querySelector(`.upload-anim-card[data-anim="${selectedAnimation}"]`);
  if (uploadCard) {
    document.querySelectorAll('.upload-anim-card').forEach(c => c.classList.remove('selected'));
    uploadCard.classList.add('selected');
  }
};

window.updateCaptionTop = function(val) {
  captionTop = parseInt(val) || 65;
  const valSpan = document.getElementById('caption-top-val');
  if (valSpan) valSpan.textContent = `${captionTop}%`;
  
  const overlayContainer = document.getElementById('live-caption-overlay');
  if (overlayContainer) {
    overlayContainer.style.top = `${captionTop}%`;
  }
};

function updateRangeLabel(id, value) {
  const valSpan = document.getElementById(id + '-val');
  if (valSpan) valSpan.textContent = value;
}

function bindSyncedInputs(id1, id2, isColor = false) {
  const el1 = document.getElementById(id1);
  const el2 = document.getElementById(id2);
  if (!el1 || !el2) return;
  
  el1.addEventListener('input', function() {
    el2.value = this.value;
    updateRangeLabel(id1, this.value);
    updateRangeLabel(id2, this.value);
    if (isColor) {
      const hexText = document.getElementById(id2 + '-hex');
      if (hexText) hexText.textContent = this.value.toUpperCase();
    }
    el2.dispatchEvent(new Event('input'));
  });
  
  el2.addEventListener('input', function() {
    el1.value = this.value;
    updateRangeLabel(id1, this.value);
    updateRangeLabel(id2, this.value);
    if (isColor) {
      const hexText = document.getElementById(id1 + '-hex');
      if (hexText) hexText.textContent = this.value.toUpperCase();
    }
    if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
  });
}

// Binds all upload-side controls to editor-side controls
document.addEventListener('DOMContentLoaded', () => {
  bindSyncedInputs('upload-active-color', 'active-color', true);
  bindSyncedInputs('upload-inactive-color', 'inactive-color', true);
  bindSyncedInputs('upload-bg-color', 'bg-color', true);
  bindSyncedInputs('upload-stroke-color', 'stroke-color', true);
  bindSyncedInputs('upload-shadow-color', 'shadow-color', true);
  bindSyncedInputs('upload-font-size', 'font-size');
  bindSyncedInputs('upload-bg-opacity', 'bg-opacity');
  bindSyncedInputs('upload-sync-offset', 'sync-offset');
  bindSyncedInputs('upload-word-spacing', 'word-spacing');
  bindSyncedInputs('upload-bg-padding', 'bg-padding');
  bindSyncedInputs('upload-stroke-width', 'stroke-width');
  bindSyncedInputs('upload-shadow-blur', 'shadow-blur');

  // Bind show-bg checkboxes
  const uploadShowBg = document.getElementById('upload-show-bg');
  const showBg = document.getElementById('show-bg');
  if (uploadShowBg && showBg) {
    uploadShowBg.addEventListener('change', function() {
      showBg.checked = this.checked;
      if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
    });
    showBg.addEventListener('change', function() {
      uploadShowBg.checked = this.checked;
      if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
    });
  }

  // Initialize all range labels
  ['upload-bg-opacity', 'upload-word-spacing', 'upload-bg-padding', 'upload-stroke-width', 'upload-shadow-blur', 'bg-opacity', 'word-spacing', 'bg-padding', 'stroke-width', 'shadow-blur'].forEach(id => {
    const el = document.getElementById(id);
    if (el) updateRangeLabel(id, el.value);
  });

  // Prefill Groq API Key if stored
  const groqInput = document.getElementById('groq-api-key-input');
  if (groqInput) {
    const savedKey = localStorage.getItem('groq_api_key') || localStorage.getItem('groqApiKey') || '';
    if (savedKey) groqInput.value = savedKey;
    groqInput.addEventListener('input', function() {
      localStorage.setItem('groq_api_key', this.value.trim());
    });
  }

  // Prefill ElevenLabs API Key & Caption Engine if stored
  const elInput = document.getElementById('elevenlabs-api-key-input');
  if (elInput) {
    const savedElKey = localStorage.getItem('elevenlabs_api_key') || '';
    if (savedElKey) elInput.value = savedElKey;
    elInput.addEventListener('input', function() {
      localStorage.setItem('elevenlabs_api_key', this.value.trim());
    });
  }

  // Prefill OpenRouter API Key if stored
  const orInput = document.getElementById('openrouter-api-key');
  if (orInput) {
    const savedOrKey = localStorage.getItem('openrouterApiKey') || localStorage.getItem('openrouterKey') || '';
    if (savedOrKey) orInput.value = savedOrKey;
    orInput.addEventListener('input', function() {
      localStorage.setItem('openrouterApiKey', this.value.trim());
      localStorage.setItem('openrouterKey', this.value.trim());
    });
  }

  const engineSelect = document.getElementById('caption-engine-select');
  if (engineSelect) {
    const savedEngine = localStorage.getItem('caption_engine') || 'v1';
    engineSelect.value = savedEngine;
    engineSelect.addEventListener('change', function() {
      localStorage.setItem('caption_engine', this.value);
      if (typeof window.toggleEngineFields === 'function') window.toggleEngineFields();
    });
  }

  window.toggleEngineFields = function() {
    const groqWrapper = document.getElementById('groq-key-wrapper');
    const elevenlabsWrapper = document.getElementById('elevenlabs-key-wrapper');
    const openrouterWrapper = document.getElementById('openrouter-key-wrapper');
    if (groqWrapper) groqWrapper.style.display = 'none';
    if (elevenlabsWrapper) elevenlabsWrapper.style.display = 'none';
    if (openrouterWrapper) openrouterWrapper.style.display = 'none';
  };

  // Run toggle once initially
  setTimeout(() => {
    if (typeof window.toggleEngineFields === 'function') window.toggleEngineFields();
  }, 200);

  // Initialize Title Overlay controls in DOMContentLoaded
  const durationInput = document.getElementById('title-duration-input');
  if (durationInput) {
    durationInput.addEventListener('input', function() {
      const valSpan = document.getElementById('title-duration-val');
      if (valSpan) valSpan.textContent = parseFloat(this.value) === 0 ? "0.0 (طوال الفيديو)" : this.value;
    });
  }

  const topInput = document.getElementById('title-top-input');
  if (topInput) {
    topInput.addEventListener('input', function() {
      const valSpan = document.getElementById('title-top-val');
      if (valSpan) valSpan.textContent = this.value;
    });
  }

  const colorInput = document.getElementById('title-color-input');
  if (colorInput) {
    colorInput.addEventListener('input', function() {
      const hexSpan = document.getElementById('title-color-hex');
      if (hexSpan) hexSpan.textContent = this.value.toUpperCase();
    });
  }

  const bgColorInput = document.getElementById('title-bg-color-input');
  if (bgColorInput) {
    bgColorInput.addEventListener('input', function() {
      const hexSpan = document.getElementById('title-bg-hex');
      if (hexSpan) hexSpan.textContent = this.value.toUpperCase();
    });
  }

  window.toggleTitleFields = function(checked) {
    const bg = document.getElementById('title-toggle-bg');
    const knob = document.getElementById('title-toggle-knob');
    const wrapper = document.getElementById('title-settings-wrapper');
    if (bg && knob && wrapper) {
      if (checked) {
        bg.style.backgroundColor = 'var(--purple-accent, #8b5cf6)';
        knob.style.transform = 'translateX(-22px)';
        wrapper.style.display = 'flex';
      } else {
        bg.style.backgroundColor = 'rgba(255,255,255,0.1)';
        knob.style.transform = 'translateX(0)';
        wrapper.style.display = 'none';
      }
    }
  };

  // Open Admin modal if hash is #admin or url contains ?admin
  if (window.location.hash === '#admin' || window.location.search.includes('admin')) {
    openAdminModal();
  }
});

window.syncShowBg = function(el) {
  const uploadShowBg = document.getElementById('upload-show-bg');
  const showBg = document.getElementById('show-bg');
  if (uploadShowBg && showBg) {
    uploadShowBg.checked = el.checked;
    showBg.checked = el.checked;
    if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
  }
};

// ==================== Color Pickers Casing & Live Updates ====================
document.getElementById('active-color').addEventListener('input', function() {
  document.getElementById('active-color-hex').textContent = this.value.toUpperCase();
  if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
});
document.getElementById('inactive-color').addEventListener('input', function() {
  document.getElementById('inactive-color-hex').textContent = this.value.toUpperCase();
  if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
});
document.getElementById('bg-color').addEventListener('input', function() {
  document.getElementById('bg-color-hex').textContent = this.value.toUpperCase();
  if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
});
if (document.getElementById('stroke-color')) {
  document.getElementById('stroke-color').addEventListener('input', function() {
    if (document.getElementById('stroke-color-hex')) document.getElementById('stroke-color-hex').textContent = this.value.toUpperCase();
    if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
  });
}
if (document.getElementById('shadow-color')) {
  document.getElementById('shadow-color').addEventListener('input', function() {
    if (document.getElementById('shadow-color-hex')) document.getElementById('shadow-color-hex').textContent = this.value.toUpperCase();
    if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
  });
}

// Other styling changes trigger live refresh
['font-size', 'bg-opacity', 'word-spacing', 'bg-padding', 'stroke-width', 'shadow-blur'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
    });
  }
});

// ==================== Advanced Settings panel toggler ====================
window.toggleAdvanced = function() {
  const panel = document.getElementById('advanced-panel');
  panel.classList.toggle('hidden');
};

// ==================== View State Managers ====================
function showState(visibleElement) {
  [uploadState, loadingState, successState, errorState].forEach(el => {
    el.classList.add('hidden');
  });
  visibleElement.classList.remove('hidden');
}

window.resetApp = function() {
  // Clear file states
  audioFile = null;
  audioInput.value = '';
  audioLabel.textContent = 'قم بسحب ملف الصوت أو الفيديو هنا أو انقر للاختيار';
  audioDropzone.classList.remove('active');
  
  const ytInput = document.getElementById('youtube-url-input');
  if (ytInput) ytInput.value = '';
  switchUploadTab('local');
  
  submitBtn.disabled = true;
  
  clearLogo('left');
  clearLogo('right');
  
  transcribeData = null;
  activeSegmentIndex = -1;
  currentTime = 0;
  
  // Hide editor, show main dashboard
  document.getElementById('editor-state').classList.add('hidden');
  document.getElementById('main-dashboard').classList.remove('hidden');
  
  showState(uploadState);
};

// Helper to convert hex to rgb for background opacity
function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `${r}, ${g}, ${b}`;
}

// ==================== Silence/Snooze Check Helper ====================
function isSpeaking(segment, time) {
  if (!segment || !segment.words || segment.words.length === 0) return false;
  return segment.words.some(w => time >= (w.start - 0.05) && time <= (w.end + 0.05));
}

// ==================== Media Player & Live Caption Overlay ====================
function initMediaPlayer() {
  const wrapper = document.getElementById('preview-wrapper');
  if (!wrapper || !transcribeData) return;
  
  const mediaUrl = `${apiUrl}/public/${transcribeData.audioPath}`;
  
  let mediaHtml = '';
  if (transcribeData.videoPath) {
    wrapper.classList.remove('audio-mode');
    mediaHtml = `
      <video id="media-player" src="${mediaUrl}" class="preview-media-element" controls></video>
    `;
  } else {
    wrapper.classList.add('audio-mode');
    mediaHtml = `
      <div class="audio-equalizer-dots" style="margin-top: 20px;">
        <div class="audio-equalizer-dot"></div>
        <div class="audio-equalizer-dot"></div>
        <div class="audio-equalizer-dot"></div>
        <div class="audio-equalizer-dot"></div>
      </div>
      <audio id="media-player" src="${mediaUrl}" controls style="width: 90%; margin-bottom: 20px;"></audio>
    `;
  }
  
  mediaHtml += `
    <div id="live-caption-overlay" class="hidden" style="
      position: absolute;
      top: ${captionTop}%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: max-content;
      max-width: 95%;
      background: rgba(0, 0, 0, 0.61);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      text-align: center;
      pointer-events: none;
      z-index: 10;
      direction: rtl;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      font-size: 16px;
      font-weight: 800;
      font-family: 'Cairo', sans-serif;
      line-height: 1.5;
      display: flex;
      flex-wrap: nowrap;
      white-space: nowrap;
      justify-content: center;
    "></div>
  `;
  
  wrapper.innerHTML = mediaHtml;
  
  const player = document.getElementById('media-player');
  player.addEventListener('timeupdate', function() {
    updateActiveSegment(this.currentTime);
  });

  if (transcribeData.videoPath && player) {
    player.style.cursor = 'pointer';
    player.addEventListener('click', function(e) {
      const rect = this.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      if (clickY > rect.height - 50) {
        return;
      }
      e.preventDefault();
      if (this.paused) {
        this.play();
      } else {
        this.pause();
      }
    });
  }
}

function updateActiveSegment(time) {
  if (!transcribeData) return;
  
  // Apply the syncOffset to the player's time for the caption overlay!
  const syncOffset = parseFloat(document.getElementById('sync-offset').value) || 0;
  const adjustedTime = time + syncOffset;
  
  currentTime = adjustedTime;
  let newActiveIndex = -1;
  for (let i = 0; i < transcribeData.segments.length; i++) {
    const seg = transcribeData.segments[i];
    if (adjustedTime >= seg.start && adjustedTime <= seg.end) {
      newActiveIndex = i;
      break;
    }
  }
  
  if (newActiveIndex !== activeSegmentIndex) {
    activeSegmentIndex = newActiveIndex;
    
    // Highlight active card
    document.querySelectorAll('.segment-card').forEach((card, idx) => {
      if (idx === activeSegmentIndex) {
        card.classList.add('active');
        
        // Smoothly auto-scroll this card into center view inside the right-side container
        const container = document.querySelector('.workspace-right');
        if (container) {
          const cardTop = card.offsetTop;
          const containerHeight = container.clientHeight;
          const cardHeight = card.offsetHeight;
          
          container.scrollTo({
            top: cardTop - (containerHeight / 2) + (cardHeight / 2),
            behavior: 'smooth'
          });
        }
      } else {
        card.classList.remove('active');
      }
    });

  }
  
  // Update live caption overlay with adjusted time
  updateLiveCaptionOverlay(adjustedTime);
}

function updateLiveCaptionOverlay(time) {
  const overlayContainer = document.getElementById('live-caption-overlay');
  if (!overlayContainer) return;
  
  if (activeSegmentIndex === -1 || !transcribeData) {
    overlayContainer.classList.add('hidden');
    overlayContainer.removeAttribute('data-rendered-key');
    return;
  }
  
  const segment = transcribeData.segments[activeSegmentIndex];
  
  overlayContainer.classList.remove('hidden');
  const activeColor = document.getElementById('active-color').value;
  const inactiveColor = document.getElementById('inactive-color').value;
  
  // Read dynamic style customizations
  const fontSize = parseFloat(document.getElementById('font-size').value) || 50;
  const bgColor = document.getElementById('bg-color').value;
  const bgOpacity = parseFloat(document.getElementById('bg-opacity').value) || 86;
  const wordSpacing = parseFloat(document.getElementById('word-spacing').value) || 31;
  const bgPadding = parseFloat(document.getElementById('bg-padding').value) || 8;
  const removeBg = document.getElementById('show-bg').checked;
  const isBgVisible = !removeBg && bgOpacity > 0;
  
  // Apply styles to overlay container dynamically
  overlayContainer.style.top = `${captionTop}%`;
  overlayContainer.style.fontSize = `${fontSize / 4.5}px`;
  overlayContainer.style.flexWrap = 'nowrap';
  overlayContainer.style.whiteSpace = 'nowrap';
  overlayContainer.style.columnGap = `${wordSpacing / 100}em`;
  overlayContainer.style.maxWidth = '95%';
  
  if (isBgVisible) {
    overlayContainer.style.background = `rgba(${hexToRgb(bgColor)}, ${bgOpacity / 100})`;
    overlayContainer.style.backdropFilter = 'none';
    overlayContainer.style.webkitBackdropFilter = 'none';
    overlayContainer.style.border = 'none'; // Clean sharp rectangular edge
    overlayContainer.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';
    overlayContainer.style.padding = `${bgPadding / 4.5}px ${(bgPadding * 2) / 4.5}px`;
    overlayContainer.style.borderRadius = `${4 / 4.5}px`; // tight corners scaled by 4.5
  } else {
    overlayContainer.style.background = 'none';
    overlayContainer.style.backdropFilter = 'none';
    overlayContainer.style.webkitBackdropFilter = 'none';
    overlayContainer.style.border = 'none';
    overlayContainer.style.boxShadow = 'none';
    overlayContainer.style.padding = '0';
    overlayContainer.style.borderRadius = '0';
  }
  
  const strokeColor = document.getElementById('stroke-color') ? document.getElementById('stroke-color').value : '#000000';
  const strokeWidth = document.getElementById('stroke-width') ? parseFloat(document.getElementById('stroke-width').value) : 3;
  const shadowColor = document.getElementById('shadow-color') ? document.getElementById('shadow-color').value : '#000000';
  const shadowBlur = document.getElementById('shadow-blur') ? parseFloat(document.getElementById('shadow-blur').value) : 10;

  const scaledStrokeWidth = (strokeWidth / 3.5).toFixed(1);
  const scaledShadowBlur = (shadowBlur / 3.5).toFixed(1);

  let outlineStroke = '';
  if (strokeWidth > 0 || shadowBlur > 0) {
    const strokePart = strokeWidth > 0 ? `-webkit-text-stroke: ${scaledStrokeWidth}px ${strokeColor};` : '';
    const shadowPart = shadowBlur > 0 ? `text-shadow: 0px 2px ${scaledShadowBlur}px ${shadowColor};` : '';
    outlineStroke = `${strokePart} ${shadowPart}`;
  } else {
    outlineStroke = isBgVisible 
      ? 'text-shadow: 1.5px 1.5px 0px #000000, -1.5px -1.5px 0px #000000, 1.5px -1.5px 0px #000000, -1.5px 1.5px 0px #000000;'
      : 'text-shadow: 1px 1px 0px #000000, -1px -1px 0px #000000;';
  }

  // React-style state key to avoid destroying the DOM and breaking slide-up transitions
  const styleKey = `${activeSegmentIndex}_${selectedAnimation}_${fontSize}_${bgColor}_${bgOpacity}_${wordSpacing}_${bgPadding}_${!removeBg}_${activeColor}_${inactiveColor}_${strokeColor}_${strokeWidth}_${shadowColor}_${shadowBlur}`;
  const isNewSegment = overlayContainer.getAttribute('data-rendered-key') !== styleKey;

  if (selectedAnimation === 'slide') {
    overlayContainer.style.overflow = 'hidden';
  } else {
    overlayContainer.style.overflow = 'visible';
  }

  if (isNewSegment) {
    overlayContainer.setAttribute('data-rendered-key', styleKey);
    let html = '';
    segment.words.forEach(w => {
      const isWordActive = time >= w.start && time <= w.end;
      const color = isWordActive ? activeColor : inactiveColor;
      
      let translateY = 0;
      let opacity = 1;
      let transitionStr = 'none';
      
      if (selectedAnimation === 'reveal') {
        const isPast = time > w.end;
        if (isWordActive || isPast) {
          translateY = 0;
          opacity = 1;
          transitionStr = 'transform 0.25s cubic-bezier(0.3, 1.5, 0.5, 1), opacity 0.2s ease-out';
        } else {
          translateY = 3.3; // 15px scaled by 4.5
          opacity = 0;
          transitionStr = 'none';
        }
      }
      
      const transformStr = selectedAnimation === 'reveal' ? `transform: translateY(${translateY}px);` : '';
      const opacityStr = selectedAnimation === 'reveal' ? `opacity: ${opacity};` : '';
      const transitionStyleStr = selectedAnimation === 'reveal' ? `transition: ${transitionStr};` : '';
      
      html += `<span class="caption-word" style="color: ${color}; ${outlineStroke} display: inline-block; ${transformStr} ${opacityStr} ${transitionStyleStr}">${w.word}</span>`;
    });
    
    if (selectedAnimation === 'slide') {
      const activeDuration = time - segment.start;
      const progress = Math.min(1, Math.max(0, activeDuration / 0.35));
      const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);
      const t = easeOutQuart(progress);
      const translateY = 100 * (1 - t);
      const opacity = progress === 0 ? 0 : 1;

      overlayContainer.innerHTML = `<div class="slide-wrapper" style="
        display: flex;
        flex-wrap: nowrap;
        white-space: nowrap;
        justify-content: center;
        column-gap: ${wordSpacing / 100}em;
        transform: translateY(${translateY}%);
        opacity: ${opacity};
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease-out;
      ">${html}</div>`;
    } else {
      overlayContainer.innerHTML = `<div style="
        display: flex;
        flex-wrap: nowrap;
        white-space: nowrap;
        justify-content: center;
        column-gap: ${wordSpacing / 100}em;
      ">${html}</div>`;
    }
  } else {
    // Fast in-place DOM updates: update words highlights & reveal transitions smoothly without resetting keyframe animations
    const spans = overlayContainer.querySelectorAll('.caption-word');
    segment.words.forEach((w, idx) => {
      const span = spans[idx];
      if (span) {
        const isWordActive = time >= w.start && time <= w.end;
        const isPast = time > w.end;
        const color = isWordActive ? activeColor : inactiveColor;
        
        span.style.color = color;
        
        if (selectedAnimation === 'reveal') {
          let translateY = 3.3;
          let opacity = 0;
          let transitionStr = 'none';
          if (isWordActive || isPast) {
            translateY = 0;
            opacity = 1;
            transitionStr = 'transform 0.25s cubic-bezier(0.3, 1.5, 0.5, 1), opacity 0.2s ease-out';
          }
          span.style.transform = `translateY(${translateY}px)`;
          span.style.opacity = opacity;
          span.style.transition = transitionStr;
        }
      }
    });

    if (selectedAnimation === 'slide') {
      const slideWrapper = overlayContainer.querySelector('.slide-wrapper');
      if (slideWrapper) {
        const activeDuration = time - segment.start;
        const progress = Math.min(1, Math.max(0, activeDuration / 0.35));
        const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);
        const t = easeOutQuart(progress);
        const translateY = 100 * (1 - t);
        const opacity = progress === 0 ? 0 : 1;

        slideWrapper.style.transform = `translateY(${translateY}%)`;
        slideWrapper.style.opacity = opacity;
        slideWrapper.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease-out';
      }
    }
  }
}

// ==================== Segment Cards Rendering & Event Handling ====================
function renderSegmentCards() {
  const container = document.getElementById('editor-segments');
  if (!container || !transcribeData) return;
  
  let html = '';
  transcribeData.segments.forEach((seg, idx) => {
    html += `
      <div id="segment-card-${idx}" class="segment-card">
        <div class="segment-card-header">
          <span class="segment-time-badge">⏱️ ${seg.start.toFixed(2)} - ${seg.end.toFixed(2)}</span>
          <button type="button" class="segment-play-btn" onclick="seekPlayer(${seg.start})">
            🎧 تشغيل هذه الجملة
          </button>
        </div>
        <textarea class="segment-textarea" oninput="handleSegmentChange(${idx}, this.value)">${seg.text}</textarea>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

window.seekPlayer = function(startTime) {
  const player = document.getElementById('media-player');
  if (player) {
    player.currentTime = startTime;
    player.play();
  }
};

window.handleSegmentChange = function(index, newText) {
  if (!transcribeData) return;
  
  const seg = transcribeData.segments[index];
  seg.text = newText;
  
  // Recalculate word-level timestamps (linear interpolation)
  const words = newText.split(/\s+/).filter(w => w.trim() !== "");
  const duration = seg.end - seg.start;
  seg.words = words.map((w, i) => {
    const start = seg.start + (i * duration) / Math.max(1, words.length);
    const end = seg.start + ((i + 1) * duration) / Math.max(1, words.length);
    return {
      word: w,
      start: parseFloat(start.toFixed(3)),
      end: parseFloat(end.toFixed(3))
    };
  });
  
  // Update the live caption overlay immediately if this is the active segment
  if (index === activeSegmentIndex) {
    updateLiveCaptionOverlay(currentTime);
  }
};

// ==================== Enter Key Split Handling ====================
function handleSegmentSplit(index, cursorPosition, fullText) {
  if (!transcribeData) return;
  
  const seg = transcribeData.segments[index];
  if (!seg.words || seg.words.length <= 1) return; // Cannot split if 0 or 1 word
  
  // 1. Determine how many words are before the cursor
  const textBefore = fullText.substring(0, cursorPosition);
  const wordsBefore = textBefore.trim().split(/\s+/).filter(w => w !== "");
  const splitIndex = wordsBefore.length;
  
  // Only split if we have a valid split point
  if (splitIndex <= 0 || splitIndex >= seg.words.length) return;
  
  // 2. Split the words array
  const wordsA = seg.words.slice(0, splitIndex);
  const wordsB = seg.words.slice(splitIndex);
  
  // 3. Create two new segments (retaining exact word timestamps)
  const segA = {
    start: seg.start,
    end: wordsA[wordsA.length - 1].end,
    text: wordsA.map(w => w.word).join(" "),
    words: wordsA
  };
  
  const segB = {
    start: wordsB[0].start,
    end: seg.end,
    text: wordsB.map(w => w.word).join(" "),
    words: wordsB
  };
  
  // 4. Replace the old segment with the two new segments
  transcribeData.segments.splice(index, 1, segA, segB);
  
  // 5. Re-render the segment cards
  renderSegmentCards();
  
  // 6. Focus the second segment's textarea at the beginning of the text
  setTimeout(() => {
    const nextTextarea = document.querySelector(`#segment-card-${index + 1} .segment-textarea`);
    if (nextTextarea) {
      nextTextarea.focus();
      nextTextarea.setSelectionRange(0, 0);
    }
  }, 50);
}

// Add event delegation for Enter key split on segment textareas
document.getElementById('editor-segments').addEventListener('keydown', function(e) {
  if (e.target.classList.contains('segment-textarea') && e.key === 'Enter') {
    e.preventDefault(); // Prevent inserting actual newline character
    
    const textarea = e.target;
    const card = textarea.closest('.segment-card');
    const index = parseInt(card.id.replace('segment-card-', ''));
    
    handleSegmentSplit(index, textarea.selectionStart, textarea.value);
  }
});

// ==================== Form submission & API handling ====================
formControls.addEventListener('submit', async function(e) {
  e.preventDefault();

  if (isSuspended) {
    document.getElementById('suspended-modal').style.display = 'flex';
    return;
  }

  // Check visitor limit before allowing submission
  if (!currentUser && freeOpsCount >= 2) {
    document.getElementById('login-prompt-modal').style.display = 'flex';
    return;
  }

  const youtubeUrlInput = document.getElementById('youtube-url-input');
  const youtubeUrl = youtubeUrlInput ? youtubeUrlInput.value.trim() : '';

  if (currentUploadSource === 'local' && !audioFile) {
    showState(errorState);
    errorMsg.textContent = 'يرجى اختيار ملف صوت أو فيديو أولاً لتوليد المقطع!';
    return;
  }
  if (currentUploadSource === 'youtube' && !youtubeUrl) {
    showState(errorState);
    errorMsg.textContent = 'يرجى إدخال رابط فيديو يوتيوب صالح!';
    return;
  }

  const originalSubmitText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.style.opacity = '0.5';
  submitBtn.style.pointerEvents = 'none';
  submitBtn.innerHTML = '<span>⏳</span> جاري المعالجة...';

  showState(loadingState);
  
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressTextLabel = document.getElementById('progress-text-label');
  
  progressBarFill.style.width = '0%';
  progressTextLabel.textContent = 'جاري التحميل والمعالجة...';
  progressMsg.textContent = currentUploadSource === 'youtube' 
    ? 'جاري تنزيل صوت اليوتيوب بالخلفية بدقة عالية...'
    : 'جاري تهيئة الملف والرفع...';

  // Build FormData payload for transcribe
  const fd = new FormData();
  if (currentUploadSource === 'local') {
    fd.append('audio', audioFile);
  } else {
    fd.append('youtubeUrl', youtubeUrl);
  }
  if (leftLogoFile) fd.append('leftLogo', leftLogoFile);
  if (rightLogoFile) fd.append('rightLogo', rightLogoFile);
  fd.append('minWords', document.getElementById('min-words').value);
  fd.append('maxWords', document.getElementById('max-words').value);
  fd.append('animation', selectedAnimation);
  fd.append('activeColor', document.getElementById('active-color').value);
  fd.append('inactiveColor', document.getElementById('inactive-color').value);

  const savedHfToken = localStorage.getItem('cohereHfToken') || '';
  const cohereTokenInput = document.getElementById('cohere-hf-token');
  const hfTokenVal = cohereTokenInput ? cohereTokenInput.value.trim() : savedHfToken;
  if (hfTokenVal) fd.append('hfToken', hfTokenVal);

  const savedOrKey = localStorage.getItem('openrouterApiKey') || localStorage.getItem('openrouterKey') || '';
  const orInput = document.getElementById('openrouter-api-key') || document.getElementById('openrouter-key-input');
  const openrouterKeyVal = orInput ? orInput.value.trim() : savedOrKey;
  if (openrouterKeyVal) fd.append('openrouterKey', openrouterKeyVal);

  const savedGroqKey = localStorage.getItem('groq_api_key') || localStorage.getItem('groqApiKey') || '';
  const groqInput = document.getElementById('groq-api-key-input');
  const groqKeyVal = groqInput ? groqInput.value.trim() : savedGroqKey;
  if (groqKeyVal) {
    localStorage.setItem('groq_api_key', groqKeyVal);
    fd.append('groqApiKey', groqKeyVal);
  }

  const savedGeminiKey = localStorage.getItem('gemini_api_key') || localStorage.getItem('geminiApiKey') || '';
  const gInput = document.getElementById('gemini-key-input');
  const geminiKeyVal = gInput ? gInput.value.trim() : savedGeminiKey;
  if (geminiKeyVal) fd.append('geminiApiKey', geminiKeyVal);

  const engineSelect = document.getElementById('caption-engine-select');
  const engineVal = engineSelect ? engineSelect.value : 'v1';
  fd.append('captionEngine', engineVal);

  const showTitleToggle = document.getElementById('show-title-toggle');
  if (showTitleToggle) fd.append('showTitle', showTitleToggle.checked ? 'true' : 'false');

  const titleTextInput = document.getElementById('title-text-input');
  if (titleTextInput && titleTextInput.value.trim()) fd.append('titleText', titleTextInput.value.trim());

  const titleColorInput = document.getElementById('title-color-input');
  if (titleColorInput) fd.append('titleColor', titleColorInput.value);

  const titleBgColorInput = document.getElementById('title-bg-color-input');
  if (titleBgColorInput) fd.append('titleBgColor', titleBgColorInput.value);

  const titleDurationInput = document.getElementById('title-duration-input');
  if (titleDurationInput) fd.append('titleDuration', titleDurationInput.value);

  const titleTopInput = document.getElementById('title-top-input');
  if (titleTopInput) fd.append('titleTop', titleTopInput.value);

  const titleStyleSelect = document.getElementById('title-style-select');
  if (titleStyleSelect) fd.append('titleStyle', titleStyleSelect.value);

  const savedElKey = localStorage.getItem('elevenlabs_api_key') || '';
  const elKeyInput = document.getElementById('elevenlabs-api-key-input');
  const elKeyVal = elKeyInput ? elKeyInput.value.trim() : savedElKey;
  if (elKeyVal) {
    localStorage.setItem('elevenlabs_api_key', elKeyVal);
    fd.append('elevenLabsApiKey', elKeyVal);
  }

  let intervalId = null;

  try {
    const data = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl + '/api/transcribe');

      xhr.upload.onprogress = function(event) {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          progressBarFill.style.width = percent + '%';
          progressTextLabel.textContent = `جاري الرفع: ${percent}%`;
          progressMsg.textContent = `جاري رفع الملف... ${percent}%`;
        }
      };

      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error('فشل قراءة استجابة السيرفر.'));
          }
        } else {
          let errorMsg = 'حدث خطأ في معالجة الملف في السيرفر';
          try {
            const errData = JSON.parse(xhr.responseText);
            errorMsg = errData.detail || errorMsg;
          } catch (_) {}
          reject(new Error(errorMsg));
        }
      };

      xhr.onerror = function() {
        reject(new Error('فشل الاتصال بالسيرفر. يرجى التحقق من تشغيل السيرفر أو الرابط.'));
      };

      // Send request
      xhr.send(fd);

      // Listen for when upload finishes to start the processing stage
      xhr.upload.onload = function() {
        progressBarFill.style.width = '5%';
        progressTextLabel.textContent = 'التقدم: 5%';
        progressMsg.textContent = 'تم الرفع بنجاح! جاري معالجة واستخراج الصوت...';
        
        let currentPercent = 5;
        intervalId = setInterval(() => {
          if (currentPercent < 95) {
            currentPercent += Math.floor(Math.random() * 4) + 1;
            if (currentPercent > 95) currentPercent = 95;
            
            progressBarFill.style.width = currentPercent + '%';
            progressTextLabel.textContent = `التقدم: ${currentPercent}%`;
            
            if (currentPercent > 30 && currentPercent <= 65) {
              progressMsg.textContent = 'جاري تنقيح وتحسين النص بالذكاء الاصطناعي...';
            } else if (currentPercent > 65) {
              progressMsg.textContent = 'جاري ترتيب التوقيت ومزامنة الكابشن مع الصوت...';
            }
          }
        }, 1500);
      };
    });

    if (intervalId) clearInterval(intervalId);
    progressBarFill.style.width = '100%';
    progressTextLabel.textContent = 'اكتمل!';

    transcribeData = data;
    
    // Hide main dashboard, show editor workspace
    document.getElementById('main-dashboard').classList.add('hidden');
    document.getElementById('editor-state').classList.remove('hidden');
    
    // Initialize editor view
    initMediaPlayer();
    renderSegmentCards();
    playSuccessSound();
    
    // Track upload event
    try {
      trackAction('upload');
      if (!currentUser) {
        freeOpsCount++;
        localStorage.setItem('free_ops_count', freeOpsCount);
        updateAuthWidget();
      }
    } catch (_) {}

    // Restore button state
    submitBtn.disabled = false;
    submitBtn.style.opacity = '';
    submitBtn.style.pointerEvents = '';
    submitBtn.innerHTML = originalSubmitText;

  } catch (err) {
    if (intervalId) clearInterval(intervalId);
    showState(errorState);
    errorMsg.textContent = err.message || 'فشل الاتصال بالسيرفر. يرجى التحقق من تشغيل السيرفر أو الرابط.';
    
    submitBtn.disabled = false;
    submitBtn.style.opacity = '';
    submitBtn.style.pointerEvents = '';
    submitBtn.innerHTML = originalSubmitText;
  }
});

// ==================== Render final video from edits ====================
let isRendering = false;

window.renderVideo = async function() {
  if (isRendering) return;
  if (!transcribeData) return;

  if (isSuspended) {
    document.getElementById('suspended-modal').style.display = 'flex';
    return;
  }

  // Check visitor limit before allowing rendering
  if (!currentUser && freeOpsCount >= 2) {
    document.getElementById('login-prompt-modal').style.display = 'flex';
    return;
  }
  
  isRendering = true;

  const renderBtn = document.getElementById('render-btn');
  const originalRenderText = renderBtn ? renderBtn.innerHTML : '<span>🚀</span> توليد الفيديو النهائي';
  if (renderBtn) {
    renderBtn.disabled = true;
    renderBtn.style.opacity = '0.5';
    renderBtn.style.pointerEvents = 'none';
    renderBtn.style.cursor = 'not-allowed';
    renderBtn.innerHTML = '<span>⏳</span> جاري رندرة وتوليد الفيديو...';
  }

  // Transition back to main dashboard loading state
  document.getElementById('editor-state').classList.add('hidden');
  const mainDashboard = document.getElementById('main-dashboard');
  mainDashboard.classList.remove('hidden');
  
  showState(loadingState);
  
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressTextLabel = document.getElementById('progress-text-label');
  
  progressBarFill.style.width = '5%';
  progressTextLabel.textContent = 'التقدم: 5%';
  progressMsg.textContent = 'جاري معالجة وتوليد مقطع الفيديو النهائي...';
  
  let currentPercent = 5;
  const renderIntervalId = setInterval(() => {
    if (currentPercent < 95) {
      currentPercent += Math.floor(Math.random() * 4) + 1;
      if (currentPercent > 95) currentPercent = 95;
      
      progressBarFill.style.width = currentPercent + '%';
      progressTextLabel.textContent = `التقدم: ${currentPercent}%`;
      
      if (currentPercent > 25 && currentPercent <= 55) {
        progressMsg.textContent = 'جاري رسم الإطارات والتقاط لقطات الفيديو مع الكابشن...';
      } else if (currentPercent > 55 && currentPercent <= 80) {
        progressMsg.textContent = 'جاري دمج ملف الصوت وضغط المقطع بصيغة MP4...';
      } else if (currentPercent > 80) {
        progressMsg.textContent = 'جاري تصدير المقطع النهائي وتجهيزه للتحميل...';
      }
    }
  }, 1500);
  
  const renderPayload = {
    audioPath: transcribeData.audioPath,
    videoPath: transcribeData.videoPath,
    durationInSeconds: transcribeData.durationInSeconds,
    segments: transcribeData.segments,
    animationType: selectedAnimation,
    activeColor: document.getElementById('active-color').value,
    inactiveColor: document.getElementById('inactive-color').value,
    leftLogo: window.leftLogoBase64Global || transcribeData.leftLogo || null,
    rightLogo: window.rightLogoBase64Global || transcribeData.rightLogo || null,
    fontSize: parseInt(document.getElementById('font-size').value) || 50,
    bgColor: document.getElementById('bg-color').value,
    bgOpacity: parseFloat(document.getElementById('bg-opacity').value) || 86,
    syncOffset: parseFloat(document.getElementById('sync-offset').value) || 0.20,
    wordSpacing: parseInt(document.getElementById('word-spacing').value) || 31,
    bgPadding: parseInt(document.getElementById('bg-padding').value) || 8,
    showBg: !document.getElementById('show-bg').checked,
    captionTop: captionTop,
    fontFamily: document.getElementById('font-family-select') ? document.getElementById('font-family-select').value : 'thmanyah',
    customFontName: (document.getElementById('font-family-select') && document.getElementById('font-family-select').value === 'custom') ? customFontName : null,
    customFontBase64: (document.getElementById('font-family-select') && document.getElementById('font-family-select').value === 'custom') ? customFontDataUrl : null,
    strokeColor: document.getElementById('stroke-color') ? document.getElementById('stroke-color').value : '#000000',
    strokeWidth: document.getElementById('stroke-width') ? parseInt(document.getElementById('stroke-width').value) : 0,
    shadowColor: document.getElementById('shadow-color') ? document.getElementById('shadow-color').value : '#000000',
    shadowBlur: document.getElementById('shadow-blur') ? parseInt(document.getElementById('shadow-blur').value) : 0,
    showTitle: document.getElementById('show-title-toggle') ? document.getElementById('show-title-toggle').checked : false,
    titleText: document.getElementById('title-text-input') ? document.getElementById('title-text-input').value.trim() : '',
    titleSubtext: '',
    titleColor: document.getElementById('title-color-input') ? document.getElementById('title-color-input').value : '#FFFFFF',
    titleBgColor: document.getElementById('title-bg-color-input') ? document.getElementById('title-bg-color-input').value : '#000000',
    titleDuration: document.getElementById('title-duration-input') ? parseFloat(document.getElementById('title-duration-input').value) : 3.0,
    titleTop: document.getElementById('title-top-input') ? parseFloat(document.getElementById('title-top-input').value) : 20.0,
    titleStyle: document.getElementById('title-style-select') ? document.getElementById('title-style-select').value : 'tiktok-pill'
  };
  
  try {
    const res = await fetch(`${apiUrl}/api/render/${transcribeData.taskId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(renderPayload)
    });
    
    clearInterval(renderIntervalId);
    
    if (!res.ok) {
      let detail = 'حدث خطأ في معالجة الفيديو في السيرفر';
      try {
        const json = await res.json();
        detail = json.detail || detail;
      } catch(_) {}
      throw new Error(detail);
    }
    
    progressBarFill.style.width = '98%';
    progressTextLabel.textContent = 'جاري تنزيل الفيديو المكتمل...';
    progressMsg.textContent = 'جاري تنزيل الفيديو المكتمل...';
    
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    
    progressBarFill.style.width = '100%';
    progressTextLabel.textContent = 'اكتمل!';
    
    outputVideo.src = url;
    downloadLink.href = url;
    showState(successState);
    playSuccessSound();

    // Auto-save to 48-Hour Video Archive (Persistent IndexedDB + LocalStorage)
    if (typeof saveHistoryEntry === 'function') {
      saveHistoryEntry({
        title: 'فيديو كابشن نهائي (' + new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + ')',
        videoUrl: url,
        blob: blob
      });
    }

    // Track render event
    try {
      trackAction('render');
      if (currentUser && window.firebaseDb) {
        const userRef = window.firebaseDb.collection('users').doc(currentUser.uid);
        await userRef.update({
          renders_count: firebase.firestore.FieldValue.increment(1)
        }).catch(e => console.warn(e));
      } else if (!currentUser) {
        freeOpsCount++;
        localStorage.setItem('free_ops_count', freeOpsCount);
        updateAuthWidget();
      }
    } catch (_) {}

  } catch (err) {
    if (typeof renderIntervalId !== 'undefined') clearInterval(renderIntervalId);
    showState(errorState);
    errorMsg.textContent = err.message || 'فشل رندرة الفيديو. يرجى المحاولة مرة أخرى.';
  } finally {
    isRendering = false;
    if (renderBtn) {
      renderBtn.disabled = false;
      renderBtn.style.opacity = '';
      renderBtn.style.pointerEvents = '';
      renderBtn.style.cursor = '';
      renderBtn.innerHTML = originalRenderText;
    }
  }
};

window.downloadSRT = function() {
  if (!transcribeData || !transcribeData.segments) return;
  
  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }
  
  let srtContent = '';
  transcribeData.segments.forEach((seg, idx) => {
    const startStr = formatTime(seg.start);
    const endStr = formatTime(seg.end);
    srtContent += `${idx + 1}\n${startStr} --> ${endStr}\n${seg.text}\n\n`;
  });
  
  const blob = new Blob([srtContent.trim()], { type: 'text/srt;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'rekaption_subtitles.srt');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ==================== User Auth & Visitor Limits ====================
let currentUser = null;
let freeOpsCount = parseInt(localStorage.getItem('free_ops_count') || '0', 10);

function updateAuthWidget() {
  const widget = document.getElementById('user-auth-widget');
  if (!widget) return;

  if (currentUser) {
    widget.innerHTML = `
      ${currentUser.photoURL ? `<img src="${currentUser.photoURL}" alt="profile" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--purple-accent);" />` : ''}
      <div style="text-align: right;">
        <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">${currentUser.displayName || currentUser.email}</div>
        <div style="font-size: 10px; color: var(--text-muted);">حساب مفعل ⚡</div>
      </div>
      <button 
        type="button" 
        onclick="triggerSignOut()"
        style="margin: 0; padding: 6px 12px; font-size: 12px; border-radius: 20px; border: 1px solid #ef4444; color: #ef4444; background: rgba(239,68,68,0.05); cursor: pointer; transition: all 0.2s;"
      >
        تسجيل الخروج 🚪
      </button>
    `;
  } else {
    const remaining = Math.max(0, 2 - freeOpsCount);
    widget.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); display: flex; flex-direction: column; align-items: flex-start;">
        <span style="font-weight: 600;">الوضع المجاني (زائر)</span>
        <span style="font-size: 10px;">العمليات المتبقية: ${remaining}/2</span>
      </div>
      <button 
        type="button" 
        onclick="triggerGoogleLogin()" 
        style="margin: 0; padding: 8px 16px; font-size: 13px; border-radius: 20px; color: #fff; background: linear-gradient(135deg, #4285F4, #34A853); border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600;"
      >
        <span>🌐</span> الدخول بجوجل
      </button>
    `;
  }
}

window.triggerGoogleLogin = async function() {
  try {
    const user = await window.signInWithGoogle();
    currentUser = user;
    document.getElementById('login-prompt-modal').style.display = 'none';
    
    // Sync with Firestore
    const data = await syncUserWithFirestore(user);
    if (data) {
      if (data.is_active === false) {
        isSuspended = true;
        document.getElementById('suspended-modal').style.display = 'flex';
        return;
      } else {
        isSuspended = false;
      }
      if (!data.whatsapp) {
        document.getElementById('whatsapp-modal').style.display = 'flex';
        document.getElementById('whatsapp-error').style.display = 'none';
      }
    }
    updateAuthWidget();
  } catch (err) {
    console.error(err);
    alert(err.message || 'فشل تسجيل الدخول بحساب جوجل.');
  }
};

window.triggerSignOut = async function() {
  try {
    await window.signOutUser();
    currentUser = null;
    isSuspended = false;
    updateAuthWidget();
  } catch (err) {
    console.error(err);
  }
};

window.handleSaveWhatsapp = async function(e) {
  e.preventDefault();
  const input = document.getElementById('whatsapp-input');
  const errorDiv = document.getElementById('whatsapp-error');
  const num = input.value.trim();
  if (!num) {
    errorDiv.textContent = 'يرجى إدخال رقم واتساب صالح';
    errorDiv.style.display = 'block';
    return;
  }
  errorDiv.style.display = 'none';
  
  const submitBtn = document.getElementById('whatsapp-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري الحفظ...';
  
  try {
    if (!window.firebaseDb) {
      throw new Error("قاعدة بيانات فايربيز غير جاهزة بعد");
    }
    await window.firebaseDb.collection('users').doc(currentUser.uid).update({
      whatsapp: num
    });
    document.getElementById('whatsapp-modal').style.display = 'none';
    input.value = '';
  } catch (err) {
    errorDiv.textContent = err.message || 'فشل حفظ رقم الواتساب في فايربيز.';
    errorDiv.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'حفظ ومتابعة 🚀';
  }
};

// Initialize Auth State Listener
setTimeout(() => {
  if (window.onAuthStateChanged) {
    window.onAuthStateChanged(async (user) => {
      if (user) {
        currentUser = user;
        // Verify or register in Firestore
        try {
          const data = await syncUserWithFirestore(user);
          if (data) {
            if (data.is_active === false) {
              isSuspended = true;
              document.getElementById('suspended-modal').style.display = 'flex';
              return;
            } else {
              isSuspended = false;
            }
            if (!data.whatsapp) {
              document.getElementById('whatsapp-modal').style.display = 'flex';
              document.getElementById('whatsapp-error').style.display = 'none';
            }
          }
        } catch (err) {
          console.warn('Firestore user sync failed:', err);
        }
        
        // مزامنة القوالب مع Firestore عند تسجيل الدخول
        if (typeof syncTemplatesWithFirestore === 'function') {
          syncTemplatesWithFirestore();
        }
      } else {
        currentUser = null;
        isSuspended = false;
        // إعادة رسم القائمة المحلية
        if (typeof renderTemplateList === 'function') {
          renderTemplateList();
        }
      }
      updateAuthWidget();
    });
  } else {
    updateAuthWidget();
  }
}, 500);

// ==================== Gemini Transcribe & Tab Logic ====================
window.switchMainTab = function(tab) {
  const editorBtn = document.getElementById('main-nav-editor');
  const geminiBtn = document.getElementById('main-nav-gemini');
  const convertBtn = document.getElementById('main-nav-convert');
  const historyBtn = document.getElementById('main-nav-history');
  const cohereBtn = document.getElementById('main-nav-cohere');
  const coherePanel = document.getElementById('cohere-dashboard-panel');
  const dashboard = document.getElementById('main-dashboard');
  const geminiPanel = document.getElementById('gemini-transcribe-panel');
  const convertPanel = document.getElementById('convert-video-panel');
  const historyPanel = document.getElementById('history-archive-panel');
  const editorState = document.getElementById('editor-state');

  const tabs = [
    { name: 'editor', btn: editorBtn, el: dashboard },
    { name: 'gemini', btn: geminiBtn, el: geminiPanel },
    { name: 'convert', btn: convertBtn, el: convertPanel },
    { name: 'history', btn: historyBtn, el: historyPanel },
    { name: 'cohere', btn: cohereBtn, el: coherePanel }
  ];

  tabs.forEach(t => {
    if (t.name === tab) {
      if (t.btn) {
        t.btn.classList.add('active');
        t.btn.style.background = 'rgba(139, 92, 246, 0.15)';
        t.btn.style.borderColor = 'var(--purple-accent)';
        t.btn.style.color = '#fff';
      }
      if (t.el) t.el.classList.remove('hidden');
    } else {
      if (t.btn) {
        t.btn.classList.remove('active');
        t.btn.style.background = 'transparent';
        t.btn.style.borderColor = 'transparent';
        t.btn.style.color = 'rgba(255,255,255,0.6)';
      }
      if (t.el) t.el.classList.add('hidden');
    }
  });

  if (tab !== 'editor' && editorState) {
    editorState.classList.add('hidden');
  }

  if (tab === 'gemini') {
    const savedKey = localStorage.getItem('gemini_api_key');
    const keyInput = document.getElementById('gemini-key-input');
    if (savedKey && keyInput) {
      keyInput.value = savedKey;
    }
  }

  if (tab === 'history') {
    renderHistoryModal();
  }
};

// ==================== Vertical Video Conversion (KIM Algorithm) ====================
let currentConvertSource = 'local';
let convertFile = null;
let lastConvertedBlob = null;

window.switchConvertSource = function(source) {
  currentConvertSource = source;
  const localBtn = document.getElementById('convert-tab-local');
  const ytBtn = document.getElementById('convert-tab-yt');
  const localBox = document.getElementById('convert-local-box');
  const ytBox = document.getElementById('convert-yt-box');

  if (source === 'local') {
    if (localBtn) localBtn.classList.add('active');
    if (ytBtn) ytBtn.classList.remove('active');
    if (localBox) localBox.classList.remove('hidden');
    if (ytBox) ytBox.classList.add('hidden');
  } else {
    if (ytBtn) ytBtn.classList.add('active');
    if (localBtn) localBtn.classList.remove('active');
    if (ytBox) ytBox.classList.remove('hidden');
    if (localBox) localBox.classList.add('hidden');
  }
};

window.handleConvertFileSelect = function(file) {
  if (!file) return;
  convertFile = file;
  const label = document.getElementById('convert-file-label');
  if (label) {
    label.innerHTML = `
      <span style="font-size: 32px; display: block; margin-bottom: 8px;">🎬</span>
      <span style="font-size: 14px; color: #fff; font-weight: 600;">${file.name}</span>
    `;
  }
};

window.startVerticalConversion = async function() {
  const startBtn = document.getElementById('convert-start-btn');
  const loadingDiv = document.getElementById('convert-loading');
  const statusText = document.getElementById('convert-status-text');
  const progressBar = document.getElementById('convert-progress-bar');
  const resultContainer = document.getElementById('convert-result-container');
  const videoPlayer = document.getElementById('convert-video-player');
  const downloadBtn = document.getElementById('convert-download-btn');
  const ytUrlInput = document.getElementById('convert-yt-url');

  if (currentConvertSource === 'local' && !convertFile) {
    alert('يرجى اختيار ملف فيديو أولاً للتحويل إلى طولي!');
    return;
  }
  if (currentConvertSource === 'youtube' && (!ytUrlInput || !ytUrlInput.value.trim())) {
    alert('يرجى إدخال رابط فيديو يوتيوب أصلي (16:9)!');
    return;
  }

  startBtn.disabled = true;
  startBtn.style.opacity = '0.5';
  startBtn.style.pointerEvents = 'none';
  loadingDiv.classList.remove('hidden');
  resultContainer.classList.add('hidden');
  progressBar.style.width = '10%';
  statusText.textContent = 'جاري رفع الملف وتهيئة المعالجة...';

  try {
    const fd = new FormData();
    if (currentConvertSource === 'local') {
      fd.append('file', convertFile);
    } else {
      fd.append('youtubeUrl', ytUrlInput.value.trim());
    }

    const res = await fetch(audioApiUrl + '/api/convert-vertical-async', {
      method: 'POST',
      body: fd
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: 'فشل بدء معالجة تحويل الفيديو.' }));
      throw new Error(errData.detail || 'فشلت معالجة الطلب على السيرفر.');
    }

    const startData = await res.json();
    const taskId = startData.taskId;

    let pollInterval = null;
    const task = await new Promise((resolve, reject) => {
      pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${audioApiUrl}/api/task-status/${taskId}`);
          if (!statusRes.ok) {
            clearInterval(pollInterval);
            reject(new Error('فشل متابعة حالة التحويل من السيرفر.'));
            return;
          }
          const t = await statusRes.json();
          if (t.status === 'success') {
            clearInterval(pollInterval);
            resolve(t);
          } else if (t.status === 'failed') {
            clearInterval(pollInterval);
            reject(new Error(t.error || 'فشلت عملية تحويل الفيديو إلى طولي.'));
          } else {
            if (t.progress) {
              statusText.textContent = t.progress;
              if (t.progress.includes('100%')) {
                progressBar.style.width = '95%';
              } else if (t.progress.includes('المشاهد')) {
                progressBar.style.width = '30%';
              } else if (t.progress.includes('الوجوه')) {
                progressBar.style.width = '55%';
              } else if (t.progress.includes('الإطارات')) {
                progressBar.style.width = '80%';
              }
            }
          }
        } catch (e) {
          clearInterval(pollInterval);
          reject(e);
        }
      }, 2000);
    });

    progressBar.style.width = '100%';
    statusText.textContent = '✅ اكتمل التحويل بنجاح!';

    const videoUrl = task.videoUrl.startsWith('http') ? task.videoUrl : (audioApiUrl + '/' + task.videoUrl);
    const videoBlobRes = await fetch(videoUrl);
    if (!videoBlobRes.ok) {
      throw new Error('فشل جلب ملف الفيديو الطولي الناتج من السيرفر.');
    }

    lastConvertedBlob = await videoBlobRes.blob();
    const localVideoUrl = URL.createObjectURL(lastConvertedBlob);

    videoPlayer.src = localVideoUrl;
    downloadBtn.href = localVideoUrl;
    resultContainer.classList.remove('hidden');

  } catch (err) {
    console.error(err);
    alert('حدث خطأ أثناء تحويل الفيديو إلى طولي: ' + err.message);
  } finally {
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
    startBtn.style.pointerEvents = 'auto';
  }
};

window.transferConvertedToEditor = function() {
  if (!lastConvertedBlob) {
    alert('لا يوجد فيديو طولي جاهز للنقل!');
    return;
  }

  const verticalFile = new File([lastConvertedBlob], 'vertical_tiktok.mp4', { type: 'video/mp4' });

  if (typeof handleAudioSelect === 'function') {
    handleAudioSelect(verticalFile);
  }

  if (typeof switchUploadTab === 'function') {
    switchUploadTab('local');
  }

  switchMainTab('editor');

  const formElement = document.getElementById('form-controls');
  if (formElement) {
    formElement.scrollIntoView({ behavior: 'smooth' });
  }

  alert('تم نقل الفيديو الطولي بنجاح إلى صانع الكابشن! اضغط الآن على "توليد الفيديو النهائي" لتفريغ المقطع وإضافة كابشن عليه 🚀');
};


let lastGeminiYtUrl = null;
let lastGeminiTranscription = null;
let lastGeminiAudioUrl = null;

window.startAudioDownloadOnly = async function() {
  const urlInput = document.getElementById('gemini-yt-url');
  const startBtn = document.getElementById('gemini-start-btn');
  const loadingDiv = document.getElementById('gemini-loading');
  const statusText = document.getElementById('gemini-status-text');
  const progressBarFill = document.getElementById('gemini-progress-bar-fill');
  const progressText = document.getElementById('gemini-progress-text');
  
  const placeholderText = document.getElementById('audio-placeholder-text');
  const audioPlayer = document.getElementById('downloaded-audio-player');
  const audioLink = document.getElementById('downloaded-audio-link');
  const transcriptionContainer = document.getElementById('transcription-container');
  const transcriptionText = document.getElementById('transcription-text');

  const youtubeUrl = urlInput.value.trim();

  if (!youtubeUrl) {
    alert('الرجاء إدخال رابط فيديو يوتيوب صالح!');
    return;
  }

  // Check client-side cache first!
  if (lastGeminiYtUrl === youtubeUrl && lastGeminiTranscription && lastGeminiAudioUrl) {
    audioPlayer.src = lastGeminiAudioUrl;
    audioPlayer.style.display = 'block';
    audioLink.href = lastGeminiAudioUrl;
    audioLink.style.display = 'flex';
    placeholderText.style.display = 'none';
    transcriptionContainer.style.display = 'flex';
    transcriptionText.value = lastGeminiTranscription;
    statusText.textContent = '✅ تم تحميل وتفريغ الصوت مسبقاً (من التخزين المؤقت)!';
    return;
  }

  // Disable UI
  startBtn.disabled = true;
  startBtn.style.opacity = '0.5';
  loadingDiv.classList.remove('hidden');

  const geminiSpinner = loadingDiv.querySelector('.spinner');
  if (geminiSpinner) geminiSpinner.style.display = 'block';
  
  // Hide previous player/link if any
  audioPlayer.style.display = 'none';
  audioPlayer.src = '';
  audioLink.style.display = 'none';
  placeholderText.style.display = 'block';
  placeholderText.textContent = 'جاري التحميل ومعالجة الصوت...';
  
  // Reset suggested shorts UI
  document.getElementById('suggested-shorts-container').style.display = 'none';
  document.getElementById('shorts-cards-list').innerHTML = '';

  // Reset Progress Bar
  progressBarFill.style.width = '0%';
  progressText.textContent = 'الخطوة 1 / 2: جاري بدء التحميل...';

  // Start simulated progress
  let currentProgress = 5;
  progressBarFill.style.width = currentProgress + '%';

  const updateProgress = (target, speed, message, stepLabel) => {
    return setInterval(() => {
      if (currentProgress < target) {
        currentProgress += 1;
        progressBarFill.style.width = currentProgress + '%';
        progressText.textContent = `${stepLabel} (${currentProgress}%)`;
        statusText.textContent = message;
      }
    }, speed);
  };

  // Get Groq & Gemini API Keys
  const keyInput = document.getElementById('gemini-key-input');
  const apiKeyVal = keyInput ? keyInput.value.trim() : "";
  const groqApiKey = localStorage.getItem('groq_api_key') || apiKeyVal;
  const geminiApiKey = localStorage.getItem('gemini_api_key') || apiKeyVal;

  if (!apiKeyVal && !groqApiKey && !geminiApiKey) {
    alert('الرجاء إدخال مفتاح المحرك السريع لتتمكن من تفريغ الصوت بسرعة فائقة!');
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
    loadingDiv.classList.add('hidden');
    if (geminiSpinner) geminiSpinner.style.display = 'none';
    return;
  }

  if (apiKeyVal.startsWith('gsk_')) {
    localStorage.setItem('groq_api_key', apiKeyVal);
  }

  // Phase 1: Processing (from 5% to 95%)
  let progressInterval = updateProgress(
    95, 
    500, 
    'جاري تحميل الصوت وتفريغه بالذكاء الاصطناعي...',
    'جاري المعالجة والتفريغ'
  );

  try {
    const response = await fetch(audioApiUrl + '/api/transcribe-gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        youtubeUrl: youtubeUrl,
        groqApiKey: apiKeyVal.startsWith('gsk_') ? apiKeyVal : (groqApiKey || apiKeyVal),
        geminiApiKey: geminiApiKey
      })
    });


    clearInterval(progressInterval);

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || 'فشلت معالجة الطلب على السيرفر.');
    }

    const startData = await response.json();
    const taskId = startData.taskId;

    // Start polling the backend status every 3 seconds
    let pollInterval = null;
    const pollPromise = new Promise((resolve, reject) => {
      pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${audioApiUrl}/api/task-status/${taskId}`);
          if (!statusRes.ok) {
            clearInterval(pollInterval);
            reject(new Error('فشل جلب حالة المهمة من السيرفر.'));
            return;
          }
          const task = await statusRes.json();
          if (task.status === 'success') {
            clearInterval(pollInterval);
            resolve(task);
          } else if (task.status === 'failed') {
            clearInterval(pollInterval);
            reject(new Error(task.error || 'فشلت عملية التحميل والتفريغ.'));
          } else {
            // Update UI with real progress message from backend
            statusText.textContent = task.progress || 'جاري المعالجة...';
            
            // Extract parts progress e.g. "معالجة الجزء 3/13"
            if (task.progress.includes('معالجة') || task.progress.includes('الجزء')) {
              const match = task.progress.match(/(\d+)\/(\d+)/);
              if (match) {
                const current = parseInt(match[1]);
                const total = parseInt(match[2]);
                const pct = 15 + Math.round((current / total) * 80);
                progressBarFill.style.width = `${pct}%`;
                progressText.textContent = `جاري التفريغ بالتوازي (${current}/${total})`;
              }
            } else if (task.progress.includes('تقسيم') || task.progress.includes('أجزاء')) {
              progressBarFill.style.width = '12%';
              progressText.textContent = task.progress;
            } else if (task.progress.includes('تحميل')) {
              progressBarFill.style.width = '7%';
              progressText.textContent = 'جاري تحميل الصوت من يوتيوب...';
            }
          }
        } catch (e) {
          clearInterval(pollInterval);
          reject(e);
        }
      }, 2000);
    });

    const resData = await pollPromise;
    
    // Complete
    currentProgress = 100;
    progressBarFill.style.width = '100%';
    progressText.textContent = 'الخطوة 2 / 2: اكتمل بنجاح!';
    statusText.textContent = '✅ تم تحميل وتفريغ الصوت بنجاح!';
    if (geminiSpinner) geminiSpinner.style.display = 'none';
    
    // Display player
    const fullAudioUrl = resData.audioUrl.startsWith('http') ? resData.audioUrl : (audioApiUrl + '/' + resData.audioUrl);
    audioPlayer.src = fullAudioUrl;
    audioPlayer.style.display = 'block';
    audioLink.href = fullAudioUrl;
    audioLink.style.display = 'flex';
    placeholderText.style.display = 'none';

    // Display transcription
    if (resData.transcription) {
      transcriptionContainer.style.display = 'flex';
      transcriptionText.value = resData.transcription;

      // Update Client Cache
      lastGeminiYtUrl = youtubeUrl;
      lastGeminiTranscription = resData.transcription;
      lastGeminiAudioUrl = fullAudioUrl;
    } else {
      transcriptionContainer.style.display = 'none';
    }
  } catch (err) {
    clearInterval(progressInterval);
    progressBarFill.style.width = '0%';
    progressText.textContent = '❌ فشلت العملية.';
    alert('حدث خطأ: ' + err.message);
    statusText.textContent = '❌ فشلت العملية.';
    placeholderText.textContent = 'فشلت معالجة وتفريغ الصوت: ' + err.message;
    if (geminiSpinner) geminiSpinner.style.display = 'none';
  } finally {
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
  }
};

window.copyTranscription = function() {
  const text = document.getElementById('transcription-text').value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    alert('تم نسخ النص المفرغ بنجاح إلى الحافظة! 📋');
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
};

window.fetchShortsSuggestions = async function() {
  const transcriptionText = document.getElementById('transcription-text').value;
  const geminiApiKey = document.getElementById('gemini-key-input').value.trim();
  const shortsBtn = document.getElementById('gemini-shorts-btn');
  const loadingDiv = document.getElementById('shorts-loading');
  const statusSpan = document.getElementById('shorts-status-text') || (loadingDiv ? loadingDiv.querySelector('span') : null);
  const timerSpan = document.getElementById('shorts-timer');
  const container = document.getElementById('suggested-shorts-container');
  const listContainer = document.getElementById('shorts-cards-list');
  
  const numShorts = parseInt(document.getElementById('gemini-shorts-count').value) || 3;
  const openrouterModelInput = document.getElementById('openrouter-model-input');
  const openrouterModel = openrouterModelInput ? openrouterModelInput.value.trim() : "google/gemini-2.5-pro-preview-05-06";
  const customPromptInput = document.getElementById('gemini-custom-prompt');
  const customPrompt = customPromptInput ? customPromptInput.value.trim() : "";
  const titleStyleSelect = document.getElementById('gemini-title-style');
  const titleStyle = titleStyleSelect ? titleStyleSelect.value : "auto";
  const ytUrl = document.getElementById('gemini-yt-url').value.trim();

  if (!transcriptionText || transcriptionText.trim() === "") {
    alert("لا يوجد نص مفرغ لتحليله واقتراح مقاطع Shorts منه!");
    return;
  }

  if (!geminiApiKey) {
    alert("الرجاء إدخال مفتاح Gemini API Key لتتمكن من تحليل النص!");
    return;
  }

  // Show loading, disable button
  shortsBtn.disabled = true;
  shortsBtn.style.opacity = '0.5';
  loadingDiv.classList.remove('hidden');
  if (statusSpan) statusSpan.textContent = `جاري تحليل النص واستخراج ${numShorts} مقاطع Shorts بالذكاء الاصطناعي...`;
  container.style.display = 'none';
  listContainer.innerHTML = '';

  let secondsElapsed = 0;
  if (timerSpan) timerSpan.textContent = `⏱️ جارٍ التحليل والمعالجة (0 ثانية)...`;
  const timerInterval = setInterval(() => {
    secondsElapsed++;
    if (timerSpan) {
      if (secondsElapsed < 12) {
        timerSpan.textContent = `⏱️ جارٍ التحليل واستخراج الأفكار (${secondsElapsed} ثانية)...`;
      } else if (secondsElapsed < 25) {
        timerSpan.textContent = `⏱️ جارٍ صياغة السكريبت والخطافات (${secondsElapsed} ثانية)...`;
      } else {
        timerSpan.textContent = `⏱️ جارٍ المزامنة وتنسيق التوقيتات (${secondsElapsed} ثانية)...`;
      }
    }
  }, 1000);

  try {
    let shortsList = [];

    // Try async endpoint first to bypass 30s HTTP timeouts
    let asyncResponse;
    try {
      asyncResponse = await fetch(audioApiUrl + '/api/suggest-shorts-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcription: transcriptionText,
          geminiApiKey: geminiApiKey,
          openrouterModel: openrouterModel,
          customPrompt: customPrompt,
          titleStyle: titleStyle,
          numShorts: numShorts
        })
      });
    } catch (e) {
      console.warn('Async suggest-shorts failed, falling back to sync:', e);
    }

    if (asyncResponse && asyncResponse.ok) {
      const startData = await asyncResponse.json();
      const taskId = startData.taskId;

      let pollInterval = null;
      const pollPromise = new Promise((resolve, reject) => {
        pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${audioApiUrl}/api/task-status/${taskId}`);
            if (!statusRes.ok) {
              clearInterval(pollInterval);
              reject(new Error('فشل جلب حالة اقتراح المقاطع من السيرفر.'));
              return;
            }
            const task = await statusRes.json();
            if (task.status === 'success') {
              clearInterval(pollInterval);
              resolve(task);
            } else if (task.status === 'failed') {
              clearInterval(pollInterval);
              reject(new Error(task.error || 'فشلت عملية اقتراح المقاطع.'));
            } else {
              if (statusSpan && task.progress) {
                statusSpan.textContent = task.progress;
              }
            }
          } catch (e) {
            clearInterval(pollInterval);
            reject(e);
          }
        }, 2000);
      });

      const resData = await pollPromise;
      shortsList = resData.shorts || [];
    } else {
      // Fallback to sync endpoint
      const response = await fetch(audioApiUrl + '/api/suggest-shorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcription: transcriptionText,
          geminiApiKey: geminiApiKey,
          openrouterModel: openrouterModel,
          customPrompt: customPrompt,
          titleStyle: titleStyle,
          numShorts: numShorts
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: 'حدث خطأ في السيرفر أثناء تحليل الـ Shorts' }));
        throw new Error(errData.detail || 'فشلت معالجة الطلب على السيرفر.');
      }

      const resData = await response.json();
      shortsList = resData.shorts || [];
    }

    clearInterval(timerInterval);

    currentSuggestedShorts = shortsList || [];
    selectedShortsIndices.clear();
    const selectAllChk = document.getElementById('select-all-shorts-chk');
    if (selectAllChk) selectAllChk.checked = false;
    updateBatchToolbar();

    if (shortsList && shortsList.length > 0) {
      let cardsHtml = '';
      const escapedYtUrl = ytUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      shortsList.forEach((short, idx) => {
        const copyText = `عنوان المقطع: ${short.title}\nالتوقيت: [${short.start_time} -> ${short.end_time}]\nالخطاف: ${short.hook}\n\nالنص:\n${short.script}`;
        const escapedCopyText = copyText.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
        
        cardsHtml += `
          <div class="short-card" style="
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(139, 92, 246, 0.25);
            border-radius: 16px;
            padding: 20px;
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          ">
            <!-- Badge: Short Number -->
            <div style="
              position: absolute;
              top: -10px;
              right: 20px;
              background: linear-gradient(135deg, #8b5cf6, #ec4899);
              color: #fff;
              font-size: 11px;
              font-weight: 800;
              padding: 4px 12px;
              border-radius: 20px;
              box-shadow: 0 4px 10px rgba(139, 92, 246, 0.3);
            ">
              مقطع مقترح #${idx + 1}
            </div>

            <!-- Badge: Select Checkbox -->
            <label style="position: absolute; top: -10px; left: 15px; display: flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #fff; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 20px; cursor: pointer; user-select: none;">
              <input type="checkbox" class="short-card-chk" data-index="${idx}" onchange="toggleShortSelection(${idx}, this.checked)" style="width: 14px; height: 14px; accent-color: #10b981; cursor: pointer;" />
              <span>تحديد</span>
            </label>

            <!-- Time Chip -->
            <div style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 12px;
              font-weight: 700;
              color: var(--purple-accent);
              margin-top: 5px;
            ">
              <span>⏱️ التوقيت:</span>
              <span style="
                background: rgba(139, 92, 246, 0.1);
                border: 1px solid rgba(139, 92, 246, 0.3);
                padding: 2px 8px;
                border-radius: 6px;
                font-family: monospace;
                font-size: 13px;
              ">
                ${short.start_time} - ${short.end_time}
              </span>
            </div>

            <!-- Title -->
            <h4 style="
              margin: 5px 0 2px 0;
              font-size: 14px;
              font-weight: 800;
              color: #fff;
            ">
              🎥 العنوان المقترح: ${short.title}
            </h4>

            <!-- Hook -->
            <div style="
              background: rgba(236, 72, 153, 0.05);
              border-right: 3px solid #ec4899;
              padding: 8px 12px;
              border-radius: 0 8px 8px 0;
              font-size: 13px;
              color: #f472b6;
              line-height: 1.5;
            ">
              <span style="font-weight: 800;">⚡ الخطاف (أول 3 ثوانٍ):</span> ${short.hook}
            </div>

            <!-- Script Text -->
            <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 5px;">
              <span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">📝 سكريبت المقطع القصير:</span>
              <textarea readonly style="
                width: 100%;
                height: 80px;
                padding: 10px;
                border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.08);
                background: rgba(0,0,0,0.2);
                color: #fff;
                font-size: 13px;
                line-height: 1.6;
                resize: none;
                font-family: inherit;
              ">${short.script}</textarea>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
              <!-- Send to Captions Phase Button (Full Width Primary) -->
              <button type="button" onclick="cutAndSendToCaptions('${escapedYtUrl}', '${short.start_time}', '${short.end_time}', ${idx + 1}, this)" class="btn-primary" style="
                width: 100%;
                padding: 10px 14px;
                font-size: 13px;
                font-weight: 800;
                justify-content: center;
                border-radius: 10px;
                background: linear-gradient(135deg, #8b5cf6, #ec4899);
                border: none;
                color: #fff;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
                box-shadow: 0 4px 14px rgba(139, 92, 246, 0.35);
                margin: 0;
              ">
                <span>🎬</span> قص وتوليد الكابشن
              </button>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <!-- Cut & Download Button -->
                <button type="button" onclick="cutVideoSegment('${escapedYtUrl}', '${short.start_time}', '${short.end_time}', ${idx + 1}, this)" class="btn-primary" style="
                  padding: 8px 10px;
                  font-size: 12px;
                  font-weight: 700;
                  justify-content: center;
                  border-radius: 8px;
                  background: linear-gradient(135deg, #10b981, #059669);
                  border: none;
                  color: #fff;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 4px;
                  margin: 0;
                ">
                  <span>✂️</span> قص وتحميل الفيديو
                </button>

                <!-- Copy Button for Script -->
                <button type="button" onclick="copyShortsText('${escapedCopyText}', ${idx + 1})" class="btn-secondary" style="
                  padding: 8px 10px;
                  font-size: 12px;
                  font-weight: 700;
                  justify-content: center;
                  border-radius: 8px;
                  margin: 0;
                  display: flex;
                  align-items: center;
                  gap: 4px;
                ">
                  <span>📋</span> نسخ التفاصيل
                </button>
              </div>
            </div>
          </div>
        `;
      });
      listContainer.innerHTML = cardsHtml;
      container.style.display = 'flex';
    } else {
      throw new Error('الاستجابة لا تحتوي على مقاطع مقترحة.');
    }
  } catch (err) {
    console.error(err);
    alert('حدث خطأ أثناء اقتراح مقاطع الـ Shorts: ' + err.message);
  } finally {
    shortsBtn.disabled = false;
    shortsBtn.style.opacity = '1';
    loadingDiv.classList.add('hidden');
  }
};

window.copyShortsText = function(text, index) {
  navigator.clipboard.writeText(text).then(() => {
    alert('تم نسخ تفاصيل المقطع المقترح #' + index + ' بنجاح! 📋');
  }).catch(err => {
    console.error('Failed to copy: ', err);
  });
};

async function performAsyncCut(youtubeUrl, startTime, endTime, quality, onProgress) {
  let response;
  try {
    response = await fetch(audioApiUrl + '/api/cut-async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: youtubeUrl,
        start_time: startTime,
        end_time: endTime,
        quality: quality || 720
      })
    });
  } catch (netErr) {
    console.warn('cut-async network error, fallback to sync cut:', netErr);
  }
  if (response && response.ok) {
    const startData = await response.json();
    const taskId = startData.taskId;

    let pollInterval = null;
    const pollPromise = new Promise((resolve, reject) => {
      pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${audioApiUrl}/api/task-status/${taskId}`);
          if (!statusRes.ok) {
            clearInterval(pollInterval);
            reject(new Error('فشل جلب حالة القص من السيرفر.'));
            return;
          }
          const task = await statusRes.json();
          if (task.status === 'success') {
            clearInterval(pollInterval);
            resolve(task);
          } else if (task.status === 'failed') {
            clearInterval(pollInterval);
            reject(new Error(task.error || 'فشلت عملية قص المقطع.'));
          } else {
            if (typeof onProgress === 'function' && task.progress) {
              onProgress(task.progress);
            }
          }
        } catch (e) {
          clearInterval(pollInterval);
          reject(e);
        }
      }, 2000);
    });

    const resData = await pollPromise;
    const videoUrl = resData.videoUrl.startsWith('http') ? resData.videoUrl : (audioApiUrl + '/' + resData.videoUrl);
    
    const fileRes = await fetch(videoUrl);
    if (!fileRes.ok) {
      throw new Error('فشل تحميل ملف المقطع المقصوص من السيرفر.');
    }
    return await fileRes.blob();
  } else {
    // Fallback sync /api/cut
    const syncRes = await fetch(audioApiUrl + '/api/cut', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: youtubeUrl,
        start_time: startTime,
        end_time: endTime,
        quality: quality || 720
      })
    });

    if (!syncRes.ok) {
      const errData = await syncRes.json().catch(() => ({ detail: 'فشل السيرفر في قص المقطع. قد يكون رابط اليوتيوب محمي أو التوقيتات خارج المدى.' }));
      throw new Error(errData.detail || 'فشلت معالجة الطلب على السيرفر.');
    }
    return await syncRes.blob();
  }
}

let selectedShortChoice = 'vertical';
let rememberedShortChoice = null;
let pendingShortArgs = null;
let pendingBatchProcess = false;
let pendingBatchArgs = null;

window.selectShortOption = function(choice) {
  selectedShortChoice = choice;
  const vertCard = document.getElementById('option-card-vertical');
  const origCard = document.getElementById('option-card-original');

  if (choice === 'vertical') {
    if (vertCard) {
      vertCard.style.background = 'rgba(139, 92, 246, 0.12)';
      vertCard.style.border = '2px solid var(--purple-accent)';
    }
    if (origCard) {
      origCard.style.background = 'rgba(255, 255, 255, 0.02)';
      origCard.style.border = '1px solid rgba(255, 255, 255, 0.12)';
    }
  } else {
    if (origCard) {
      origCard.style.background = 'rgba(139, 92, 246, 0.12)';
      origCard.style.border = '2px solid var(--purple-accent)';
    }
    if (vertCard) {
      vertCard.style.background = 'rgba(255, 255, 255, 0.02)';
      vertCard.style.border = '1px solid rgba(255, 255, 255, 0.12)';
    }
  }
};

window.toggleModalEngineFields = function() {
  const select = document.getElementById('modal-caption-engine-select');
  const elevenlabsWrapper = document.getElementById('modal-elevenlabs-key-wrapper');
  if (select && elevenlabsWrapper) {
    if (select.value === 'v2') {
      elevenlabsWrapper.style.display = 'block';
    } else {
      elevenlabsWrapper.style.display = 'none';
    }
  }
};

window.closeShortOptionsModal = function() {
  const modal = document.getElementById('short-options-modal');
  if (modal) modal.style.display = 'none';
  pendingShortArgs = null;
  pendingBatchProcess = false;
  pendingBatchArgs = null;
};

// تملأ قائمة القوالب جوّه الـ modal
window.populateModalTemplates = function() {
  const listEl   = document.getElementById('modal-template-list');
  const emptyEl  = document.getElementById('modal-template-empty');
  const nameEl   = document.getElementById('modal-selected-template-name');
  if (!listEl) return;

  const templates = typeof getTemplates === 'function' ? getTemplates() : [];

  // احذف كل شيء عدا الـ emptyEl
  Array.from(listEl.children).forEach(c => { if (c !== emptyEl) c.remove(); });
  if (nameEl) nameEl.textContent = 'الإعدادات الحالية';

  if (templates.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // بطاقة "بدون قالب"
  const noneBtn = document.createElement('button');
  noneBtn.type = 'button';
  noneBtn.dataset.tid = 'none';
  noneBtn.style.cssText = 'width:100%;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.2);border-radius:10px;padding:9px 12px;cursor:pointer;color:#fff;font-family:inherit;text-align:right;transition:all 0.15s;';
  noneBtn.innerHTML = `<span style="font-size:16px">⚙️</span><span style="font-size:12px;font-weight:700">بدون قالب (الإعدادات الحالية)</span>`;
  noneBtn.onclick = () => selectModalTemplate(null, noneBtn, 'الإعدادات الحالية');
  listEl.appendChild(noneBtn);

  templates.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.tid = String(t.id);
    btn.style.cssText = 'width:100%;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(139,92,246,0.25);border-radius:10px;padding:9px 12px;cursor:pointer;color:#fff;font-family:inherit;text-align:right;transition:all 0.15s;';
    btn.innerHTML = `
      <div style="display:flex;gap:3px;flex-shrink:0;">
        <div style="width:12px;height:12px;border-radius:50%;background:${t.settings.activeColor||'#fff'};border:1px solid rgba(255,255,255,0.3);"></div>
        <div style="width:12px;height:12px;border-radius:50%;background:${t.settings.bgColor||'#000'};border:1px solid rgba(255,255,255,0.3);"></div>
        <div style="width:12px;height:12px;border-radius:50%;background:${t.settings.titleBgColor||'#000'};border:1px solid rgba(255,255,255,0.3);"></div>
      </div>
      <span style="font-size:12px;font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</span>
      <span style="font-size:10px;color:rgba(255,255,255,0.4);flex-shrink:0;">${t.settings.animationType||'classic'}</span>`;
    btn.onclick = () => selectModalTemplate(t, btn, t.name);
    listEl.appendChild(btn);
  });
};

window.selectModalTemplate = function(template, btnEl, label) {
  // إزالة التحديد من كل البطاقات
  const listEl = document.getElementById('modal-template-list');
  if (listEl) Array.from(listEl.querySelectorAll('button')).forEach(b => {
    b.style.border = b.dataset.tid === 'none' ? '2px solid rgba(255,255,255,0.2)' : '1px solid rgba(139,92,246,0.25)';
    b.style.background = 'rgba(255,255,255,0.03)';
  });
  if (btnEl) { btnEl.style.border = '2px solid #8b5cf6'; btnEl.style.background = 'rgba(139,92,246,0.15)'; }
  const nameEl = document.getElementById('modal-selected-template-name');
  if (nameEl) nameEl.textContent = label;

  // طبّق القالب فوراً لو اختاره
  if (template && typeof applySettingsToDOM === 'function') applySettingsToDOM(template.settings);
};


window.confirmShortOptionChoice = function() {
  const rememberCheckbox = document.getElementById('remember-short-option');
  if (rememberCheckbox && rememberCheckbox.checked) {
    rememberedShortChoice = selectedShortChoice;
  }

  // Sync engine and ElevenLabs key selection from modal to main inputs & localStorage
  const modalSelect = document.getElementById('modal-caption-engine-select');
  const modalElInput = document.getElementById('modal-elevenlabs-key-input');
  
  const selectedEngine = modalSelect ? modalSelect.value : 'v1';
  localStorage.setItem('caption_engine', selectedEngine);
  
  const engineSelect = document.getElementById('caption-engine-select');
  if (engineSelect) {
    engineSelect.value = selectedEngine;
    if (typeof window.toggleEngineFields === 'function') window.toggleEngineFields();
  }
  
  const elKeyVal = modalElInput ? modalElInput.value.trim() : '';
  if (elKeyVal) {
    localStorage.setItem('elevenlabs_api_key', elKeyVal);
    const elInput = document.getElementById('elevenlabs-api-key-input');
    if (elInput) elInput.value = elKeyVal;
  }
  
  // Capture values before closing/clearing variables
  const isBatch = pendingBatchProcess;
  const batchArgs = pendingBatchArgs;
  const singleArgs = pendingShortArgs;

  closeShortOptionsModal();

  if (isBatch) {
    if (batchArgs) {
      executeBatchCaptionProcess(batchArgs.youtubeUrl, selectedShortChoice);
    }
  } else {
    if (singleArgs) {
      executeCutAndSendToCaptions(singleArgs.youtubeUrl, singleArgs.startTime, singleArgs.endTime, singleArgs.idx, singleArgs.btn, selectedShortChoice);
    }
  }
};

window.cutAndSendToCaptions = function(youtubeUrl, startTime, endTime, idx, btn) {
  if (!youtubeUrl) {
    alert("رابط اليوتيوب غير متوفر لقص المقطع!");
    return;
  }

  if (rememberedShortChoice) {
    executeCutAndSendToCaptions(youtubeUrl, startTime, endTime, idx, btn, rememberedShortChoice);
    return;
  }

  pendingShortArgs = { youtubeUrl, startTime, endTime, idx, btn };
  pendingBatchProcess = false;
  pendingBatchArgs = null;

  // Prefill title input and toggle title ON
  const shortItem = currentSuggestedShorts[idx];
  const suggestedTitle = shortItem ? shortItem.title : '';
  const titleTextInput = document.getElementById('title-text-input');
  if (titleTextInput) {
    titleTextInput.value = suggestedTitle;
  }
  const showTitleToggle = document.getElementById('show-title-toggle');
  if (showTitleToggle) {
    showTitleToggle.checked = true;
    if (typeof window.toggleTitleFields === 'function') {
      window.toggleTitleFields(true);
    }
  }

  // Set up modal inputs to reflect current settings
  const modalSelect = document.getElementById('modal-caption-engine-select');
  const modalElInput = document.getElementById('modal-elevenlabs-key-input');
  
  const currentEngine = localStorage.getItem('caption_engine') || 'v1';
  const currentElKey = localStorage.getItem('elevenlabs_api_key') || '';
  
  if (modalSelect) modalSelect.value = currentEngine;
  if (modalElInput) modalElInput.value = currentElKey;

  selectShortOption('vertical');

  if (typeof window.toggleModalEngineFields === 'function') {
    window.toggleModalEngineFields();
  }

  if (typeof window.populateModalTemplates === 'function') window.populateModalTemplates();
  const modal = document.getElementById('short-options-modal');
  if (modal) modal.style.display = 'flex';
};


async function executeCutAndSendToCaptions(youtubeUrl, startTime, endTime, idx, btn, convertChoice) {
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.style.pointerEvents = 'none';
  btn.innerHTML = '<span>⏳</span> جاري قص المقطع...';

  try {
    // Step 1: Perform Async Cut from YouTube
    let blob = await performAsyncCut(youtubeUrl, startTime, endTime, 720, (progText) => {
      btn.innerHTML = `<span>⏳</span> ${progText}`;
    });

    // Step 2: If user chose 'vertical', pass cut clip blob through KIM algorithm (/api/convert-vertical-async)
    if (convertChoice === 'vertical') {
      btn.innerHTML = '<span>📱</span> جاري تحويل المقطع إلى طولي (9:16)...';
      
      const rawCutFile = new File([blob], `cut_clip_${idx}.mp4`, { type: 'video/mp4' });
      const fd = new FormData();
      fd.append('file', rawCutFile);

      const convertRes = await fetch(audioApiUrl + '/api/convert-vertical-async', {
        method: 'POST',
        body: fd
      });

      if (!convertRes.ok) {
        const errData = await convertRes.json().catch(() => ({ detail: 'فشل بدء معالجة تحويل المقطع إلى طولي.' }));
        throw new Error(errData.detail || 'فشلت معالجة التحويل على السيرفر.');
      }

      const startData = await convertRes.json();
      const taskId = startData.taskId;

      let pollInterval = null;
      const convertTask = await new Promise((resolve, reject) => {
        pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${audioApiUrl}/api/task-status/${taskId}`);
            if (!statusRes.ok) {
              clearInterval(pollInterval);
              reject(new Error('فشل متابعة حالة التحويل من السيرفر.'));
              return;
            }
            const t = await statusRes.json();
            if (t.status === 'success') {
              clearInterval(pollInterval);
              resolve(t);
            } else if (t.status === 'failed') {
              clearInterval(pollInterval);
              reject(new Error(t.error || 'فشلت عملية تحويل المقطع إلى طولي.'));
            } else {
              if (t.progress) {
                btn.innerHTML = `<span>📱</span> ${t.progress}`;
              }
            }
          } catch (e) {
            clearInterval(pollInterval);
            reject(e);
          }
        }, 2000);
      });

      const verticalVideoUrl = convertTask.videoUrl.startsWith('http') ? convertTask.videoUrl : (audioApiUrl + '/' + convertTask.videoUrl);
      const verticalRes = await fetch(verticalVideoUrl);
      if (!verticalRes.ok) {
        throw new Error('فشل جلب ملف المقطع الطولي من السيرفر.');
      }

      blob = await verticalRes.blob();
    }

    btn.innerHTML = '<span>🚀</span> جاري فتح المحرر...';
    const finalFile = new File([blob], `short_clip_${idx}_${convertChoice}.mp4`, { type: 'video/mp4' });

    // Set cut/converted video file as active in dropzone
    handleAudioSelect(finalFile);

    // Switch upload tab if tab elements exist
    switchUploadTab('local');

    // Switch main tab to Video Creator / Editor
    switchMainTab('editor');

    // Make sure upload-state is visible
    if (typeof showState === 'function' && uploadState) {
      showState(uploadState);
    }

    // Scroll to top of form
    const formElement = document.getElementById('form-controls');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }

    // Enable submitBtn explicitly and trigger form submission
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.click();
    }

  } catch (err) {
    console.error(err);
    alert('حدث خطأ أثناء معالجة ونقل المقطع لمرحلة الكابشن: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.innerHTML = originalHtml;
  }
};

window.processBatchCaption = async function() {
  if (selectedShortsIndices.size === 0) {
    alert('يرجى تحديد مقطع واحد على الأقل من كروت الـ Shorts بالضغط على زر "تحديد" أعلى المقطع!');
    return;
  }

  const indices = Array.from(selectedShortsIndices).sort((a, b) => a - b);
  const ytUrl = document.getElementById('gemini-yt-url').value.trim();

  if (!ytUrl) {
    alert('رابط اليوتيوب غير متوفر لقص المقاطع المحددة!');
    return;
  }

  const confirmMsg = `هل تريد بدء قص وتوليد الكابشن آلياً لعدد ${indices.length} مقطع مُحدد؟\nسيتم حفض المخرجات تلقائياً في "أرشيف الفيديوهات (48h)".`;
  if (!confirm(confirmMsg)) return;

  const batchBtn = document.getElementById('batch-caption-btn');
  const originalBtnHtml = batchBtn ? batchBtn.innerHTML : '';
  if (batchBtn) {
    batchBtn.disabled = true;
    batchBtn.style.opacity = '0.6';
  }

  let successCount = 0;
  for (let i = 0; i < indices.length; i++) {
    const sIdx = indices[i];
    const short = currentSuggestedShorts[sIdx];
    if (!short) continue;

    if (batchBtn) {
      batchBtn.innerHTML = `<span>⏳</span> جاري معالجة المقطع ${i + 1} من ${indices.length}: [${short.title.substring(0, 15)}...]`;
    }

    try {
      // 1. Cut audio/video segment
      let blob = await performAsyncCut(ytUrl, short.start_time, short.end_time, 720);

      // 2. Convert to vertical (9:16)
      if (batchBtn) {
        batchBtn.innerHTML = `<span>📱</span> جاري تحويل المقطع ${i + 1} من ${indices.length} لطولي (9:16)...`;
      }
      const rawCutFile = new File([blob], `cut_clip_${sIdx}.mp4`, { type: 'video/mp4' });
      const convertFd = new FormData();
      convertFd.append('file', rawCutFile);

      const convertRes = await fetch(audioApiUrl + '/api/convert-vertical-async', {
        method: 'POST',
        body: convertFd
      });

      if (convertRes.ok) {
        const startData = await convertRes.json();
        const convertTaskId = startData.taskId;

        let convertPollInterval = null;
        const convertTaskData = await new Promise((resolve, reject) => {
          convertPollInterval = setInterval(async () => {
            try {
              const statusRes = await fetch(`${audioApiUrl}/api/task-status/${convertTaskId}`);
              if (!statusRes.ok) {
                clearInterval(convertPollInterval);
                reject(new Error('فشل جلب حالة التحويل لطولي.'));
                return;
              }
              const t = await statusRes.json();
              if (t.status === 'success') {
                clearInterval(convertPollInterval);
                resolve(t);
              } else if (t.status === 'failed') {
                clearInterval(convertPollInterval);
                reject(new Error(t.error || 'فشل التحويل لطولي.'));
              }
            } catch (e) {
              clearInterval(convertPollInterval);
              reject(e);
            }
          }, 2000);
        });

        const verticalVideoUrl = convertTaskData.videoUrl.startsWith('http') ? convertTaskData.videoUrl : (audioApiUrl + '/' + convertTaskData.videoUrl);
        const verticalRes = await fetch(verticalVideoUrl);
        if (verticalRes.ok) {
          blob = await verticalRes.blob();
        }
      }

      const audioFile = new File([blob], `batch_clip_${sIdx + 1}.mp4`, { type: 'video/mp4' });

      // 3. Transcribe & weld via MAIN backend (apiUrl, not audioApiUrl)
      if (batchBtn) {
        batchBtn.innerHTML = `<span>🎤</span> جاري تفريغ المقطع ${i + 1} من ${indices.length} بالـ AI...`;
      }
      const fd = new FormData();
      fd.append('audio', audioFile);
      fd.append('minWords', document.getElementById('min-words') ? document.getElementById('min-words').value : '2');
      fd.append('maxWords', document.getElementById('max-words') ? document.getElementById('max-words').value : '5');
      fd.append('animation', selectedAnimation || 'classic');
      fd.append('activeColor', document.getElementById('active-color') ? document.getElementById('active-color').value : '#FFFFFF');
      fd.append('inactiveColor', document.getElementById('inactive-color') ? document.getElementById('inactive-color').value : '#FFFFFF');

      fd.append('showTitle', 'true');
      if (short.title) fd.append('titleText', short.title);
      fd.append('titleColor', document.getElementById('title-color-input') ? document.getElementById('title-color-input').value : '#FFFFFF');
      fd.append('titleBgColor', document.getElementById('title-bg-color-input') ? document.getElementById('title-bg-color-input').value : '#000000');
      fd.append('titleDuration', document.getElementById('title-duration-input') ? document.getElementById('title-duration-input').value : '3.0');
      fd.append('titleTop', document.getElementById('title-top-input') ? document.getElementById('title-top-input').value : '12.0');
      fd.append('titleStyle', document.getElementById('title-style-select') ? document.getElementById('title-style-select').value : 'tiktok-pill');
      
      const groqKey = localStorage.getItem('groq_api_key') || '';
      const geminiKey = localStorage.getItem('gemini_api_key') || localStorage.getItem('geminiApiKey') || '';
      if (groqKey) fd.append('groqApiKey', groqKey);
      if (geminiKey) fd.append('geminiApiKey', geminiKey);

      const engineSelect = document.getElementById('caption-engine-select');
      const engineVal = engineSelect ? engineSelect.value : 'v1';
      fd.append('captionEngine', engineVal);

      const elKey = localStorage.getItem('elevenlabs_api_key') || '';
      if (elKey) fd.append('elevenLabsApiKey', elKey);

      const savedOrKey = localStorage.getItem('openrouterApiKey') || localStorage.getItem('openrouterKey') || '';
      const orInput = document.getElementById('openrouter-api-key') || document.getElementById('openrouter-key-input');
      const openrouterKeyVal = orInput ? orInput.value.trim() : savedOrKey;
      if (openrouterKeyVal) fd.append('openrouterKey', openrouterKeyVal);

      // Use the MAIN apiUrl (HF backend) for transcription, NOT audioApiUrl
      fd.append('isBatchMode', 'true');
      const transRes = await fetch(`${apiUrl}/api/transcribe`, {
        method: 'POST',
        body: fd
      });

      if (!transRes.ok) {
        const errDetail = await transRes.json().catch(() => ({ detail: 'فشل التفريغ' }));
        throw new Error(`فشل تفريغ المقطع #${sIdx + 1}: ${errDetail.detail || transRes.status}`);
      }

      const transData = await transRes.json();

      // 4. Render video using MAIN apiUrl
      if (batchBtn) {
        batchBtn.innerHTML = `<span>🎬</span> جاري رندرة الكابشن على المقطع ${i + 1} من ${indices.length}...`;
      }
      const renderPayload = {
        audioPath: transData.audioPath,
        videoPath: transData.videoPath,
        durationInSeconds: transData.durationInSeconds,
        segments: transData.segments,
        animationType: typeof selectedAnimation !== 'undefined' ? selectedAnimation : 'classic',
        activeColor: document.getElementById('active-color') ? document.getElementById('active-color').value : '#FFFFFF',
        inactiveColor: document.getElementById('inactive-color') ? document.getElementById('inactive-color').value : '#FFFFFF',
        leftLogo: window.leftLogoBase64Global || transData.leftLogo || null,
        rightLogo: window.rightLogoBase64Global || transData.rightLogo || null,
        fontSize: document.getElementById('font-size') ? parseInt(document.getElementById('font-size').value) : 50,
        bgColor: document.getElementById('bg-color') ? document.getElementById('bg-color').value : '#000000',
        bgOpacity: document.getElementById('bg-opacity') ? parseFloat(document.getElementById('bg-opacity').value) : 86,
        syncOffset: Math.max(0, (document.getElementById('sync-offset') ? parseFloat(document.getElementById('sync-offset').value) : 0.20) - 0.15),
        wordSpacing: document.getElementById('word-spacing') ? parseInt(document.getElementById('word-spacing').value) : 31,
        bgPadding: document.getElementById('bg-padding') ? parseInt(document.getElementById('bg-padding').value) : 8,
        showBg: document.getElementById('show-bg') ? !document.getElementById('show-bg').checked : true,
        captionTop: typeof captionTop !== 'undefined' ? captionTop : 65,
        fontFamily: document.getElementById('font-family-select') ? document.getElementById('font-family-select').value : 'thmanyah',
        customFontName: (document.getElementById('font-family-select') && document.getElementById('font-family-select').value === 'custom') ? customFontName : null,
        customFontBase64: (document.getElementById('font-family-select') && document.getElementById('font-family-select').value === 'custom') ? customFontDataUrl : null,
        strokeColor: document.getElementById('stroke-color') ? document.getElementById('stroke-color').value : '#000000',
        strokeWidth: document.getElementById('stroke-width') ? parseInt(document.getElementById('stroke-width').value) : 0,
        shadowColor: document.getElementById('shadow-color') ? document.getElementById('shadow-color').value : '#000000',
        shadowBlur: document.getElementById('shadow-blur') ? parseInt(document.getElementById('shadow-blur').value) : 0,
        showTitle: true,
        titleText: short.title ? short.title.trim() : '',
        titleSubtext: '',
        titleColor: document.getElementById('title-color-input') ? document.getElementById('title-color-input').value : '#FFFFFF',
        titleBgColor: document.getElementById('title-bg-color-input') ? document.getElementById('title-bg-color-input').value : '#000000',
        titleDuration: 0, // Force 0 (infinite) for Batch mode so sentences don't disappear
        titleTop: document.getElementById('title-top-input') ? parseFloat(document.getElementById('title-top-input').value) : 20.0,
        titleStyle: document.getElementById('title-style-select') ? document.getElementById('title-style-select').value : 'tiktok-pill'
      };

      const renderRes = await fetch(`${apiUrl}/api/render/${transData.taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renderPayload)
      });

      if (!renderRes.ok) {
        const errDetail = await renderRes.json().catch(() => ({ detail: 'فشل الرندر' }));
        throw new Error(`فشل رندرة المقطع #${sIdx + 1}: ${errDetail.detail || renderRes.status}`);
      }

      const finalVideoBlob = await renderRes.blob();
      const finalUrl = URL.createObjectURL(finalVideoBlob);

      // 5. Save automatically to 48h Archive!
      if (typeof saveHistoryEntry === 'function') {
        await saveHistoryEntry({
          title: `🎬 ${short.title} (${short.start_time} - ${short.end_time})`,
          videoUrl: finalUrl,
          blob: finalVideoBlob
        });
      }

      successCount++;
    } catch (err) {
      console.error(`Batch processing error for item ${sIdx}:`, err);
      alert(`⚠️ خطأ في معالجة المقطع #${sIdx + 1} (${short.title.substring(0,20)}...):\n${err.message}\n\nسيتم الانتقال للمقطع التالي.`);
    }
  }

  if (batchBtn) {
    batchBtn.disabled = false;
    batchBtn.style.opacity = '1';
    batchBtn.innerHTML = originalBtnHtml;
  }

  alert(`🎉 اكتملت المعالجة الجماعية بنجاح!\nتم توليد وحفظ ${successCount} فيديو في "أرشيف الفيديوهات (48h)".`);
  
  // Open 48h archive modal to let user view/download rendered videos
  if (typeof openHistoryModal === 'function') {
    openHistoryModal();
  }
};


window.cutVideoSegment = async function(youtubeUrl, startTime, endTime, idx, btn) {
  if (!youtubeUrl) {
    alert("رابط اليوتيوب غير متوفر لقص المقطع!");
    return;
  }

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.style.pointerEvents = 'none';
  btn.innerHTML = '<span>⏳</span> جاري القص...';

  try {
    const blob = await performAsyncCut(youtubeUrl, startTime, endTime, 720, (progText) => {
      btn.innerHTML = `<span>⏳</span> ${progText}`;
    });

    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `short_clip_${idx}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
    
    alert(`تم تحميل مقطع الـ Shorts المقصوص #${idx} بنجاح! 🎉`);
  } catch (err) {
    console.error(err);
    alert('حدث خطأ أثناء قص المقطع: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.innerHTML = originalHtml;
  }
};

// ==================== 48-Hour Captioned Video History Manager (IndexedDB Persistent) ====================
const HISTORY_STORAGE_KEY = 'rekaption_video_history_v1';
const EXPIRE_DURATION_MS = 48 * 60 * 60 * 1000; // 48 Hours
const ARCHIVE_DB_NAME = 'ReKaptionArchiveDB_v1';
const ARCHIVE_STORE = 'video_blobs';

function openArchiveDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ARCHIVE_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ARCHIVE_STORE)) {
        db.createObjectStore(ARCHIVE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveVideoBlobToIDB(id, blob) {
  try {
    const db = await openArchiveDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ARCHIVE_STORE, 'readwrite');
      const store = tx.objectStore(ARCHIVE_STORE);
      store.put({ id: id, blob: blob });
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn("IDB save error:", e);
  }
}

async function getVideoBlobFromIDB(id) {
  try {
    const db = await openArchiveDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ARCHIVE_STORE, 'readonly');
      const store = tx.objectStore(ARCHIVE_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn("IDB get error:", e);
    return null;
  }
}

async function deleteVideoBlobFromIDB(id) {
  try {
    const db = await openArchiveDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ARCHIVE_STORE, 'readwrite');
      const store = tx.objectStore(ARCHIVE_STORE);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn("IDB delete error:", e);
  }
}

window.getHistoryEntries = function() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw);
    const now = Date.now();
    const validEntries = entries.filter(item => now < item.expiryTime);
    if (validEntries.length !== entries.length) {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(validEntries));
    }
    return validEntries;
  } catch (e) {
    console.warn("Error reading history storage:", e);
    return [];
  }
};

window.saveHistoryEntry = async function(entry) {
  try {
    const id = entry.id || ('vid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
    
    if (entry.blob) {
      await saveVideoBlobToIDB(id, entry.blob);
    }
    
    const entries = getHistoryEntries();
    const now = Date.now();
    const newEntry = {
      id: id,
      title: entry.title || 'فيديو كابشن مجهز',
      serverUrl: entry.serverUrl || '',
      timestamp: now,
      expiryTime: now + EXPIRE_DURATION_MS,
      duration: entry.duration || ''
    };
    entries.unshift(newEntry);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
    updateHistoryBadge();
    renderHistoryModal();
    return newEntry;
  } catch (e) {
    console.warn("Error saving history entry:", e);
  }
};

window.deleteHistoryEntry = async function(id) {
  try {
    let entries = getHistoryEntries();
    entries = entries.filter(item => item.id !== id);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
    await deleteVideoBlobFromIDB(id);
    updateHistoryBadge();
    renderHistoryModal();
  } catch (e) {
    console.warn("Error deleting history entry:", e);
  }
};

window.clearExpiredHistoryEntries = function() {
  getHistoryEntries();
  updateHistoryBadge();
  renderHistoryModal();
  alert("تم تنظيف الأرشيف وتحديث الفيديوهات الصالحة بنجاح! 🧹");
};

window.updateHistoryBadge = function() {
  const badge = document.getElementById('history-badge');
  if (badge) {
    const entries = getHistoryEntries();
    badge.textContent = entries.length;
  }
};

function formatCountdown(expiryTime) {
  const diffMs = expiryTime - Date.now();
  if (diffMs <= 0) return "منتهي الصلاحية";
  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  return `⏳ متبقي ${hours} ساعة و ${mins} دقيقة`;
}

window.renderHistoryModal = async function() {
  const grid = document.getElementById('history-cards-grid');
  const emptyView = document.getElementById('history-empty-view');
  if (!grid) return;

  const entries = getHistoryEntries();
  if (!entries || entries.length === 0) {
    grid.innerHTML = '';
    if (emptyView) emptyView.classList.remove('hidden');
    return;
  }

  if (emptyView) emptyView.classList.add('hidden');

  // Render initial card frames
  grid.innerHTML = entries.map(item => `
    <div id="hist-card-${item.id}" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(139, 92, 246, 0.25); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px; position: relative;">
      <div class="video-container" style="width: 100%; height: 210px; border-radius: 10px; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; position: relative;">
        <div class="spinner" style="width: 24px; height: 24px; border-left-color: #8b5cf6;"></div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <h4 style="font-size: 14px; font-weight: 800; color: #fff; margin: 0; line-height: 1.4;">${item.title}</h4>
        <span style="font-size: 11px; color: #a78bfa; font-weight: 600;">${formatCountdown(item.expiryTime)}</span>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <button disabled class="btn-primary" style="flex: 1; padding: 8px; justify-content: center; font-size: 12px; opacity: 0.5;">
          <span>📥</span> تنزيل
        </button>
        <button onclick="deleteHistoryEntry('${item.id}')" class="btn-secondary" style="padding: 8px 12px; font-size: 12px; color: #f87171; border-color: rgba(248, 113, 113, 0.3); cursor: pointer;">
          <span>🗑️</span>
        </button>
      </div>
    </div>
  `).join('');

  // Retrieve Blobs asynchronously from IndexedDB and bind active URLs
  for (const item of entries) {
    const cardEl = document.getElementById(`hist-card-${item.id}`);
    if (!cardEl) continue;

    let activeUrl = item.serverUrl || '';
    const storedBlob = await getVideoBlobFromIDB(item.id);

    if (storedBlob) {
      activeUrl = URL.createObjectURL(storedBlob);
    }

    if (!activeUrl) {
      cardEl.querySelector('.video-container').innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 6px; color: #f87171; font-size: 12px;">
          <span>⚠️ الملف انتهت صلاحيته أو غير متوفر</span>
        </div>
      `;
      continue;
    }

    const safeTitle = item.title.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');

    cardEl.innerHTML = `
      <div style="width: 100%; border-radius: 10px; overflow: hidden; background: #000; position: relative;">
        <video src="${activeUrl}" controls style="width: 100%; height: 210px; object-fit: contain; display: block;"></video>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <h4 style="font-size: 14px; font-weight: 800; color: #fff; margin: 0; line-height: 1.4;">${item.title}</h4>
        <span style="font-size: 11px; color: #a78bfa; font-weight: 600;">${formatCountdown(item.expiryTime)}</span>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <a href="${activeUrl}" download="${safeTitle}.mp4" class="btn-primary" style="flex: 1; padding: 8px; justify-content: center; font-size: 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
          <span>📥</span> تنزيل
        </a>
        <button onclick="deleteHistoryEntry('${item.id}')" class="btn-secondary" style="padding: 8px 12px; font-size: 12px; color: #f87171; border-color: rgba(248, 113, 113, 0.3); cursor: pointer;">
          <span>🗑️</span>
        </button>
      </div>
    `;
  }
};

// Initialize history badge on page load
document.addEventListener('DOMContentLoaded', () => {
  updateHistoryBadge();
});

// ==================== Batch Caption Processing Queue ====================
let currentSuggestedShorts = [];
let selectedShortsIndices = new Set();

window.toggleShortSelection = function(index, isChecked) {
  if (isChecked) {
    selectedShortsIndices.add(index);
  } else {
    selectedShortsIndices.delete(index);
  }
  updateBatchToolbar();
};

window.toggleSelectAllShorts = function(isChecked) {
  selectedShortsIndices.clear();
  if (isChecked && currentSuggestedShorts.length > 0) {
    currentSuggestedShorts.forEach((_, idx) => selectedShortsIndices.add(idx));
  }
  
  document.querySelectorAll('.short-card-chk').forEach(chk => {
    chk.checked = isChecked;
  });
  
  updateBatchToolbar();
};

function updateBatchToolbar() {
  const btn = document.getElementById('batch-caption-btn');
  const badge = document.getElementById('batch-selected-count-badge');
  const count = selectedShortsIndices.size;
  
  if (badge) badge.textContent = `(${count})`;
  if (btn) {
    if (count > 0) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    } else {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    }
  }
}

window.startBatchCaptionProcess = async function() {
  if (selectedShortsIndices.size === 0) {
    alert("يرجى تحديد مقطع شورت واحد على الأقل للمعالجة الدُفعية!");
    return;
  }

  const youtubeUrl = document.getElementById('gemini-yt-url').value.trim();
  if (!youtubeUrl) {
    alert("رابط اليوتيوب الأصلي غير متوفر!");
    return;
  }

  pendingBatchProcess = true;
  pendingBatchArgs = { youtubeUrl };

  // Set up modal inputs to reflect current settings
  const modalSelect = document.getElementById('modal-caption-engine-select');
  const modalElInput = document.getElementById('modal-elevenlabs-key-input');
  
  const currentEngine = localStorage.getItem('caption_engine') || 'v1';
  const currentElKey = localStorage.getItem('elevenlabs_api_key') || '';
  
  if (modalSelect) modalSelect.value = currentEngine;
  if (modalElInput) modalElInput.value = currentElKey;

  selectShortOption('vertical');

  if (typeof window.toggleModalEngineFields === 'function') {
    window.toggleModalEngineFields();
  }

  if (typeof window.populateModalTemplates === 'function') window.populateModalTemplates();
  const modal = document.getElementById('short-options-modal');
  if (modal) modal.style.display = 'flex';
};

async function executeBatchCaptionProcess(youtubeUrl, convertChoice) {
  const indicesToProcess = Array.from(selectedShortsIndices).sort((a, b) => a - b);
  const total = indicesToProcess.length;

  const modal = document.getElementById('batch-progress-modal');
  const modalStep = document.getElementById('batch-modal-step');
  const modalBarFill = document.getElementById('batch-modal-bar-fill');
  const modalStatusDesc = document.getElementById('batch-modal-status-desc');

  if (modal) modal.style.display = 'flex';

  let successCount = 0;

  for (let i = 0; i < total; i++) {
    const idx = indicesToProcess[i];
    const shortItem = currentSuggestedShorts[idx];
    if (!shortItem) continue;

    const currentNum = i + 1;
    const percent = Math.round((currentNum / total) * 100);

    if (modalStep) modalStep.textContent = `المقطع ${currentNum} من ${total}`;
    if (modalBarFill) modalBarFill.style.width = `${percent}%`;
    if (modalStatusDesc) modalStatusDesc.textContent = `جارٍ قص المقطع #${idx+1} (${shortItem.title}) وتحليله بالذكاء الاصطناعي...`;

    try {
      // 1. Perform Async Cut
      let blob = await performAsyncCut(youtubeUrl, shortItem.start_time, shortItem.end_time, 720, (progMsg) => {
        if (modalStatusDesc) modalStatusDesc.textContent = `المقطع #${idx+1}: ${progMsg}`;
      });

      // 2. Perform Vertical Conversion if selected
      if (convertChoice === 'vertical') {
        if (modalStatusDesc) modalStatusDesc.textContent = `المقطع #${idx+1}: جارٍ التحويل إلى طولي (9:16)...`;
        const fd = new FormData();
        const rawFile = new File([blob], `short_${idx+1}.mp4`, { type: 'video/mp4' });
        fd.append('file', rawFile);

        const convRes = await fetch(audioApiUrl + '/api/convert-vertical-async', {
          method: 'POST',
          body: fd
        });

        if (convRes.ok) {
          const convTaskData = await convRes.json();
          const convTaskId = convTaskData.taskId;

          let pollInterval = null;
          const pollPromise = new Promise((resolve, reject) => {
            pollInterval = setInterval(async () => {
              try {
                const statusRes = await fetch(`${audioApiUrl}/api/task-status/${convTaskId}`);
                if (!statusRes.ok) {
                  clearInterval(pollInterval);
                  reject(new Error('فشل متابعة حالة التحويل للطولي'));
                  return;
                }
                const task = await statusRes.json();
                if (task.status === 'success') {
                  clearInterval(pollInterval);
                  resolve(task);
                } else if (task.status === 'failed') {
                  clearInterval(pollInterval);
                  reject(new Error(task.error || 'فشلت عملية التحويل للطولي'));
                }
              } catch (err) {
                clearInterval(pollInterval);
                reject(err);
              }
            }, 2000);
          });

          const vertTaskRes = await pollPromise;
          const vertUrl = vertTaskRes.videoUrl.startsWith('http') ? vertTaskRes.videoUrl : (audioApiUrl + '/' + vertTaskRes.videoUrl);
          const vertFileRes = await fetch(vertUrl);
          if (vertFileRes.ok) {
            blob = await vertFileRes.blob();
          }
        }
      }

      // 3. AI Speech Transcription & Word Timestamp Alignment
      if (modalStatusDesc) modalStatusDesc.textContent = `المقطع #${idx+1}: جارٍ التفريغ والتوقيت بالذكاء الاصطناعي...`;

      const audioFile = new File([blob], `batch_clip_${idx+1}.mp4`, { type: 'video/mp4' });
      const transFd = new FormData();
      transFd.append('audio', audioFile);
      transFd.append('minWords', document.getElementById('min-words') ? document.getElementById('min-words').value : '2');
      transFd.append('maxWords', document.getElementById('max-words') ? document.getElementById('max-words').value : '5');
      transFd.append('animation', typeof selectedAnimation !== 'undefined' ? selectedAnimation : 'classic');
      transFd.append('activeColor', document.getElementById('active-color') ? document.getElementById('active-color').value : '#FFFFFF');
      transFd.append('inactiveColor', document.getElementById('inactive-color') ? document.getElementById('inactive-color').value : '#FFFFFF');
      
      const groqKey = localStorage.getItem('groq_api_key') || '';
      const geminiKey = localStorage.getItem('gemini_api_key') || localStorage.getItem('geminiApiKey') || '';
      const openrouterKey = localStorage.getItem('openrouterApiKey') || localStorage.getItem('openrouterKey') || '';
      if (groqKey) transFd.append('groqApiKey', groqKey);
      if (geminiKey) transFd.append('geminiApiKey', geminiKey);
      if (openrouterKey) transFd.append('openrouterKey', openrouterKey);

      const engineSelect = document.getElementById('caption-engine-select');
      const engineVal = engineSelect ? engineSelect.value : 'v1';
      transFd.append('captionEngine', engineVal);

      const elKey = localStorage.getItem('elevenlabs_api_key') || '';
      if (elKey) transFd.append('elevenLabsApiKey', elKey);
      transFd.append('isBatchMode', 'true');

      const transRes = await fetch(`${apiUrl}/api/transcribe`, {
        method: 'POST',
        body: transFd
      });

      if (!transRes.ok) {
        const errJson = await transRes.json().catch(() => ({ detail: 'فشل تفريغ الكابشن' }));
        throw new Error(`فشل تفريغ المقطع #${idx+1}: ${errJson.detail || transRes.status}`);
      }

      const transData = await transRes.json();

      // 4. Burn-in Remotion Captions onto Video
      if (modalStatusDesc) modalStatusDesc.textContent = `المقطع #${idx+1}: جارٍ طباعة ورندر الكابشن النهائي...`;

      const renderPayload = {
        audioPath: transData.audioPath,
        videoPath: transData.videoPath,
        durationInSeconds: transData.durationInSeconds,
        segments: transData.segments,
        animationType: typeof selectedAnimation !== 'undefined' ? selectedAnimation : 'classic',
        activeColor: document.getElementById('active-color') ? document.getElementById('active-color').value : '#FFFFFF',
        inactiveColor: document.getElementById('inactive-color') ? document.getElementById('inactive-color').value : '#FFFFFF',
        leftLogo: window.leftLogoBase64Global || transData.leftLogo || null,
        rightLogo: window.rightLogoBase64Global || transData.rightLogo || null,
        fontSize: document.getElementById('font-size') ? parseInt(document.getElementById('font-size').value) : 50,
        bgColor: document.getElementById('bg-color') ? document.getElementById('bg-color').value : '#000000',
        bgOpacity: document.getElementById('bg-opacity') ? parseFloat(document.getElementById('bg-opacity').value) : 86,
        syncOffset: Math.max(0, (document.getElementById('sync-offset') ? parseFloat(document.getElementById('sync-offset').value) : 0.20) - 0.15),
        wordSpacing: document.getElementById('word-spacing') ? parseInt(document.getElementById('word-spacing').value) : 31,
        bgPadding: document.getElementById('bg-padding') ? parseInt(document.getElementById('bg-padding').value) : 8,
        showBg: document.getElementById('show-bg') ? !document.getElementById('show-bg').checked : true,
        captionTop: typeof captionTop !== 'undefined' ? captionTop : 65,
        fontFamily: document.getElementById('font-family-select') ? document.getElementById('font-family-select').value : 'thmanyah',
        customFontName: (document.getElementById('font-family-select') && document.getElementById('font-family-select').value === 'custom') ? customFontName : null,
        customFontBase64: (document.getElementById('font-family-select') && document.getElementById('font-family-select').value === 'custom') ? customFontDataUrl : null,
        strokeColor: document.getElementById('stroke-color') ? document.getElementById('stroke-color').value : '#000000',
        strokeWidth: document.getElementById('stroke-width') ? parseInt(document.getElementById('stroke-width').value) : 0,
        shadowColor: document.getElementById('shadow-color') ? document.getElementById('shadow-color').value : '#000000',
        shadowBlur: document.getElementById('shadow-blur') ? parseInt(document.getElementById('shadow-blur').value) : 0,
        showTitle: document.getElementById('show-title-toggle') ? document.getElementById('show-title-toggle').checked : false,
        titleText: shortItem.title,
        titleColor: document.getElementById('title-color-input') ? document.getElementById('title-color-input').value : '#FFFFFF',
        titleBgColor: document.getElementById('title-bg-color-input') ? document.getElementById('title-bg-color-input').value : '#000000',
        titleDuration: document.getElementById('title-duration-input') ? parseFloat(document.getElementById('title-duration-input').value) : 3.0,
        titleTop: document.getElementById('title-top-input') ? parseFloat(document.getElementById('title-top-input').value) : 20.0,
        titleStyle: document.getElementById('title-style-select') ? document.getElementById('title-style-select').value : 'tiktok-pill'
      };

      const renderRes = await fetch(`${apiUrl}/api/render/${transData.taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renderPayload)
      });

      if (!renderRes.ok) {
        const errJson = await renderRes.json().catch(() => ({ detail: 'فشل رندر الكابشن' }));
        throw new Error(`فشل رندر المقطع #${idx+1}: ${errJson.detail || renderRes.status}`);
      }

      const finalCaptionedBlob = await renderRes.blob();
      const clipUrl = URL.createObjectURL(finalCaptionedBlob);

      // 5. Save CAPTIONED video clip to 48-hour history archive (Persistent IndexedDB)
      await saveHistoryEntry({
        title: `🎬 مقطع Shorts #${idx+1}: ${shortItem.title}`,
        videoUrl: clipUrl,
        blob: finalCaptionedBlob
      });

      successCount++;
    } catch (err) {
      console.error(`Error processing batch short #${idx+1}:`, err);
      alert(`⚠️ خطأ في معالجة المقطع #${idx+1} (${shortItem.title.substring(0,20)}...):\n${err.message}\n\nسيتم الاستمرار في باقي المقاطع.`);
    }
  }

  if (modal) modal.style.display = 'none';

  alert(`🎉 اكتملت المعالجة الجماعية بنجاح! تم توليد وحفظ ${successCount} من أصل ${total} مقاطع بالكابشن النهائي في أرشيف الـ 48 ساعة.`);

  // Switch to History Tab to let user preview & download all!
  if (typeof switchMainTab === 'function') {
    switchMainTab('history');
  }
};

// ==================== Cohere ASR Logic ====================
let cohereSelectedFile = null;

window.handleCohereFileSelect = function(file) {
  if (!file) return;
  cohereSelectedFile = file;
  const label = document.getElementById('cohere-file-label');
  if (label) {
    label.textContent = `تم اختيار: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    label.style.color = '#a855f7';
  }
};

window.runCohereTranscription = async function() {
  if (!cohereSelectedFile) {
    alert('الرجاء اختيار أو رفع ملف صوتي أولاً!');
    return;
  }

  const tokenInput = document.getElementById('cohere-hf-token');
  const hfToken = tokenInput ? tokenInput.value.trim() : (localStorage.getItem('cohereHfToken') || '');

  const btn = document.getElementById('cohere-transcribe-btn');
  const outputText = document.getElementById('cohere-output-text');
  const origHtml = btn.innerHTML;

  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.innerHTML = '<span>⏳</span> جاري رفع الصوت واستخراج النص بنموذج Cohere...';
  outputText.value = 'جاري تفريغ الصوت بنواة Cohere (CohereLabs/cohere-transcribe-arabic-07-2026)... يرجى الانتظار لحظات...';

  try {
    const fd = new FormData();
    fd.append('audio', cohereSelectedFile);
    if (hfToken) {
      fd.append('hf_token', hfToken);
    }

    const res = await fetch(`${apiUrl}/api/transcribe-cohere`, {
      method: 'POST',
      body: fd
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`فشل الاتصال بـ API التفريغ (Status ${res.status}: ${errText})`);
    }

    const data = await res.json();
    outputText.value = data.text || 'تم الانتهاء ولم يتم إرجاع نص.';
    alert('✨ تم استخراج النص بنجاح باستخدام نموذج Cohere!');
  } catch (err) {
    console.error(err);
    outputText.value = 'حدث خطأ أثناء الاتصال بنموذج Cohere: ' + err.message;
    alert('حدث خطأ أثناء التفريغ: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.innerHTML = origHtml;
  }
};

// Initialize saved HF token on load
document.addEventListener('DOMContentLoaded', () => {
  const savedToken = localStorage.getItem('cohereHfToken');
  const tokenInput = document.getElementById('cohere-hf-token');
  if (savedToken && tokenInput) {
    tokenInput.value = savedToken;
  }
});

function fileToBase64DataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

window.copyCohereText = function() {
  const textarea = document.getElementById('cohere-output-text');
  if (!textarea || !textarea.value) {
    alert('لا يوجد نص لنسخه!');
    return;
  }
  textarea.select();
  document.execCommand('copy');
  alert('📋 تم نسخ النص بنجاح إلى الحافظة!');
};

window.openComparisonModal = function() {
  if (!transcribeData) {
    alert('لا توجد بيانات تفريغ متاحة حالياً للمقارنة.');
    return;
  }
  const modal = document.getElementById('comparison-modal');
  const origBox = document.getElementById('comparison-original-text');
  const txtOnlyBox = document.getElementById('comparison-textonly-text');
  const corrBox = document.getElementById('comparison-corrected-text');
  if (origBox) origBox.textContent = transcribeData.originalText || 'غير متوفر';
  if (txtOnlyBox) txtOnlyBox.textContent = transcribeData.textOnlyText || 'غير متوفر';
  if (corrBox) corrBox.textContent = transcribeData.audioCorrectedText || (transcribeData.segments || []).map(s => s.text).join('\n');
  if (modal) modal.style.display = 'flex';
};


window.closeComparisonModal = function() {
  const modal = document.getElementById('comparison-modal');
  if (modal) modal.style.display = 'none';
};

// ==================== نظام القوالب — الدوال الأساسية ====================
const TEMPLATES_KEY = 'rekaption_templates_v2';
let _pickerCallback = null;

function getTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]'); }
  catch { return []; }
}
function saveTemplates(arr) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(arr));
}

function collectCurrentSettings() {
  const g = id => document.getElementById(id);
  const val = (id, fb) => { const el=g(id); return el ? el.value : fb; };
  const num = (id, fb) => { const el=g(id); return el ? parseFloat(el.value) : fb; };
  const int = (id, fb) => { const el=g(id); return el ? parseInt(el.value) : fb; };
  const chk = (id, fb) => { const el=g(id); return el ? el.checked : fb; };
  return {
    animationType  : typeof selectedAnimation !== 'undefined' ? selectedAnimation : 'classic',
    activeColor    : val('active-color', '#FFFFFF'),
    inactiveColor  : val('inactive-color', '#FFFFFF'),
    bgColor        : val('bg-color', '#000000'),
    bgOpacity      : num('bg-opacity', 86),
    fontSize       : int('font-size', 50),
    syncOffset     : num('sync-offset', 0.20),
    wordSpacing    : int('word-spacing', 31),
    bgPadding      : int('bg-padding', 8),
    showBg         : chk('show-bg', false),
    captionTop     : typeof captionTop !== 'undefined' ? captionTop : 65,
    fontFamily     : val('font-family-select', 'thmanyah'),
    customFontName : typeof customFontName !== 'undefined' ? customFontName : null,
    customFontBase64: typeof customFontDataUrl !== 'undefined' ? customFontDataUrl : null,
    strokeColor    : val('stroke-color', '#000000'),
    strokeWidth    : int('stroke-width', 0),
    shadowColor    : val('shadow-color', '#000000'),
    shadowBlur     : int('shadow-blur', 0),
    showTitle      : chk('show-title-toggle', true),
    titleColor     : val('title-color-input', '#FFFFFF'),
    titleBgColor   : val('title-bg-color-input', '#000000'),
    titleDuration  : num('title-duration-input', 3.0),
    titleTop       : num('title-top-input', 12),
    titleStyle     : val('title-style-select', 'tiktok-pill'),
    leftLogoBase64 : typeof leftLogoBase64Global  !== 'undefined' ? leftLogoBase64Global  : null,
    rightLogoBase64: typeof rightLogoBase64Global !== 'undefined' ? rightLogoBase64Global : null,
  };
}

// دالة مساعدة لتغيير الارتفاع الافتراضي تلقائياً عند تغيير ستايل العنوان
window.onTitleStyleChange = function(style) {
  const titleTopInput = document.getElementById('title-top-input');
  const titleTopVal = document.getElementById('title-top-val');
  if (titleTopInput) {
    const targetVal = style === 'centered-rect' ? 42 : 12;
    titleTopInput.value = targetVal;
    if (titleTopVal) titleTopVal.textContent = targetVal;
    titleTopInput.dispatchEvent(new Event('input'));
  }
};

function applySettingsToDOM(s) {
  const g   = id => document.getElementById(id);
  const set = (id, v) => { const el=g(id); if(el){ el.value=v; el.dispatchEvent(new Event('input')); } };
  const setChk = (id, v) => { const el=g(id); if(el){ el.checked=v; el.dispatchEvent(new Event('change')); } };
  const setHex = (id, v) => { const el=g(id); if(el) el.textContent=String(v).toUpperCase(); };

  if (s.animationType !== undefined) {
    selectedAnimation = s.animationType;
    document.querySelectorAll('.anim-card, .upload-anim-card').forEach(c => {
      if (c.dataset.anim === selectedAnimation) {
        c.classList.add('selected');
      } else {
        c.classList.remove('selected');
      }
    });
  }
  if (s.activeColor)   { set('active-color',   s.activeColor);   setHex('active-color-hex',   s.activeColor); }
  if (s.inactiveColor) { set('inactive-color', s.inactiveColor); setHex('inactive-color-hex', s.inactiveColor); }
  if (s.bgColor)       { set('bg-color',       s.bgColor);       setHex('bg-color-hex',       s.bgColor); }
  if (s.strokeColor)   { set('stroke-color',   s.strokeColor);   setHex('stroke-color-hex',   s.strokeColor); }
  if (s.shadowColor)   { set('shadow-color',   s.shadowColor);   setHex('shadow-color-hex',   s.shadowColor); }
  if (s.bgOpacity   !== undefined) set('bg-opacity',   s.bgOpacity);
  if (s.fontSize    !== undefined) set('font-size',    s.fontSize);
  if (s.syncOffset  !== undefined) set('sync-offset',  s.syncOffset);
  if (s.wordSpacing !== undefined) set('word-spacing', s.wordSpacing);
  if (s.bgPadding   !== undefined) set('bg-padding',   s.bgPadding);
  if (s.strokeWidth !== undefined) set('stroke-width', s.strokeWidth);
  if (s.shadowBlur  !== undefined) set('shadow-blur',  s.shadowBlur);
  if (s.showBg      !== undefined) setChk('show-bg', s.showBg);
  if (s.captionTop !== undefined) {
    captionTop = s.captionTop;
    const ctv=g('caption-top-val'); if(ctv) ctv.textContent=s.captionTop;
    const cts=g('caption-top');     if(cts) cts.value=s.captionTop;
  }

  // الخط المخصص
  if (s.customFontName !== undefined) window.customFontName = s.customFontName;
  if (s.customFontBase64 !== undefined) {
    window.customFontDataUrl = s.customFontBase64;
    if (s.customFontBase64 && s.customFontName) {
      const cleanFontName = s.customFontName.replace(/[^a-zA-Z0-9]/g, '');
      const fontFace = new FontFace(cleanFontName, `url(${s.customFontBase64})`);
      fontFace.load().then(loadedFace => {
        document.fonts.add(loadedFace);
      }).catch(err => console.error("Error loading custom font from template:", err));
    }
  }

  if (s.fontFamily) { const ff=g('font-family-select'); if(ff){ ff.value=s.fontFamily; ff.dispatchEvent(new Event('change')); } }
  const showT = s.showTitle !== undefined ? s.showTitle : true;
  setChk('show-title-toggle', showT);
  if (typeof toggleTitleFields === 'function') toggleTitleFields(showT);
  if (s.titleColor)   { set('title-color-input',    s.titleColor);   setHex('title-color-hex', s.titleColor); }
  if (s.titleBgColor) { set('title-bg-color-input', s.titleBgColor); setHex('title-bg-hex',    s.titleBgColor); }
  if (s.titleDuration !== undefined) set('title-duration-input', s.titleDuration);
  if (s.titleTop      !== undefined) set('title-top-input',      s.titleTop);
  if (s.titleStyle)   { set('title-style-select',   s.titleStyle); }

  // تحديث لوجو أعلى اليمين واليسار في الواجهة (DOM Preview)
  if (s.leftLogoBase64 !== undefined) {
    window.leftLogoBase64Global = s.leftLogoBase64;
    const leftLogoContent = g('left-logo-content');
    if (leftLogoContent) {
      if (s.leftLogoBase64) {
        leftLogoContent.innerHTML = `
          <img src="${s.leftLogoBase64}" class="preview-thumbnail" alt="left logo preview" />
          <button type="button" class="clear-btn" onclick="event.stopPropagation(); clearLogo('left')">&times;</button>
        `;
      } else {
        leftLogoContent.innerHTML = `
          <span class="file-box-icon">🖼️</span>
          <span class="file-box-text">شعار أعلى اليسار</span>
        `;
      }
    }
  }
  if (s.rightLogoBase64 !== undefined) {
    window.rightLogoBase64Global = s.rightLogoBase64;
    const rightLogoContent = g('right-logo-content');
    if (rightLogoContent) {
      if (s.rightLogoBase64) {
        rightLogoContent.innerHTML = `
          <img src="${s.rightLogoBase64}" class="preview-thumbnail" alt="right logo preview" />
          <button type="button" class="clear-btn" onclick="event.stopPropagation(); clearLogo('right')">&times;</button>
        `;
      } else {
        rightLogoContent.innerHTML = `
          <span class="file-box-icon">🖼️</span>
          <span class="file-box-text">شعار أعلى اليمين</span>
        `;
      }
    }
  }

  // مزامنة المدخلات المزدوجة
  [['upload-active-color','active-color'],['upload-inactive-color','inactive-color'],
   ['upload-bg-color','bg-color'],['upload-stroke-color','stroke-color'],
   ['upload-shadow-color','shadow-color'],['upload-font-size','font-size'],
   ['upload-bg-opacity','bg-opacity'],['upload-sync-offset','sync-offset'],
   ['upload-word-spacing','word-spacing'],['upload-bg-padding','bg-padding'],
   ['upload-stroke-width','stroke-width'],['upload-shadow-blur','shadow-blur']
  ].forEach(([u,e]) => { const eu=g(u),ee=g(e); if(eu&&ee) eu.value=ee.value; });
  if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(0);
}

window.renderTemplateList = function() {
  const container = document.getElementById('template-list-container');
  const emptyMsg  = document.getElementById('template-empty-msg');
  if (!container) return;
  const templates = getTemplates();
  if (templates.length === 0) { if(emptyMsg) emptyMsg.style.display='block'; return; }
  if (emptyMsg) emptyMsg.style.display = 'none';
  Array.from(container.children).forEach(c => { if(c !== emptyMsg) c.remove(); });
  templates.forEach(t => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 10px;';
    row.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:700;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">${new Date(t.id).toLocaleDateString('ar-EG')}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;align-items:center;">
        <div style="display:flex;gap:3px;margin-left:4px;">
          <div style="width:13px;height:13px;border-radius:50%;background:${t.settings.activeColor||'#fff'};border:1px solid rgba(255,255,255,0.3);"></div>
          <div style="width:13px;height:13px;border-radius:50%;background:${t.settings.bgColor||'#000'};border:1px solid rgba(255,255,255,0.3);"></div>
          <div style="width:13px;height:13px;border-radius:50%;background:${t.settings.titleBgColor||'#000'};border:1px solid rgba(255,255,255,0.3);"></div>
        </div>
        <button onclick="applyTemplate('${t.id}')" style="background:rgba(139,92,246,0.25);color:#c4b5fd;border:1px solid rgba(139,92,246,0.4);border-radius:7px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">تطبيق</button>
        <button onclick="deleteTemplate('${t.id}')" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:7px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit;">✕</button>
      </div>`;
    container.appendChild(row);
  });
};

// مزامنة القوالب مع Firestore عند تسجيل الدخول
async function syncTemplatesWithFirestore() {
  if (!currentUser || !window.firebaseDb) return;
  try {
    const snapshot = await window.firebaseDb
      .collection('users')
      .doc(currentUser.uid)
      .collection('templates')
      .get();
    
    const dbTemplates = [];
    snapshot.forEach(doc => {
      dbTemplates.push(doc.data());
    });
    
    // ترتيب تنازلي حسب التاريخ (الأحدث أولاً)
    dbTemplates.sort((a, b) => b.id - a.id);
    
    saveTemplates(dbTemplates);
    renderTemplateList();
  } catch (err) {
    console.error("Error syncing templates with Firestore:", err);
  }
}
window.syncTemplatesWithFirestore = syncTemplatesWithFirestore;

window.applyTemplate = function(templateId) {
  const t = getTemplates().find(x => String(x.id) === String(templateId));
  if (!t) { alert('لم يتم العثور على القالب!'); return; }
  applySettingsToDOM(t.settings);
  closeTemplatePickerModal(true);
  showToast('✅ تم تطبيق القالب: ' + t.name);
};

window.deleteTemplate = async function(templateId) {
  if (!confirm('هل تريد حذف هذا القالب؟')) return;
  
  saveTemplates(getTemplates().filter(x => String(x.id) !== String(templateId)));
  
  if (currentUser && window.firebaseDb) {
    try {
      await window.firebaseDb
        .collection('users')
        .doc(currentUser.uid)
        .collection('templates')
        .doc(String(templateId))
        .delete();
    } catch (err) {
      console.error("Failed to delete template from Firestore:", err);
    }
  }
  
  renderTemplateList();
};

window.openSaveTemplateModal = function() {
  const inp = document.getElementById('template-name-input');
  if (inp) inp.value = '';
  const m = document.getElementById('save-template-modal');
  if (m) { m.style.display='flex'; setTimeout(()=>{ if(inp) inp.focus(); },100); }
};

window.closeSaveTemplateModal = function() {
  const m = document.getElementById('save-template-modal');
  if (m) m.style.display = 'none';
};

window.confirmSaveTemplate = async function() {
  const inp = document.getElementById('template-name-input');
  const name = inp ? inp.value.trim() : '';
  if (!name) { alert('يرجى كتابة اسم للقالب!'); return; }
  
  const newTemplate = {
    id: Date.now(),
    name: name,
    settings: collectCurrentSettings()
  };

  const templates = getTemplates();
  templates.unshift(newTemplate);
  if (templates.length > 20) templates.splice(20);
  saveTemplates(templates);
  
  if (currentUser && window.firebaseDb) {
    try {
      await window.firebaseDb
        .collection('users')
        .doc(currentUser.uid)
        .collection('templates')
        .doc(String(newTemplate.id))
        .set(newTemplate);
    } catch (err) {
      console.error("Failed to save template to Firestore:", err);
    }
  }

  closeSaveTemplateModal();
  renderTemplateList();
  showToast('✅ تم حفظ القالب: ' + name);
};

window.openTemplatePickerModal = function(callback) {
  _pickerCallback = callback || null;
  const templates = getTemplates();
  const listEl = document.getElementById('picker-template-list');
  if (!listEl) { if(callback) callback(); return; }
  listEl.innerHTML = '';
  if (templates.length === 0) {
    listEl.innerHTML = '<p style="font-size:12px;color:rgba(255,255,255,0.4);text-align:center;margin:16px 0;">لا توجد قوالب محفوظة — احفظ قالباً أولاً من قسم الإعدادات</p>';
  } else {
    templates.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText = 'width:100%;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:12px 14px;cursor:pointer;color:#fff;font-family:inherit;text-align:right;transition:background 0.15s;';
      btn.onmouseover = () => btn.style.background = 'rgba(139,92,246,0.15)';
      btn.onmouseout  = () => btn.style.background = 'rgba(255,255,255,0.05)';
      btn.innerHTML = `
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <div style="width:18px;height:18px;border-radius:50%;background:${t.settings.activeColor||'#fff'};border:1px solid rgba(255,255,255,0.3);"></div>
          <div style="width:18px;height:18px;border-radius:50%;background:${t.settings.bgColor||'#000'};border:1px solid rgba(255,255,255,0.3);"></div>
          <div style="width:18px;height:18px;border-radius:50%;background:${t.settings.titleBgColor||'#000'};border:1px solid rgba(255,255,255,0.3);"></div>
        </div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;">${t.name}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;">${t.settings.fontFamily||'thmanyah'} • ${t.settings.animationType||'classic'}</div>
        </div>
        <span style="color:#a78bfa;font-size:20px;">✓</span>`;
      btn.onclick = () => { applySettingsToDOM(t.settings); closeTemplatePickerModal(true); showToast('✅ تم تطبيق القالب: '+t.name); };
      listEl.appendChild(btn);
    });
  }
  const m = document.getElementById('template-picker-modal');
  if (m) m.style.display = 'flex';
};

window.closeTemplatePickerModal = function(proceed) {
  const m = document.getElementById('template-picker-modal');
  if (m) m.style.display = 'none';
  if (proceed && _pickerCallback) { _pickerCallback(); _pickerCallback = null; }
};

window.proceedWithCurrentSettings = function() { closeTemplatePickerModal(true); };

window.showToast = function(msg) {
  let toast = document.getElementById('rekaption-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'rekaption-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e1b4b;color:#fff;padding:10px 22px;border-radius:50px;font-size:13px;font-weight:700;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,0.5);border:1px solid rgba(139,92,246,0.4);opacity:0;transition:opacity 0.3s;pointer-events:none;white-space:nowrap;font-family:Cairo,sans-serif;direction:rtl;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
};

// ==================== Admin Backend System Keys Management ====================
async function fetchSystemKeysBackend() {
  if (!adminToken) return;
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/admin/get-system-keys?token=${adminToken}`);
    if (res.ok) {
      const keys = await res.json();
      if (document.getElementById('sys-groq-key')) document.getElementById('sys-groq-key').value = keys.groq || '';
      if (document.getElementById('sys-elevenlabs-key')) document.getElementById('sys-elevenlabs-key').value = keys.elevenlabs || '';
      if (document.getElementById('sys-openrouter-key')) document.getElementById('sys-openrouter-key').value = keys.openrouter || '';
      if (document.getElementById('sys-gemini-key')) document.getElementById('sys-gemini-key').value = keys.gemini || '';
    }
  } catch (err) {
    console.warn("Could not fetch system keys:", err);
  }
}

async function saveSystemKeysBackend() {
  if (!adminToken) {
    alert("يرجى تسجيل الدخول كمدير أولاً");
    return;
  }
  const groq = (document.getElementById('sys-groq-key')?.value || '').trim();
  const el = (document.getElementById('sys-elevenlabs-key')?.value || '').trim();
  const openrouter = (document.getElementById('sys-openrouter-key')?.value || '').trim();
  const gemini = (document.getElementById('sys-gemini-key')?.value || '').trim();

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/admin/save-system-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: adminToken,
        groq_api_key: groq,
        elevenlabs_api_key: el,
        openrouter_api_key: openrouter,
        gemini_api_key: gemini
      })
    });

    if (res.ok) {
      // Also store in localStorage as local cache
      if (groq) localStorage.setItem('groq_api_key', groq);
      if (el) localStorage.setItem('elevenlabs_api_key', el);
      if (openrouter) { localStorage.setItem('openrouterApiKey', openrouter); localStorage.setItem('openrouterKey', openrouter); }
      if (gemini) { localStorage.setItem('gemini_api_key', gemini); localStorage.setItem('geminiApiKey', gemini); }

      showToast('✅ تم حفظ مفاتيح النظام على السيرفر بنجاح لجميع المستخدمين!');
    } else {
      alert("حدث خطأ أثناء حفظ المفاتيح على السيرفر");
    }
  } catch (err) {
    alert("تعذر الاتصال بالسيرفر لحفظ المفاتيح: " + err.message);
  }
}

// تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => { renderTemplateList(); });
