// @ts-nocheck
// 六爻卦象诊断层
// 接收已装卦好的 r 对象 + 用神类型，按 Handbook v1 的流程做本地推理，
// 产出结构化诊断结果，让 AI 只需做"翻译和建议"而不是"五行推导"。

import {
  XING5, ZHIS, QING6, xingOf, sheng, ke, chong, he,
  PROGRESS_MAP, MU_MAP, YAO_POS, HE_PAIRS,
} from './najia';

// 五行生我者（元神五行）
function shengMe(x) {
  // x 在 XING5 索引为 i，生 x 的五行索引为 (i-1+5)%5
  return XING5[(XING5.indexOf(x) - 1 + 5) % 5];
}
// 克我者（忌神五行）
function keMe(x) {
  return XING5[(XING5.indexOf(x) - 2 + 5) % 5];
}

// 真空判定（《旬空章第二十六》原文："真空即春土、夏金、秋木、三冬逢火是真空"）
// 严格按野鹤原书明示：春夏秋仅取仲月；冬季按"三冬"明文取三个月（亥子丑）
// 反例佐证：《旬空章》辰月乙卯日卦例野鹤云"三月之丑土财爻有气"——辰未戌丑这四个土王月
// 不算入"春/夏/秋"真空范围（土王月各自所属五行有气，野鹤实战判法承认"有气不为空"）
var ZHENKONG_MAP = {
  '寅': '土', '卯': '土',                  // 春仲月 → 土真空
  '巳': '金', '午': '金',                  // 夏仲月 → 金真空
  '申': '木', '酉': '木',                  // 秋仲月 → 木真空
  '亥': '火', '子': '火', '丑': '火'       // 三冬（野鹤明示"三冬逢火"）→ 火真空
};

// 五行长生、帝旺于地支（《增删卜易》附录 B.1，水土同表）
var CHANG_SHENG = { '金': '巳', '木': '亥', '水': '申', '土': '申', '火': '寅' };
var DI_WANG     = { '金': '酉', '木': '卯', '水': '子', '土': '子', '火': '午' };

// ---- STEP 1/2: 定位用神 + 标记元忌仇 ----
function locateYongShen(r, yongType) {
  if (yongType === '世爻') {
    var pos = r.sy[0] - 1;
    return {
      type: '世爻',
      primary: pos,
      xing: xingOf(r.na[pos][1]),
      zhi: r.na[pos][1],
      gz: r.na[pos],
      q6: r.q6[pos],
      qx: r.qx[pos],
      candidates: [pos],
      viaFuShen: false
    };
  }
  // 六亲类型
  var positions = [];
  for (var i = 0; i < 6; i++) {
    if (r.q6[i] === yongType) positions.push(i);
  }
  if (positions.length === 0) {
    // 用神不上卦，查伏神
    if (r.hide && r.hide.seat && r.hide.seat.length > 0) {
      for (var j = 0; j < r.hide.seat.length; j++) {
        var fPos = r.hide.seat[j];
        if (r.hide.qin6[fPos] === yongType) {
          return {
            type: yongType,
            primary: fPos,
            xing: r.hide.qinx[fPos].substring(2),
            zhi: r.hide.qinx[fPos][1],
            gz: r.hide.qin6[fPos] + r.hide.qinx[fPos].substring(0, 2),
            q6: yongType,
            qx: r.hide.qinx[fPos],
            candidates: [fPos],
            viaFuShen: true,
            flyingPos: fPos // 飞神位置（用神伏在此爻下）
          };
        }
      }
    }
    return {
      type: yongType,
      primary: null,
      xing: null,
      candidates: [],
      viaFuShen: false,
      notInGua: true
    };
  }
  // 一个或多个用神在卦上
  var chosen = pickTwoPresent(r, positions);
  return {
    type: yongType,
    primary: chosen.primary,
    xing: xingOf(r.na[chosen.primary][1]),
    zhi: r.na[chosen.primary][1],
    gz: r.na[chosen.primary],
    q6: yongType,
    qx: r.qx[chosen.primary],
    candidates: positions,
    viaFuShen: false,
    twoPresentReason: chosen.reason
  };
}

