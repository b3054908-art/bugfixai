const portCandidates = [
  { title: 'Frontend', url: 'http://localhost:3000', kind: 'app' },
  { title: 'Backend', url: 'http://localhost:4000/api/v1/health', kind: 'api' },
  { title: 'Frontend Alt', url: 'http://localhost:3001', kind: 'app' },
  { title: 'Postgres', url: 'http://localhost:5432', kind: 'db' },
  { title: 'Redis', url: 'http://localhost:6379', kind: 'db' },
];

const portList = document.getElementById('portList');
const appView = document.getElementById('appView');
const activeTitle = document.getElementById('activeTitle');
const activeUrl = document.getElementById('activeUrl');
const refreshBtn = document.getElementById('refreshBtn');
const openBtn = document.getElementById('openBtn');
const emptyState = document.getElementById('emptyState');

async function isPortLive(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok || response.status === 200 || response.status === 204 || response.status === 401 || response.status === 403;
  } catch (error) {
    return false;
  }
}

function sortPorts(items) {
  return [...items].sort((a, b) => {
    if (a.live !== b.live) return Number(b.live) - Number(a.live);
    return a.item.title.localeCompare(b.item.title);
  });
}

function createPortMarkup(item, isLive) {
  const liveText = isLive ? 'Live' : 'Idle';
  return `
    <div class="port-label">
      <span>${item.title}</span>
      <span class="port-state"><span class="dot"></span>${liveText}</span>
    </div>
    <div class="port-url">${item.url}</div>
  `;
}

async function renderPorts() {
  portList.innerHTML = '';

  const liveStates = await Promise.all(
    portCandidates.map(async (item) => ({
      item,
      live: await isPortLive(item.url),
    }))
  );

  const sorted = sortPorts(liveStates);
  const activePorts = sorted.filter(({ live }) => live);
  const itemsToRender = activePorts.length ? activePorts.map(({ item }) => item) : portCandidates.slice(0, 3);

  itemsToRender.forEach((item, index) => {
    const live = activePorts.some(({ item: candidate }) => candidate.url === item.url);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'port-item' + (index === 0 ? ' active' : '');
    button.dataset.live = String(live);
    button.innerHTML = createPortMarkup(item, live);

    button.addEventListener('click', () => {
      document.querySelectorAll('.port-item').forEach((el) => el.classList.remove('active'));
      button.classList.add('active');
      appView.src = item.url;
      activeTitle.textContent = item.title;
      activeUrl.textContent = item.url;
      emptyState.style.display = 'none';
    });

    portList.appendChild(button);
  });

  if (itemsToRender.length > 0) {
    const firstItem = itemsToRender[0];
    appView.src = firstItem.url;
    activeTitle.textContent = firstItem.title;
    activeUrl.textContent = firstItem.url;
    emptyState.style.display = 'none';
  }
}

refreshBtn.addEventListener('click', () => {
  appView.reload();
  renderPorts();
});

openBtn.addEventListener('click', () => {
  const currentUrl = activeUrl.textContent.trim();
  if (window.electronAPI && window.electronAPI.openExternal) {
    window.electronAPI.openExternal(currentUrl);
  }
});

renderPorts();
appView.addEventListener('did-finish-load', () => {
  emptyState.style.display = 'none';
});

setInterval(() => {
  renderPorts();
}, 4000);
