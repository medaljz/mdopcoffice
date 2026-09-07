// Foreground furniture pieces are sampled from the unchanged scene image.
// These polygons restore the table above a seated torso, then hands render on top.
export const OCCLUDERS={
 boss:'397,205 508,205 508,177 576,177 576,205 620,205 629,247 382,247',manager:'725,205 824,212 835,242 714,242',finance:'1180,207 1227,207 1227,164 1314,164 1314,207 1384,207 1393,250 1174,250',
 developer:'401,411 434,410 452,451 483,454 500,411 607,417 615,477 401,477',
 product:'624,412 649,411 673,452 710,458 725,412 846,418 859,477 622,477',
 designer:'871,412 891,412 915,453 953,458 970,414 1088,420 1098,478 869,478',
 delivery:'1124,415 1145,415 1164,452 1204,459 1221,416 1340,419 1352,478 1123,478',
 hr:'380,603 413,602 432,651 474,660 493,604 599,610 607,682 379,682',
 reviewer:'623,607 650,606 674,654 709,662 729,608 846,614 859,685 621,685',
 sofaL:'170,255 191,257 197,273 256,274 256,295 175,295',sofaR:'251,274 309,273 315,250 337,250 337,294 251,295',bean:'240,397 288,404 318,394 315,425 256,435'
};

// Chair art is restored as a single layer, never cut into animated body parts.
const chairOutline=[[0,0],[42,13],[49,51],[68,52],[71,66],[52,77],[52,96],[70,105],[66,116],[39,116],[26,125],[9,119],[-2,109],[16,99],[17,84],[6,70]];
export const CHAIRS={};
export const CHAIR_ANCHORS={developer:[460,521],product:[672,521],designer:[914,521],delivery:[1165,521],hr:[445,725],reviewer:[664,725]};
for(const [id,x,y] of [['developer',434,396],['product',646,396],['designer',888,396],['delivery',1139,396],['hr',419,600],['reviewer',638,600]])CHAIRS[id]=chairOutline.map(([a,b])=>[a+x,b+y].join(',')).join(' ');
CHAIRS.boss='478,136 505,120 555,124 579,143 565,208 548,248 552,273 479,275 473,202';
CHAIRS.finance='1202,137 1220,122 1269,125 1290,142 1283,207 1273,272 1202,274 1195,190';
// Only the far/right desk edge masks a main-row seated worker. The near chair
// back stays in front; executive workers sit behind their desk instead.
for(const [id,x,y] of [['developer',400,447],['product',623,447],['designer',870,447],['delivery',1123,447],['hr',380,651],['reviewer',622,651]])OCCLUDERS[id]=`${x+106},${y} ${x+218},${y} ${x+218},${y+74} ${x+106},${y+74}`;
delete OCCLUDERS.manager;

// One description drives both the desk image transform and its floor collision.
export const DESKS=[
 ['developer',400,478,218,[483,378,89,81]],['product',623,478,237,[722,356,92,101]],
 ['designer',867,478,234,[982,359,80,98]],['delivery',1123,478,225,[1156,358,97,106]],
 ['hr',377,682,230,[473,580,89,86]],['reviewer',612,682,243,[715,555,90,113]],
 ['reserve-a',863,682,237,[914,557,92,109]],['reserve-b',1113,682,255,[1201,555,150,110]]
].map(([id,x,y,width,monitor])=>({id,x,y,width,monitor,scale:.78,scaleX:.68,top:y===478?402:593,bottom:y===478?520:726}));
export const BOARD={x:68,y:716,scale:.8,foot:[123,860,81,17]};

export const SEAT_POINTS={boss:[540,265],manager:[879,235],finance:[1244,190],developer:[456,537],product:[695,537],designer:[938,537],delivery:[1184,537],hr:[452,747],reviewer:[696,747]};
OCCLUDERS.manager='789,205 1005,205 1005,311 789,311';