// 两现择取 —— STEP 6.9 正法
function pickTwoPresent(r, positions) {
  if (positions.length === 1) {
    return { primary: positions[0], reason: '唯一用神' };
  }
  var xk = r.xk || '';
  var mZhi = r.mg.gz[1];

  // 规则 1: 舍休囚用旺相（临月建、日辰或得月日生）
  var wangxiang = positions.filter(function(p) {
    var z = r.na[p][1], x = xingOf(z);
    if (z === mZhi || z === r.dg.gz[1]) return true;
    if (sheng(xingOf(mZhi), x) || sheng(xingOf(r.dg.gz[1]), x)) return true;
    if (x === xingOf(mZhi) || x === xingOf(r.dg.gz[1])) return true;
    return false;
  });
  if (wangxiang.length === 1) return { primary: wangxiang[0], reason: '舍休囚用旺相' };
  var pool = wangxiang.length > 0 ? wangxiang : positions;

  // 规则 2: 舍静用动
  var dong = pool.filter(function(p) { return r.dong.indexOf(p) !== -1; });
  if (dong.length === 1) return { primary: dong[0], reason: '舍静用动' };
  if (dong.length > 1) pool = dong;

  // 规则 3: 舍月破用不破
  var notBroken = pool.filter(function(p) { return !chong(r.na[p][1], mZhi); });
  if (notBroken.length === 1) return { primary: notBroken[0], reason: '舍月破用不破' };
  if (notBroken.length > 0) pool = notBroken;

  // 规则 4: 舍旬空用不空
  var notKong = pool.filter(function(p) { return xk.indexOf(r.na[p][1]) === -1; });
  if (notKong.length === 1) return { primary: notKong[0], reason: '舍旬空用不空' };
  if (notKong.length > 0) pool = notKong;

  // 规则 5: 舍被伤用不伤（简化：取持世或临动者）
  var shi = pool.filter(function(p) { return p === r.sy[0] - 1; });
  if (shi.length === 1) return { primary: shi[0], reason: '优先取持世' };

  return { primary: pool[0], reason: '两现同等，取首位' };
}

function markYuanJiChou(r, yongXing) {
  if (!yongXing) return { yuan: [], ji: [], chou: [] };
  var yuanXing = shengMe(yongXing);      // 生用神者
  var jiXing = keMe(yongXing);            // 克用神者
  var chouXing = keMe(yuanXing);          // 克元神 = 生忌神（同一五行）

  var yuan = [], ji = [], chou = [];
  for (var i = 0; i < 6; i++) {
    var x = xingOf(r.na[i][1]);
    if (x === yuanXing) yuan.push(i);
    if (x === jiXing) ji.push(i);
    if (x === chouXing) chou.push(i);
  }
  return {
    yuan: yuan, ji: ji, chou: chou,
    yuanXing: yuanXing, jiXing: jiXing, chouXing: chouXing
  };
}

// ---- STEP 3.7 / Hard Rule 3: 真空判定 ----
function checkZhenKong(r) {
  var xk = r.xk || '';
  var mZhi = r.mg.gz[1];
  var forbidden = ZHENKONG_MAP[mZhi];
  if (!forbidden) return [];
  var out = [];
  for (var i = 0; i < 6; i++) {
    var z = r.na[i][1], x = xingOf(z);
    var isKong = xk.indexOf(z) !== -1;
    var isStatic = r.dong.indexOf(i) === -1;
    if (isKong && isStatic && x === forbidden) {
      out.push({ pos: i, reason: '旬空+静+' + mZhi + '月' + forbidden + '真空' });
    }
  }
  return out;
}

// ---- STEP 5.1: 用神无根 ----
function checkNoRoot(r, yongShen, yjc) {
  if (!yongShen || yongShen.primary === null || yongShen.viaFuShen) return null;
  var idx = yongShen.primary;
  var z = r.na[idx][1], x = yongShen.xing;
  var mZhi = r.mg.gz[1], mX = xingOf(mZhi);
  var dZhi = r.dg.gz[1], dX = xingOf(dZhi);

  var isMonthBreak = chong(z, mZhi);
  // 月之救：临月建 / 月生 / 月合 / 比和
  var monthHelps = (z === mZhi) || sheng(mX, x) || he(z, mZhi) || (x === mX);
  // 日之救：临日辰 / 日生 / 日合 / 长生 / 帝旺 / 比和
  var dayHelps = (z === dZhi) || sheng(dX, x) || he(z, dZhi) || (x === dX)
                 || CHANG_SHENG[x] === dZhi || DI_WANG[x] === dZhi;

  // 动爻之救：动爻生用神 / 动爻合用神 / 动爻同党比和 / 动爻克休囚之忌神
  // 《元神章第十一》"忌神虽动，不能克用神者有七：忌神**休囚**不动，而动休囚被日、月动爻克者一也"
  // 关键前置：忌神必须休囚（无月之力），旺相忌神不因被普通动爻克而失力
  // 《克处逢生章第十三》卦例佐证：父母暗动生用神为"克处逢生若有父母可以救"
  var dongSaves = false;
  for (var i = 0; i < r.dong.length; i++) {
    var di = r.dong[i];
    if (di === idx) continue;
    var dongZ = r.na[di][1];
    var dongX = xingOf(dongZ);
    if (sheng(dongX, x) || he(dongZ, z) || dongX === x) { dongSaves = true; break; }
    // 动爻克"休囚"忌神：野鹤"忌神虽动，不能克用神者有七 - 第一条要求忌神休囚"
    // 必须卦中**所有**忌神都休囚（every）：单个旺忌神仍能克用神，部分救不算救
    // 休囚定义：月、日皆不扶（非临月/日、非月日生、非月日合、非五行比和）
    if (yjc && yjc.jiXing && yjc.ji && yjc.ji.length > 0 && ke(dongX, yjc.jiXing)) {
      var allJiXiuQiu = yjc.ji.every(function(jp) {
        var jZ = r.na[jp][1], jX = xingOf(jZ);
        var monthSupports = (jZ === mZhi) || (jX === mX) || sheng(mX, jX) || he(jZ, mZhi);
        var daySupports = (jZ === dZhi) || (jX === dX) || sheng(dX, jX) || he(jZ, dZhi);
        return !monthSupports && !daySupports;
      });
      if (allJiXiuQiu) { dongSaves = true; break; }
    }
  }
  // 用神自己动：化回头生 / 化进神 / 化比和
  if (!dongSaves && r.dong.indexOf(idx) !== -1 && r.bian && r.bian.na) {
    var bZ = r.bian.na[idx][1];
    var bX = xingOf(bZ);
    if (sheng(bX, x) || PROGRESS_MAP[z] === bZ || bX === x) dongSaves = true;
  }

  // 暗动救应：元神暗动可作动爻生用神（《暗动章第二十二》line 833 "用神休囚得元神暗动以相生"）
  // 静爻 + 月旺 + 日冲 = 暗动；暗动元神自动生用神（因 yuan = shengMe(yong) 五行循环保证）
  if (!dongSaves && yjc && yjc.yuan && yjc.yuan.length > 0) {
    for (var ay = 0; ay < yjc.yuan.length; ay++) {
      var ayPos = yjc.yuan[ay];
      if (r.dong.indexOf(ayPos) !== -1) continue;  // 已是明动跳过
      var ayZ = r.na[ayPos][1], ayX = xingOf(ayZ);
      if (!chong(ayZ, dZhi)) continue;  // 必须日辰冲
      // 月旺
      if (ayZ === mZhi || ayX === mX || sheng(mX, ayX) || he(ayZ, mZhi)) {
        dongSaves = true; break;
      }
    }
  }

  if (isMonthBreak && !monthHelps && !dayHelps && !dongSaves) {
    return {
      reason: '用神月破，日月不生扶不合，动爻无救应',
      severity: '危（待救）',
      hint: '看卦中是否有 卦逢六合 / 六冲变六合 / 三合局生用神 / 应期填实(出破之月) 等格局翻案；若无，按凶推。'
    };
  }
  return null;
}

