/* Devanagari → Masaram Gondi (mirrors converter/python) */
(function (global) {
  const D = {
    0x0905: 0x11D00, 0x0906: 0x11D01, 0x0907: 0x11D02, 0x0908: 0x11D03,
    0x0909: 0x11D04, 0x090A: 0x11D05, 0x090F: 0x11D06, 0x0910: 0x11D08,
    0x0913: 0x11D09, 0x0914: 0x11D0B, 0x090E: 0x11D06, 0x0912: 0x11D09,
    0x090D: 0x11D06,
    0x0915: 0x11D0C, 0x0916: 0x11D0D, 0x0917: 0x11D0E, 0x0918: 0x11D0F,
    0x0919: 0x11D10, 0x091A: 0x11D11, 0x091B: 0x11D12, 0x091C: 0x11D13,
    0x091D: 0x11D14, 0x091E: 0x11D15, 0x091F: 0x11D16, 0x0920: 0x11D17,
    0x0921: 0x11D18, 0x0922: 0x11D19, 0x0923: 0x11D1A, 0x0924: 0x11D1B,
    0x0925: 0x11D1C, 0x0926: 0x11D1D, 0x0927: 0x11D1E, 0x0928: 0x11D1F,
    0x0929: 0x11D1F, 0x092A: 0x11D20, 0x092B: 0x11D21, 0x092C: 0x11D22,
    0x092D: 0x11D23, 0x092E: 0x11D24, 0x092F: 0x11D25, 0x0930: 0x11D26,
    0x0931: 0x11D26, 0x0932: 0x11D27, 0x0933: 0x11D2D, 0x0934: 0x11D2D,
    0x0935: 0x11D28, 0x0936: 0x11D29, 0x0937: 0x11D2A, 0x0938: 0x11D2B,
    0x0939: 0x11D2C,
    0x093E: 0x11D31, 0x093F: 0x11D32, 0x0940: 0x11D33, 0x0941: 0x11D34,
    0x0942: 0x11D35, 0x0943: 0x11D36, 0x0946: 0x11D3A, 0x0947: 0x11D3A,
    0x0948: 0x11D3C, 0x094A: 0x11D3D, 0x094B: 0x11D3D, 0x094C: 0x11D3F,
    0x0901: 0x11D40, 0x0902: 0x11D40, 0x0903: 0x11D41,
    0x093C: 0x11D42, 0x0945: 0x11D43, 0x0949: 0x11D43, 0x094D: 0x11D45,
    0x0966: 0x11D50, 0x0967: 0x11D51, 0x0968: 0x11D52, 0x0969: 0x11D53,
    0x096A: 0x11D54, 0x096B: 0x11D55, 0x096C: 0x11D56, 0x096D: 0x11D57,
    0x096E: 0x11D58, 0x096F: 0x11D59,
  };

  const R = {};
  Object.keys(D).forEach((k) => {
    const src = +k, dst = D[k];
    if (R[dst] === undefined) R[dst] = src;
  });
  Object.assign(R, {
    0x11D06: 0x090F, 0x11D09: 0x0913, 0x11D1F: 0x0928, 0x11D26: 0x0930,
    0x11D2D: 0x0933, 0x11D3A: 0x0947, 0x11D3D: 0x094B, 0x11D40: 0x0902,
    0x11D44: 0x094D, 0x11D45: 0x094D,
  });

  const cps = (...xs) => String.fromCodePoint(...xs);
  const NUKTA = {
    "\u0958": cps(0x11D0C, 0x11D42), "\u0959": cps(0x11D0D, 0x11D42),
    "\u095A": cps(0x11D0E, 0x11D42), "\u095B": cps(0x11D13, 0x11D42),
    "\u095C": cps(0x11D18, 0x11D42), "\u095D": cps(0x11D19, 0x11D42),
    "\u095E": cps(0x11D21, 0x11D42), "\u095F": cps(0x11D25, 0x11D42),
  };
  const CONJ = {
    "\u0915\u094d\u0937": cps(0x11D2E),
    "\u091c\u094d\u091e": cps(0x11D2F),
    "\u0924\u094d\u0930": cps(0x11D30),
  };
  const VOC = {
    "\u090B": cps(0x11D26, 0x11D36),
    "\u0960": cps(0x11D26, 0x11D36),
    "\u0944": cps(0x11D36),
    "\u0911": cps(0x11D09, 0x11D43),
  };
  const REPHA = 0x11D46, RAKARA = 0x11D47, VIRAMA = 0x11D45, HALANTA = 0x11D44;

  function isCons(cp) {
    return (cp >= 0x0915 && cp <= 0x0939) || (cp >= 0x0958 && cp <= 0x095F);
  }
  function toCps(s) {
    return Array.from(s).map((ch) => ch.codePointAt(0));
  }

  function convert(text, smartRa) {
    if (smartRa === undefined) smartRa = true;
    if (!text) return text;
    let s = text;
    Object.keys(NUKTA).forEach((k) => { s = s.split(k).join(NUKTA[k]); });
    Object.keys(VOC).forEach((k) => { s = s.split(k).join(VOC[k]); });
    Object.keys(CONJ).forEach((k) => { s = s.split(k).join(CONJ[k]); });

    if (smartRa) {
      const chars = toCps(s);
      const out = [];
      for (let i = 0; i < chars.length; ) {
        const ch = chars[i];
        if (ch === 0x0930 && i + 2 < chars.length && chars[i + 1] === 0x094D && isCons(chars[i + 2])) {
          out.push(REPHA, D[chars[i + 2]] || chars[i + 2]);
          i += 3;
          continue;
        }
        if (isCons(ch) && i + 2 < chars.length && chars[i + 1] === 0x094D && chars[i + 2] === 0x0930) {
          out.push(D[ch] || ch, RAKARA);
          i += 3;
          continue;
        }
        out.push(ch);
        i++;
      }
      s = String.fromCodePoint(...out);
    }

    return Array.from(s).map((ch) => {
      const cp = ch.codePointAt(0);
      return String.fromCodePoint(D[cp] !== undefined ? D[cp] : cp);
    }).join("");
  }

  function convertReverse(text) {
    if (!text) return text;
    let s = text;
    s = s.split(cps(0x11D2E)).join("\u0915\u094d\u0937");
    s = s.split(cps(0x11D2F)).join("\u091c\u094d\u091e");
    s = s.split(cps(0x11D30)).join("\u0924\u094d\u0930");
    s = s.split(cps(REPHA)).join("\u0930\u094d");
    s = s.split(cps(RAKARA)).join("\u094d\u0930");
    s = s.split(cps(HALANTA)).join("\u094d");
    return Array.from(s).map((ch) => {
      const cp = ch.codePointAt(0);
      return String.fromCodePoint(R[cp] !== undefined ? R[cp] : cp);
    }).join("");
  }

  const CHARSET = {
    vowels: [
      ["𑴀", "अ", 0x11D00], ["𑴁", "आ", 0x11D01], ["𑴂", "इ", 0x11D02], ["𑴃", "ई", 0x11D03],
      ["𑴄", "उ", 0x11D04], ["𑴅", "ऊ", 0x11D05], ["𑴆", "ए", 0x11D06], ["𑴈", "ऐ", 0x11D08],
      ["𑴉", "ओ", 0x11D09], ["𑴋", "औ", 0x11D0B],
    ],
    ka: [["𑴌","क"],["𑴍","ख"],["𑴎","ग"],["𑴏","घ"],["𑴐","ङ"]],
    ca: [["𑴑","च"],["𑴒","छ"],["𑴓","ज"],["𑴔","झ"],["𑴕","ञ"]],
    tta:[["𑴖","ट"],["𑴗","ठ"],["𑴘","ड"],["𑴙","ढ"],["𑴚","ण"]],
    ta: [["𑴛","त"],["𑴜","थ"],["𑴝","द"],["𑴞","ध"],["𑴟","न"]],
    pa: [["𑴠","प"],["𑴡","फ"],["𑴢","ब"],["𑴣","भ"],["𑴤","म"]],
    ya: [["𑴥","य"],["𑴦","र"],["𑴧","ल"],["𑴨","व"],["𑴩","श"],["𑴪","ष"],["𑴫","स"],["𑴬","ह"],["𑴭","ळ"]],
    conj:[["𑴮","क्ष"],["𑴯","ज्ञ"],["𑴰","त्र"]],
    matra:[["𑴱","ा"],["𑴲","ि"],["𑴳","ी"],["𑴴","ु"],["𑴵","ू"],["𑴶","ृ"],["𑴺","े"],["𑴼","ै"],["𑴽","ो"],["𑴿","ौ"]],
    signs:[["𑵀","ं"],["𑵁","ः"],["𑵂","़"],["𑵃","ॅ"],["𑵄","् हलं"],["𑵅","् युक्त"],["𑵆","र्"],["𑵇","्र"]],
    digits:[["𑵐","०"],["𑵑","१"],["𑵒","२"],["𑵓","३"],["𑵔","४"],["𑵕","५"],["𑵖","६"],["𑵗","७"],["𑵘","८"],["𑵙","९"]],
  };

  global.Gondi = { convert, convertReverse, CHARSET, VIRAMA, HALANTA, REPHA, RAKARA };
})(window);
