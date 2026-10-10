// Core Banker game logic — shared by index.html and tests.html.
// Pure calculation functions plus the mutable game state (G).

var HOLES = 18;
var BETS = [5,10,15,20,25,30,40,50,75,100,125,150,175,200,250,300,350,400,450,500];
var COURSE = {rating:71.3,slope:134,par:72,holes:[
  {h:1,par:4,si:9},{h:2,par:5,si:13},{h:3,par:4,si:3},{h:4,par:4,si:7},
  {h:5,par:3,si:11},{h:6,par:5,si:1},{h:7,par:3,si:17},{h:8,par:4,si:15},
  {h:9,par:4,si:5},{h:10,par:4,si:4},{h:11,par:3,si:16},{h:12,par:4,si:10},
  {h:13,par:4,si:8},{h:14,par:5,si:2},{h:15,par:5,si:14},{h:16,par:4,si:18},
  {h:17,par:3,si:12},{h:18,par:4,si:6}
]};

var TEES = {white:{rating:71.3,slope:134}, blue:{rating:72.6,slope:137}};
var G = {players:[],count:3,holes:[],active:0,hdcp:{},chdcp:{},course:'home',tee:'white'};

function fmt(v){return v===0?'E':(v>0?'+$':'-$')+Math.abs(v);}

// Course Handicap = Index x (Slope/113) + (Rating - Par)
function courseHdcp(index,tee,par){
  if(par===undefined) par=COURSE.par;
  return Math.round(index*(tee.slope/113)+(tee.rating-par));
}

// Nets a list of raw handicap indexes down to the low player (who plays at 0).
function netHandicaps(indexes,tee,par){
  var raw=indexes.map(function(idx){return courseHdcp(idx,tee,par);});
  var low=Math.min.apply(null,raw);
  return raw.map(function(r){return r-low;});
}

// The single place that wires a typed-in Index into G.hdcp/G.chdcp.
// G.chdcp is what getStrokes()/calcResult() read as "strokes" — this makes the
// computed NET behave exactly like the old directly-typed Strokes field did.
function applyHandicaps(players,indexes,tee,par){
  var net=netHandicaps(indexes,tee,par);
  G.hdcp={}; G.chdcp={};
  for(var i=0;i<players.length;i++){
    G.hdcp[players[i]]=indexes[i];
    G.chdcp[players[i]]=net[i];
  }
  return net;
}

// The holes in play for the current game: Rolling Green's layout at home, or
// G.awayHoles (same pars, custom stroke-index sequence) when an away course
// with its own SI sequence has been entered.
function activeHoles(){
  return (G.course==='away'&&G.awayHoles&&G.awayHoles.length===HOLES)?G.awayHoles:COURSE.holes;
}

// Par 3 = 3x press, Par 4/5 = 2x press
function holeMult(hi){
  return activeHoles()[hi].par===3?3:2;
}

function calcMult(press,hi){
  var pm=press.player?holeMult(hi):1;
  return press.banker?pm*holeMult(hi):pm;
}

function finalWager(base,press,hi){
  return base*calcMult(press,hi);
}

function getStrokes(player,hi){
  var ch=G.chdcp[player]||0,si=activeHoles()[hi].si,s=0;
  if(ch>=si) s++;
  if(ch>=18+si) s++;
  return s;
}

// True only if si is a permutation of 1..18 (every course's SI must be).
function isValidSISequence(si){
  if(!si||si.length!==HOLES) return false;
  var seen={};
  for(var i=0;i<si.length;i++){
    var n=si[i];
    if(!(n>=1&&n<=18)||seen[n]) return false;
    seen[n]=true;
  }
  return true;
}

// Builds an away course's holes array: keeps Rolling Green's par layout (par
// isn't collected for away courses) but uses the entered SI sequence.
function buildAwayHoles(si){
  var arr=[];
  for(var i=0;i<HOLES;i++) arr.push({h:i+1,par:COURSE.holes[i].par,si:si[i]});
  return arr;
}

function initHoles(players){
  var arr=[];
  for(var i=0;i<HOLES;i++){
    var w={},pr={},sc={};
    for(var j=0;j<players.length;j++){
      w[players[j]]=null;
      pr[players[j]]={player:false,banker:false};
      sc[players[j]]='';
    }
    arr.push({hole:i+1,banker:null,lmin:5,lmax:50,wagers:w,press:pr,strokes:sc,locked:false});
  }
  return arr;
}

function calcResult(hole){
  if(!hole.banker) return null;
  var hi=hole.hole-1;
  var bs=Number(hole.strokes[hole.banker]);
  if(!bs) return null;
  var bnet=bs-getStrokes(hole.banker,hi);
  var res={},bn=0;
  for(var i=0;i<G.players.length;i++){
    var p=G.players[i];
    if(p===hole.banker) continue;
    var ps=Number(hole.strokes[p]);
    if(!ps||hole.wagers[p]==null) continue;
    var pnet=ps-getStrokes(p,hi);
    var fw=finalWager(hole.wagers[p],hole.press[p],hi);
    var diff=bnet-pnet;
    var amt=diff>0?fw:diff<0?-fw:0;
    res[p]=amt; bn-=amt;
  }
  res[hole.banker]=bn;
  return res;
}

// Gross strokes per player, split front/back/total across locked holes only.
// Net = total gross strokes minus the player's net course handicap (G.chdcp).
function calcScores(){
  var front={},back={},total={},net={};
  for(var i=0;i<G.players.length;i++){var p=G.players[i];front[p]=0;back[p]=0;total[p]=0;}
  for(var i=0;i<G.holes.length;i++){
    var h=G.holes[i]; if(!h.locked) continue;
    for(var j=0;j<G.players.length;j++){
      var p=G.players[j],s=Number(h.strokes[p]); if(!s) continue;
      if(h.hole<=9) front[p]+=s; else back[p]+=s;
      total[p]+=s;
    }
  }
  for(var i=0;i<G.players.length;i++){var p=G.players[i];net[p]=total[p]-(G.chdcp[p]||0);}
  return {front:front,back:back,total:total,net:net};
}

function calcTotals(){
  var t={};
  for(var i=0;i<G.players.length;i++) t[G.players[i]]=0;
  for(var i=0;i<G.holes.length;i++){
    var h=G.holes[i]; if(!h.locked) continue;
    var r=calcResult(h); if(!r) continue;
    for(var j=0;j<G.players.length;j++) t[G.players[j]]+=(r[G.players[j]]||0);
  }
  return t;
}
