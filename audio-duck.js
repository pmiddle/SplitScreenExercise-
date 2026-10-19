/* Shared, reference-counted entertainment mute. No audio generation. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MoveMixAudioDucker=factory();})(typeof window==='undefined'?this:window,function(){
  'use strict';
  return class AudioDucker {
    constructor(adapter){this.adapter=adapter;this.leases=new Set();this.snapshot=null;}
    get active(){return this.leases.size>0;}
    acquire(reason='timer'){
      const token={reason};
      if(!this.active){
        const player=this.adapter.player();
        this.snapshot=player?{player,volume:player.getVolume(),muted:player.isMuted(),revision:this.adapter.revision()}:null;
      }
      this.leases.add(token);
      this.reassert();
      let released=false;
      return ()=>{
        if(released)return;released=true;this.leases.delete(token);
        if(this.active)return;
        const snapshot=this.snapshot;this.snapshot=null;
        if(snapshot&&this.adapter.player()===snapshot.player&&this.adapter.revision()===snapshot.revision){
          this.adapter.command('setVolume',[snapshot.volume],'Timer restore');
          this.adapter.command(snapshot.muted?'mute':'unMute',[],'Timer restore');
        }else this.adapter.applyPreferences();
      };
    }
    reassert(){if(this.active&&this.adapter.player())this.adapter.command('mute',[],'Temporary timer silence');}
  };
});
