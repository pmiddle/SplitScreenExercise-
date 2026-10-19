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
    {id:'silent-cardio',title:'10 min Silent Cardio',creator:'Pamela Reif',videoId:'gFeEUq2624Q',duration:600,category:'No jumping · No equipment'},
    {id:'full-body',title:'20 min Full Body',creator:'Pamela Reif',videoId:'UBMk30rjy0o',duration:1200,category:'Full body · No equipment'},
    {id:'beginner-abs',title:'10 min Beginner Abs',creator:'Pamela Reif',videoId:'1f8yoFFdkcY',duration:600,category:'Beginner · No equipment',
      // User-supplied absolute video timestamps: 00:16–10:06.
      // Fifteen 30s work intervals, fourteen 10s rests; no rest after the last work.
      timerPreset:{offset:0,countdown:false,segments:[{start:16,end:606,work:30,rest:10}]}
    },
    {id:'lower-abs',title:'10 min Lower Abs',creator:'Pamela Reif',videoId:'54x6yjnzLms',duration:600,category:'Lower abs · No equipment',
      // User-supplied absolute windows. The first block is 490s: its final
      // nominal 30s interval clips to 10s at 8:25. No rest in any block.
      timerPreset:{offset:0,countdown:false,segments:[
        {start:15,end:505,work:30,rest:0},
        {start:505,end:525,work:20,rest:0},
        {start:525,end:615,work:30,rest:0}
      ]}
    },
    // The following six additions intentionally have no Automatic Cues preset.
    {id:'standing-cardio-dance',title:'30 min Standing Cardio Dance',creator:'Eleni Fit',videoId:'Zq0EH2E-oIs',duration:1800,category:'No jumping · Cardio HIIT'},
    {id:'standing-waist-abs',title:'30 min Small Waist + Abs',creator:'Eleni Fit',videoId:'hutTtNxJBec',duration:1800,category:'Standing · No jumping'},
    {id:'standing-abs-thigh',title:'30 min Standing Cardio · Abs + Thigh',creator:'Eleni Fit',videoId:'qpKXzVTfN4E',duration:1800,category:'No jumping · No repeats'},
    {id:'arms-shoulders',title:'20 min Toned Arms + Shoulders',creator:'growingannanas',videoId:'P7k7ABUKmxo',duration:1200,category:'Dumbbells · Upper body'},
    {id:'daily-strength',title:'10 min Daily Strength',creator:'growingannanas',videoId:'nUKKnkw7oAM',duration:600,category:'No equipment · No jumping'},
    {id:'standing-back',title:'15 min Standing Back Workout',creator:'MIZI',videoId:'yimeburgZX8',duration:900,category:'Back · Upper body'}
  ];
  // Optional timerPreset shape (attach ONLY after checking every boundary):
  // timerPreset: { offset: 60, countdown: false,
  //   segments: [{ start: 0, end: 600, work: 45, rest: 15 }] }
  // In this example the first work interval starts at VIDEO 1:00, not 2:00.
  return BUILT_IN_WORKOUTS;
});
