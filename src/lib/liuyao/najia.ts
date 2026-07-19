// @ts-nocheck
// 由原微信小程序的纯算法层机械移植，保持计算行为一致。
var GANS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
var ZHIS = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
var XING5 = ['木','火','土','金','水'];
var ZHI5 = [4,2,0,0,2,1,1,2,3,3,2,4];
var GUA5 = [3,3,1,0,0,4,2,2];
var GUAS = ['乾','兑','离','震','巽','坎','艮','坤'];
var QING6 = ['兄弟','父母','官鬼','妻财','子孙'];
var SHEN6 = ['青龙','朱雀','勾陈','螣蛇','白虎','玄武'];
var YAOS = ['111','110','101','100','011','010','001','000'];
var NAJIA = [['甲子寅辰','壬午申戌'],['丁巳卯丑','丁亥酉未'],['己卯丑亥','己酉未巳'],['庚子寅辰','庚午申戌'],['辛丑亥酉','辛未巳卯'],['戊寅辰午','戊申戌子'],['丙辰午申','丙戌子寅'],['乙未巳卯','癸丑亥酉']];
var GUA64 = {'111111':'乾为天','011111':'天风姤','001111':'天山遁','000111':'天地否','000011':'风地观','000001':'山地剥','000101':'火地晋','111101':'火天大有','110110':'兑为泽','010110':'泽水困','000110':'泽地萃','001110':'泽山咸','001010':'水山蹇','001000':'地山谦','001100':'雷山小过','110100':'雷泽归妹','101101':'离为火','001101':'火山旅','011101':'火风鼎','010101':'火水未济','010001':'山水蒙','010011':'风水涣','010111':'天水讼','101111':'天火同人','100100':'震为雷','000100':'雷地豫','010100':'雷水解','011100':'雷风恒','011000':'地风升','011010':'水风井','011110':'泽风大过','100110':'泽雷随','011011':'巽为风','111011':'风天小畜','101011':'风火家人','100011':'风雷益','100111':'天雷无妄','100101':'火雷噬嗑','100001':'山雷颐','011001':'山风蛊','010010':'坎为水','110010':'水泽节','100010':'水雷屯','101010':'水火既济','101110':'泽火革','101100':'雷火丰','101000':'地火明夷','010000':'地水师','001001':'艮为山','101001':'山火贲','111001':'山天大畜','110001':'山泽损','110101':'火泽睽','110111':'天泽履','110011':'风泽中孚','001011':'风山渐','000000':'坤为地','100000':'地雷复','110000':'地泽临','111000':'地天泰','111100':'雷天大壮','111110':'泽天夬','111010':'水天需','000010':'水地比'};
var KONG = ['子丑','寅卯','辰巳','午未','申酉','戌亥'];

function getJDN(y,m,d){var a=Math.floor((14-m)/12),yy=y+4800-a,mm=m+12*a-3;return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045;}
function getDayGZ(dt){var j=getJDN(dt.getFullYear(),dt.getMonth()+1,dt.getDate()),i=((j+49)%60+60)%60;return{gan:i%10,zhi:i%12,gz:GANS[i%10]+ZHIS[i%12]};}
function getHourGZ(dg,h){var s=Math.floor(((h+1)%24)/2),g=((dg%5)*2+s)%10;return{gz:GANS[g]+ZHIS[s]};}
function getYearGZ(y){var i=((y-4)%60+60)%60;return{gan:i%10,gz:GANS[i%10]+ZHIS[i%12]};}
function getMonthGZ(yg,dt){var m=dt.getMonth()+1,d=dt.getDate(),b=[[1,6],[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,7],[9,8],[10,8],[11,7],[12,7]],zm=[1,2,3,4,5,6,7,8,9,10,11,0],z=0;for(var i=b.length-1;i>=0;i--)if(m>b[i][0]||(m===b[i][0]&&d>=b[i][1])){z=zm[i];break;}var base=[2,4,6,8,0][yg%5],g=(base+((z-2+12)%12))%10;return{gz:GANS[g]+ZHIS[z]};}

