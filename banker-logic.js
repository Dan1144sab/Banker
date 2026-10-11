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
var G = {players:[],count:3,holes:[],active:0,hdcp:{},raw:{},chdcp:{},course:'home',tee:'white',roster:{},hammer:null};

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
  if(G.hammer) G.hammer.teams=G.hammer.teams.map(function(t){
    return t.map(function(p){return map[p]!==undefined?map[p]:p;});
  });
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
    chdcp:G.chdcp,holes:G.holes,active:G.active,awayHoles:G.awayHoles||null,hammer:G.hammer||null});
}

function restoreGame(snap){
  var o=JSON.parse(snap);
  G.players=o.players; G.roster=o.roster; G.hdcp=o.hdcp; G.raw=o.raw;
  G.chdcp=o.chdcp; G.holes=o.holes; G.active=o.active; G.awayHoles=o.awayHoles;
  G.hammer=o.hammer||null;
}

// ---------------------------------------------------------------------------
// Persistence — a round survives a reload, a crashed tab, a dead battery.
//
// snapshotGame() above is an in-memory undo for one save. This is the durable
// version: it also carries what the setup screen needs to be rebuilt (course,
// tee, the Away rating/slope, which live in the DOM and are passed in by the
// caller). Pure — storage itself (localStorage) is index.html's business.
// ---------------------------------------------------------------------------

var SAVE_VERSION=1;

function serializeRound(extra){
  extra=extra||{};
  return JSON.stringify({v:SAVE_VERSION,course:G.course,tee:G.tee,
    players:G.players,roster:G.roster,hdcp:G.hdcp,raw:G.raw,chdcp:G.chdcp,
    holes:G.holes,active:G.active,awayHoles:G.awayHoles||null,hammer:G.hammer||null,
    awayRating:extra.awayRating==null?'':String(extra.awayRating),
    awaySlope:extra.awaySlope==null?'':String(extra.awaySlope)});
}

// Returns the saved round, or null if the text is missing, corrupt, from a
// different version, or structurally unusable. A bad save must never throw
// at load — it just means there is nothing to resume.
function parseRound(text){
  var o;
  try{ o=JSON.parse(text); }catch(e){ return null; }
  if(!o||o.v!==SAVE_VERSION) return null;
  if(!Array.isArray(o.players)||o.players.length<2) return null;
  if(!Array.isArray(o.holes)||o.holes.length!==HOLES) return null;
  if(!o.roster||!o.hdcp||!o.raw||!o.chdcp) return null;
  if(typeof o.active!=='number'||o.active<0||o.active>=HOLES) return null;
  if(o.course==='away'&&(!Array.isArray(o.awayHoles)||o.awayHoles.length!==HOLES)) return null;
  // A save from before Hammer existed simply has no hammer field.
  if(o.hammer!=null&&(!Array.isArray(o.hammer.teams)||o.hammer.teams.length!==2
    ||!Array.isArray(o.hammer.log)||o.hammer.log.length!==HOLES||!Array.isArray(o.hammer.presses))) return null;
  return o;
}

// Puts a parsed round back into G. The caller restores the Away rating/slope
// and SI inputs from the same object, then re-renders.
function loadRound(o){
  G.players=o.players; G.roster=o.roster; G.hdcp=o.hdcp; G.raw=o.raw;
  G.chdcp=o.chdcp; G.holes=o.holes; G.active=o.active;
  G.course=o.course==='away'?'away':'home';
  G.awayHoles=G.course==='away'?o.awayHoles:null;
  if(TEES[o.tee]) G.tee=o.tee;
  G.count=o.players.length;
  G.hammer=o.hammer||null;
}

