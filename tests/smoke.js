'use strict';
// Native Node.js regression checks. No external packages or real TV network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const project = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(project, 'manifest.json'), 'utf8'));
assert.equal(manifest.version, '0.10.8');
assert.equal(manifest.manifest_version, 3);

const chimeCode = fs.readFileSync(path.join(project, 'chime.js'), 'utf8');
assert(chimeCode.includes('AudioContext'), 'Local chime synthesis must be retained');
assert(chimeCode.includes("message.type === 'PLAY_CHIME' ? playConfirmation"), 'Chime handler missing');
assert(chimeCode.includes("message.type === 'PLAY_COUNTDOWN_BEEP'"), 'Countdown beep handler missing');
assert(!chimeCode.includes('new Audio('), 'No voice audio playback should remain');
assert(!fs.existsSync(path.join(project, 'sounds/logo-mute-active.wav')), 'Voice file must be removed');
assert(fs.readFileSync(path.join(project, 'popup.html'), 'utf8').includes('Test confirmation chime'));
assert(fs.readFileSync(path.join(project, 'popup.html'), 'utf8').includes('v0.10.8'));

assert.equal(JSON.parse(fs.readFileSync(path.join(project,'package.json'),'utf8')).license,'Apache-2.0');
assert(fs.readFileSync(path.join(project,'LICENSE'),'utf8').includes('Apache License'));
assert(fs.readFileSync(path.join(project,'NOTICE'),'utf8').includes('Copyright © 2026 ContactProject.org'));
assert(fs.readFileSync(path.join(project,'help.html'),'utf8').includes('larger than the logo'));
assert(fs.readFileSync(path.join(project,'help.html'),'utf8').includes('does <strong>not</strong> skip commercials, hide advertisements, or modify the television broadcast'));
assert(fs.readFileSync(path.join(project,'docs','USER-GUIDE.md'),'utf8').includes('independent, open-source browser extension')); 
for (const state of ['off','watching','muted']) for (const size of [16,32,48,128]) assert(fs.existsSync(path.join(project,`icons/${state}${size}.png`)));
for (const f of ['popup.html','popup.js','background.js','help.html','help.css','selector.js','fullscreen-arm.js']) {
  assert(fs.existsSync(path.join(project,f)), 'Missing extension file '+f);
}
assert(fs.readFileSync(path.join(project,'popup.html'),'utf8').includes('href="help.html"'), 'Help not linked');
assert(fs.readFileSync(path.join(project,'help.html'),'utf8').includes('desktop Chrome extension'), 'Desktop Chrome requirement absent');
assert(fs.readFileSync(path.join(project,'help.html'),'utf8').includes('FOX'), 'FOX example absent');
assert(!fs.readFileSync(path.join(project,'docs','USER-GUIDE.md'),'utf8').includes('manifest.json'), 'Beginner guide contains technical manifest detail');

const storage = {local:{profiles:{},settings:{muteAfterMs:1700},channelSensitivities:{}},session:{}};
const listeners = {};
const muteActions=[];
const tab={id:99,windowId:8,url:'https://usnewson.com/watch/cnn-live',mutedInfo:{muted:false}};
const makeArea=name=>({
  async get(query){
    const current=storage[name];
    if (typeof query==='string') return query in current?{[query]:current[query]}:{};
    if(Array.isArray(query)) return Object.fromEntries(query.filter(k=>k in current).map(k=>[k,current[k]]));
    if(!query) return {...current};
    return Object.fromEntries(Object.entries(query).map(([key,fallback])=>[key, key in current ? current[key] : fallback]));
  },
  async set(values){Object.assign(storage[name],values)},
  async remove(names){for (const key of Array.isArray(names)?names:[names]) delete storage[name][key]}
});
const evt=name=>({addListener(handler){listeners[name]=handler}});
const chrome={
  runtime:{id:'simulated',getURL:f=>'chrome-extension://simulated/'+f,onMessage:evt('onMessage')},
  storage:{local:makeArea('local'),session:makeArea('session')},
  action:{async setIcon(){},async setTitle(){}},
  tabs:{
    async get(id){assert.equal(id,tab.id);return {...tab,mutedInfo:{...tab.mutedInfo}}},
    async update(id,props){assert.equal(id,tab.id);if(typeof props.muted==='boolean'){tab.mutedInfo.muted=props.muted;muteActions.push(props.muted)}return {...tab,...props}},
    async query(){return [tab]},
    async captureVisibleTab(){return 'data:image/jpeg;base64,AAAA'},
    onActivated:evt('activated'),onRemoved:evt('tabRemoved'),onUpdated:evt('tabUpdated')},
  windows:{async update(){},async create(){return{id:123}},onRemoved:evt('windowRemoved')},
  scripting:{async executeScript(){return[{result:null}]}},
  commands:{onCommand:evt('command')},
  offscreen:{async createDocument(){}},
};
const context=vm.createContext({chrome,console,setTimeout,clearTimeout,setInterval,clearInterval,URL,Date,Promise,crypto:require('node:crypto').webcrypto});
context.importScripts=(...filenames)=>{
  for(const filename of filenames){
    if(filename==='detector.js'){
      vm.runInContext(`globalThis.LogoMuteDetector={
        LogoDetector:class {constructor(){this.quality='good';this.calibrationScore=.84;}threshold(){return .37;}score(patch){return patch.score;}},
        edges(){return {};} };`,context);
    } else {
      vm.runInContext(fs.readFileSync(path.join(project, filename),'utf8'),context,{filename});
    }
  }
};
vm.runInContext(fs.readFileSync(path.join(project,'background.js'),'utf8'),context,{filename:'background.js'});
// Replace only frame decoding / capture in this mock. The actual state machine,
// Chrome mute updates, startup and timeout paths remain unmodified.
vm.runInContext(`
 globalThis.mockVisible=false;
 decodeImage=async function(){return {width:80,height:25,close(){}}};
 createProcessor=function(profile){return {
   width:40,height:15,reference:{},referenceMatcher:{score(p){return p.score;}},
   detector:null,learning:[],lockedRect:null,confidence:null,trigger:.37,
   quality:'unknown',initialized:false,frameCount:0,sourceWidth:0,sourceHeight:0,
   anchor:'bottom-right',videoBox:null,relativeLogo:null,relocating:false,relockCandidate:null
 }};
 frame=function(p,bitmap,rect){return {score:globalThis.mockVisible?.82:.02}};
 bestRegion=function(){return null};
 refreshLayout=async function(){};
 takeScreenshot=async function(s){await handleFrame(s,{width:1280,height:720})};
 announceLogoLocked=function(){};
 `,context);
