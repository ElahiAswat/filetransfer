(async () => {
  let password = '';
  let currentXHR = null;
  let currentReader = null;
  let isPaused = false;
  let isDownloading = false;
  let currentDownloadFile = '';

  // DOM elements
  const passwordForm = document.getElementById('passwordForm');
  const passwordInput = document.getElementById('passwordInput');
  const loginBtn = document.getElementById('loginBtn');
  const errorMessage = document.getElementById('errorMessage');
  const mainContent = document.getElementById('mainContent');
  
  const uploadForm = document.getElementById('uploadForm');
  const showFilesBtn = document.getElementById('showFilesBtn');
  const fileList = document.getElementById('fileList');
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loadingText');
  const progressBar = document.getElementById('progressBar');
  const pauseBtn = document.getElementById('pauseBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const closeBtn = document.getElementById('closeBtn');

  // Authentication
  const showError = (message) => {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
      errorMessage.style.display = 'none';
    }, 3000);
  };

  const authenticate = async (inputPassword) => {
    try {
      const res = await fetch('/files', {
        headers: { 'x-auth-password': inputPassword },
      });
      
      if (res.status === 401) {
        showError('Incorrect password. Please try again.');
        return false;
      }
      
      password = inputPassword;
      passwordForm.style.display = 'none';
      mainContent.style.display = 'flex';
      return true;
    } catch (err) {
      showError('Connection error. Please try again.');
      return false;
    }
  };

  loginBtn.addEventListener('click', async () => {
    const inputPassword = passwordInput.value.trim();
    if (!inputPassword) {
      showError('Please enter a password.');
      return;
    }
    
    loginBtn.disabled = true;
    loginBtn.textContent = 'Checking...';
    
    const success = await authenticate(inputPassword);
    
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
    
    if (!success) {
      passwordInput.value = '';
      passwordInput.focus();
    }
  });

  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginBtn.click();
    }
  });

  // Loading and progress functions
  const showLoading = (text = 'Loading...') => {
    loadingText.textContent = text;
    loading.style.display = 'flex';
    pauseBtn.style.display = 'inline-block';
    resumeBtn.style.display = 'none';
    isPaused = false;
  };

  const hideLoading = () => {
    loading.style.display = 'none';
    currentXHR = null;
    currentReader = null;
    isPaused = false;
    isDownloading = false;
    currentDownloadFile = '';
  };

  const formatSpeed = (bytesPerSec) => {
    const kbps = bytesPerSec / 1024;
    return kbps < 1024 ? `${kbps.toFixed(1)} KB/s` : `${(kbps / 1024).toFixed(2)} MB/s`;
  };

  const formatETA = (seconds) => {
    if (!isFinite(seconds)) return '∞';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const renderProgressBar = (percent, speed, eta) => {
    const isDesktop = window.innerWidth >= 768;
    const divisor = isDesktop ? 80 : 60;
    const maxBarLength = Math.min(Math.floor(window.innerWidth / divisor), 40);
    const filled = Math.round((percent / 100) * maxBarLength);
    const hashes = '#'.repeat(filled);
    const spaces = ' '.repeat(maxBarLength - filled);
    return `[${hashes}${spaces}] ${percent}% | ${speed} | ETA: ${eta}`;
  };

  // Control button handlers
  pauseBtn.addEventListener('click', () => {
    isPaused = true;
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'inline-block';
    
    if (currentXHR) {
      // For uploads, we'll need to restart since XMLHttpRequest doesn't support true pause
      currentXHR.abort();
    }
    
    if (currentReader && isDownloading) {
      // For downloads, we can pause the reading process
      loadingText.textContent = 'Download Paused...';
    }
  });

  resumeBtn.addEventListener('click', () => {
    isPaused = false;
    resumeBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';
    
    if (isDownloading && currentDownloadFile) {
      // Resume download
      loadingText.textContent = 'Downloading...';
      continueDownload();
    } else {
      // For uploads, show a message that they need to restart
      hideLoading();
      alert('Upload was paused. Please select your files and upload again.');
    }
  });

  closeBtn.addEventListener('click', () => {
    if (currentXHR) {
      currentXHR.abort();
    }
    if (currentReader) {
      currentReader.cancel();
    }
    hideLoading();
  });

  // Continue download function for resume
  async function continueDownload() {
    if (!currentReader || !isDownloading) return;
    
    try {
      const chunks = [];
      let received = 0;
      const startTime = Date.now();

      while (true) {
        if (isPaused) {
          break;
        }

        const { done, value } = await currentReader.read();
        if (done) {
          // Download completed
          const blob = new Blob(chunks);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = currentDownloadFile;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          hideLoading();
          break;
        }
        
        chunks.push(value);
        received += value.length;

        const now = Date.now();
        const elapsed = (now - startTime) / 1000;
        const speed = received / elapsed;
        const percent = Math.round((received / chunks.reduce((acc, chunk) => acc + chunk.length, 0)) * 100);
        const eta = speed > 0 ? (received / speed) : 0;

        progressBar.textContent = renderProgressBar(
          percent,
          formatSpeed(speed),
          formatETA(eta)
        );
      }
    } catch (err) {
      if (err.name !== 'AbortError' && !isPaused) {
        alert('Download error');
        console.error(err);
        hideLoading();
      }
    }
  }

  // Upload form handler
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const input = uploadForm.querySelector('input[type="file"]');
    const files = input.files;

    if (!files.length) return alert('Please select at least one file');

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const xhr = new XMLHttpRequest();
    currentXHR = xhr;
    const startTime = Date.now();
    isDownloading = false;

    showLoading('Uploading...');
    xhr.open('POST', '/upload', true);
    xhr.setRequestHeader('x-auth-password', password);

    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable && !isPaused) {
        const now = Date.now();
        const elapsed = (now - startTime) / 1000;
        const speed = e.loaded / elapsed;
        const eta = (e.total - e.loaded) / speed;
        const percent = Math.round((e.loaded / e.total) * 100);

        progressBar.textContent = renderProgressBar(
          percent,
          formatSpeed(speed),
          formatETA(eta)
        );
      }
    };

    xhr.onload = () => {
      hideLoading();
      if (xhr.status === 200) {
        alert(xhr.responseText);
        input.value = ''; // Clear the file input
      } else {
        alert(`Upload failed: ${xhr.responseText}`);
      }
    };

    xhr.onerror = () => {
      hideLoading();
      alert('Upload failed due to a network error.');
    };

    xhr.onabort = () => {
      if (!isPaused) {
        hideLoading();
        alert('Upload was cancelled.');
      }
    };

    xhr.send(formData);
  });

  showFilesBtn.addEventListener('click', fetchFiles);

  async function fetchFiles() {
    try {
      showLoading('Fetching file list...');
      const res = await fetch('/files', {
        headers: { 'x-auth-password': password },
      });

      if (res.status === 401) {
        hideLoading();
        alert('Unauthorized: Incorrect password');
        return;
      }

      const files = await res.json();
      fileList.innerHTML = '';

      files.forEach((file) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = file;

        link.addEventListener('click', async (e) => {
          e.preventDefault();
          await downloadFile(file);
        });

        li.appendChild(link);
        fileList.appendChild(li);
      });
    } catch (err) {
      alert('Failed to fetch file list');
      console.error(err);
    } finally {
      hideLoading();
    }
  }

  async function downloadFile(filename) {
    showLoading('Downloading...');
    isDownloading = true;
    currentDownloadFile = filename;
    
    try {
      const res = await fetch(`/download/${encodeURIComponent(filename)}`, {
        headers: { 'x-auth-password': password },
      });

      if (!res.ok || !res.body) {
        hideLoading();
        alert('Failed to download file');
        return;
      }

      const total = res.headers.get('Content-Length');
      const totalBytes = total ? parseInt(total, 10) : null;
      const reader = res.body.getReader();
      currentReader = reader;
      const chunks = [];
      let received = 0;
      const startTime = Date.now();

      while (true) {
        if (isPaused) {
          // Just break the loop, reader stays alive for resume
          break;
        }

        const { done, value } = await reader.read();
        if (done) {
          // Download completed successfully
          const blob = new Blob(chunks);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          hideLoading();
          break;
        }
        
        chunks.push(value);
        received += value.length;

        const now = Date.now();
        const elapsed = (now - startTime) / 1000;
        const speed = received / elapsed;
        const percent = totalBytes ? Math.round((received / totalBytes) * 100) : 0;
        const eta = totalBytes ? (totalBytes - received) / speed : 0;

        progressBar.textContent = renderProgressBar(
          percent,
          formatSpeed(speed),
          formatETA(eta)
        );
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        alert('Download error');
        console.error(err);
      }
      hideLoading();
    }
  }

  // Focus on password input when page loads
  passwordInput.focus();
})();
