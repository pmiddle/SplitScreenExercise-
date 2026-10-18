(() => {
const YouTubeURL = window.URL;
'use strict';
const $ = id => document.getElementById(id);
const categories = ['workout', 'entertainment'];
const STORAGE = 'move-mix-v1';
function videoId(value) {
  try {
    const url = new YouTubeURL(value.trim().replace(/^(www\.|youtu\.be\/|youtube\.com\/|m\.youtube\.com\/)/i, 'https://$1'));
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    let id;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      const parts = url.pathname.split('/').filter(Boolean);
      id = parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] : null;
    }
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORAGE)) || {}; } catch {}
const state = { workoutUrl: '', entertainmentUrl: '', workoutVolume: 35, entertainmentVolume: 80, position: 'bottom-right', favorites: [], ...saved };
categories.forEach(c => {
  state[c + 'Url'] = typeof state[c + 'Url'] === 'string' ? state[c + 'Url'] : '';
  state[c + 'Volume'] = Number.isFinite(Number(state[c + 'Volume'])) ? Math.max(0, Math.min(100, Number(state[c + 'Volume']))) : c === 'workout' ? 35 : 80;
});
state.favorites = Array.isArray(state.favorites) ? state.favorites.filter(f => f && categories.includes(f.category) && typeof f.name === 'string' && videoId(f.url) === f.videoId) : [];
if (!['bottom-right','bottom-left','top-right','top-left'].includes(state.position)) state.position = 'bottom-right';
function persist() { try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch { status('Device storage is unavailable. Your current mix still works, but changes cannot be saved.'); } }
function status(message) { $('status').textContent = message; }
const players = {workout: null, entertainment: null};
let workoutPlayer, entertainmentPlayer;
const ready = {workout:false, entertainment:false};
const pending = {workout:null, entertainment:null};
const muted = {workout:false, entertainment:false};
let playing = false, initialized = false, apiPromise, filter = 'all', dialogMode = 'save', replaceCategory = 'entertainment';
function youtubeAPI() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve,reject) => {
    const timeout = setTimeout(() => { apiPromise = null; reject(new Error('YouTube is taking too long to connect. Check your connection or content blocker, then try Start session again.')); }, 15000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); resolve(); };
    const old = $('youtubeApi'); if (old) old.remove();
    const script = document.createElement('script'); script.id = 'youtubeApi'; script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { clearTimeout(timeout); apiPromise = null; reject(new Error('Could not connect to YouTube. Check your connection and try again.')); };
    document.head.appendChild(script);
  });
  return apiPromise;
}
function applySound(c) { if (ready[c]) { players[c].setVolume(state[c+'Volume']); muted[c] ? players[c].mute() : players[c].unMute(); } }
function invoke(c, method, ...args) { if (ready[c]) players[c][method](...args); }
function loadVideo(c, id) {
  pending[c] = id;
  $(c+'PlayerError').hidden = true;
  if (ready[c]) {
    players[c][playing ? 'loadVideoById' : 'cueVideoById'](id);
    pending[c] = null; applySound(c);
  }
}
function createPlayer(c) {
  players[c] = new YT.Player(c+'Player', {
    width:'100%',height:'100%',videoId:pending[c],
    playerVars:{playsinline:1,autoplay:0,rel:0,origin:location.origin},
    events:{onReady: e => {
      ready[c] = true;
      e.target.getIframe().title = c === 'workout' ? 'Workout YouTube video' : 'Entertainment YouTube video';
      if (pending[c]) { e.target[playing ? 'loadVideoById' : 'cueVideoById'](pending[c]); pending[c]=null; }
      applySound(c);
      if (playing) e.target.playVideo();
      if (categories.every(k => ready[k])) status('Your mix is ready. If playback is paused, press Play both or use each video’s play button.');
    }, onError:e => {
      const message = e.data === 153 ? 'YouTube could not verify this page. Open the app through an HTTP server or a hosted URL, then try again.' : 'This video is unavailable or does not allow embedded playback. Try another YouTube video.';
      $(c+'PlayerError').textContent = message; $(c+'PlayerError').hidden=false;
      status((c === 'workout' ? 'Workout: ' : 'Entertainment: ') + message);
    },onAutoplayBlocked:() => status('Your browser paused automatic playback. Press Play both, or press play inside each YouTube player.'),
    onStateChange:() => {
      const both = categories.every(k => ready[k] && players[k].getPlayerState() === 1);
      $('sessionBadge').textContent = both ? 'IN YOUR ELEMENT' : 'YOUR SESSION';
    }}
  });
  if (c === 'workout') workoutPlayer = players[c]; else entertainmentPlayer = players[c];
}
async function startSession(event) {
  event?.preventDefault();
  let valid = true;
  const ids = {};
  categories.forEach(c => {
    ids[c] = videoId($(c+'Url').value);
    $(c+'Error').textContent = ids[c] ? '' : 'Paste a valid YouTube video link to get started.';
    $(c+'Url').setAttribute('aria-invalid', String(!ids[c]));
    if (!ids[c]) valid=false;
  });
  if (!valid) { status('Check the video links above.'); return; }
  categories.forEach(c => { state[c+'Url'] = $(c+'Url').value.trim(); }); persist();
  playing=true; status('Connecting your two videos…');
  const submit = document.querySelector('.start'); submit.disabled=true;
  try {
    await youtubeAPI();
    $('stageEmpty').hidden=true;
    categories.forEach(c => { $(c+'Shell').hidden=false; loadVideo(c,ids[c]); if (!players[c]) createPlayer(c); });
    initialized=true; updateLayout(); $('sessionBadge').textContent='YOUR SESSION';
  } catch(e) {status(e.message);} finally {submit.disabled=false;}
}
function updateLayout() {
  const main = $('stage').dataset.main;
  categories.forEach(c => $(c+'Shell').classList.toggle('small', c !== main));
}
function setMode(mode) {
  document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('active',b.dataset.mode===mode); b.setAttribute('aria-pressed',String(b.dataset.mode===mode)); });
  if (mode !== 'mixed') $('stage').dataset.main=mode;
  updateLayout();
}
async function replace(c, url) {
  const id = videoId(url); if (!id) return;
  state[c+'Url']=url.trim(); $(c+'Url').value=state[c+'Url']; $(c+'Error').textContent=''; $(c+'Url').setAttribute('aria-invalid','false'); persist();
  if (initialized) { loadVideo(c,id); status(`${c === 'workout' ? 'Workout' : 'Entertainment'} changed. Your other video keeps its place.`); }
  else status('Video added to setup. Add your other video and press Start session.');
}
function openEditor(mode,c) {
  dialogMode=mode; replaceCategory=c || 'entertainment'; $('editorForm').reset(); $('editorError').textContent='';
  const isSave=mode==='save';
  $('categoryLabel').hidden=!isSave; $('nameLabel').hidden=!isSave; $('favoriteName').required=isSave;
  $('favoriteCategory').value=replaceCategory;
  $('editorUrl').value=$(replaceCategory+'Url').value;
  $('dialogTitle').textContent=isSave?'Save a little motivation.':`Change ${replaceCategory}.`;
  $('dialogEyebrow').textContent=isSave?'YOUR COLLECTION':'A FRESH MIX';
  $('editorSubmit').textContent=isSave?'Save video ↗':'Replace video ↗';
  $('editor').showModal();
}
function renderFavorites() {
  const list=$('favoriteList'); list.replaceChildren();
  $('favoriteCount').textContent=state.favorites.length;
  const entertainment=state.favorites.filter(f=>f.category==='entertainment');
  $('surprise').disabled=entertainment.length<2;
  const items=state.favorites.filter(f=>filter==='all'||f.category===filter);
  if (!items.length) {
    const el=document.createElement('div');el.className='collection-empty';
    const title=document.createElement('b');title.textContent='Your favorites deserve a spot here.';
    el.append(title,document.createTextNode('Save your go-to videos. Make your next mix in a click.'));list.append(el);
  }
  items.forEach(f=> {
    const card=document.createElement('article');card.className='favorite';
    const load=document.createElement('button');load.className='favorite-load';load.title=`Load ${f.name} as ${f.category}`;
    const img=document.createElement('img');img.src=`https://i.ytimg.com/vi/${f.videoId}/hqdefault.jpg`;img.alt='';img.loading='lazy';
    const copy=document.createElement('span');copy.className='favorite-copy';
    const type=document.createElement('small');type.textContent=f.category;
    const name=document.createElement('b');name.textContent=f.name;copy.append(type,name);load.append(img,copy);
    load.onclick=()=>replace(f.category,f.url);
    const del=document.createElement('button');del.className='delete-favorite';del.textContent='×';del.setAttribute('aria-label',`Remove ${f.name}`);
    del.onclick=()=>{state.favorites=state.favorites.filter(x=>x!==f);persist();renderFavorites();status('Favorite removed.');};
    card.append(load,del);list.append(card);
  });
}
categories.forEach(c=> {
  $(c+'Url').value=state[c+'Url']; $(c+'Volume').value=state[c+'Volume']; $(c+'VolumeValue').textContent=state[c+'Volume']+'%';
  $(c+'Volume').addEventListener('input',e=>{state[c+'Volume']=Number(e.target.value);$(c+'VolumeValue').textContent=e.target.value+'%';applySound(c);persist();});
  document.querySelector(`[data-mute="${c}"]`).onclick=e=> {
    muted[c]=!muted[c];e.currentTarget.textContent=muted[c]?'×':'♫';e.currentTarget.setAttribute('aria-pressed',String(muted[c]));e.currentTarget.setAttribute('aria-label',`${muted[c]?'Unmute':'Mute'} ${c}`);applySound(c);
  };
});
$('position').value=state.position; $('stage').dataset.position=state.position;
$('position').onchange=e=>{state.position=e.target.value;$('stage').dataset.position=state.position;persist();};
$('setupForm').onsubmit=startSession;
$('playBoth').onclick=()=>{if(!initialized){startSession();return;}playing=true;categories.forEach(c=>invoke(c,'playVideo'));status('Playing your mix. If a video stays paused, use its YouTube play button.');};
$('pauseBoth').onclick=()=>{playing=false;categories.forEach(c=>invoke(c,'pauseVideo'));status(initialized?'Both videos paused. Take your time.':'Add your videos to start a session.');};
$('restart').onclick=()=>{if(!ready.workout){status('Start a session before restarting your workout.');return;}invoke('workout','seekTo',0,true);status('Workout back to the beginning. Entertainment stays where it is.');};
$('swap').onclick=()=>{$('stage').dataset.main=$('stage').dataset.main==='workout'?'entertainment':'workout';setMode('mixed');status('Screens swapped. Playback stays in place.');};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
document.querySelectorAll('[data-change]').forEach(b=>b.onclick=()=>openEditor('replace',b.dataset.change));
document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>openEditor('save',b.dataset.save));
$('addFavorite').onclick=()=>openEditor('save','entertainment');
$('closeDialog').onclick=()=>$('editor').close();
$('editorForm').onsubmit=e=> {
  e.preventDefault();const url=$('editorUrl').value.trim(),id=videoId(url);
  if(!id){$('editorError').textContent='That link does not look like a YouTube video. Try a watch, Shorts, embed, or youtu.be link.';return;}
  if(dialogMode==='save') {
    const name=$('favoriteName').value.trim();if(!name){$('editorError').textContent='Give your favorite a name.';return;}
    const category=$('favoriteCategory').value;
    const existing=state.favorites.find(f=>f.category===category&&f.videoId===id);
    if(existing){existing.name=name;existing.url=url;}else state.favorites.push({name,url,videoId:id,category});
    persist();renderFavorites();status('Saved to your collection.');
  } else replace(replaceCategory,url);
  $('editor').close();
};
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderFavorites();});
$('surprise').onclick=()=> {
  const all=state.favorites.filter(f=>f.category==='entertainment');if(all.length<2)return;
  const current=videoId(state.entertainmentUrl);const options=all.filter(f=>f.videoId!==current);
  const pick=options[Math.floor(Math.random()*options.length)];if(pick)replace('entertainment',pick.url);
};
function demo(){ $('workoutUrl').value='https://www.youtube.com/watch?v=UBMk30rjy0o';$('entertainmentUrl').value='https://www.youtube.com/watch?v=dQw4w9WgXcQ';startSession(); }
$('demo').onclick=demo;$('emptyDemo').onclick=demo;
updateLayout();renderFavorites();

})();