function getNajia(mk){
  var n=mk.substring(0,3),w=mk.substring(3,6);
  var ni=YAOS.indexOf(n),wi=YAOS.indexOf(w);
  var nA=NAJIA[ni][0].substring(1).split('').map(function(z){return NAJIA[ni][0][0]+z;});
  var wA=NAJIA[wi][1].substring(1).split('').map(function(z){return NAJIA[wi][1][0]+z;});
  return nA.concat(wA);
}
function gz5x(gz){return gz+XING5[ZHI5[ZHIS.indexOf(gz[1])]];}
function getQin6(a,b){var x=typeof a==='string'?XING5.indexOf(a):a,y=typeof b==='string'?XING5.indexOf(b):b;return QING6[((x-y)%5+5)%5];}

function setShiYao(mk){
  var w=mk.substring(3,6),n=mk.substring(0,3);
  var sh=function(s,x){var idx=x!==undefined?x:s;return[s,s>3?s-3:s+3,idx];};
  if(w[2]===n[2]){if(w[1]!==n[1]&&w[0]!==n[0])return sh(2);}
  else if(w[1]===n[1]&&w[0]===n[0])return sh(5);
  if(w[1]===n[1]){if(w[0]!==n[0]&&w[2]!==n[2])return sh(4,6);}
  else if(w[0]===n[0]&&w[2]===n[2])return sh(3,6);
  if(w[0]===n[0]){if(w[1]!==n[1]&&w[2]!==n[2])return sh(4);}
  else if(w[1]===n[1]&&w[2]===n[2])return sh(1);
  if(w===n)return sh(6);
  return sh(3);
}
function getPalace(mk,shi){
  var w=mk.substring(3,6),n=mk.substring(0,3),hun='';
  if(w[1]===n[1]){if(w[0]!==n[0]&&w[2]!==n[2])hun='y';}
  else if(w[0]===n[0]&&w[2]===n[2])hun='g';
  if(hun==='g')return YAOS.indexOf(n);
  if([1,2,3,6].indexOf(shi)!==-1)return YAOS.indexOf(w);
  if([4,5].indexOf(shi)!==-1||hun==='y')return YAOS.indexOf(n.split('').map(function(c){return c==='0'?'1':'0';}).join(''));
  return 0;
}
function getGod6(dg){var num=Math.ceil((dg+1)/2)-7;if(dg===4)num=-4;if(dg===5)num=-3;if(dg>5)num+=1;var idx=((num%6)+6)%6;return SHEN6.slice(idx).concat(SHEN6.slice(0,idx));}
function getXunkong(gz){var gm=GANS.indexOf(gz[0]),zm=ZHIS.indexOf(gz[1]);if(gm===zm||zm<gm)zm+=12;return KONG[Math.floor((zm-gm)/2)-1];}
function getGuaType(mk){
  var w=mk.substring(3,6),n=mk.substring(0,3);
  if(w[1]===n[1]&&w[0]!==n[0]&&w[2]!==n[2])return '游魂';
  if(w[1]!==n[1]&&w[0]===n[0]&&w[2]===n[2])return '归魂';
  if(w===n)return '六冲';
  var s=[n,w];if(s.length===2&&s.indexOf('100')!==-1&&s.indexOf('111')!==-1)return '六冲';
  var nm=GUA64[mk]||'';
  var lh=['否','困','旅','豫','节','贲','复','泰'];
  for(var i=0;i<lh.length;i++)if(nm.indexOf(lh[i])!==-1)return '六合';
  return '';
}
function getHidden(gi,q6){
  var set={};q6.forEach(function(q){set[q]=1;});
  if(Object.keys(set).length>=5)return null;
  var mk=YAOS[gi]+YAOS[gi],na=getNajia(mk),gw=XING5[GUA5[gi]];
  var hq=na.map(function(g){return getQin6(gw,XING5[ZHI5[ZHIS.indexOf(g[1])]]);});
  var hx=na.map(function(g){return gz5x(g);});
  var seat=[];for(var i=0;i<hq.length;i++)if(!set[hq[i]])seat.push(i);
  return{name:GUA64[mk],qin6:hq,qinx:hx,seat:seat};
}
function getTransform(p,gi){
  if(!p.some(function(v){return v===3||v===4;}))return null;
  var bm=p.map(function(v){return(v===1||v===4)?'1':'0';}).join('');
  var gw=XING5[GUA5[gi]],na=getNajia(bm);
  var q6=na.map(function(g){return getQin6(gw,XING5[ZHI5[ZHIS.indexOf(g[1])]]);});
  var qx=na.map(function(g){return gz5x(g);});
  var bs=setShiYao(bm),bg=getPalace(bm,bs[0]);
  return{name:GUA64[bm],mark:bm,qin6:q6,qinx:qx,gong:GUAS[bg],na:na};
}