// ---- STEP 4: 判定元神/忌神"有力"还是"无力" ----
function evalPower(r, idx, isElement) {
  // isElement: 'yuan' 或 'ji'
  var x = xingOf(r.na[idx][1]);
  var z = r.na[idx][1];
  var xk = r.xk || '';
  var mZhi = r.mg.gz[1], mX = xingOf(mZhi);
  var dZhi = r.dg.gz[1], dX = xingOf(dZhi);
  var isDong = r.dong.indexOf(idx) !== -1;
  var kong = xk.indexOf(z) !== -1;
  var monthBreak = chong(z, mZhi);

  var strong = [], weak = [];

  // 旺相（临日月/得日月生）
  if (z === mZhi || x === mX) strong.push('临月建');
  else if (sheng(mX, x)) strong.push('月建生');
  if (z === dZhi || x === dX) strong.push('临日辰');
  else if (sheng(dX, x)) strong.push('日辰生');
  if (he(z, dZhi)) strong.push('日辰合');
  // 长生 / 帝旺于日辰（仅在不临日辰、日辰五行不同时计入，避免与"临日辰"重复）
  if (z !== dZhi && x !== dX) {
    if (CHANG_SHENG[x] === dZhi) strong.push('长生于日');
    else if (DI_WANG[x] === dZhi) strong.push('帝旺于日');
  }
  // 暗动（《暗动章第二十二》line 832："静爻旺相日辰冲之为暗动"，可作动用）
  // 旺相 = 临月建 / 月生 / 月合 / 月比和；休囚日冲是日破不是暗动
  if (!isDong && chong(z, dZhi)) {
    if (z === mZhi || x === mX || sheng(mX, x) || he(z, mZhi)) {
      strong.push('暗动');
    }
  }

  // 动化
  if (isDong && r.bian && r.bian.na) {
    var bZ = r.bian.na[idx][1];
    var bX = xingOf(bZ);
    if (PROGRESS_MAP[z] === bZ) strong.push('化进神');
    else if (PROGRESS_MAP[bZ] === z) weak.push('化退神');
    if (sheng(bX, x) && x !== bX) strong.push('化回头生');
    if (ke(bX, x)) weak.push('化回头克');
    if (xk.indexOf(bZ) !== -1 && strong.length === 0) weak.push('化入空亡');
    if (chong(bZ, mZhi)) weak.push('化月破');
    if (MU_MAP[x] === bZ) weak.push('化入墓库');
  }

  // 弱点
  if (monthBreak) weak.push('月破');
  if (ke(mX, x) && !strong.length) weak.push('月建克');
  if (ke(dX, x) && !strong.some(function(s){ return s.indexOf('日辰') !== -1; })) weak.push('日辰克');
  if (kong && !isDong && !strong.length) weak.push('静爻旬空');

  // 入日墓 / 入动墓（《千金赋》"入墓难克"；STEP 4.2 "元神入三墓"）—— 对元神是无力、对忌神是克不动
  if (MU_MAP[x] === dZhi) weak.push('入日墓');
  for (var di = 0; di < r.dong.length; di++) {
    if (r.dong[di] !== idx && MU_MAP[x] === r.na[r.dong[di]][1]) {
      weak.push('入动墓');
      break;
    }
  }

  // 加权计分（避免 weak 标签密度高、单纯按个数失衡）
  // 临月建/临日辰是骨干旺衰来源，应≥普通生/合；月破/化回头克是硬伤；
  // 入墓三类（日墓/动墓/化墓）同因，按一次计；化退神/化入空亡较弱
  var WEIGHT = {
    '临月建': 2, '临日辰': 2, '化回头生': 2, '化进神': 2,
    '月破': 2, '化回头克': 2, '月建克': 2,
    '日辰克': 1.5, '化月破': 1.5,
    '化退神': 1, '化入空亡': 1, '静爻旬空': 1,
    '入日墓': 1, '入动墓': 1, '化入墓库': 1
  };
  function score(arr) {
    var s = 0, seenMu = false;
    for (var i = 0; i < arr.length; i++) {
      var t = arr[i];
      // 入墓三类同因去重
      if (t === '入日墓' || t === '入动墓' || t === '化入墓库') {
        if (seenMu) continue;
        seenMu = true;
      }
      s += WEIGHT[t] || 1;
    }
    return s;
  }
  var sScore = score(strong);
  var wScore = score(weak);
  // 入墓三类是"暂封"语义（《千金赋》野鹤注："屡见后逢冲开墓库日，依然木被金伤"），
  // 不等同于"自身破败"（如月破、化回头克），需在 reason 里区分以便 AI 抓住应期
  var hasBurial = weak.indexOf('入日墓') !== -1 || weak.indexOf('入动墓') !== -1 || weak.indexOf('化入墓库') !== -1;

  // 判定（对称阈值）
  var power = '未定';
  var reason = '';
  if (isElement === 'yuan') {
    if (sScore > wScore) {
      power = '有力';
      reason = strong.join('、') + (weak.length ? '（小损：' + weak.join('、') + '）' : '');
    } else if (wScore > sScore) {
      power = '无力';
      reason = weak.join('、') + (strong.length ? '（小补：' + strong.join('、') + '）' : '');
    } else if (sScore === 0) {
      power = '平';
      reason = '无明显旺衰因素，按本气论';
    } else {
      power = '半吉半凶';
      reason = '利：' + strong.join('、') + '；弊：' + weak.join('、');
    }
  } else {
    // 忌神："有力"表示能克用神，"无力"表示克不动
    // C7（2026-05-09 second-pass 修订）：忌神入墓硬规则覆盖
    // 野鹤《千金赋·入墓难克》（line 1490）："忌神入墓不克用神"——这是硬规则，不该被 score 加权压过
    // 触发条件：hasBurial（入日墓 / 入动墓 / 化入墓库）且无更硬的破败因素（月破、化回头克）
    // 月破或化回头克叠加时，忌神是"真破败"而非"暂封"，走原 score 路径
    if (hasBurial && !monthBreak && weak.indexOf('化回头克') === -1) {
      power = '无力(吉)';
      reason = weak.join('、') + '（忌神入墓暂封——野鹤《千金赋》"入墓难克"硬规则，眼下克不动用神；应期警惕冲开墓库之日）' + (strong.length ? '；虽自身有 ' + strong.join('、') + ' 但被墓地封住' : '');
    } else if (sScore > wScore) {
      power = '有力(凶)';
      reason = strong.join('、') + '（忌神旺则克用神）' + (weak.length ? '；自身小损：' + weak.join('、') : '');
    } else if (wScore > sScore) {
      power = '无力(吉)';
      if (hasBurial) {
        reason = weak.join('、') + '（忌神入墓暂封，眼下克不动用神；野鹤曰"屡见后逢冲开墓库日，依然木被金伤"——应期警惕冲开墓库之日）' + (strong.length ? '；但仍有：' + strong.join('、') : '');
      } else {
        reason = weak.join('、') + '（忌神自身破败，克不动用神）' + (strong.length ? '；但仍有：' + strong.join('、') : '');
      }
    } else if (sScore === 0) {
      power = '平';
      reason = '忌神无明显作用力，威胁较小';
    } else {
      power = '半力';
      reason = '利：' + strong.join('、') + '；弊：' + weak.join('、');
    }
  }
  return { pos: idx, power: power, reason: reason, isDong: isDong, kong: kong, hasBurial: hasBurial };
}

