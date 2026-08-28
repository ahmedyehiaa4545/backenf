/**
 * ReKaption - Buffer & Cloudinary Integration Service
 * Enables direct Cloudinary video hosting and TikTok publishing/scheduling via Buffer.
 */

(function() {
  const SETTINGS_KEY = 'rekaption_buffer_cloudinary_settings';
  let currentVideoPayload = null; // { blob, url, title }

  // 1. Storage Helpers
  function getStoredSettings() {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : {
        cloudName: '',
        uploadPreset: '',
        bufferToken: '',
        defaultChannelId: '',
        defaultHashtags: '#fyp #viral #shorts #rekaption'
      };
    } catch(e) {
      return {
        cloudName: '',
        uploadPreset: '',
        bufferToken: '',
        defaultChannelId: '',
        defaultHashtags: '#fyp #viral #shorts #rekaption'
      };
    }
  }

  function saveStoredSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  // 2. Cloudinary Upload Engine
  async function uploadToCloudinary(fileOrBlobOrUrl, cloudName, uploadPreset, onProgress) {
    if (!cloudName || !uploadPreset) {
      throw new Error('يرجى إدخال Cloud Name و Upload Preset الخاص بحساب Cloudinary أولاً في الإعدادات.');
    }

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName.trim()}/video/upload`;
    const formData = new FormData();
    formData.append('upload_preset', uploadPreset.trim());

    if (fileOrBlobOrUrl instanceof Blob || fileOrBlobOrUrl instanceof File) {
      formData.append('file', fileOrBlobOrUrl, 'rekaption_tiktok.mp4');
    } else if (typeof fileOrBlobOrUrl === 'string' && fileOrBlobOrUrl.startsWith('http')) {
      formData.append('file', fileOrBlobOrUrl);
    } else {
      throw new Error('صيغة الفيديو غير صالحة للرفع إلى Cloudinary.');
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resp = JSON.parse(xhr.responseText);
            if (resp.secure_url) {
              resolve(resp.secure_url);
            } else {
              reject(new Error(resp.error ? resp.error.message : 'فشل الحصول على رابط الفيديو من Cloudinary'));
            }
          } catch(e) {
            reject(new Error('خطأ في معالجة استجابة Cloudinary: ' + e.message));
          }
        } else {
          try {
            const errResp = JSON.parse(xhr.responseText);
            reject(new Error(errResp.error ? errResp.error.message : `خطأ Cloudinary (كود ${xhr.status})`));
          } catch(_) {
            reject(new Error(`خطأ في رفع الفيديو إلى Cloudinary (كود ${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('فشل الاتصال بخدمة Cloudinary. يرجى التحقق من اتصال الإنترنت أو صحة اسم الـ Cloud Name.'));
      };

      xhr.send(formData);
    });
  }

  // 3. Buffer API Engine (GraphQL with Backend Proxy Fallback)
  async function fetchBufferChannels(bufferToken) {
    if (!bufferToken) {
      throw new Error('يرجى إدخال مفتاح Buffer API Key في الإعدادات.');
    }

    const backendUrl = (window.apiUrl || '').replace(/\/$/, '');

    // Try via Backend proxy first for zero CORS friction
    if (backendUrl && !backendUrl.includes('localhost:8080')) {
      try {
        const proxyRes = await fetch(`${backendUrl}/api/buffer/channels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: bufferToken.trim() })
        });
        if (proxyRes.ok) {
          const data = await proxyRes.json();
          if (data && data.channels && data.channels.length > 0) return data.channels;
        }
      } catch (err) {
        console.warn('Backend proxy channels fetch failed, falling back to direct request:', err);
      }
    }

    // Direct Buffer GraphQL API
    const query = `
      query GetBufferChannels {
        account {
          organizations {
            id
            name
            channels {
              id
              name
              displayName
              service
              avatar
              isQueuePaused
            }
          }
        }
      }
    `;

    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bufferToken.trim()}`
      },
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      throw new Error(`فشل الاتصال بـ Buffer API (كود ${res.status}). يرجى التحقق من المفتاح.`);
    }

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message || 'خطأ في استعلام حساب Buffer');
    }

    const channels = [];
    const orgs = json.data?.account?.organizations || [];
    for (const org of orgs) {
      if (org.channels) {
        for (const ch of org.channels) {
          channels.push({
            id: ch.id,
            name: ch.name || ch.displayName || 'حساب بدون اسم',
            displayName: ch.displayName || ch.name,
            service: ch.service || 'unknown',
            avatar: ch.avatar || '',
            organizationName: org.name
          });
        }
      }
    }

    return channels;
  }

  async function publishToBuffer({ bufferToken, channelId, text, videoUrl, scheduledAt, isNow }) {
    if (!bufferToken) throw new Error('مفتاح Buffer API غير موجود.');
    if (!channelId) throw new Error('يرجى اختيار قناة TikTok أو إدخال Channel ID.');
    if (!videoUrl) throw new Error('رابط الفيديو مفقود.');

    const backendUrl = (window.apiUrl || '').replace(/\/$/, '');

    // Try via backend proxy first
    if (backendUrl && !backendUrl.includes('localhost:8080')) {
      try {
        const proxyRes = await fetch(`${backendUrl}/api/buffer/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: bufferToken.trim(),
            channel_id: channelId.trim(),
            text: text || '',
            video_url: videoUrl,
            scheduled_at: scheduledAt || null,
            is_now: !!isNow
          })
        });
        if (proxyRes.ok) {
          const resJson = await proxyRes.json();
          if (resJson.status === 'success') return resJson;
          if (resJson.error) throw new Error(resJson.error);
        }
      } catch (proxyErr) {
        console.warn('Proxy publish failed, falling back to direct request:', proxyErr);
      }
    }

    // Direct Buffer GraphQL Mutation
    const mutation = `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            post {
              id
              dueAt
              status
            }
          }
          ... on MutationError {
            message
          }
          ... on UserError {
            message
          }
        }
      }
    `;

    const input = {
      channelId: channelId.trim(),
      text: text || '',
      schedulingType: 'automatic',
      mode: isNow ? 'shareNow' : 'customScheduled',
      assets: {
        video: {
          url: videoUrl
        }
      }
    };

    if (!isNow && scheduledAt) {
      input.dueAt = new Date(scheduledAt).toISOString();
    }

    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bufferToken.trim()}`
      },
      body: JSON.stringify({
        query: mutation,
        variables: { input }
      })
    });

    if (!res.ok) {
      throw new Error(`خطأ في طلب Buffer API (كود ${res.status})`);
    }

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message || 'فشل إرسال المنشور إلى Buffer');
    }

    const result = json.data?.createPost;
    if (result?.message) {
      throw new Error(result.message);
    }

    return result?.post || { id: 'success', status: isNow ? 'published' : 'scheduled' };
  }

  // 4. UI Actions & Modal Handlers
  window.openTikTokPublishModal = function(blobOrUrl, initialTitle = '') {
    currentVideoPayload = {
      blob: blobOrUrl instanceof Blob ? blobOrUrl : null,
      url: typeof blobOrUrl === 'string' ? blobOrUrl : null,
      title: initialTitle || ''
    };

    // If no blob/url passed, try detecting from active page states
    if (!currentVideoPayload.blob && !currentVideoPayload.url) {
      if (window.lastRenderedVideoBlob) {
        currentVideoPayload.blob = window.lastRenderedVideoBlob;
      } else if (window.lastRenderedVideoUrl) {
        currentVideoPayload.url = window.lastRenderedVideoUrl;
      } else {
        const outVid = document.getElementById('output-video');
        if (outVid && outVid.src) {
          currentVideoPayload.url = outVid.src;
        }
      }
    }

    const modal = document.getElementById('tiktok-buffer-modal');
    if (!modal) {
      console.error('TikTok Buffer Modal element not found in DOM');
      return;
    }

    // Set video preview
    const previewEl = document.getElementById('buffer-video-preview');
    if (previewEl) {
      if (currentVideoPayload.blob) {
        previewEl.src = URL.createObjectURL(currentVideoPayload.blob);
      } else if (currentVideoPayload.url) {
        previewEl.src = currentVideoPayload.url;
      }
    }

    // Populate Caption Text
    const captionInput = document.getElementById('buffer-caption-text');
    const settings = getStoredSettings();
    let textToSet = currentVideoPayload.title || '';
    if (!textToSet && document.getElementById('title-text-input')) {
      textToSet = document.getElementById('title-text-input').value.trim();
    }
    if (settings.defaultHashtags) {
      textToSet = (textToSet ? (textToSet + '\n\n') : '') + settings.defaultHashtags;
    }
    if (captionInput) {
      captionInput.value = textToSet;
      updateCaptionCharCount();
    }

    // Set default schedule time (1 hour from now)
    const scheduleInput = document.getElementById('buffer-schedule-time');
    if (scheduleInput) {
      const now = new Date();
      now.setHours(now.getHours() + 1);
      now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5); // Round to 5 mins
      const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      scheduleInput.value = localIso;
      scheduleInput.min = new Date(Date.now() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    }

    // Reset progress UI
    resetPublishProgressUI();

    // Populate channels
    loadChannelsIntoUI();

    modal.style.display = 'flex';
  };

  window.closeTikTokPublishModal = function() {
    const modal = document.getElementById('tiktok-buffer-modal');
    if (modal) modal.style.display = 'none';
    const previewEl = document.getElementById('buffer-video-preview');
    if (previewEl) previewEl.pause();
  };

  window.openTikTokSettingsModal = function() {
    const settings = getStoredSettings();
    const cName = document.getElementById('setting-cloud-name');
    const cPreset = document.getElementById('setting-upload-preset');
    const bToken = document.getElementById('setting-buffer-token');
    const bTags = document.getElementById('setting-default-hashtags');

    if (cName) cName.value = settings.cloudName || '';
    if (cPreset) cPreset.value = settings.uploadPreset || '';
    if (bToken) bToken.value = settings.bufferToken || '';
    if (bTags) bTags.value = settings.defaultHashtags || '#fyp #viral #shorts #rekaption';

    const modal = document.getElementById('tiktok-settings-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeTikTokSettingsModal = function() {
    const modal = document.getElementById('tiktok-settings-modal');
    if (modal) modal.style.display = 'none';
  };

  window.saveTikTokSettings = function() {
    const cName = document.getElementById('setting-cloud-name')?.value.trim() || '';
    const cPreset = document.getElementById('setting-upload-preset')?.value.trim() || '';
    const bToken = document.getElementById('setting-buffer-token')?.value.trim() || '';
    const bTags = document.getElementById('setting-default-hashtags')?.value.trim() || '';

    saveStoredSettings({
      cloudName: cName,
      uploadPreset: cPreset,
      bufferToken: bToken,
      defaultHashtags: bTags
    });

    closeTikTokSettingsModal();
    showToastNotification('✅ تم حفظ إعدادات Cloudinary و Buffer بنجاح');
    loadChannelsIntoUI();
  };

  async function loadChannelsIntoUI() {
    const settings = getStoredSettings();
    const select = document.getElementById('buffer-channel-select');
    const refreshBtn = document.getElementById('buffer-refresh-channels-btn');
    if (!select) return;

    if (!settings.bufferToken) {
      select.innerHTML = '<option value="">⚠️ يرجى ضبط مفتاح Buffer API في الإعدادات</option>';
      return;
    }

    select.innerHTML = '<option value="">⏳ جاري جلب قنوات Buffer المتصلة...</option>';
    if (refreshBtn) refreshBtn.classList.add('spinning');

    try {
      const channels = await fetchBufferChannels(settings.bufferToken);
      if (!channels || channels.length === 0) {
        select.innerHTML = '<option value="">❌ لم يتم العثور على قنوات متصلة في حسابك</option>';
        return;
      }

      select.innerHTML = '';
      let hasTikTok = false;
      channels.forEach(ch => {
        const isTikTok = (ch.service || '').toLowerCase().includes('tiktok');
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.textContent = `${isTikTok ? '🎵 [TikTok]' : `[${ch.service}]`} ${ch.name || ch.displayName}`;
        if (isTikTok && !hasTikTok) {
          opt.selected = true;
          hasTikTok = true;
        }
        select.appendChild(opt);
      });

      if (!hasTikTok && channels.length > 0) {
        select.selectedIndex = 0;
      }
    } catch(err) {
      console.error('Error fetching Buffer channels:', err);
      select.innerHTML = `<option value="">⚠️ خطأ: ${err.message || 'فشل جلب القنوات'}</option>`;
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
  }

  window.refreshBufferChannelsUI = loadChannelsIntoUI;

  window.togglePublishModeUI = function(mode) {
    const scheduleBox = document.getElementById('buffer-schedule-box');
    const submitBtnText = document.getElementById('buffer-submit-btn-text');
    if (mode === 'schedule') {
      if (scheduleBox) scheduleBox.style.display = 'block';
      if (submitBtnText) submitBtnText.textContent = '📅 جدولة النشر عبر Buffer';
    } else {
      if (scheduleBox) scheduleBox.style.display = 'none';
      if (submitBtnText) submitBtnText.textContent = '⚡ نشر فوري الآن على TikTok';
    }
  };

  function updateCaptionCharCount() {
    const input = document.getElementById('buffer-caption-text');
    const countEl = document.getElementById('buffer-char-count');
    if (input && countEl) {
      countEl.textContent = `${input.value.length} حرف`;
    }
  }

  function resetPublishProgressUI() {
    const progressBox = document.getElementById('buffer-progress-box');
    const submitBtn = document.getElementById('buffer-submit-btn');
    const statusMsg = document.getElementById('buffer-status-msg');
    const pFill = document.getElementById('buffer-progress-fill');
    const pText = document.getElementById('buffer-progress-percent');
    const resultBox = document.getElementById('buffer-result-box');

    if (progressBox) progressBox.style.display = 'none';
    if (resultBox) resultBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.pointerEvents = 'auto';
    }
    if (pFill) {
      pFill.style.width = '0%';
      pFill.style.background = 'linear-gradient(90deg, #8b5cf6, #ec4899)';
    }
    if (pText) pText.textContent = '0%';
    if (statusMsg) statusMsg.textContent = 'جاهز لبدء النشر...';
  }

  window.handleTikTokPublishSubmit = async function() {
    const settings = getStoredSettings();
    if (!settings.cloudName || !settings.uploadPreset) {
      alert('يرجى إدخال بيانات Cloudinary أولاً في الإعدادات (Cloud Name & Upload Preset).');
      openTikTokSettingsModal();
      return;
    }
    if (!settings.bufferToken) {
      alert('يرجى إدخال مفتاح Buffer API Key في الإعدادات.');
      openTikTokSettingsModal();
      return;
    }

    const channelSelect = document.getElementById('buffer-channel-select');
    const channelId = channelSelect ? channelSelect.value : '';
    if (!channelId) {
      alert('يرجى اختيار القناة المراد النشر إليها أولاً.');
      return;
    }

    const isSchedule = document.querySelector('input[name="buffer-publish-type"]:checked')?.value === 'schedule';
    const scheduleTimeInput = document.getElementById('buffer-schedule-time');
    const scheduledAt = isSchedule && scheduleTimeInput ? scheduleTimeInput.value : null;

    if (isSchedule && !scheduledAt) {
      alert('يرجى تحديد تاريخ ووقت الجدولة.');
      return;
    }

    const captionText = document.getElementById('buffer-caption-text')?.value || '';

    // UI state
    const submitBtn = document.getElementById('buffer-submit-btn');
    const progressBox = document.getElementById('buffer-progress-box');
    const statusMsg = document.getElementById('buffer-status-msg');
    const pFill = document.getElementById('buffer-progress-fill');
    const pText = document.getElementById('buffer-progress-percent');
    const resultBox = document.getElementById('buffer-result-box');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      submitBtn.style.pointerEvents = 'none';
    }
    if (progressBox) progressBox.style.display = 'block';
    if (resultBox) resultBox.style.display = 'none';

    try {
      // Step 1: Obtain video blob or file
      if (statusMsg) statusMsg.textContent = '1/2 ☁️ جاري رفع واستضافة الفيديو على Cloudinary...';
      let videoSource = null;

      if (currentVideoPayload?.blob) {
        videoSource = currentVideoPayload.blob;
      } else if (currentVideoPayload?.url) {
        // Fetch blob from URL if needed or pass directly
        if (currentVideoPayload.url.startsWith('blob:')) {
          const res = await fetch(currentVideoPayload.url);
          videoSource = await res.blob();
        } else {
          videoSource = currentVideoPayload.url;
        }
      }

      if (!videoSource) {
        throw new Error('لم يتم العثور على ملف الفيديو للرفع.');
      }

      // Step 2: Upload to Cloudinary with live progress
      const cloudinaryUrl = await uploadToCloudinary(
        videoSource,
        settings.cloudName,
        settings.uploadPreset,
        (percent) => {
          if (pFill) pFill.style.width = `${Math.min(percent, 90)}%`;
          if (pText) pText.textContent = `${percent}% (رفع Cloudinary)`;
        }
      );

      console.log('✅ Video uploaded to Cloudinary successfully:', cloudinaryUrl);

      // Step 3: Publish to Buffer
      if (pFill) pFill.style.width = '95%';
      if (pText) pText.textContent = '95%';
      if (statusMsg) {
        statusMsg.textContent = isSchedule 
          ? '2/2 📅 جاري جدولة المنشور عبر Buffer API...'
          : '2/2 ⚡ جاري إرسال المنشور للنشر الفوري على TikTok...';
      }

      const postResult = await publishToBuffer({
        bufferToken: settings.bufferToken,
        channelId: channelId,
        text: captionText,
        videoUrl: cloudinaryUrl,
        scheduledAt: scheduledAt,
        isNow: !isSchedule
      });

      // Complete!
      if (pFill) pFill.style.width = '100%';
      if (pText) pText.textContent = '100% اكتمل!';
      if (statusMsg) statusMsg.textContent = '🎉 تمت العملية بنجاح!';

      if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 14px; text-align: center; margin-top: 15px;">
            <div style="font-size: 24px; margin-bottom: 6px;">✨ ${isSchedule ? 'تمت جدولة المنشور بنجاح!' : 'تم النشر بنجاح على الحساب!'}</div>
            <p style="font-size: 12px; color: rgba(255,255,255,0.8); margin-bottom: 8px;">
              ${isSchedule ? `📅 موعد النشر المحدد: <strong>${new Date(scheduledAt).toLocaleString('ar-EG')}</strong>` : '🚀 تم إرسال الفيديو إلى TikTok بنجاح.'}
            </p>
            <div style="font-size: 11px; color: rgba(255,255,255,0.5); word-break: break-all;">
              🔗 رابط الفيديو على Cloudinary: <a href="${cloudinaryUrl}" target="_blank" style="color: #a855f7; text-decoration: underline;">فتح الفيديو</a>
            </div>
          </div>
        `;
      }

      showToastNotification(isSchedule ? '📅 تمت جدولة الفيديو على TikTok بنجاح!' : '🚀 تم نشر الفيديو على TikTok بنجاح!');
    } catch(err) {
      console.error('TikTok Buffer Publish Error:', err);
      if (statusMsg) statusMsg.textContent = `❌ فشلت العملية: ${err.message}`;
      if (pFill) pFill.style.background = '#ef4444';
      alert(`حدث خطأ أثناء النشر:\n${err.message}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.pointerEvents = 'auto';
      }
    }
  };

  function showToastNotification(msg) {
    let toast = document.getElementById('rekaption-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rekaption-toast';
      toast.style.cssText = 'position:fixed;bottom:25px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff;padding:12px 24px;border-radius:30px;font-weight:700;font-size:13px;box-shadow:0 8px 25px rgba(0,0,0,0.5);z-index:99999;transition:all 0.3s ease;pointer-events:none;font-family:Cairo,sans-serif;direction:rtl;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 4000);
  }

  // Export to global scope
  window.BufferCloudinaryService = {
    getStoredSettings,
    saveStoredSettings,
    uploadToCloudinary,
    fetchBufferChannels,
    publishToBuffer
  };

  // Init listener for character count
  document.addEventListener('DOMContentLoaded', () => {
    const captionEl = document.getElementById('buffer-caption-text');
    if (captionEl) {
      captionEl.addEventListener('input', updateCaptionCharCount);
    }
  });

})();