// ---- 断卦状态计算 ----
function chong(z1, z2) {
  var a = ZHIS.indexOf(z1), b = ZHIS.indexOf(z2);
  return a >= 0 && b >= 0 && Math.abs(a - b) === 6;
}
var HE_PAIRS = [[0,1],[2,11],[3,10],[4,9],[5,8],[6,7]];
function he(z1, z2) {
  var a = ZHIS.indexOf(z1), b = ZHIS.indexOf(z2);
  for (var i = 0; i < HE_PAIRS.length; i++) {
    if ((HE_PAIRS[i][0] === a && HE_PAIRS[i][1] === b) ||
        (HE_PAIRS[i][0] === b && HE_PAIRS[i][1] === a)) return true;
  }
  return false;
}
function xingOf(zhi) { return XING5[ZHI5[ZHIS.indexOf(zhi)]]; }
function sheng(x1, x2) { return (XING5.indexOf(x1) + 1) % 5 === XING5.indexOf(x2); }
function ke(x1, x2)   { return (XING5.indexOf(x1) + 2) % 5 === XING5.indexOf(x2); }

var PROGRESS_MAP = { '寅':'卯','巳':'午','申':'酉','亥':'子','辰':'未','丑':'辰','未':'戌' };
var MU_MAP = { '木':'未','火':'戌','土':'辰','金':'丑','水':'辰' };

function yaoRelationMonth(zhi, monZhi) {
  if (zhi === monZhi) return '临月建旺相';
  if (chong(zhi, monZhi)) return '月破';
  if (he(zhi, monZhi)) return '月合';
  var x = xingOf(zhi), mx = xingOf(monZhi);
  if (x === mx) return '得月建比和';
  if (sheng(mx, x)) return '月建生';
  if (ke(mx, x)) return '受月建克';
  if (sheng(x, mx)) return '泄月建之气';
  if (ke(x, mx)) return '克月建(反克)';
  return '';
}

function yaoRelationDay(zhi, dayZhi, isAnimated) {
  if (zhi === dayZhi) return '临日辰';
  if (chong(zhi, dayZhi)) return isAnimated ? '日冲(旺相不散，应于值日)' : '日冲(旺则暗动、衰则日破)';
  if (he(zhi, dayZhi)) return '日合';
  var x = xingOf(zhi), dx = xingOf(dayZhi);
  if (x === dx) return '日辰比和';
  if (sheng(dx, x)) return '日辰生';
  if (ke(dx, x)) return '日辰克';
  if (sheng(x, dx)) return '泄日辰之气';
  if (ke(x, dx)) return '克日辰(反克)';
  return '';
}

function bianRelation(origZhi, bianZhi, xkStr, monZhi) {
  var out = [];
  if (origZhi === bianZhi) return '';
  var ox = xingOf(origZhi), bx = xingOf(bianZhi);
  if (ox === bx) {
    if (PROGRESS_MAP[origZhi] === bianZhi) out.push('化进神');
    else if (PROGRESS_MAP[bianZhi] === origZhi) out.push('化退神');
    else out.push('化比和');
  } else {
    if (sheng(bx, ox)) out.push('化回头生');
    if (ke(bx, ox))   out.push('化回头克');
    if (sheng(ox, bx)) out.push('化泄气');
    if (ke(ox, bx))   out.push('反克出');
  }
  if (xkStr && xkStr.indexOf(bianZhi) !== -1) out.push('化入空亡');
  if (chong(bianZhi, monZhi)) out.push('化月破');
  if (MU_MAP[ox] === bianZhi) out.push('化入墓库');
  return out.join('、');
}

