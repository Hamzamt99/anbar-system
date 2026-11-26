const units = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const tens = [
  "",
  "",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
];
function small(n) {
  if (n < 20) return units[n];
  if (n < 100)
    return [units[n % 10], tens[Math.floor(n / 10)]].filter(Boolean).join(" و");
  const h = [
    "",
    "مائة",
    "مائتان",
    "ثلاثمائة",
    "أربعمائة",
    "خمسمائة",
    "ستمائة",
    "سبعمائة",
    "ثمانمائة",
    "تسعمائة",
  ];
  return [h[Math.floor(n / 100)], small(n % 100)].filter(Boolean).join(" و");
}
function whole(n) {
  if (n < 1000) return small(n);
  const groups = [
    [1000000000, "مليار", "ملياران", "مليارات"],
    [1000000, "مليون", "مليونان", "ملايين"],
    [1000, "ألف", "ألفان", "آلاف"],
  ];
  for (const [size, one, two, many] of groups)
    if (n >= size) {
      const q = Math.floor(n / size),
        rest = n % size;
      return [
        q === 1 ? one : q === 2 ? two : whole(q) + " " + (q < 11 ? many : one),
        rest ? whole(rest) : "",
      ]
        .filter(Boolean)
        .join(" و");
    }
}
export function quantityWords(value) {
  const scaled = Math.round(Number(value) * 1000),
    n = Math.floor(scaled / 1000),
    r = scaled % 1000;
  const fractions = { 250: "ربع", 500: "نصف", 750: "ثلاثة أرباع" };
  const integer = n ? whole(n) : "صفر";
  if (!r) return `${integer} متر مكعب`;
  if (fractions[r]) return `${n ? integer + " و" : ""}${fractions[r]} متر مكعب`;
  const decimal = String(r)
    .padStart(3, "0")
    .replace(/0+$/, "")
    .split("")
    .map((digit) => (digit === "0" ? "صفر" : units[Number(digit)]))
    .join(" ");
  return `${integer} فاصلة ${decimal} متر مكعب`;
}