function evalAllPower(r, yjc) {
  return {
    yuan: yjc.yuan.map(function(i) { return evalPower(r, i, 'yuan'); }),
    ji: yjc.ji.map(function(i) { return evalPower(r, i, 'ji'); })
  };
}

// ---- STEP 6.7: 随鬼入墓 ----
// 原书《随鬼入墓章第三十》："自占看世爻，旺相者非真；代占看用神，用神旺相者非真"
// 当 yongShen.type === '世爻' 时 idx 即世爻位、q 即世爻六亲，所以单条件 q === '官鬼'
// 既覆盖自占（世爻六亲=官鬼），也覆盖代占（用神六亲=官鬼）
function checkSuiGuiRuMu(r, yongShen) {
  if (!yongShen || yongShen.primary === null) return null;
  var idx = yongShen.primary;
  var x = yongShen.xing;
  var q = r.q6[idx];
  if (q !== '官鬼') return null;

  var dZhi = r.dg.gz[1];
  var dayMu = MU_MAP[x] === dZhi;

  var dongMu = false;
  for (var i = 0; i < r.dong.length; i++) {
    if (MU_MAP[x] === r.na[r.dong[i]][1]) { dongMu = true; break; }
  }

  var huaMu = false;
  if (r.dong.indexOf(idx) !== -1 && r.bian && r.bian.na) {
    if (MU_MAP[x] === r.bian.na[idx][1]) huaMu = true;
  }

  if (!(dayMu || dongMu || huaMu)) return null;
  var which = [];
  if (dayMu) which.push('日墓');
  if (dongMu) which.push('动墓');
  if (huaMu) which.push('化墓');

  // 野鹤修正：只有休囚被克 + 入墓才真凶
  var mZhi = r.mg.gz[1];
  var weak = chong(r.na[idx][1], mZhi) || ke(xingOf(mZhi), x);
  return {
    pos: idx,
    types: which,
    severity: weak ? '真凶（世/用休囚被克+入墓）' : '非真凶（世/用旺相，墓为冲开之期）',
    muZhi: MU_MAP[x]
  };
}