function buildStatus(r) {
  var lines = [];
  var xk = r.xk || '';
  var dZhi = r.dg.gz[1];
  var mZhi = r.mg.gz[1];
  var bian = r.bian;
  var dongCount = r.dong.length;

  for (var i = 0; i < 6; i++) {
    var yaoGz = r.na[i];
    var zhi = yaoGz[1];
    var isDong = r.dong.indexOf(i) !== -1;
    var tags = [];

    var mr = yaoRelationMonth(zhi, mZhi); if (mr) tags.push(mr);
    var dr = yaoRelationDay(zhi, dZhi, isDong); if (dr) tags.push(dr);
    if (xk.indexOf(zhi) !== -1) tags.push(isDong ? '旬空(动不为空)' : '旬空');

    // 冲合则散：爻与月合被日冲 / 爻与日合被月冲
    if ((he(zhi, mZhi) && chong(zhi, dZhi)) || (he(zhi, dZhi) && chong(zhi, mZhi))) {
      tags.push('冲合则散');
    }

    if (isDong && bian && bian.na) {
      var bRel = bianRelation(zhi, bian.na[i][1], xk, mZhi);
      if (bRel) tags.push(bRel);
    }

    // 动爻对本爻（静爻）的生克
    if (!isDong) {
      var influ = getDongInfluenceOn(i, r.na, r.dong);
      if (influ) tags.push(influ);
    }

    if (dongCount === 1 && isDong) tags.push('独发(焦点)');
    if (dongCount === 5 && !isDong) tags.push('独静(焦点)');

    lines.push(tags.join('、') || '无特殊状态');
  }
  return lines;
}

function buildGuaFeatures(r) {
  var f = [];
  if (r.tp) f.push(r.tp);
  if (r.dong.length === 0) f.push('静卦');
  else if (r.dong.length === 6) f.push('乱动卦(六爻皆动)');
  else if (r.dong.length === 1) f.push('独发');
  else if (r.dong.length === 5) f.push('独静');
  if (r.bian) {
    if (r.name && r.bian.name && r.gong === r.bian.gong) f.push('本变同宫');
  }
  return f.join('、');
}

// ---- 三合局检测 ----
var SANHE_JU = [
  { name: '申子辰水局', zhi: ['申','子','辰'], xing: '水' },
  { name: '寅午戌火局', zhi: ['寅','午','戌'], xing: '火' },
  { name: '巳酉丑金局', zhi: ['巳','酉','丑'], xing: '金' },
  { name: '亥卯未木局', zhi: ['亥','卯','未'], xing: '木' }
];

function detectSanhe(na, dong, bianNa) {
  var zhis = na.map(function(g){ return g[1]; });
  var out = [];
  for (var i = 0; i < SANHE_JU.length; i++) {
    var ju = SANHE_JU[i];

    // 情况 1: 本卦 6 爻直接成局
    var pos = [];
    for (var j = 0; j < zhis.length; j++) {
      if (ju.zhi.indexOf(zhis[j]) !== -1) pos.push(j);
    }
    var uniqueZ = {};
    for (var k = 0; k < pos.length; k++) uniqueZ[zhis[pos[k]]] = 1;
    if (Object.keys(uniqueZ).length === 3 && pos.length >= 3) {
      var hasDong = false;
      for (var m = 0; m < pos.length; m++) {
        if (dong.indexOf(pos[m]) !== -1) { hasDong = true; break; }
      }
      out.push({
        name: ju.name, xing: ju.xing, positions: pos.slice(0,3), hasDong: hasDong, viaBian: false
      });
      continue;
    }

    // 情况 2: 本卦 2 支 + 动爻变爻第 3 支（原书六合章"内外卦变出第三支"）
    if (bianNa && dong && dong.length > 0 && Object.keys(uniqueZ).length === 2) {
      var missing = ju.zhi.filter(function(z){ return !uniqueZ[z]; })[0];
      for (var d = 0; d < dong.length; d++) {
        var didx = dong[d];
        if (bianNa[didx] && bianNa[didx][1] === missing) {
          var allPos = pos.indexOf(didx) === -1 ? pos.concat([didx]) : pos.slice();
          out.push({
            name: ju.name + '(动爻化出成局)',
            xing: ju.xing,
            positions: allPos.slice(0, 3),
            hasDong: true,
            viaBian: true,
            bianZhi: missing
          });
          break;
        }
      }
    }
  }
  return out;
}

