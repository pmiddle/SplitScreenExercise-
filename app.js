(() => {
'use strict';
const YouTubeURL = window.URL;
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
// A platform hint only: a viewport size cannot reproduce Safari's media policy.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const debug = new YouTubeURL(location.href).searchParams.get('debug') === '1';
const commandHistory = {workout:[], entertainment:[]};
let commandSequence = 0, mobileAudioMode = false, expanded = false, restoreFocus, savedScroll = 0;
let audioBeforeMode = null;
let playing = false, initialized = false, apiPromise, filter = 'all', dialogMode = 'save', replaceCategory = 'entertainment';
function diagnostic(type, detail) {
  if (debug) console.info('[MOVE/MIX]', type, {at: new Date().toISOString(), ...detail});
}
function updateMuteButton(c) {
  const button = document.querySelector(`[data-mute="${c}"]`);
  button.textContent = muted[c] ? '×' : '♫';
  button.setAttribute('aria-pressed', String(muted[c]));
  button.setAttribute('aria-label', `${muted[c] ? 'Unmute' : 'Mute'} ${c}`);
}
function setMobileAudioMode(enabled) {
  if (enabled === mobileAudioMode) return;
  if (enabled) {
    audioBeforeMode = {...muted};
    muted.workout = true; muted.entertainment = false;
  } else if (audioBeforeMode) {
    Object.assign(muted, audioBeforeMode); audioBeforeMode = null;
  }
  mobileAudioMode = enabled;
  $('mobileAudioMode').setAttribute('aria-pressed', String(enabled));
  $('mobileAudioMode').textContent = enabled ? 'Muted workout mode: on' : 'Try muted workout mode';
  categories.forEach(c => { updateMuteButton(c); applySound(c); });
  status(enabled ? 'Workout muted; entertainment audio enabled. Press Play both to test this combination on your device.' : 'Previous mute settings restored. Press Play both when ready.');
  diagnostic('audio-mode', {enabled});
}
function setExpanded(enabled) {
  if (enabled === expanded) return;
  expanded = enabled;
  if (enabled) {
    restoreFocus = document.activeElement; savedScroll = window.scrollY;
    $('mobilePlaybackHelp').hidden = false;
  }
  document.body.classList.toggle('expanded', enabled);
  $('expandView').textContent = enabled ? 'Exit Expanded View' : 'Expand View';
  $('expandView').setAttribute('aria-pressed', String(enabled));
  // Only CSS changes: never move or replace iframe nodes or call fullscreen APIs.
  if (enabled) $('expandView').focus({preventScroll:true});
  else { window.scrollTo(0, savedScroll); restoreFocus?.focus({preventScroll:true}); }
  diagnostic('expanded-view', {enabled});
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && expanded && !$('editor').open) setExpanded(false);
});
function handlePlayerState(c, value) {
  const names = {'-1':'unstarted',0:'ended',1:'playing',2:'paused',3:'buffering',5:'cued'};
  const recent = commandHistory[c].filter(command => Date.now() - command.at < 2500);
  const match = recent.slice().reverse().find(command => command.expected === value && !command.observed);
  if (match) match.observed = true;
  diagnostic('player-state', {
    player:c, state:names[value] || value,
    attribution:match ? 'matches-recent-app-command (correlation, not proof)' : 'no-matching-app-command (YouTube/browser/native-control)',
    command:match ? {sequence:match.sequence, method:match.method, reason:match.reason} : null,
    recentCommands:recent.map(command => ({sequence:command.sequence, method:command.method, reason:command.reason}))
  });
  const both = categories.every(k => ready[k] && players[k].getPlayerState() === 1);
  $('sessionBadge').textContent = both ? 'IN YOUR ELEMENT' : 'YOUR SESSION';
  const other = c === 'workout' ? 'entertainment' : 'workout';
  if (value === 2 && playing && !match && ready[other] && players[other].getPlayerState() === 1) {
    $('mobilePlaybackHelp').hidden = false;
    status(`${c === 'workout' ? 'Workout' : 'Entertainment'} paused without a matching app pause request. YouTube or your browser may limit this combination. ${mobileAudioMode ? 'Muted mode is already on; try the individual video play buttons or choose one player below.' : 'Try muted workout mode, then tap Play both again.'}`);
  }
}
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
function applySound(c) { if (ready[c]) { invoke(c, 'setVolume', state[c+'Volume']); invoke(c, muted[c] ? 'mute' : 'unMute'); } }
function command(c, method, args = [], reason = 'app control') {
  if (!ready[c]) { diagnostic('command-skipped', {player:c, method, reason:'player not ready'}); return; }
  const expected = {playVideo:1,pauseVideo:2,loadVideoById:1,cueVideoById:5}[method];
  const record = {sequence:++commandSequence, at:Date.now(), method, reason, expected, observed:false};
  commandHistory[c].push(record);
  if (commandHistory[c].length > 24) commandHistory[c].shift();
  diagnostic('app-command', {player:c, sequence:record.sequence, method, reason});
  players[c][method](...args);
}
function invoke(c, method, ...args) { command(c, method, args); }
function loadVideo(c, id) {
  pending[c] = id;
  $(c+'PlayerError').hidden = true;
  if (ready[c]) {
    applySound(c);
    command(c, playing && !isIOS ? 'loadVideoById' : 'cueVideoById', [id], 'replace video');
    pending[c] = null;
  }
}
function createPlayer(c) {
  players[c] = new YT.Player(c+'Player', {
    width:'100%',height:'100%',videoId:pending[c],
    playerVars:{playsinline:1,autoplay:0,fs:isIOS ? 0 : 1,rel:0,origin:location.origin},
    events:{onReady: e => {
      ready[c] = true;
      e.target.getIframe().title = c === 'workout' ? 'Workout YouTube video' : 'Entertainment YouTube video';
      diagnostic('player-ready', {player:c, inline:true});
      // Set mute state before any load/play request, including after replacement.
      applySound(c);
      if (pending[c]) { command(c, playing && !isIOS ? 'loadVideoById' : 'cueVideoById', [pending[c]], 'initial video'); pending[c]=null; }
      if (playing && !isIOS) command(c, 'playVideo', [], 'desktop session start');
      if (categories.every(k => ready[k])) status(isIOS ? 'Both videos are ready. Tap Play both now to start from a fresh touch. If one pauses, try muted workout mode.' : 'Your mix is ready. If playback is paused, press Play both or use each video’s play button.');
    }, onError:e => {
      const message = e.data === 153 ? 'YouTube could not verify this page. Open the app through an HTTP server or a hosted URL, then try again.' : 'This video is unavailable or does not allow embedded playback. Try another YouTube video.';
      $(c+'PlayerError').textContent = message; $(c+'PlayerError').hidden=false;
      status((c === 'workout' ? 'Workout: ' : 'Entertainment: ') + message);
    },onAutoplayBlocked:() => {
      diagnostic('playback-blocked', {player:c}); $('mobilePlaybackHelp').hidden = false;
      status('YouTube reports a blocked playback request. Tap Play both again or use each video’s play button. If one pauses, try muted workout mode.');
    }, onStateChange:event => handlePlayerState(c,event.data)}
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
  playing=!isIOS; status('Connecting your two videos…');
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
  if (initialized) { loadVideo(c,id); status(`${c === 'workout' ? 'Workout' : 'Entertainment'} changed. Your other video keeps its place.${isIOS ? ' Tap play inside the changed video to start it.' : ''}`); }
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
    // Leaving the mode restores the old mix before applying this manual choice.
    const nextMuted = !muted[c];
    if (mobileAudioMode) setMobileAudioMode(false);
    muted[c]=nextMuted;updateMuteButton(c);applySound(c);
  };
});
$('position').value=state.position; $('stage').dataset.position=state.position;
$('position').onchange=e=>{state.position=e.target.value;$('stage').dataset.position=state.position;persist();};
$('setupForm').onsubmit=startSession;
$('playBoth').onclick=()=>{
  if(!initialized){startSession();return;}
  if(!categories.every(c=>ready[c])){status('YouTube is still getting ready. Tap Play both again when both videos are ready.');return;}
  playing=true;
  // Both calls are synchronous in this real click handler. No await, timer, or retry loop.
  categories.forEach(c=>applySound(c));
  command('workout','playVideo',[],'Play Both button');
  command('entertainment','playVideo',[],'Play Both button');
  status('Play requested for both videos. If one pauses, try muted workout mode or its YouTube play button.');
};
$('pauseBoth').onclick=()=>{playing=false;categories.forEach(c=>command(c,'pauseVideo',[],'Pause Both button'));status(initialized?'Both videos paused. Take your time.':'Add your videos to start a session.');};
$('expandView').onclick=()=>setExpanded(!expanded);
$('mobileAudioMode').onclick=()=>setMobileAudioMode(!mobileAudioMode);
$('showPlaybackHelp').onclick=()=>{
  $('mobilePlaybackHelp').hidden=false;
  $('mobilePlaybackHelp').open=!$('mobilePlaybackHelp').open;
};
document.querySelectorAll('[data-play-only]').forEach(button=>button.onclick=()=>{
  const c=button.dataset.playOnly,other=c==='workout'?'entertainment':'workout';
  if(!ready[c]){status('Start a session and wait for the videos to be ready first.');return;}
  playing=false; applySound(c);
  command(other,'pauseVideo',[],'Single player button'); command(c,'playVideo',[],'Single player button');
  status(`Playing ${c} only. Both players remain on the page.`);
});
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
$('mobilePlaybackHelp').hidden = !isIOS;
if (isIOS) $('platformNote').textContent = 'On iPhone/iPad, load your videos, then tap Play both. If starting one pauses the other, try muted workout mode. Use your device volume buttons if a slider has no effect.';
diagnostic('session-environment', {iosHint:isIOS, note:'iOS hint is not a playback capability test'});

})();