// ---- STEP 6.10: 飞伏神有用/无用 ----
// 原书《飞伏神章第二十八》：有用 6 条 + 无用 5 条
function evalFlyingBuried(r) {
  if (!r.hide || !r.hide.seat || r.hide.seat.length === 0) return [];
  var out = [];
  for (var i = 0; i < r.hide.seat.length; i++) {
    var pos = r.hide.seat[i];
    var fuX = r.hide.qinx[pos].substring(2);
    var fuZ = r.hide.qinx[pos][1];
    var feiZ = r.na[pos][1];
    var feiX = xingOf(feiZ);
    var mZhi = r.mg.gz[1], mX = xingOf(mZhi);
    var dZhi = r.dg.gz[1], dX = xingOf(dZhi);
    var xk = r.xk || '';

    var reasons = [];
    var canOut = false;

    // 有用（6 条补全）
    if (sheng(dX, fuX) || fuZ === dZhi) { canOut = true; reasons.push('伏神得日生'); }
    if (sheng(mX, fuX) || fuZ === mZhi) { canOut = true; reasons.push('伏神得月生'); }
    // 伏神旺相（与月建五行比和）
    if (fuX === mX && fuZ !== mZhi) { canOut = true; reasons.push('伏神旺相'); }
    if (sheng(feiX, fuX)) { canOut = true; reasons.push('飞神生伏神'); }
    // 动爻生伏神
    for (var di = 0; di < r.dong.length; di++) {
      var dongIdx = r.dong[di];
      if (dongIdx === pos) continue;
      var dongX = xingOf(r.na[dongIdx][1]);
      if (sheng(dongX, fuX)) { canOut = true; reasons.push('动爻生伏神'); break; }
    }
    if (xk.indexOf(feiZ) !== -1) { canOut = true; reasons.push('飞神旬空'); }
    if (chong(feiZ, mZhi)) { canOut = true; reasons.push('飞神月破'); }
    if (chong(feiZ, dZhi)) { canOut = true; reasons.push('日辰冲飞神'); }
    // 飞神休囚（月克）或飞神墓于日月
    if (ke(mX, feiX)) { canOut = true; reasons.push('飞神休囚(月克)'); }
    if (MU_MAP[feiX] === dZhi || MU_MAP[feiX] === mZhi) { canOut = true; reasons.push('飞神入日月墓'); }

    // 无用（5 条补全）
    var cantReasons = [];
    if (ke(feiX, fuX) && !canOut) cantReasons.push('飞神克伏神');
    if ((chong(fuZ, dZhi) || chong(fuZ, mZhi)) && !canOut) cantReasons.push('伏神被日月冲克');
    if (MU_MAP[fuX] === feiZ && !canOut) cantReasons.push('伏神墓于飞神');
    if ((MU_MAP[fuX] === dZhi || MU_MAP[fuX] === mZhi) && !canOut) cantReasons.push('伏神墓于日月');
    if (xk.indexOf(fuZ) !== -1 && (ke(mX, fuX) || ke(dX, fuX)) && !canOut) cantReasons.push('伏神空且被克');
    if (!canOut && !cantReasons.length && ke(mX, fuX) && ke(dX, fuX)) cantReasons.push('伏神休囚无气');

    out.push({
      pos: pos,
      q6: r.hide.qin6[pos],
      xing: fuX,
      canOut: canOut,
      reason: canOut ? reasons.join('、') : (cantReasons.join('、') || '伏神无力')
    });
  }
  return out;
}