// 半合检测（两个合会等第三个填实）
function detectBanhe(na) {
  var zhis = na.map(function(g){ return g[1]; });
  var out = [];
  for (var i = 0; i < SANHE_JU.length; i++) {
    var ju = SANHE_JU[i];
    var pos = [];
    for (var j = 0; j < zhis.length; j++) {
      if (ju.zhi.indexOf(zhis[j]) !== -1) pos.push(j);
    }
    var uniqueZ = {};
    for (var k = 0; k < pos.length; k++) uniqueZ[zhis[pos[k]]] = 1;
    var uniqueArr = Object.keys(uniqueZ);
    if (uniqueArr.length === 2) {
      var missing = ju.zhi.filter(function(z){ return uniqueArr.indexOf(z) === -1; })[0];
      out.push({
        name: ju.name + '半合(待' + missing + '日填实)',
        xing: ju.xing, positions: pos, waitFor: missing
      });
    }
  }
  return out;
}

// ---- 爻内六合六冲 ----
function detectLiuheLiuchong(na) {
  var zhis = na.map(function(g){ return g[1]; });
  var he = [], chong = [];
  for (var i = 0; i < zhis.length; i++) {
    for (var j = i + 1; j < zhis.length; j++) {
      var z1 = zhis[i], z2 = zhis[j];
      var zi = ZHIS.indexOf(z1), zj = ZHIS.indexOf(z2);
      if (Math.abs(zi - zj) === 6) {
        chong.push({ a: i, b: j, zhi: z1 + '冲' + z2 });
      }
      for (var k = 0; k < HE_PAIRS.length; k++) {
        if ((HE_PAIRS[k][0] === zi && HE_PAIRS[k][1] === zj) ||
            (HE_PAIRS[k][0] === zj && HE_PAIRS[k][1] === zi)) {
          he.push({ a: i, b: j, zhi: z1 + '合' + z2 });
        }
      }
    }
  }
  return { he: he, chong: chong };
}

// ---- 反吟 / 伏吟（爻级 + 卦级）----
// 原书《反伏章第二十五》："卦变者内外动而反伏者，如乾卦变坤卦"
// 卦级反吟：内卦或外卦三爻全动（三爻取反 = 变出对宫卦），事体反复无常
function detectFanFuYin(na, bianNa, dong) {
  if (!bianNa || !dong || dong.length === 0) return { fanyin: [], fuyin: [], guaFanyin: null };
  var fy = [], fuy = [];
  for (var i = 0; i < dong.length; i++) {
    var idx = dong[i];
    var origZ = na[idx][1], bianZ = bianNa[idx][1];
    if (origZ === bianZ) fuy.push(idx);
    else {
      var zi = ZHIS.indexOf(origZ), zj = ZHIS.indexOf(bianZ);
      if (Math.abs(zi - zj) === 6) fy.push(idx);
    }
  }
  var innerAllDong = (dong.indexOf(0) !== -1) && (dong.indexOf(1) !== -1) && (dong.indexOf(2) !== -1);
  var outerAllDong = (dong.indexOf(3) !== -1) && (dong.indexOf(4) !== -1) && (dong.indexOf(5) !== -1);
  var guaFanyin = null;
  if (innerAllDong && outerAllDong) guaFanyin = '内外卦皆反吟';
  else if (innerAllDong) guaFanyin = '内卦反吟';
  else if (outerAllDong) guaFanyin = '外卦反吟';
  return { fanyin: fy, fuyin: fuy, guaFanyin: guaFanyin };
}

// ---- 世应关系 ----
function getShiYingRel(na, sy) {
  var shiIdx = sy[0] - 1, yingIdx = sy[1] - 1;
  var shiZ = na[shiIdx][1], yingZ = na[yingIdx][1];
  var si = ZHIS.indexOf(shiZ), yi = ZHIS.indexOf(yingZ);
  var shiX = xingOf(shiZ), yingX = xingOf(yingZ);
  var rel = [];

  if (shiZ === yingZ) rel.push('世应同地支(比和)');
  if (Math.abs(si - yi) === 6) rel.push('世应相冲(双方对立)');
  for (var k = 0; k < HE_PAIRS.length; k++) {
    if ((HE_PAIRS[k][0] === si && HE_PAIRS[k][1] === yi) ||
        (HE_PAIRS[k][0] === yi && HE_PAIRS[k][1] === si)) {
      rel.push('世应相合(双方有意)');
    }
  }
  if (shiX === yingX && shiZ !== yingZ) rel.push('世应五行同类(比和)');
  if (sheng(shiX, yingX)) rel.push('世生应(我付出给对方)');
  if (sheng(yingX, shiX)) rel.push('应生世(对方付出给我)');
  if (ke(shiX, yingX)) rel.push('世克应(我主动压制对方)');
  if (ke(yingX, shiX)) rel.push('应克世(对方主动压制我)');
  return rel.join('、') || '世应无明显生克';
}

