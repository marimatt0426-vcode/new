(function(){'use strict';
var base="https://purge-pros-site-assets.purgepros.workers.dev/assets/", names=['pp-next-60e07c26bc871ab7.js','core-d87a9788370ce8d2.js'];
function run(){if(!document.querySelector('[data-pp-header]'))return false;
names.forEach(function(name){var src=base+name;if(Array.prototype.some.call(document.scripts,function(s){return s.src===src;}))return;
var s=document.createElement('script');s.src=src;s.async=false;s.dataset.ppProductionAsset=name;document.body.appendChild(s);});return true;}
function ready(){if(run())return;var observer=new MutationObserver(function(){if(run())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(function(){observer.disconnect();},30000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();