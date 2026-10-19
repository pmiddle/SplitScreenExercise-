/* Buildless interval timer. The timeline/tracker are also exported for Node tests. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoveMixAutomaticCues = factory();
})(typeof window === 'undefined' ? this : window, function() {
  'use strict';
  const KEY = 'move-mix-automatic-cues-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const blank = () => ({enabled:false, offset:0, countdown:false, segments:[]});
  function parseTime(value) {
    const parts = String(value).trim().split(':');
    if (!parts.length || parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return NaN;
    if (parts.length > 1 && parts.slice(1).some(p => Number(p) >= 60)) return NaN;
    return parts.reduce((n,p) => n * 60 + Number(p), 0);
  }
  function formatTime(seconds) {
    const n = Math.max(0, Math.ceil(seconds));
    const h = Math.floor(n / 3600), m = Math.floor(n % 3600 / 60), s = n % 60;
    return `${h ? h + ':' + String(m).padStart(2,'0') : String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function validate(preset) {
    if (!preset || !Number.isInteger(preset.offset) || preset.offset < 0 || preset.offset > 86400) return 'Enter a valid intro offset (seconds, m:ss, or h:mm:ss).';
    if (!Array.isArray(preset.segments) || !preset.segments.length || preset.segments.length > 30) return 'Add between 1 and 30 timing segments.';
    let end = 0;
    for (let i = 0; i < preset.segments.length; i++) {
      const s = preset.segments[i];
      if (!s || !['start','end','work','rest'].every(k => Number.isInteger(s[k]))) return `Segment ${i+1}: enter whole seconds and valid times.`;
      if (s.start < 0 || s.end <= s.start || s.end + preset.offset > 86400) return `Segment ${i+1}: end must follow start, within 24 hours including the offset.`;
      if (s.start < end) return `Segment ${i+1}: segments must be in time order and cannot overlap.`;
      if (s.work < 1 || s.work > 3600 || s.rest < 0 || s.rest > 3600) return `Segment ${i+1}: work must be 1–3600 seconds; rest may be 0–3600 seconds.`;
      end = s.end;
    }
    return '';
  }
  function phaseAt(preset, videoTime) {
    const t = Math.max(0, videoTime) - preset.offset;
    for (let index = 0; index < preset.segments.length; index++) {
      const s = preset.segments[index];
      if (t < s.start) return {phase:'GET READY', remaining:s.start-t, next:'WORK', key:`intro:${index}`, segment:index};
      if (t >= s.end) continue;
      const period = s.work + s.rest, elapsed = t - s.start;
      const cycle = Math.floor(elapsed / period), within = elapsed - cycle * period;
      const phase = within < s.work ? 'WORK' : 'REST';
      const boundary = s.start + cycle * period + (phase === 'WORK' ? s.work : period);
      const end = Math.min(boundary, s.end);
      const nextSegment = preset.segments[index+1];
      const next = end === s.end ? (nextSegment ? (nextSegment.start === s.end ? 'WORK' : 'GET READY') : 'DONE') : phase === 'REST' || s.rest === 0 ? 'WORK' : 'REST';
      return {phase, remaining:Math.max(0,end-t), next, key:`${index}:${cycle}:${phase}`, segment:index};
    }
    return {phase:'DONE', remaining:0, next:'—', key:'done', segment:-1};
  }
  class Tracker {
    reset() { this.previous = null; this.warningKey = null; }
    update(sample, preset, now) {
      const phase = phaseAt(preset, sample.time), prev = this.previous;
      let cue = null;
      const wall = prev ? (now - prev.now) / 1000 : 0;
      const delta = prev ? sample.time - prev.time : 0;
      const continuous = prev && sample.state === 1 && prev.state === 1 && wall > 0 && wall <= 1.25 && delta >= 0 && delta <= Math.max(0.9, wall * (sample.rate || 1) + 0.45);
      if (!continuous) this.warningKey = phase.remaining <= 3 ? phase.key : null;
      else {
        if (phase.key !== prev.phase.key) {
          if (phase.phase === 'WORK' || phase.phase === 'REST') cue = phase.phase;
          else if(phase.phase === 'GET READY' && (prev.phase.phase === 'WORK' || prev.phase.phase === 'REST'))cue='REST';
          else if(phase.phase === 'DONE' && (prev.phase.phase === 'WORK' || prev.phase.phase === 'REST'))cue='DONE';
          this.warningKey = null;
        } else if (preset.countdown && phase.phase === 'WORK' && phase.remaining <= 3 && prev.phase.remaining > 3 && this.warningKey !== phase.key) {
          cue = 'WARNING'; this.warningKey = phase.key;
        }
      }
      this.previous = {time:sample.time, state:sample.state, now, phase};
      return {...phase, cue};
    }
  }
  class CueAudio {
    constructor(adapter, notice) { this.adapter=adapter; this.notice=notice; this.nodes=[]; this.context=null; this.cleanupTimer=null; this.release=null; this.generation=0; }
    unlock() {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) { this.notice('This browser has no Web Audio support. The visual timer still works.'); return Promise.resolve(false); }
        if (!this.context || this.context.state === 'closed') {
          this.context = new Audio();
          this.context.onstatechange = () => {
            if (this.context.state !== 'running') {
              this.stop(); this.notice('Cue audio is paused by the browser. Tap Play Both to re-enable sound.');
            }
          };
        }
        // Called only by an explicit enable/save/test/Play Both/Start Session gesture.
        return this.context.resume().then(() => {
          const ok = this.context.state === 'running';
          if (ok) this.notice('Cue sound ready. Keep this page visible during your workout.');
          return ok;
        }).catch(() => { this.notice('Sound could not start. Tap Play Both to try again; the visual timer still works.'); return false; });
      } catch { this.notice('Sound is unavailable. The visual timer still works.'); return Promise.resolve(false); }
    }
    play(kind) {
      if (!this.context || this.context.state !== 'running' || document.hidden) {
        this.notice('Timer is tracking visually. Tap Play Both to enable sound.'); return false;
      }
      this.stop();
      const ctx=this.context, lead=0.06, starts=kind === 'REST' || kind === 'DONE' ? [0,0.14] : [0];
      const duration=kind === 'WARNING' ? 0.06 : kind === 'REST' || kind === 'DONE' ? 0.09 : 0.13;
      const hz=kind === 'WORK' ? 880 : kind === 'REST' ? 440 : 660;
      try {
        this.release=this.adapter.beginDuck();
        starts.forEach(offset => {
          const osc=ctx.createOscillator(), gain=ctx.createGain();
          const start=ctx.currentTime+lead+offset;
          osc.type='sine'; osc.frequency.value=hz;
          gain.gain.setValueAtTime(0,start);
          gain.gain.linearRampToValueAtTime(kind === 'WARNING' ? 0.055 : 0.11,start+0.01);
          gain.gain.linearRampToValueAtTime(0,start+duration);
          osc.connect(gain);gain.connect(ctx.destination);
          this.nodes.push({osc,gain});osc.start(start);osc.stop(start+duration+0.01);
        });
        const length=lead+starts[starts.length-1]+duration+0.06;
        this.cleanupTimer=setTimeout(()=>this.stop(),length*1000);
        this.adapter.log?.('timer-cue',{kind});
        return true;
      } catch { this.stop(); this.notice('Cue sound failed. The visual timer continues; tap Play Both to retry.'); return false; }
    }
    stop() {
      this.generation++;
      clearTimeout(this.cleanupTimer);this.cleanupTimer=null;
      this.nodes.forEach(({osc,gain})=>{try{osc.stop();}catch{}osc.disconnect();gain.disconnect();});this.nodes=[];
      const release=this.release;this.release=null;if(release)release();
    }
  }
  class AutomaticCues {
    constructor(adapter) {
      this.adapter=adapter;this.id=null;this.preset=blank();this.preferences=Object.create(null);this.tracker=new Tracker();this.poll=null;this.announced='';
      this.$=id=>document.getElementById(id);
      this.audio=new CueAudio(adapter,message=>this.notice(message));
      try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved&&typeof saved==='object')Object.entries(saved).forEach(([id,on])=>{if(/^[\w-]{11}$/.test(id)&&typeof on==='boolean')this.preferences[id]=on;});}catch{}
      this.$('timerEnabled').onclick=()=>this.toggle();
      document.addEventListener('visibilitychange',()=>this.resync());
      window.addEventListener('pagehide',()=>this.audio.stop());
      this.bindWorkout(null);
    }
    notice(message){this.$('timerNotice').textContent=message;this.$('timerNotice').hidden=!message;}
    bindWorkout(id){
      if(id&&id===this.id){this.resync();return;}
      this.audio.stop();this.stopPolling();this.id=id;this.tracker.reset();
      const pick=(this.adapter.workouts||[]).find(pick=>pick.videoId===id&&pick.timerPreset);
      const source=pick?{offset:0,countdown:false,...clone(pick.timerPreset)}:null;
      this.available=!!source&&!validate(source);
      this.preset=this.available?{...source,enabled:this.preferences[id]===true}:blank();
      this.$('automaticControls').hidden=!this.available;
      this.$('timerEnabled').disabled=!this.available;
      this.notice(this.preset.enabled?'Automatic Cues restored. Tap Play Both to enable cue sound.':'');
      this.updateEnabled();
    }
    toggle(){
      if(!this.available)return;
      this.preset.enabled=!this.preset.enabled;this.preferences[this.id]=this.preset.enabled;
      this.resync();this.updateEnabled();
      try{localStorage.setItem(KEY,JSON.stringify(this.preferences));this.notice('');}catch{this.notice('Automatic Cues changed for this session; storage is unavailable.');}
      if(this.preset.enabled)this.unlockFromGesture();
    }
    updateEnabled(){
      const on=this.preset.enabled;
      this.$('timerEnabled').textContent=`Automatic Cues: ${on?'ON':'OFF'}`;
      this.$('timerEnabled').setAttribute('aria-pressed',String(on));
      this.$('timerOverlay').hidden=!on;this.stopPolling();
      if(on){this.tick();this.poll=setInterval(()=>this.tick(),250);}
    }
    stopPolling(){if(this.poll!==null)clearInterval(this.poll);this.poll=null;}
    resync(){this.tracker.reset();this.audio.stop();}
    unlockFromGesture(){if(this.preset.enabled)return this.audio.unlock();return Promise.resolve(false);}
    tick(){
      if(!this.preset.enabled)return;
      if(document.hidden){this.resync();return;}
      let sample;try{sample=this.adapter.sample();}catch{sample=null;}
      if(!sample||sample.videoId!==this.id||!Number.isFinite(sample.time)){
        this.tracker.reset();this.render({phase:'READY',remaining:null,next:'Load workout'});return;
      }
      if(sample.state!==1&&this.tracker.previous?.state===1)this.audio.stop();
      const phase=this.tracker.update(sample,this.preset,performance.now());
      this.render({...phase,paused:sample.state!==1});
      // Quick Timer has no generated sound. Skip automatic tones during that
      // manually selected exercise, while keeping the automatic timeline aligned.
      if(phase.cue&&!this.adapter.suppressAudio?.())this.audio.play(phase.cue);
    }
    render(phase){
      this.$('timerPhase').textContent=phase.phase;
      this.$('timerRemaining').textContent=phase.remaining===null?'—':formatTime(phase.remaining);
      this.$('timerNext').textContent=phase.paused?`Paused · Next: ${phase.next}`:`Next: ${phase.next}`;
      this.$('timerOverlay').dataset.phase=phase.phase;
      const announcement=`${phase.phase}${phase.paused?' paused':''}`;
      if(announcement!==this.announced){this.$('timerAnnouncement').textContent=announcement;this.announced=announcement;}
    }
  }
  Object.assign(AutomaticCues,{KEY,parseTime,formatTime,validate,phaseAt,Tracker,CueAudio});
  return AutomaticCues;
});