async function evalExpr(expr){return await vm.runInContext(expr,context)}
(async()=>{
  const defaults=await evalExpr(`getSettings('https://usnewson.com/watch/cnn-live')`);
  assert.equal(defaults.sensitivity,.75,'CNN should default to Tolerant');
  storage.local.channelSensitivities[tab.url]=1.25;
  assert.equal((await evalExpr(`getSettings('https://usnewson.com/watch/cnn-live')`)).sensitivity,1.25,'Saved sensitivity must override default');
  delete storage.local.channelSensitivities[tab.url];
  storage.local.profiles[tab.url]={savedAt:'test',reference:'data:image/png;base64,AAAA',rect:{x:.86,y:.82,w:.08,h:.08}};

  await evalExpr('start({tabId:99},null)');
  assert.equal(tab.mutedInfo.muted,true,'Start must mute while logo absent');
  assert.equal((await evalExpr('status()')).muteReason,'awaiting-logo');
  assert.equal((await evalExpr('status()')).stage,'waiting for saved logo');
  vm.runInContext('monitor.noMatchSince=Date.now()-50000',context);
  await evalExpr('handleFrame(monitor,{width:1280,height:720})');
  assert.equal((await evalExpr('status()')).running,true,'Long commercial must not stop monitoring');
  assert.equal(tab.mutedInfo.muted,true);
  // Changing debug/sensitivity must not unmute while waiting for initial logo.
  await evalExpr(`handleMessage({type:'SETTINGS',tabId:99,url:'https://usnewson.com/watch/cnn-live',settings:{sensitivity:.75,muteAfterMs:1700,debugMuteOnLostLogo:false}}, {})`);
  assert.equal(tab.mutedInfo.muted,true,'Settings update unexpectedly unmuted startup');
  vm.runInContext('globalThis.mockVisible=true',context);
  for(let i=0;i<5;i++) await evalExpr('handleFrame(monitor,{width:1280,height:720})');
  assert.equal(tab.mutedInfo.muted,false,'Logo recognition should restore programme sound');
  assert.equal((await evalExpr('status()')).awaitingFirstLogo,false);
  assert.equal((await evalExpr('status()')).stage,'watching');
  vm.runInContext('globalThis.mockVisible=false; monitor.absentSince=Date.now()-2100',context);
  await evalExpr('handleFrame(monitor,{width:1280,height:720})');
  assert.equal(tab.mutedInfo.muted,true,'Commercial should mute after logo disappears');
  vm.runInContext('globalThis.mockVisible=true; monitor.visibleSince=Date.now()-1100',context);
  await evalExpr('handleFrame(monitor,{width:1280,height:720})');
  assert.equal(tab.mutedInfo.muted,false,'Logo return should restore sound');
  await evalExpr(`stopMonitor('')`);
  assert.deepEqual(muteActions.slice(0,5),[true,false,true,false], 'Audio mute sequence incorrect');
  console.log('PASS: manifest and guide; CNN Tolerant default and override; start muted without logo; survive 50-second commercial; unmute on logo; mute on ad; restore on return; stop.');
})().catch(e=>{console.error(e);process.exitCode=1;});