// ---- STEP 6.11: 三刑 ----
// 野鹤原书《三刑章第二十一》："寅刑巳、巳刑申、子刑卯、卯刑午、丑戌相刑、未辰相刑。又云：辰午酉亥谓之自刑"
// 传统扩展：寅巳申、丑戌未三支聚齐亦称"恃势之刑"
var SANXING_RULES = [
  // 三支聚齐（恃势之刑）
  { name: '寅巳申三刑', zhi: ['寅','巳','申'] },
  // 两两互刑（野鹤原书明列）
  { name: '寅刑巳', pair: ['寅','巳'] },
  { name: '巳刑申', pair: ['巳','申'] },
  { name: '丑戌相刑', pair: ['丑','戌'] },
  { name: '未辰相刑', pair: ['未','辰'] },
  { name: '子刑卯', pair: ['子','卯'] },
  { name: '卯刑午', pair: ['卯','午'] },
  // 自刑（原书"辰午酉亥谓之自刑"，严格定义需两个相同地支）
  { name: '辰自刑', self: '辰' },
  { name: '午自刑', self: '午' },
  { name: '酉自刑', self: '酉' },
  { name: '亥自刑', self: '亥' }
];
function checkSanXing(r) {
  var zhis = r.na.map(function(g){ return g[1]; });
  var out = [];
  for (var i = 0; i < SANXING_RULES.length; i++) {
    var rule = SANXING_RULES[i];
    if (rule.zhi) {
      var found = [];
      for (var j = 0; j < zhis.length; j++) {
        if (rule.zhi.indexOf(zhis[j]) !== -1) found.push(j);
      }
      if (found.length >= 3) out.push({ name: rule.name, positions: found.slice(0,3) });
    } else if (rule.pair) {
      var a = zhis.indexOf(rule.pair[0]);
      var b = zhis.indexOf(rule.pair[1]);
      if (a !== -1 && b !== -1) out.push({ name: rule.name, positions: [a, b] });
    } else if (rule.self) {
      var selfPos = [];
      for (var k = 0; k < zhis.length; k++) {
        if (zhis[k] === rule.self) selfPos.push(k);
      }
      if (selfPos.length >= 2) out.push({ name: rule.name, positions: selfPos.slice(0, 2) });
    }
  }
  return out;
}

