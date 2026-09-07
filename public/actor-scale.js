// Measured crown-to-chin distances in the immutable sprite sheets, in source pixels.
// Match heads, not the bounding box that also contains chairs or bent legs.
const heads={
 'boss-seated-unified':[278,278],
 'seated-directions':[120,117,120,118,118,118,118,118,119,110,119,118,123,118,120,121,123,116],
 'seated-side':[140,130,127,130,134,136,138,135,134],
 'seated-phone':[148,148,144,138,152,146,160,146,155],
 'walk-right':[103,102,99,99,97,97,94,96,98,98,97,97,99,99,102,102,102,102],
 'walk-front':[119,119,118,119,118,118,114,113,111,111,116,116,116,117,111,111,115,114],
 'walk-back':[110,110,111,108,111,110,99,99,104,104,105,94,103,90,101,100,101,98],
 'walk-pass':[149,152,147,140,132,150,154,152,157],
 'team-sipping':[104,104,99,96,96,97,90,89,96,95,99,99,94,93,97,97,97,97],
 'executive-phone-front':[218,218,225]
};
export function actorSize(name,index,box){const factor=58/(heads[name]?.[index]||box[3]*.4);return {width:box[2]*factor,height:box[3]*factor};}
