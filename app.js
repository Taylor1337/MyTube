const $ = id => document.getElementById(id);
const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem('mytube-' + key)) ?? fallback; }
  catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem('mytube-' + key, JSON.stringify(value)); }
  catch { $('status').textContent = 'Browser storage is unavailable. Changes apply to this session.'; }
};
const sample = [
  {id:'demo-1', title:'Why ordinary technology is surprisingly complicated', channel:'Technology Connections'},
  {id:'demo-2', title:'A fascinating place you have never heard of', channel:'Tom Scott'},
  {id:'demo-3', title:'A quick science experiment', channel:'Science Channel', short:true},
  {id:'demo-4', title:'Revisiting a classic game from the 1990s', channel:'Retro Gaming'},
  {id:'demo-5', title:'A surprising historical fact', channel:'History in a Minute', short:true}
];
const labels = {subs:'Subscriptions', shorts:'Shorts', later:'Watch Later'};
let token = '', account = '', tab = 'subs', showWatched = false, busy = false, player;
let videos = sample, saved = read('saved-demo', []), watched = new Set(read('watched-demo', []));
const key = name => name + '-' + (account || 'demo');
const say = message => { $('status').textContent = message; };
const button = (label, onClick) => {
  const element = document.createElement('button');
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
};

function markWatched(video, value) {
  if (value) watched.add(video.id);
  else watched.delete(video.id);
  write(key('watched'), [...watched]);
  render();
}

function play(video) {
  $('player').showModal();
  if (video.id.startsWith('demo-')) {
    const description = document.createElement('p');
    description.textContent = video.title + ' � Sample video';
    $('frame').replaceChildren(description);
    if (video.short) $('frame').append(button('Mark watched', () => {
      markWatched(video, true);
      $('player').close();
    }));
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.id = 'youtube-video';
  iframe.title = video.title;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  iframe.src = 'https://www.youtube.com/embed/' + encodeURIComponent(video.id) +
    '?autoplay=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
  const link = document.createElement('a');
  link.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(video.id);
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Open on YouTube';
  $('frame').replaceChildren(iframe, link);
  if (video.short) {
    loadPlayerApi().then(() => {
      if (!iframe.isConnected) return;
      player = new YT.Player(iframe, {events:{onStateChange(event) {
        if (event.data === YT.PlayerState.ENDED) markWatched(video, true);
      }}});
    }).catch(() => {});
  }
}

let playerApi;
function loadPlayerApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (!playerApi) playerApi = new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = reject;
    document.head.append(script);
  });
  return playerApi;
}
$('close').onclick = () => $('player').close();
$('player').onclose = () => {
  player?.destroy();
  player = undefined;
  $('frame').replaceChildren();
};

function render() {
  $('heading').textContent = labels[tab];
  $('subtitle').textContent = tab === 'later' ? 'Saved in this browser' :
    tab === 'shorts' ? (showWatched ? 'Shorts you marked watched' : 'Your unwatched Shorts') :
    'Latest uploads from your channels';
  $('count').textContent = saved.length ? '(' + saved.length + ')' : '';
  $('restore').hidden = tab !== 'shorts';
  $('restore').textContent = showWatched ? 'Show unwatched' : 'Show watched';
  $('refresh').hidden = !token || tab === 'later';
  $('refresh').disabled = busy;
  $('account').disabled = busy;
  document.querySelectorAll('[data-tab]').forEach(element =>
    element.setAttribute('aria-pressed', String(element.dataset.tab === tab)));
  const list = tab === 'later' ? saved : videos.filter(video => tab === 'subs' ?
    !video.short : video.short && watched.has(video.id) === showWatched);
  const rows = list.map(video => {
    const row = document.createElement('article');
    const thumb = button('', () => play(video));
    thumb.className = 'thumb';
    thumb.setAttribute('aria-label', 'Play ' + video.title);
    if (video.thumbnail) {
      const image = document.createElement('img');
      image.src = video.thumbnail;
      image.alt = '';
      image.loading = 'lazy';
      thumb.append(image);
    }
    const playIcon = document.createElement('span');
    playIcon.textContent = '?';
    thumb.append(playIcon);
    const detail = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = video.title;
    const meta = document.createElement('p');
    meta.textContent = video.channel + (video.date ? ' � ' + new Date(video.date).toLocaleDateString() : '');
    detail.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const isSaved = saved.some(item => item.id === video.id);
    actions.append(button(isSaved ? 'Remove from Watch Later' : '+ Watch Later', () => {
      saved = isSaved ? saved.filter(item => item.id !== video.id) : [...saved, video];
      write(key('saved'), saved);
      render();
    }));
    if (video.short) {
      const isWatched = watched.has(video.id);
      actions.append(button(isWatched ? 'Mark unwatched' : 'Mark watched', () => markWatched(video, !isWatched)));
    }
    row.append(thumb, detail, actions);
    return row;
  });
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = busy ? 'Loading uploads.' :
      {subs:'No recent uploads to show.', shorts:showWatched ? 'No watched Shorts yet.' : 'No unwatched Shorts.', later:'Save videos here to watch them later.'}[tab];
    rows.push(empty);
  }
  $('feed').replaceChildren(...rows);
}