// ---- STEP 8: 应期候选日 ----
function calcYingQi(r, yongShen, yjc) {
  if (!yongShen || yongShen.primary === null) return null;
  var idx = yongShen.primary;
  var z = r.na[idx][1];
  var xk = r.xk || '';
  var mZhi = r.mg.gz[1];
  var isDong = r.dong.indexOf(idx) !== -1;
  var kong = xk.indexOf(z) !== -1;
  var monthBreak = chong(z, mZhi);

  // 冲日
  var chongZhi = '';
  var zIdx = ZHIS.indexOf(z);
  if (zIdx !== -1) chongZhi = ZHIS[(zIdx + 6) % 12];

  // 合日
  var heZhi = '';
  for (var i = 0; i < HE_PAIRS.length; i++) {
    if (HE_PAIRS[i][0] === zIdx) { heZhi = ZHIS[HE_PAIRS[i][1]]; break; }
    if (HE_PAIRS[i][1] === zIdx) { heZhi = ZHIS[HE_PAIRS[i][0]]; break; }
  }

  var candidates = [];
  if (kong && !isDong) {
    // 旬空：出空日（值日） + 冲空日
    candidates.push({ rule: '旬空出空', zhi: z, note: '值日出空', scale: 'day' });
    candidates.push({ rule: '旬空冲空', zhi: chongZhi, note: '冲空实空', scale: 'day' });
  } else if (isDong) {
    // 动：合日 + 值日
    candidates.push({ rule: '动逢合', zhi: heZhi, note: '合日应事', scale: 'day' });
    candidates.push({ rule: '动逢值', zhi: z, note: '值日应事', scale: 'day' });
  } else {
    // 静：值日 + 冲日
    candidates.push({ rule: '静逢值', zhi: z, note: '值日应事', scale: 'day' });
    candidates.push({ rule: '静逢冲', zhi: chongZhi, note: '冲则暗动', scale: 'day' });
  }
  if (monthBreak) {
    candidates.push({ rule: '月破填实', zhi: z, note: '实破之月（对应月）或合日', scale: 'day' });
  }

  // 化墓 / 入墓 → 冲开墓日
  if (r.status && r.status[idx]) {
    if (r.status[idx].indexOf('化入墓库') !== -1 || r.status[idx].indexOf('入墓') !== -1) {
      var muZhi = MU_MAP[yongShen.xing];
      if (muZhi) {
        var muIdx = ZHIS.indexOf(muZhi);
        var muChong = ZHIS[(muIdx + 6) % 12];
        candidates.push({ rule: '墓逢冲开', zhi: muChong, note: '冲开墓库之日', scale: 'day' });
      }
    }
  }

  // 忌神入墓 → 忌神出墓凶应期（《千金赋》野鹤："屡见后逢冲开墓库日，依然木被金伤"）
  // 即使忌神被判"无力(吉)"且其无力来源含入墓，应期到时仍会出墓克用神
  if (yjc && yjc.jiXing && yjc.ji && yjc.ji.length > 0) {
    var jiX = yjc.jiXing;
    var jiMu = MU_MAP[jiX];
    if (jiMu) {
      var jiInDayMu = (jiMu === r.dg.gz[1]);
      var jiInDongMu = false;
      // C8（2026-05-09 second-pass 修订）：删除原"yjc.ji 排除"
      // 原 reviewer-c2 r1 误判此排除为"与 evalPower 对称"——但 evalPower 只排除当前评估爻自身（idx）
      // calcYingQi 没有"当前忌神 idx"概念，排除整个 yjc.ji 反而过严，导致同一卦
      // evalPower 标"入动墓"但 calcYingQi 不出"忌神出墓凶应期"——两边信号打架
      // 现修：任一动爻地支等于 jiMu 即触发（与 evalPower 行为对称）
      for (var di2 = 0; di2 < r.dong.length; di2++) {
        if (r.na[r.dong[di2]][1] === jiMu) { jiInDongMu = true; break; }
      }
      var jiHuaMu = false;
      if (r.bian && r.bian.na) {
        for (var jx = 0; jx < yjc.ji.length; jx++) {
          var jiPos2 = yjc.ji[jx];
          if (r.dong.indexOf(jiPos2) !== -1 && r.bian.na[jiPos2][1] === jiMu) {
            jiHuaMu = true; break;
          }
        }
      }
      if (jiInDayMu || jiInDongMu || jiHuaMu) {
        var jiMuIdx = ZHIS.indexOf(jiMu);
        var jiMuChong = ZHIS[(jiMuIdx + 6) % 12];
        var muTypes = [];
        if (jiInDayMu) muTypes.push('日墓');
        if (jiInDongMu) muTypes.push('动墓');
        if (jiHuaMu) muTypes.push('化墓');
        candidates.push({
          rule: '忌神出墓凶应期',
          zhi: jiMuChong,
          note: '忌神(' + jiX + ')入' + muTypes.join('/') + '于' + jiMu + '，冲开之日（' + jiMuChong + '）忌神出墓克用神——野鹤"冲开墓库日依然木被金伤"',
          scale: 'day'
        });
      }
    }
  }

  // 远期岁应（《千金赋》"作当年祸福不以为重，作后世之吉凶，其实不轻"）
  // 当前太岁 r.yg 不参与判定（野鹤"太岁冲爻为岁破不以为凶"），但提供未来年级应期候选
  if (yongShen.xing) {
    var yongXing = yongShen.xing;
    // 1. 墓岁：用神五行之墓所在地支年（旺者冲开成事、衰者遭凶）
    var muZhiY = MU_MAP[yongXing];
    if (muZhiY) {
      candidates.push({
        rule: '墓岁',
        zhi: muZhiY,
        note: '用神入墓之年（旺者冲开成事之年、衰者遭凶）',
        scale: 'year'
      });
    }
    // 2. 实破之岁：月破爻远期应于用神本支之年
    if (monthBreak) {
      candidates.push({
        rule: '实破之岁',
        zhi: z,
        note: '月破爻远期应于用神本支之年（野鹤"实破之年"）',
        scale: 'year'
      });
    }
    // 3. 忌神旺岁：克用神五行对应的地支年（"后遇申酉岁难免其殃"）
    var jiXingY = keMe(yongXing);  // 克用神者
    var keZhisList = [];
    for (var zi = 0; zi < ZHIS.length; zi++) {
      if (xingOf(ZHIS[zi]) === jiXingY) keZhisList.push(ZHIS[zi]);
    }
    if (keZhisList.length > 0) {
      candidates.push({
        rule: '忌神旺岁',
        zhi: keZhisList.join('/'),
        note: '克用神五行(' + jiXingY + ')之年太岁到位，远期伤用神（《千金赋》"后遇申酉岁难免其殃"）',
        scale: 'year'
      });
    }
    // 4. 元神旺岁：生用神五行对应的地支年（远期吉）
    var yuanXingY = shengMe(yongXing);  // 生用神者
    var yuanZhisList = [];
    for (var zj = 0; zj < ZHIS.length; zj++) {
      if (xingOf(ZHIS[zj]) === yuanXingY) yuanZhisList.push(ZHIS[zj]);
    }
    if (yuanZhisList.length > 0) {
      candidates.push({
        rule: '元神旺岁',
        zhi: yuanZhisList.join('/'),
        note: '生用神五行(' + yuanXingY + ')之年太岁扶助，远期吉',
        scale: 'year'
      });
    }
  }

  return { yongZhi: z, yearZhi: r.yg.gz[1], candidates: candidates };
}