// ---- 动爻对其他爻的生克 ----
function getDongInfluenceOn(i, na, dong) {
  if (dong.indexOf(i) !== -1) return '';
  var targetX = xingOf(na[i][1]);
  var effects = [];
  for (var j = 0; j < dong.length; j++) {
    var didx = dong[j];
    var dX = xingOf(na[didx][1]);
    var label = YAO_POS[didx] + '爻动(' + dX + ')';
    if (sheng(dX, targetX)) effects.push('得' + label + '生');
    else if (ke(dX, targetX)) effects.push('受' + label + '克');
    else if (sheng(targetX, dX)) effects.push('泄于' + label);
  }
  return effects.join('、');
}
var YAO_POS = ['初','二','三','四','五','上'];

function compile(p, dt) {
  dt = dt || new Date();
  var mk = p.map(function(v){return String(v%2);}).join('');
  var sy = setShiYao(mk), gi = getPalace(mk, sy[0]);
  var na = getNajia(mk), gw = XING5[GUA5[gi]];
  var q6 = na.map(function(g){return getQin6(gw,XING5[ZHI5[ZHIS.indexOf(g[1])]]);});
  var qx = na.map(function(g){return gz5x(g);});
  var dg = getDayGZ(dt), god6 = getGod6(dg.gan);
  var dong = []; p.forEach(function(v,i){if(v>2)dong.push(i);});
  var yg = getYearGZ(dt.getFullYear());
  var r = {
    params:p, mk:mk, name:GUA64[mk], gong:GUAS[gi], gi:gi,
    sy:sy, q6:q6, qx:qx, na:na, god6:god6, dong:dong,
    hide:getHidden(gi,q6), bian:getTransform(p,gi),
    dg:dg, yg:yg, mg:getMonthGZ(yg.gan,dt),
    hg:getHourGZ(dg.gan,dt.getHours()),
    xk:getXunkong(dg.gz), tp:getGuaType(mk), dt:dt
  };
  r.status = buildStatus(r);
  r.features = buildGuaFeatures(r);
  r.sanhe = detectSanhe(r.na, r.dong, r.bian ? r.bian.na : null);
  r.banhe = detectBanhe(r.na);
  var hc = detectLiuheLiuchong(r.na);
  r.neihe = hc.he;
  r.neichong = hc.chong;
  r.fanfu = detectFanFuYin(r.na, r.bian ? r.bian.na : null, r.dong);
  r.shiYingRel = getShiYingRel(r.na, r.sy);
  return r;
}

const najia = {
  compile: compile,
  COIN_MAP: {6:4, 7:1, 8:2, 9:3},
  COIN_LABEL: {1:'少阳', 2:'少阴', 3:'老阳', 4:'老阴'},
  XING5: XING5, GUA5: GUA5,
  ZHIS: ZHIS, ZHI5: ZHI5, GANS: GANS,
  QING6: QING6,
  xingOf: xingOf, sheng: sheng, ke: ke, chong: chong, he: he,
  PROGRESS_MAP: PROGRESS_MAP, MU_MAP: MU_MAP, HE_PAIRS: HE_PAIRS,
  YAO_POS: YAO_POS
};

export const COIN_MAP = najia.COIN_MAP;
export const COIN_LABEL = najia.COIN_LABEL;
export {
  compile, XING5, GUA5, ZHIS, ZHI5, GANS, QING6,
  xingOf, sheng, ke, chong, he, PROGRESS_MAP, MU_MAP, HE_PAIRS, YAO_POS,
};

export default najia;
