// Every replaceable pose family must be supplied before a custom actor is used.
export const CHARACTER_ACTIONS={idle:2,'walk-right':3,'walk-up':3,'walk-down':3,seated:2,phone:2,music:2,game:2,drink:2,sofa:2,'sofa-front':2,greet:2,sit:2,pull:2,read:2,chat:2};
export const CHARACTER_FILES=Object.entries(CHARACTER_ACTIONS).flatMap(([action,count])=>Array.from({length:count},(_,i)=>`${action}-${i}.png`));

export const CHARACTER_LABELS={idle:'站立','walk-right':'向右行走','walk-up':'向后行走','walk-down':'向前行走',seated:'坐着工作',phone:'玩手机',music:'听音乐',game:'玩游戏',drink:'喝水',sofa:'朝左休息','sofa-front':'沙发正面坐姿',greet:'挥手',sit:'坐下',pull:'拉椅子',read:'阅读',chat:'交谈'};
