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
var G = {players:[],count:3,holes:[],active:0,hdcp:{},raw:{},chdcp:{},course:'home',tee:'white',roster:{}};

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

// The single place that wires a typed-in Index into the handicap maps.
//
// G.hdcp  — the Index as typed.
// G.raw   — the raw course handicap, before any netting. This is the durable
//           number: every per-hole netting below is derived from it.
// G.chdcp — the netting in force for the REST OF THE ROUND, which is what the
//           leaderboard's CH and the scorecard's net score show. Holes already
//           played are netted by chdcpAt(), not by this.
function applyHandicaps(players,indexes,tee,par){
  G.hdcp={}; G.raw={};
  for(var i=0;i<players.length;i++){
    G.hdcp[players[i]]=indexes[i];
    G.raw[players[i]]=courseHdcp(indexes[i],tee,par);
  }
  G.chdcp={};
  for(var i=0;i<players.length;i++) G.chdcp[players[i]]=chdcpAt(players[i],HOLES-1);
  return players.map(function(p){return G.chdcp[p];});
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

// ---------------------------------------------------------------------------
// Per-hole netting
//
// The scratch reference for a hole is the lowest raw course handicap among
// everyone who had joined the group BY that hole. Because that set only ever
// grows, the reference can only ever move down — which is the whole rule:
//
//   * Someone joins off a lower handicap than anyone playing. From their first
//     hole on the reference drops to them, so the holes still to play are
//     dotted exactly as they would have been had the whole group teed off
//     together. Holes already settled do not see them at all (their roster
//     `from` is after those holes), so the money on them cannot move.
//   * Someone leaves. Their `from` is unchanged, so they keep counting towards
//     the reference for the rest of the round and nobody loses a dot they have
//     been playing under all day.
//
// Read a player's strokes for a hole through chdcpAt(p,hi) — G.chdcp is only
// the rest-of-round figure for display.
// ---------------------------------------------------------------------------

function netBaseAt(hi){
  var base=null;
  for(var p in G.raw){
    if(!G.raw.hasOwnProperty(p)) continue;
    if(rosterEntry(p).from>hi) continue; // had not joined the group yet
    if(base===null||G.raw[p]<base) base=G.raw[p];
  }
  return base===null?0:base;
}

// Falls back to G.chdcp for a game (or a test) that never populated G.raw,
// the same way rosterEntry() falls back to "in for the whole round".
function chdcpAt(player,hi){
  if(!G.raw||G.raw[player]==null) return G.chdcp[player]||0;
  return G.raw[player]-netBaseAt(hi);
}

function getStrokes(player,hi){
  var ch=chdcpAt(player,hi),si=activeHoles()[hi].si,s=0;
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

// ---------------------------------------------------------------------------
// Roster: which holes each player is actually in play for.
//
// G.roster[player] = {from:<first hole index in play>, to:<hole index they
// left, or null if still in>}. Everyone who tees off is {from:0,to:null}.
// A late arrival gets from = the first unplayed hole when they were added; a
// player who leaves early gets `to` set to the first unplayed hole at that
// moment. Both stay in G.players and keep every hole they actually played —
// nothing is ever deleted, they're just out of play for the holes they
// weren't there for.
//
// Read a hole's participants through holePlayers(hi), never G.players, or a
// late arrival will be asked to wager on holes played before they showed up.
// ---------------------------------------------------------------------------

function initRoster(players){
  var r={};
  for(var i=0;i<players.length;i++) r[players[i]]={from:0,to:null};
  return r;
}

// Defaults to "in for the whole round" for any player with no entry, so a
// game (or a test) that never set up a roster behaves exactly as before.
function rosterEntry(p){
  return (G.roster&&G.roster[p])||{from:0,to:null};
}

function playerInHole(p,hi){
  var e=rosterEntry(p);
  return hi>=e.from&&(e.to==null||hi<e.to);
}

// The players in play for hole index hi, in G.players order.
function holePlayers(hi){
  return G.players.filter(function(p){return playerInHole(p,hi);});
}

// Hidden = out for the rest of the round (left early).
function isHiddenPlayer(p){
  return rosterEntry(p).to!=null;
}

function visiblePlayers(){
  return G.players.filter(function(p){return !isHiddenPlayer(p);});
}

// The hole a mid-round join or departure takes effect from: the one after the
// last locked hole. Deliberately not "the first unlocked hole" — unlocking an
// earlier hole to fix a typo must not drag the boundary backwards.
function nextUnplayedHole(){
  var last=-1;
  for(var i=0;i<G.holes.length;i++) if(G.holes[i].locked) last=i;
  return last+1;
}

// Adds a player mid-round. They get a slot in every hole's maps so nothing
// ever reads undefined, but are only in play from `from` onward.
function addPlayerToGame(name,from){
  G.players.push(name);
  G.roster[name]={from:from,to:null};
  for(var i=0;i<G.holes.length;i++){
    var h=G.holes[i];
    h.wagers[name]=null;
    h.press[name]={player:false,banker:false};
    h.strokes[name]='';
  }
}

function setPlayerHidden(p,hidden,at){
  if(!G.roster[p]) G.roster[p]={from:0,to:null};
  G.roster[p].to=hidden?at:null;
}

// Rebuilds every name-keyed map against a full set of new names (parallel to
// G.players) in one pass, so a swap (A->B, B->A) can't collide mid-rename.
function renamePlayers(newNames){
  var map={},old=G.players;
  for(var i=0;i<old.length;i++) map[old[i]]=newNames[i];
  G.players=newNames.slice();
  G.hdcp=remapKeys(G.hdcp,map);
  G.raw=remapKeys(G.raw,map);
  G.chdcp=remapKeys(G.chdcp,map);
  G.roster=remapKeys(G.roster,map);
  for(var j=0;j<G.holes.length;j++){
    var h=G.holes[j];
    h.wagers=remapKeys(h.wagers,map);
    h.press=remapKeys(h.press,map);
    h.strokes=remapKeys(h.strokes,map);
    if(h.banker!=null&&map[h.banker]!==undefined) h.banker=map[h.banker];
  }
}

function remapKeys(obj,map){
  var out={};
  for(var k in obj) if(obj.hasOwnProperty(k)) out[map[k]!==undefined?map[k]:k]=obj[k];
  return out;
}

// Clears the wager/press/score slots of players who aren't in play on an
// UNLOCKED hole, and drops a banker who is no longer in that hole. Locked
// holes are never touched — that's the whole point of hiding instead of
// deleting: a player who left keeps the record of what they played.
function applyRoster(){
  for(var i=0;i<G.holes.length;i++){
    var h=G.holes[i];
    if(h.locked) continue;
    for(var j=0;j<G.players.length;j++){
      var p=G.players[j];
      if(playerInHole(p,i)) continue;
      h.wagers[p]=null;
      h.press[p]={player:false,banker:false};
      h.strokes[p]='';
    }
    if(h.banker!=null&&!playerInHole(h.banker,i)) h.banker=null;
  }
}

// ---------------------------------------------------------------------------
// Settled-money guard
//
// A locked hole is settled: the players have agreed what changed hands on it.
// Adding or marking out a player must never move those numbers. saveSetupEdit()
// snapshots the game, applies the edit, and checks the running totals against
// the snapshot — and rolls the whole save back if they moved, rather than
// silently rewriting a hole that was already paid.
// ---------------------------------------------------------------------------

function snapshotGame(){
  return JSON.stringify({players:G.players,roster:G.roster,hdcp:G.hdcp,raw:G.raw,
    chdcp:G.chdcp,holes:G.holes,active:G.active,awayHoles:G.awayHoles||null});
}

function restoreGame(snap){
  var o=JSON.parse(snap);
  G.players=o.players; G.roster=o.roster; G.hdcp=o.hdcp; G.raw=o.raw;
  G.chdcp=o.chdcp; G.holes=o.holes; G.active=o.active; G.awayHoles=o.awayHoles;
}

// Every player who was in the game before must still have the same total.
// Players who only appear in `after` joined, and start at zero by definition.
function totalsUnchanged(before,after){
  for(var p in before){
    if(!before.hasOwnProperty(p)) continue;
    if((after[p]||0)!==before[p]) return false;
  }
  return true;
}

// The players whose RAW course handicap moved between two snapshots of G.raw.
// Raw is the right thing to compare: editing an Index or the tee moves it and
// legitimately reaches settled holes, whereas a join or a departure never
// does — it only shifts the per-hole netting of holes still to play. So the
// guard above bites on exactly the case it should.
function changedHandicaps(before,after){
  var out=[];
  for(var p in before){
    if(!before.hasOwnProperty(p)) continue;
    if(after[p]!==before[p]) out.push(p);
  }
  return out;
}

function calcResult(hole){
  if(!hole.banker) return null;
  var hi=hole.hole-1;
  var bs=Number(hole.strokes[hole.banker]);
  if(!bs) return null;
  var bnet=bs-getStrokes(hole.banker,hi);
  var res={},bn=0,inPlay=holePlayers(hi);
  for(var i=0;i<inPlay.length;i++){
    var p=inPlay[i];
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
