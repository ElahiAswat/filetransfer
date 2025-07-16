(async () => {
  const password = prompt('Enter password to access the service');

  const uploadForm = document.getElementById('uploadForm');
  const showFilesBtn = document.getElementById('showFilesBtn');
  const fileList = document.getElementById('fileList');
  const loading = document.getElementById('loading');
  const progressBar = document.getElementById('progressBar');

  const showLoading = (text = 'Loading...') => {
    document.querySelector('#loading .loading-box div:first-child').textContent = text;
    loading.style.display = 'flex';
  };
  const hideLoading = () => loading.style.display = 'none';

  const formatSpeed = (bytesPerSec) => {
    const kbps = bytesPerSec / 1024;
    return kbps < 1024
      ? `${kbps.toFixed(1)} KB/s`
      : `${(kbps / 1024).toFixed(2)} MB/s`;
  };

  const formatETA = (seconds) => {
    if (!isFinite(seconds)) return '∞';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

const renderProgressBar = (percent, speed, eta) => {
  const isDesktop = window.innerWidth >= 768; // e.g. tablets and up
  const divisor = isDesktop ? 80 : 60;
  const maxBarLength = Math.min(Math.floor(window.innerWidth / divisor), 40);

  const filled = Math.round((percent / 100) * maxBarLength);
  const hashes = '#'.repeat(filled);
  const spaces = ' '.repeat(maxBarLength - filled);

  return `[${hashes}${spaces}] ${percent}% | ${speed} | ETA: ${eta}`;
};

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(uploadForm);
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();

    showLoading('Uploading...');

    xhr.open('POST', '/upload', true);
    xhr.setRequestHeader('x-auth-password', password);

    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) {
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
      alert(xhr.status === 200
        ? 'File uploaded successfully.'
        : `Upload failed: ${xhr.responseText}`);
    };

    xhr.onerror = () => {
      hideLoading();
      alert('Upload failed due to a network error.');
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
          showLoading('Downloading...');

          try {
            const res = await fetch(`/download/${encodeURIComponent(file)}`, {
              headers: { 'x-auth-password': password },
            });

            if (!res.ok || !res.body) {
              alert('Failed to download file');
              return;
            }

            const total = res.headers.get('Content-Length');
            const totalBytes = total ? parseInt(total, 10) : null;
            const reader = res.body.getReader();
            const chunks = [];
            let received = 0;
            const startTime = Date.now();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
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

            const blob = new Blob(chunks);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          } catch (err) {
            alert('Download error');
            console.error(err);
          } finally {
            hideLoading();
          }
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
})();