// What the "Resume round?" prompt tells the user, so they can tell at a
// glance that it is the right round.
function roundSummary(o){
  var locked=0;
  for(var i=0;i<o.holes.length;i++) if(o.holes[i].locked) locked++;
  return {players:o.players.slice(),holesPlayed:locked};
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
// Net = gross minus the strokes received on those same holes (getStrokes), so
// mid-round it is net *through the holes played*, not gross minus a full
// 18-hole handicap.
function calcScores(){
  var front={},back={},total={},net={};
  for(var i=0;i<G.players.length;i++){var p=G.players[i];front[p]=0;back[p]=0;total[p]=0;net[p]=0;}
  for(var i=0;i<G.holes.length;i++){
    var h=G.holes[i]; if(!h.locked) continue;
    for(var j=0;j<G.players.length;j++){
      var p=G.players[j],s=Number(h.strokes[p]); if(!s) continue;
      if(h.hole<=9) front[p]+=s; else back[p]+=s;
      total[p]+=s;
      net[p]+=s-getStrokes(p,i);
    }
  }
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

// ---------------------------------------------------------------------------
// Hammer — a two-team side game, entirely separate from the Banker money.
//
// G.hammer is null when the group isn't playing it, else
//   {base:<$ per man>, teams:[[names],[names]], presses:[{team,from}],
//    log:[<events for hole 1>, ... x18]}
//
// Teams are the top and bottom halves of the setup rows, fixed at the tee.
// A late arrival plays Banker only — never Hammer. If any team member leaves,
// the Hammer game is over from the hole they left (hammerEndsAt); every hole
// before that is settled as played.
//
// A hole's log is the sequence of hammer calls made on it — {t:'throw',team},
// {t:'accept'}, {t:'decline'}. Everything else (what the hole is worth, who
// holds the hammer, whether it was conceded) is replayed from the log by
// hammerState(), so "undo" is nothing more than dropping the last event.
//
// Rules:
//   * Either team may throw first. After an accept, only the team that
//     accepted may throw it back. Each accept doubles the hole.
//   * Declining concedes the hole at what it was worth before that throw, and
//     a natural birdie no longer matters — the hole is over.
//   * Otherwise each team's low net score plays; a tie halves the hole.
//   * A natural birdie (gross birdie or better) on the winning team doubles
//     whatever the hole is worth, once.
//   * A team that is down may press at any time: every hole from the first
//     unplayed one to the 18th doubles. Presses stack.
// ---------------------------------------------------------------------------

var HAMMER_BASE=20;

function canPlayHammer(n){return n>=2&&n%2===0;}

function hammerTeamsFor(players){
  var k=players.length/2;
  return [players.slice(0,k),players.slice(k)];
}

function initHammer(players,base){
  var log=[];
  for(var i=0;i<HOLES;i++) log.push([]);
  return {base:base,teams:hammerTeamsFor(players),presses:[],log:log};
}

function otherTeam(t){return t===0?1:0;}

// Which team a player is on: 0, 1, or -1 (not playing Hammer).
function hammerTeamOf(p){
  if(!G.hammer) return -1;
  for(var t=0;t<2;t++) if(G.hammer.teams[t].indexOf(p)!==-1) return t;
  return -1;
}

// The hole index the Hammer game stops at: the earliest exit of any team
// member, or HOLES if everyone is still in.
function hammerEndsAt(){
  var end=HOLES;
  if(!G.hammer) return end;
  for(var t=0;t<2;t++) for(var i=0;i<G.hammer.teams[t].length;i++){
    var to=rosterEntry(G.hammer.teams[t][i]).to;
    if(to!=null&&to<end) end=to;
  }
  return end;
}

// The team member whose exit ended the game, or null.
function hammerEndedBy(){
  var end=hammerEndsAt();
  if(end>=HOLES) return null;
  for(var t=0;t<2;t++) for(var i=0;i<G.hammer.teams[t].length;i++){
    var p=G.hammer.teams[t][i];
    if(rosterEntry(p).to===end) return p;
  }
  return null;
}

function hammerLive(hi){
  return !!G.hammer&&hi<hammerEndsAt();
}

// Replays a hole's log.
//   doubles  — hammers accepted so far
//   holder   — the team allowed to throw next; null = either (none thrown yet)
//   pending  — the team whose throw is waiting for an answer, or null
//   conceded — the team that declined and gave the hole away, or null
function hammerState(hi){
  var s={doubles:0,holder:null,pending:null,conceded:null};
  var log=G.hammer?G.hammer.log[hi]:[];
  for(var i=0;i<log.length;i++){
    var e=log[i];
    if(e.t==='throw') s.pending=e.team;
    else if(e.t==='accept'){ s.doubles++; s.holder=otherTeam(s.pending); s.pending=null; }
    else if(e.t==='decline'){ s.conceded=otherTeam(s.pending); s.pending=null; }
  }
  return s;
}

function hammerOpen(hi){
  return hammerLive(hi)&&!G.holes[hi].locked;
}

function canThrowHammer(hi,team){
  if(!hammerOpen(hi)) return false;
  var s=hammerState(hi);
  if(s.pending!==null||s.conceded!==null) return false;
  return s.holder===null||s.holder===team;
}

function hammerThrow(hi,team){
  if(!canThrowHammer(hi,team)) return false;
  G.hammer.log[hi].push({t:'throw',team:team});
  return true;
}

function hammerAnswer(hi,accept){
  if(!hammerOpen(hi)||hammerState(hi).pending===null) return false;
  G.hammer.log[hi].push({t:accept?'accept':'decline'});
  return true;
}

function hammerPending(hi){
  return hammerLive(hi)&&hammerState(hi).pending!==null;
}

function canUndoHammer(hi){
  return !!G.hammer&&!G.holes[hi].locked&&G.hammer.log[hi].length>0;
}

function hammerUndo(hi){
  if(!canUndoHammer(hi)) return false;
  G.hammer.log[hi].pop();
  return true;
}

function hammerPressMult(hi){
  var m=1;
  if(!G.hammer) return m;
  for(var i=0;i<G.hammer.presses.length;i++) if(G.hammer.presses[i].from<=hi) m*=2;
  return m;
}

// What hole index hi is worth per man right now, before any natural birdie.
function hammerHoleValue(hi){
  return G.hammer.base*hammerPressMult(hi)*Math.pow(2,hammerState(hi).doubles);
}

function isNaturalBirdie(p,hi){
  var g=Number(G.holes[hi].strokes[p]);
  return !!g&&g<=activeHoles()[hi].par-1;
}

// A team's low net on a hole, or null until every member has a score.
function hammerTeamNet(t,hi){
  var ins=G.hammer.teams[t],low=null;
  for(var i=0;i<ins.length;i++){
    var g=Number(G.holes[hi].strokes[ins[i]]);
    if(!g) return null;
    var n=g-getStrokes(ins[i],hi);
    if(low===null||n<low) low=n;
  }
  return low;
}

// The Hammer outcome of a hole, or null if it isn't decided yet (a throw
// waiting for an answer, or scores missing) or Hammer isn't running on it.
//   win      — 0 or 1, or -1 for a halved hole
//   value    — per man, including a natural-birdie double
//   res      — {player: $} for every team member, +/- value a man
function hammerHole(hi){
  if(!hammerLive(hi)) return null;
  var s=hammerState(hi);
  if(s.pending!==null) return null;
  var ins=G.hammer.teams;
  var value=hammerHoleValue(hi),win,birdie=false;
  if(s.conceded!==null){
    win=otherTeam(s.conceded);
  } else {
    var n0=hammerTeamNet(0,hi),n1=hammerTeamNet(1,hi);
    if(n0===null||n1===null) return null;
    win=n0===n1?-1:(n0<n1?0:1);
    if(win>=0) birdie=ins[win].some(function(p){return isNaturalBirdie(p,hi);});
    if(birdie) value*=2;
  }
  var res={};
  for(var t=0;t<2;t++) for(var i=0;i<ins[t].length;i++) res[ins[t][i]]=0;
  if(win>=0){
    for(var i=0;i<ins[win].length;i++) res[ins[win][i]]=value;
    for(var i=0;i<ins[otherTeam(win)].length;i++) res[ins[otherTeam(win)][i]]=-value;
  }
  return {win:win,value:value,birdie:birdie,conceded:s.conceded!==null,doubles:s.doubles,
    press:hammerPressMult(hi),res:res};
}

// Per-player Hammer money across locked holes (team members only).
function hammerTotals(){
  var t={};
  if(!G.hammer) return t;
  for(var k=0;k<2;k++) for(var i=0;i<G.hammer.teams[k].length;i++) t[G.hammer.teams[k][i]]=0;
  for(var i=0;i<G.holes.length;i++){
    if(!G.holes[i].locked) continue;
    var r=hammerHole(i); if(!r) continue;
    for(var p in r.res) if(r.res.hasOwnProperty(p)) t[p]+=r.res[p];
  }
  return t;
}

function hammerTeamTotals(){
  var t=hammerTotals(),out=[0,0];
  for(var k=0;k<2;k++) for(var i=0;i<G.hammer.teams[k].length;i++) out[k]+=t[G.hammer.teams[k][i]];
  return out;
}

// Only a team that is down on the locked holes may press, only while there's
// a Hammer hole left to play, and only once per hole — a press starting on
// the current hole blocks another (by either team) until that hole is locked.
function canHammerPress(team){
  if(!G.hammer) return false;
  var at=nextUnplayedHole();
  if(at>=hammerEndsAt()) return false;
  if(G.hammer.presses.some(function(p){return p.from===at;})) return false;
  return hammerTeamTotals()[team]<0;
}

function hammerPress(team){
  if(!canHammerPress(team)) return false;
  G.hammer.presses.push({team:team,from:nextUnplayedHole()});
  return true;
}

// The latest press can be taken back until a hole it covers is locked — after
// that it has paid out, and removing it would move settled money.
function canUndoHammerPress(){
  if(!G.hammer||!G.hammer.presses.length) return false;
  var from=G.hammer.presses[G.hammer.presses.length-1].from;
  for(var i=from;i<G.holes.length;i++) if(G.holes[i].locked) return false;
  return true;
}

function hammerUndoPress(){
  if(!canUndoHammerPress()) return false;
  G.hammer.presses.pop();
  return true;
}
