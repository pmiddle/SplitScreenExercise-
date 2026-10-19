/* Quick Timer is elapsed-time only. It never reads YouTube time or uses Web Audio. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MoveMixQuickTimer=factory();})(typeof window==='undefined'?this:window,function(){
  'use strict';
  const KEY='move-mix-quick-timer-v1';
  const valid=seconds=>Number.isInteger(seconds)&&seconds>=1&&seconds<=3600;
  class Countdown {
    constructor(adapter){this.adapter=adapter;this.end=null;this.release=null;this.timeout=null;}
    get running(){return this.end!==null;}
    start(seconds){
      if(!valid(seconds))return false;
      this.cancel(false);
      this.end=this.adapter.now()+seconds*1000;
      this.tick();return true;
    }
    tick(){
      this.adapter.clear(this.timeout);this.timeout=null;
      if(!this.running)return;
      const remaining=this.end-this.adapter.now();
      // A late callback finishes immediately; it never plays a delayed silence cue.
      if(remaining<=0){this.cancel(false);this.adapter.render({running:false,finished:true,seconds:0});return;}
      if(remaining<=1500&&!this.release)this.release=this.adapter.beginDuck();
      this.adapter.render({running:true,seconds:Math.ceil(remaining/1000),silent:!!this.release});
      const next=Math.min(250,remaining>1500?remaining-1500:remaining);
      this.timeout=this.adapter.schedule(()=>this.tick(),Math.max(8,next));
    }
    cancel(render=true){
      this.adapter.clear(this.timeout);this.timeout=null;this.end=null;
      const release=this.release;this.release=null;if(release)release();
      if(render)this.adapter.render({running:false,seconds:0});
    }
  }
  class QuickTimer {
    constructor(adapter){
      this.adapter=adapter;this.$=id=>document.getElementById(id);this.custom=45;this.lastSeconds=null;
      try{const value=JSON.parse(localStorage.getItem(KEY));if(valid(value?.customDuration))this.custom=value.customDuration;}catch{}
      this.clock=new Countdown({now:()=>performance.now(),schedule:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id),beginDuck:()=>adapter.beginDuck('quick'),render:value=>this.render(value)});
      document.querySelectorAll('[data-quick-seconds]').forEach(button=>button.onclick=()=>this.start(Number(button.dataset.quickSeconds)));
      this.$('quickCancel').onclick=()=>this.clock.cancel();this.$('quickOverlayCancel').onclick=()=>this.clock.cancel();
      this.$('quickCustom').onclick=()=>{this.$('quickCustomPanel').hidden=!this.$('quickCustomPanel').hidden;if(!this.$('quickCustomPanel').hidden)this.$('quickCustomSeconds').focus();};
      this.$('quickCustomClose').onclick=()=>{this.$('quickCustomPanel').hidden=true;this.$('quickCustom').focus();};
      this.$('quickChange').onclick=()=>{this.$('quickChoices').hidden=!this.$('quickChoices').hidden;};
      this.$('quickReuse').onclick=()=>this.start(this.custom);
      this.$('quickCustomSeconds').value=this.custom;
      this.$('quickCustomForm').onsubmit=event=>{
        event.preventDefault();const seconds=Number(this.$('quickCustomSeconds').value);
        if(!valid(seconds)){this.$('quickError').textContent='Choose 1–3600 whole seconds.';return;}
        this.custom=seconds;
        try{localStorage.setItem(KEY,JSON.stringify({customDuration:seconds}));}catch{this.$('quickAnnouncement').textContent='Custom duration works for this session; storage is unavailable.';}
        this.updateReuse();this.start(seconds);
      };
      document.addEventListener('visibilitychange',()=>this.clock.tick());
      window.addEventListener('pagehide',()=>this.clock.cancel());
      this.updateReuse();this.render({running:false,seconds:0});
    }
    updateReuse(){this.$('quickReuse').textContent=`${this.custom}s`;this.$('quickReuse').setAttribute('aria-label',`Start last custom timer: ${this.custom} seconds`);this.$('quickReuse').hidden=[30,45,60].includes(this.custom);}
    start(seconds){
      if(!valid(seconds))return;
      this.adapter.onStart?.();
      this.$('quickCustomPanel').hidden=true;this.$('quickError').textContent='';
      this.clock.start(seconds);this.$('quickChoices').hidden=true;
      this.$('quickCancel').focus({preventScroll:true});
      this.$('quickAnnouncement').textContent=`${seconds}-second Quick Timer started. Entertainment will be silent for the final 1.5 seconds.`;
    }
    render(value){
      this.$('quickRunning').hidden=!value.running;
      if(this.wasRunning!==value.running)this.$('quickChoices').hidden=value.running;
      this.wasRunning=value.running;
      this.$('quickOverlay').hidden=!value.running;
      this.$('stage').classList.toggle('quick-timer-running',value.running);
      if(value.running){
        if(this.lastSeconds!==value.seconds){this.$('quickRemaining').textContent=value.seconds;this.$('quickOverlayRemaining').textContent=value.seconds;this.lastSeconds=value.seconds;}
        this.$('quickOverlay').dataset.silent=String(value.silent);
      }else{this.lastSeconds=null;this.$('quickOverlay').dataset.silent='false';if(value.finished)this.$('quickAnnouncement').textContent='Quick Timer finished. Entertainment audio restored.';}
    }
  }
  Object.assign(QuickTimer,{KEY,Countdown,valid});return QuickTimer;
});