async function api(resource, options) {
  const query = new URLSearchParams(options);
  const response = await fetch('https://www.googleapis.com/youtube/v3/' + resource + '?' + query, {
    headers:{Authorization:'Bearer ' + token}
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'Your Google session expired. Reconnect YouTube.' :
      data.error?.message || 'YouTube could not load your feed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function batches(items, size) {
  return Array.from({length:Math.ceil(items.length / size)}, (_, index) => items.slice(index * size, (index + 1) * size));
}

function durationSeconds(duration) {
  const parts = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  return parts ? Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0) : 0;
}

async function refresh() {
  busy = true;
  say('Loading subscriptions and recent uploads.');
  render();
  try {
    const own = await api('channels', {mine:true, part:'id'});
    const channel = own.items?.[0]?.id;
    if (!channel) throw new Error('Google did not return a YouTube channel for this account.');
    if (account !== channel) {
      account = channel;
      saved = read(key('saved'), []);
      watched = new Set(read(key('watched'), []));
      videos = [];
    }
    const ids = new Set();
    let page = '';
    do {
      const subscriptions = await api('subscriptions', {mine:true, part:'snippet', maxResults:50, ...(page ? {pageToken:page} : {})});
      for (const item of subscriptions.items) ids.add(item.snippet.resourceId.channelId);
      page = subscriptions.nextPageToken;
    } while (page);
    const uploads = [];
    for (const group of batches([...ids], 50)) {
      const channels = await api('channels', {part:'contentDetails', id:group.join(',')});
      uploads.push(...channels.items.map(item => item.contentDetails.relatedPlaylists.uploads).filter(Boolean));
    }
    const videoIds = new Set();
    for (const group of batches(uploads, 8)) {
      const pages = await Promise.all(group.map(playlistId => api('playlistItems', {playlistId, part:'contentDetails', maxResults:5})
        .catch(error => { if (error.status === 404) return {items:[]}; throw error; })));
      for (const result of pages) for (const item of result.items) videoIds.add(item.contentDetails.videoId);
    }
    const latest = [];
    for (const group of batches([...videoIds], 50)) {
      const details = await api('videos', {part:'snippet,contentDetails', id:group.join(',')});
      for (const item of details.items) {
        const info = item.snippet;
        const seconds = durationSeconds(item.contentDetails.duration);
        latest.push({id:item.id, title:info.title, channel:info.channelTitle, date:info.publishedAt,
          thumbnail:info.thumbnails.medium?.url || info.thumbnails.default?.url,
          short:seconds > 0 && (seconds <= 60 || (seconds <= 180 && /#shorts\b/i.test(info.title + ' ' + info.description)))});
      }
    }
    videos = latest.sort((a, b) => b.date.localeCompare(a.date));
    say('Loaded up to five recent uploads per channel. Shorts are estimated from duration and #Shorts tags.');
  } catch (error) {
    if (error.status === 401) token = '';
    say(error.message);
  } finally {
    busy = false;
    $('account').textContent = token ? 'Disconnect YouTube' : 'Connect YouTube';
    render();
  }
}

$('account').onclick = () => {
  if (token) {
    window.google?.accounts.oauth2.revoke(token, () => {});
    token = '';
    account = '';
    videos = sample;
    saved = read(key('saved'), []);
    watched = new Set(read(key('watched'), []));
    $('account').textContent = 'Connect YouTube';
    say('Sample feed � Connect YouTube to see your subscriptions.');
    render();
    return;
  }
  $('origin').textContent = location.origin;
  $('client').value = read('oauth-client', '');
  $('connect').showModal();
};
$('cancel').onclick = () => $('connect').close();
$('setup').onsubmit = event => {
  event.preventDefault();
  const client = $('client').value.trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(client)) {
    $('client').setCustomValidity('Enter the Web application OAuth client ID.');
    $('client').reportValidity();
    return;
  }
  $('connect').close();
  if (!window.google?.accounts?.oauth2) {
    say('Google sign-in could not load. Reload the page and try again.');
    return;
  }
  write('oauth-client', client);
  window.google.accounts.oauth2.initTokenClient({
    client_id:client,
    scope:'https://www.googleapis.com/auth/youtube.readonly',
    callback:response => {
      if (!response.access_token) { say(response.error_description || 'Google did not grant access.'); return; }
      token = response.access_token;
      refresh();
    },
    error_callback:error => say(error.type === 'popup_closed' ? 'Google sign-in was closed.' : 'Google sign-in could not open.')
  }).requestAccessToken();
};
$('client').oninput = () => $('client').setCustomValidity('');
$('refresh').onclick = refresh;
$('restore').onclick = () => { showWatched = !showWatched; render(); };
document.querySelectorAll('[data-tab]').forEach(element => {
  element.onclick = () => { tab = element.dataset.tab; render(); };
});
say('Sample feed � Connect YouTube to see your subscriptions.');
render();