// ---- 暗动识别（《暗动章第二十二》line 832-833）----
// 原文："静爻旺相日辰冲之为暗动，静爻休囚日辰冲之为破"
// 元神暗动 → 喜（生用神）；忌神暗动 → 忌（克用神）；用神暗动 → 主事
// 与 evalPower 的 strong push '暗动' 互补：此处给顶层 anDong 字段供 AI 综合判断角色作用
function checkAnDong(r, yongShen, yjc) {
  var out = [];
  var mZhi = r.mg.gz[1], mX = xingOf(mZhi);
  var dZhi = r.dg.gz[1];
  for (var i = 0; i < 6; i++) {
    if (r.dong.indexOf(i) !== -1) continue;  // 必须静爻
    var z = r.na[i][1], x = xingOf(z);
    if (!chong(z, dZhi)) continue;  // 必须日辰冲
    // 旺相（临月建 / 月生 / 月合 / 月比和）；休囚日冲是日破，不是暗动
    var monthSupports = (z === mZhi) || (x === mX) || sheng(mX, x) || he(z, mZhi);
    if (!monthSupports) continue;
    // 角色识别 + 作用方向
    var role = '其他', target = '';
    if (yongShen && !yongShen.viaFuShen && yongShen.primary === i) {
      role = '用神'; target = '用神自身暗动主事';
    } else if (yjc && yjc.yuan && yjc.yuan.indexOf(i) !== -1) {
      role = '元神'; target = '元神暗动 → 生用神（喜，"用神休囚得元神暗动以相生"）';
    } else if (yjc && yjc.ji && yjc.ji.indexOf(i) !== -1) {
      role = '忌神'; target = '忌神暗动 → 克用神（忌）';
    } else if (yjc && yjc.chou && yjc.chou.indexOf(i) !== -1) {
      role = '仇神'; target = '仇神暗动 → 助忌神';
    }
    out.push({
      pos: i, q6: r.q6[i], zhi: z, xing: x,
      role: role, target: target,
      // 应期：日辰冲此爻的日（即占卦当日 dZhi）已暗动；下次 dZhi 值日为重应期
      // 野鹤卦例 line 842 "未日冲动丑土... 申时遇明医" — 暗动当下生效到时辰
      yingQiHint: dZhi + '日已冲此爻 → 暗动当下生效；下次 ' + dZhi + ' 日为该爻暗动重应期'
    });
  }
  return out;
}

// ---- 元神忌神接续相生（《元神章第十一》第 4 条格局）----
// 原文："忌神未土反生元神之酉金，金生亥水，接续相生，化凶而为吉"（卷一 line 561 卦例）
// 五行循环：ji = keMe(yong)、yuan = shengMe(yong)；天然有 sheng(jiXing, yuanXing)
// 所以触发条件简化为：卦中既有动元神 ∧ 又有动忌神（链路自动成立）
function checkContinuingSheng(r, yjc) {
  if (!yjc || !yjc.yuanXing || !yjc.jiXing) return null;
  if (!yjc.yuan || !yjc.ji || yjc.yuan.length === 0 || yjc.ji.length === 0) return null;
  var dongYuan = yjc.yuan.filter(function(p) { return r.dong.indexOf(p) !== -1; });
  var dongJi = yjc.ji.filter(function(p) { return r.dong.indexOf(p) !== -1; });
  if (dongYuan.length === 0 || dongJi.length === 0) return null;
  return {
    yuanPositions: dongYuan,
    jiPositions: dongJi,
    chain: yjc.jiXing + ' → ' + yjc.yuanXing + ' → 用神',
    note: '《元神章第十一》"忌神反生元神，元神生用神，接续相生，化凶而为吉"——忌神动+元神动时，忌神被元神牵走转生，不直接克用神'
  };
}

// ---- 主诊断函数 ----
function diagnose(r, yongType) {
  if (!yongType) yongType = '世爻';
  var yongShen = locateYongShen(r, yongType);
  var yjc = markYuanJiChou(r, yongShen.xing);
  var powerEval = evalAllPower(r, yjc);
  var noRoot = checkNoRoot(r, yongShen, yjc);
  var zhenKong = checkZhenKong(r);
  var suiGui = checkSuiGuiRuMu(r, yongShen);
  var flyingBuried = evalFlyingBuried(r);
  var sanXing = checkSanXing(r);
  var yingQi = calcYingQi(r, yongShen, yjc);
  var continuingSheng = checkContinuingSheng(r, yjc);
  var anDong = checkAnDong(r, yongShen, yjc);

  return {
    yongShen: yongShen,
    yuanJiChou: yjc,
    powerEval: powerEval,
    noRoot: noRoot,
    zhenKong: zhenKong,
    suiGui: suiGui,
    flyingBuried: flyingBuried,
    sanXing: sanXing,
    yingQi: yingQi,
    continuingSheng: continuingSheng,
    anDong: anDong
  };
}

export { diagnose };
