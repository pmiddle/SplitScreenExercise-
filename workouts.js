/* Developer-owned library. Never copied into the user's Favorites or timer data.
 * See WORKOUTS_AND_TIMERS.md before adding a timerPreset. Timing must be verified
 * against the video; nominal duration is not enough to infer an interval schedule.
 * Segment start/end are relative to offset, exactly as in the existing engine.
 */
(function(root,factory){const workouts=factory();if(typeof module==='object'&&module.exports)module.exports=workouts;else root.BUILT_IN_WORKOUTS=workouts;})(typeof window==='undefined'?this:window,function(){
  'use strict';
  const BUILT_IN_WORKOUTS=[
    {id:'sweaty-endorphins',title:'10 min Sweaty Endorphins',creator:'Pamela Reif',videoId:'LcxzO9FSLfQ',duration:600,category:'Dance · 2 timed moves',
      // User-supplied absolute video windows. offset is zero, so the segment
      // timestamps are video timestamps: 6:50–7:20 and 7:45–8:00 only.
      timerPreset:{offset:0,countdown:false,segments:[
        {start:410,end:440,work:30,rest:0},
        {start:465,end:480,work:15,rest:0}
      ]}
    },
    {id:'standing-core',title:'10 min Standing Abs',creator:'MadFit',videoId:'DNqkPbglnjU',duration:600,category:'Standing · No equipment'},
    {id:'full-body',title:'20 min Full Body',creator:'Pamela Reif',videoId:'UBMk30rjy0o',duration:1200,category:'Full body · No equipment'}
  ];
  // Optional timerPreset shape (attach ONLY after checking every boundary):
  // timerPreset: { offset: 60, countdown: false,
  //   segments: [{ start: 0, end: 600, work: 45, rest: 15 }] }
  // In this example the first work interval starts at VIDEO 1:00, not 2:00.
  return BUILT_IN_WORKOUTS;
});
