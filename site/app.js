"use strict";
const $ = (id) => document.getElementById(id),
  photo = new Image(),
  canvas = $("bike"),
  ctx = canvas.getContext("2d", { willReadFrequently: true });
const W = 1536,
  H = 1024,
  CROP = { x: 0, y: 30, w: 1536, h: 980 };
const gloss = 0.6;
let ready = false,
  selected = "frame",
  paintMode = "solid",
  solidColor = "#FFFFFF",
  solidLogo = "#000000",
  comparing = false,
  sampled = null,
  originalData,
  surfaceData,
  masks = {},
  changed = {},
  model = "v9",
  alphaMask;
const labels = {
    frame: t("车架与前叉"),
    fork: t("前叉"),
    logo: t("车身 Logo"),
  },
  colors = {
    frame: "#FFFFFF",
    front: "#433AA3",
    fork: "#FFFFFF",
    logo: "#000000",
  };
function off() {
  let c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}
const raw = off(),
  rawCtx = raw.getContext("2d", { willReadFrequently: true }),
  out = off(),
  outCtx = out.getContext("2d");
function poly(c, pts) {
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
  c.closePath();
  c.fill();
}
function stroke(c, pts, w) {
  c.lineWidth = w;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
  c.stroke();
}
function makeMasks() {
  const c = off(),
    cx = c.getContext("2d", { willReadFrequently: true });
  cx.drawImage(maskPhoto, 0, 0, W, H);
  const packed = cx.getImageData(0, 0, W, H).data;
  for (let k of Object.keys(labels))
    masks[k] = new Uint8ClampedArray(packed.length);
  for (let i = 3; i < packed.length; i += 4) {
    masks.frame[i] = packed[i - 3];
    masks.fork[i] = model === "v9" ? packed[i - 2] : 0;
    masks.logo[i] = packed[i - 1];
  }
  cx.clearRect(0, 0, W, H);
  cx.drawImage(surfacePhoto, 0, 0, W, H);
  surfaceData = cx.getImageData(0, 0, W, H).data;
}
// Fit the actual opaque bicycle, rather than each asset's different transparent margins.
const displayBike = off(),
  displayCtx = displayBike.getContext("2d");
let bikeLayout = { scale: 1, dx: 0, dy: 0 };
function fitBike() {
  const a = originalData.data,
    cols = new Uint16Array(W),
    rows = new Uint16Array(H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (a[(y * W + x) * 4 + 3] > 128) {
        cols[x]++;
        rows[y]++;
      }
  let left = 0,
    right = W - 1,
    top = 0,
    bottom = H - 1;
  while (left < right && cols[left] < 12) left++;
  while (right > left && cols[right] < 12) right--;
  while (top < bottom && rows[top] < 12) top++;
  while (bottom > top && rows[bottom] < 12) bottom--;
  const scale = Math.min(1360 / (right - left + 1), 875 / (bottom - top + 1));
  bikeLayout = {
    scale,
    dx: W / 2 - ((left + right + 1) * scale) / 2,
    dy: 950 - (bottom + 1) * scale,
  };
}
function groundPoints() {
  const points =
    model === "v8"
      ? [
          [360, 945],
          [1175, 945],
        ]
      : model === "crv"
        ? [
            [350, 956],
            [1180, 958],
          ]
        : model === "v9"
          ? [
              [365, 951],
              [1190, 951],
            ]
          : [
              [349, 970],
              [1214, 974],
            ];
  return points.map(([x, y]) => [
    x * bikeLayout.scale + bikeLayout.dx,
    y * bikeLayout.scale + bikeLayout.dy,
  ]);
}
function pointPoly(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (
      p[i][1] > y != p[j][1] > y &&
      x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]
    )
      inside = !inside;
  }
  return inside;
}
function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function render() {
  if (!ready) return;
  const src = originalData.data,
    data = new Uint8ClampedArray(src);
  for (let k of ["frame", "fork", "logo"]) {
    if (k === "logo" && !changed[k]) continue;
    let mask = masks[k],
      color = rgb(colors[k]),
      front = rgb(colors.front);
    for (let i = 3; i < data.length; i += 4) {
      const coverage = mask[i] / 255;
      if (!coverage) continue;
      const lum =
        (0.2126 * src[i - 3] + 0.7152 * src[i - 2] + 0.0722 * src[i - 1]) / 255;
      const shade =
          k === "logo" ? 1 : Math.min(1.05, surfaceData[i - 3] / 255 / 0.88),
        spec = 0;
      for (let j = 0; j < 3; j++) {
        const x = ((i - 3) / 4) % W,
          u = Math.max(
            0,
            Math.min(
              1,
              (x - (model === "v9" ? 805 : model === "crv" ? 760 : 680)) / 320,
            ),
          ),
          t =
            k === "frame" && paintMode === "gradient" ? u * u * (3 - 2 * u) : 0;
        const pigment = color[j] * (1 - t) + front[j] * t;
        const v = pigment * shade * (1 - spec) + 255 * spec;
        data[i - 3 + j] =
          data[i - 3 + j] * (1 - coverage) +
          Math.max(0, Math.min(255, v)) * coverage;
      }
    }
  } // Reference-derived reflection is an independent layer, confined to painted tubes.
  for (let i = 3; i < data.length; i += 4) {
    const light = surfaceData[i - 2] / 255;
    const coverage = Math.max(masks.frame[i], masks.fork[i]) / 255;
    const finish = model === "v9" ? 0.72 : gloss;
    const tubeShade = surfaceData[i - 3] / 255 / 0.88;
    const softSheen =
      model === "v9"
        ? Math.max(0, Math.min(1, (tubeShade - 0.87) / 0.13)) * 0.018
        : 0;
    const reflection =
      Math.min(
        0.18,
        light * (0.45 + 0.55 * Math.min(1, light / 0.45)) * finish + softSheen,
      ) * coverage;
    for (let j = 0; j < 3; j++)
      data[i - 3 + j] = data[i - 3 + j] * (1 - reflection) + 255 * reflection;
  }
  outCtx.putImageData(new ImageData(data, W, H), 0, 0);
  displayCtx.clearRect(0, 0, W, H);
  displayCtx.drawImage(
    out,
    bikeLayout.dx,
    bikeLayout.dy,
    W * bikeLayout.scale,
    H * bikeLayout.scale,
  );
  canvas.width = CROP.w;
  canvas.height = CROP.h;
  drawStudio();
  ctx.drawImage(
    displayBike,
    CROP.x,
    CROP.y,
    CROP.w,
    CROP.h,
    0,
    0,
    CROP.w,
    CROP.h,
  );
}

function drawStudio() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  function shadow(x, y, rx, ry, opacity) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(25,25,28," + opacity + ")");
    g.addColorStop(0.45, "rgba(25,25,28," + opacity * 0.4 + ")");
    g.addColorStop(1, "rgba(25,25,28,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  for (const [gx, gy] of groundPoints()) {
    const x = gx,
      y = gy - CROP.y;
    shadow(x, y + 6, 232, 23, 0.1);
    shadow(x, y + 1, 115, 6, 0.29);
  }
}

const uiLabels = {
  frame: t("车架与前叉"),
  front: t("前部颜色"),
  fork: t("前叉"),
  logo: t("车身 Logo"),
};
function select(k) {
  selected = k;
  document
    .querySelectorAll(".row")
    .forEach((r) => r.classList.toggle("selected", r.dataset.part === k));
  $("status").textContent = t("当前部位：") + uiLabels[k];
  $("apply").textContent = t("应用颜色");
}
function setSingleColor(k, value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return;
  colors[k] = value.toUpperCase();
  changed[k] = true;
  if ($("brandSource")) $("brandSource").style.display = "none";
  if ($("color-" + k)) {
    $("color-" + k).value = value;
    $("hex-" + k).value = colors[k];
  }
  render();
}
function setColor(k, value) {
  if (k in uiLabels) {
    setSingleColor(k, value);
    if (
      model === "v9" &&
      ((k === "frame" && paintMode === "solid") ||
        (k === "front" && paintMode === "gradient"))
    )
      setSingleColor("fork", value);
  }
}
for (let k of Object.keys(uiLabels)) {
  let r = document.createElement("div");
  r.className = "row";
  r.dataset.part = k;
  r.innerHTML = `<span>${uiLabels[k]}</span><input class="hex" id="hex-${k}" aria-label="${uiLabels[k]}${language === "en" ? " hex value" : "色号"}" value="${colors[k]}" maxlength="7"><input type="color" id="color-${k}" aria-label="${uiLabels[k]}${language === "en" ? " color picker" : "调色盘"}" value="${colors[k]}">`;
  r.onclick = () => select(k);
  $("rows").appendChild(r);
  $("color-" + k).oninput = (e) => setColor(k, e.target.value);
  $("hex-" + k).onchange = (e) => {
    if (/^#[0-9a-f]{6}$/i.test(e.target.value)) setColor(k, e.target.value);
    else e.target.value = colors[k];
  };
}
function reset() {
  Object.assign(colors, { frame: "#FFFFFF", logo: "#000000" });
  for (let k of Object.keys(uiLabels)) {
    $("hex-" + k).value = colors[k];
    $("color-" + k).value = colors[k];
  }
  changed = {};
  render();
}
const inspirations = {
  solid: [
    { name: t("雾蓝"), group: "莫兰迪", frame: "#8592A2", logo: "#F2EEED" },
    { name: t("鼠尾草"), group: "莫兰迪", frame: "#AAB8AB", logo: "#3B4338" },
    { name: t("灰玫瑰"), group: "莫兰迪", frame: "#C09D9B", logo: "#53565C" },
    { name: t("燕麦"), group: "莫兰迪", frame: "#D4C3AA", logo: "#674D41" },
    { name: t("岩灰"), group: "莫兰迪", frame: "#ADAAA5", logo: "#F8F8F8" },
    { name: t("海盐"), group: "低饱和", frame: "#BECBD3", logo: "#53565C" },
    { name: t("奶油"), group: "低饱和", frame: "#EDDFC4", logo: "#60656C" },
    { name: t("烟紫"), group: "低饱和", frame: "#A392A2", logo: "#F2EEED" },
    { name: t("薄荷灰"), group: "低饱和", frame: "#A1B0AD", logo: "#1F2C1C" },
    { name: t("陶土"), group: "低饱和", frame: "#A1706B", logo: "#F4EBE4" },
    { name: t("松林"), group: "近似色", frame: "#4E6E62", logo: "#CCD2CC" },
    { name: t("暮蓝"), group: "近似色", frame: "#586D80", logo: "#B3CAD8" },
    { name: t("暖砂"), group: "近似色", frame: "#B09279", logo: "#F8E8D1" },
    { name: t("梅雾"), group: "近似色", frame: "#72626C", logo: "#EBD8E1" },
    { name: t("橄榄"), group: "近似色", frame: "#737C75", logo: "#D9DFC5" },
    { name: t("蓝铜"), group: "对比色", frame: "#586D80", logo: "#E1AA8D" },
    { name: t("苔粉"), group: "对比色", frame: "#728A7A", logo: "#EED1CC" },
    { name: t("紫麦"), group: "对比色", frame: "#75809C", logo: "#F1D09D" },
    { name: t("砖青"), group: "对比色", frame: "#956757", logo: "#C9D3D5" },
    { name: t("墨杏"), group: "对比色", frame: "#2A483A", logo: "#F4C7B0" },
  ],
  gradient: [
    {
      name: t("雾海"),
      group: "莫兰迪",
      frame: "#60656C",
      front: "#BECBD3",
      logo: "#F8F8F8",
    },
    {
      name: t("山岚"),
      group: "莫兰迪",
      frame: "#737C75",
      front: "#C1CCC7",
      logo: "#FFFFFF",
    },
    {
      name: t("玫瑰石"),
      group: "莫兰迪",
      frame: "#8C736F",
      front: "#D4B8B4",
      logo: "#F8F8F8",
    },
    {
      name: t("暖岩"),
      group: "莫兰迪",
      frame: "#877865",
      front: "#D4C3AA",
      logo: "#FFFFFF",
    },
    {
      name: t("紫烟"),
      group: "莫兰迪",
      frame: "#72626C",
      front: "#BFC2CB",
      logo: "#FFFFFF",
    },
    {
      name: t("盐白"),
      group: "低饱和",
      frame: "#8592A2",
      front: "#E3E7EA",
      logo: "#30343A",
    },
    {
      name: t("苔霜"),
      group: "低饱和",
      frame: "#95A098",
      front: "#D6E1D7",
      logo: "#354239",
    },
    {
      name: t("柔杏"),
      group: "低饱和",
      frame: "#A98978",
      front: "#F0DED4",
      logo: "#40362F",
    },
    {
      name: t("雾樱"),
      group: "低饱和",
      frame: "#A08887",
      front: "#E8D8D7",
      logo: "#403538",
    },
    {
      name: t("海石"),
      group: "低饱和",
      frame: "#627676",
      front: "#C9D3D5",
      logo: "#273B3C",
    },
    {
      name: t("森林"),
      group: "近似色",
      frame: "#2A483A",
      front: "#A9B7AA",
      logo: "#FFFFFF",
    },
    {
      name: t("海岸"),
      group: "近似色",
      frame: "#2A4C65",
      front: "#B3CAD8",
      logo: "#FFFFFF",
    },
    {
      name: t("暮紫"),
      group: "近似色",
      frame: "#65546E",
      front: "#B1ACB3",
      logo: "#FFFFFF",
    },
    {
      name: t("沙丘"),
      group: "近似色",
      frame: "#8E6E57",
      front: "#E7D4B5",
      logo: "#FFFFFF",
    },
    {
      name: t("雪松"),
      group: "近似色",
      frame: "#4C5445",
      front: "#B2B2A8",
      logo: "#FFFFFF",
    },
    {
      name: t("蓝与陶"),
      group: "对比色",
      frame: "#586D80",
      front: "#D09075",
      logo: "#FFFFFF",
    },
    {
      name: t("苔与玫"),
      group: "对比色",
      frame: "#4E6E62",
      front: "#C09D9B",
      logo: "#FFFFFF",
    },
    {
      name: t("紫与麦"),
      group: "对比色",
      frame: "#75809C",
      front: "#E6C786",
      logo: "#292C36",
    },
    {
      name: t("砖与青"),
      group: "对比色",
      frame: "#976666",
      front: "#82ABA3",
      logo: "#FFFFFF",
    },
    {
      name: t("墨与杏"),
      group: "对比色",
      frame: "#2A483A",
      front: "#F4C7B0",
      logo: "#283F34",
    },
  ],
};
inspirations.solid.push(
  { name: t("松针"), group: t("山系"), frame: "#405D4A", logo: "#E2D6BC" },
  { name: t("荒野沙"), group: t("山系"), frame: "#B5A183", logo: "#344A3B" },
  { name: t("岩层"), group: t("山系"), frame: "#666E6B", logo: "#E7E2D7" },
  { name: t("赤土"), group: t("山系"), frame: "#A35F45", logo: "#E8D8B8" },
  { name: t("冰川"), group: t("山系"), frame: "#87A6B2", logo: "#F3F1E9" },
);
inspirations.gradient.push(
  {
    name: t("森林晨雾"),
    group: t("山系"),
    frame: "#30493D",
    front: "#A4B7A5",
    logo: "#F3EADB",
  },
  {
    name: t("山脊沙丘"),
    group: t("山系"),
    frame: "#655E4F",
    front: "#D0BD96",
    logo: "#FFFFFF",
  },
  {
    name: t("苔岩"),
    group: t("山系"),
    frame: "#4D5B52",
    front: "#A8AB95",
    logo: "#F1EBDD",
  },
  {
    name: t("日落赤岭"),
    group: t("山系"),
    frame: "#6A4D45",
    front: "#CE9974",
    logo: "#FFF1DB",
  },
  {
    name: t("雪线"),
    group: t("山系"),
    frame: "#496572",
    front: "#D8E1DC",
    logo: "#FFFFFF",
  },
);
for (const mode of ["solid", "gradient"]) {
  inspirations[mode] = inspirations[mode]
    .filter((scheme) => scheme.group !== "对比色")
    .map((scheme) => ({
      ...scheme,
      group: ["莫兰迪", "低饱和", "近似色"].includes(scheme.group)
        ? t("莫兰迪配色")
        : scheme.group,
    }));
}
inspirations.solid.push(
  ...[
    {
      name: t("银白"),
      group: t("品牌灵感"),
      brand: "Specialized",
      model: "S-Works Tarmac SL8",
      official: "Gloss Metallic White Silver",
      frame: "#ECEDE9",
      logo: "#ADB3B8",
      url: "https://www.specialized.com/gb/en/s-works-tarmac-sl8-shimano-dura-ace-di2/p/4221553",
    },
    {
      name: t("峡湾绿"),
      group: t("品牌灵感"),
      brand: "Specialized",
      model: "S-Works Tarmac SL8",
      official: "Gloss Premium Fjord Metallic",
      frame: "#526D60",
      logo: "#ECEDE9",
      url: "https://www.specialized.com/ua/en/s-works-tarmac-sl8-sram-red-axs/p/4221554",
    },
    {
      name: t("水晶白"),
      group: t("品牌灵感"),
      brand: "Canyon",
      model: "Aeroad CF SLX",
      official: "Crystal White",
      frame: "#F1F0EB",
      logo: "#16191E",
      url: "https://www.canyon.com/en-us/road-bikes/aero-bikes/aeroad/",
    },
    {
      name: t("酸绿"),
      group: t("品牌灵感"),
      brand: "Canyon",
      model: "Aeroad CF SLX",
      official: "Metallic Acid",
      frame: "#CBD63B",
      logo: "#171C1F",
      url: "https://www.canyon.com/en-us/road-bikes/aero-bikes/aeroad/",
    },
    {
      name: t("极光白"),
      group: t("品牌灵感"),
      brand: "Giant",
      model: "Propel Advanced SL 0",
      official: "Arctic Light / Chrome",
      frame: "#DCE5E3",
      logo: "#8C979F",
      url: "https://www.giant-bicycles.com/gb/bikes-propel-advanced-sl",
    },
    {
      name: t("烈焰红"),
      group: t("品牌灵感"),
      brand: "Trek",
      model: "Madone SL 7 Gen 8",
      official: "Gloss Fury Red / Matte Deep Smoke",
      frame: "#D52B32",
      logo: "#E6E7E6",
      url: "https://www.trekbikes.com/gb/en_GB/bikes/road-bikes/performance-road-bikes/madone/madone-sl/f/F213-2/madone-sl-7-gen-8/57664/5338021/",
    },
    {
      name: t("曜石绿"),
      group: t("品牌灵感"),
      brand: "Pinarello",
      model: "DOGMA F",
      official: "Obsidian Emerald",
      frame: "#234F46",
      logo: "#DADDD9",
      url: "https://pinarello.com/global/en/bikes/road/competition/new-dogma-f/new-dogma-f-sram-red-etap-axs",
    },
    {
      name: t("琥珀金"),
      group: t("品牌灵感"),
      brand: "Pinarello",
      model: "DOGMA F MY26",
      official: "Luxter Amber",
      frame: "#A67A34",
      logo: "#252727",
      url: "https://pinarello.com/global/en/bikes/road/competition/new-dogma-f/new-dogma-f-sram-red-etap-axs",
    },
    {
      name: t("天空青"),
      group: t("品牌灵感"),
      brand: "Bianchi",
      model: "Oltre Comp",
      official: "Metallic Celeste / CK16",
      frame: "#64BAB3",
      logo: "#B3E2CC",
      url: "https://bianchi.co.uk/bianchi-oltre/",
    },
    {
      name: t("午夜蓝"),
      group: t("品牌灵感"),
      brand: "Bianchi",
      model: "Oltre Comp",
      official: "Night Blue / Acid",
      frame: "#1D2E47",
      logo: "#D3DD42",
      url: "https://bianchi.co.uk/bianchi-oltre/",
    },
    {
      name: t("礁湖蓝"),
      group: t("品牌灵感"),
      brand: "Cervélo",
      model: "S5 Frameset",
      official: "Reef Blue",
      frame: "#267DA7",
      logo: "#F1F1ED",
      url: "https://www.cog.inc/cervelo/product/s5-frameset",
    },
    {
      name: t("红玉髓"),
      group: t("品牌灵感"),
      brand: "Cervélo",
      model: "S5 Frameset",
      official: "Carnelian",
      frame: "#9C332E",
      logo: "#E9E3DB",
      url: "https://www.cog.inc/cervelo/product/s5-frameset",
    },
  ],
);
inspirations.gradient.push(
  ...[
    {
      name: t("深海湛蓝"),
      group: t("品牌灵感"),
      brand: "Giant",
      model: "Propel Advanced SL 1",
      official: "Ultra Navy / Azure / Chrome",
      frame: "#182C46",
      logo: "#C7CDD2",
      url: "https://www.giant-bicycles.com/gb/bikes-propel-advanced-sl",
      front: "#2686B3",
    },
    {
      name: t("烟黑焰红"),
      group: t("品牌灵感"),
      brand: "Trek",
      model: "Madone SL 7 Gen 8",
      official: "Gloss Fury Red / Matte Deep Smoke",
      frame: "#25282D",
      logo: "#F4F4F1",
      url: "https://www.trekbikes.com/gb/en_GB/bikes/road-bikes/performance-road-bikes/madone/madone-sl/f/F213-2/madone-sl-7-gen-8/57664/5338021/",
      front: "#D52B32",
    },
    {
      name: t("钴蓝珊瑚"),
      group: t("品牌灵感"),
      brand: "Trek",
      model: "Madone SL 7 Gen 8",
      official: "Matte Cobalt Blue / Trek Black / Living Coral",
      frame: "#20242B",
      logo: "#F2756C",
      url: "https://www.trekbikes.com/gb/en_GB/bikes/road-bikes/performance-road-bikes/madone/madone-sl/f/F213-2/madone-sl-7-gen-8/57664/5338021/",
      front: "#3159A5",
    },
    {
      name: t("曜石翡翠"),
      group: t("品牌灵感"),
      brand: "Pinarello",
      model: "DOGMA F",
      official: "Obsidian Emerald",
      frame: "#1B2424",
      logo: "#E6E7DE",
      url: "https://pinarello.com/global/en/bikes/road/competition/new-dogma-f/new-dogma-f-sram-red-etap-axs",
      front: "#38735F",
    },
    {
      name: t("熔沙"),
      group: t("品牌灵感"),
      brand: "Pinarello",
      model: "DOGMA F",
      official: "Molten Sand",
      frame: "#5F5545",
      logo: "#252727",
      url: "https://pinarello.com/global/en/bikes/road/competition/new-dogma-f/new-dogma-f-sram-red-etap-axs",
      front: "#CBB483",
    },
    {
      name: t("红金流光"),
      group: t("品牌灵感"),
      brand: "Pinarello",
      model: "DOGMA F",
      official: "Luxter Red Gold",
      frame: "#9B293C",
      logo: "#EEE7D7",
      url: "https://pinarello.com/global/en/bikes/road/competition/new-dogma-f/new-dogma-f-sram-red-etap-axs",
      front: "#BE944C",
    },
    {
      name: t("夜蓝酸绿"),
      group: t("品牌灵感"),
      brand: "Bianchi",
      model: "Oltre Comp",
      official: "Night Blue / Acid",
      frame: "#1D2E47",
      logo: "#F1F1E9",
      url: "https://bianchi.co.uk/bianchi-oltre/",
      front: "#D3DD42",
    },
    {
      name: t("峡湾银绿"),
      group: t("品牌灵感"),
      brand: "Specialized",
      model: "S-Works Tarmac SL8",
      official: "Gloss Premium Fjord Metallic",
      frame: "#526D60",
      logo: "#F3F3EC",
      url: "https://www.specialized.com/ua/en/s-works-tarmac-sl8-sram-red-axs/p/4221554",
      front: "#D7DDCF",
    },
  ],
);
let inspirationsExpanded = false;
function inspirationGrid(schemes) {
  const grid = document.createElement("div");
  grid.className = "inspirationGrid";
  for (const scheme of schemes) {
    const button = document.createElement("button");
    button.className = "inspiration";
    button.type = "button";
    button.title =
      (scheme.brand
        ? scheme.brand + " · " + scheme.model + " · " + scheme.official + "\n"
        : "") +
      scheme.name +
      " · " +
      [scheme.frame, scheme.front, scheme.logo].filter(Boolean).join(" / ");
    button.setAttribute(
      "aria-label",
      (language === "en" ? "Apply " : "应用") +
        (paintMode === "gradient" ? t("渐变") : t("纯色")) +
        t("方案：") +
        scheme.name,
    );
    const swatch = document.createElement("span");
    swatch.className = "inspirationSwatch";
    if (paintMode === "gradient") {
      swatch.classList.add("gradientSwatch");
      const preview = document.createElement("canvas");
      preview.width = 240;
      preview.height = 96;
      preview.setAttribute("aria-hidden", "true");
      const paint = preview.getContext("2d"),
        gradient = paint.createLinearGradient(0, 0, 240, 0);
      gradient.addColorStop(0, scheme.frame);
      gradient.addColorStop(1, scheme.front);
      paint.fillStyle = gradient;
      paint.fillRect(0, 0, 240, 96);
      swatch.appendChild(preview);
    } else {
      swatch.style.background = scheme.frame;
      const dot = document.createElement("i");
      dot.style.background = scheme.logo;
      swatch.appendChild(dot);
    }
    const name = document.createElement("span");
    name.textContent = scheme.name;
    button.appendChild(swatch);
    button.appendChild(name);
    if (scheme.brand) {
      const brand = document.createElement("small");
      brand.className = "brandName";
      brand.textContent = scheme.brand;
      button.appendChild(brand);
    }
    button.onclick = () =>
      applyInspiration(paintMode, inspirations[paintMode].indexOf(scheme));
    grid.appendChild(button);
  }
  return grid;
}
function drawInspirations() {
  const box = $("inspirationList");
  box.innerHTML = "";
  const groups = [t("品牌灵感"), t("莫兰迪配色"), t("山系")];
  if (!inspirationsExpanded) {
    const ordered = groups.flatMap((group) =>
      inspirations[paintMode].filter((p) => p.group === group),
    );
    box.appendChild(inspirationGrid(ordered.slice(0, 10)));
  } else {
    for (const group of groups) {
      const section = document.createElement("div");
      section.className = "inspirationGroup";
      const heading = document.createElement("div");
      heading.className = "inspirationGroupTitle";
      heading.textContent = group;
      section.appendChild(heading);
      if (group === t("品牌灵感")) {
        const note = document.createElement("div");
        note.className = "brandNote";
        note.textContent = t("官网配色近似 · 渐变为色系演绎");
        section.appendChild(note);
      }
      section.appendChild(
        inspirationGrid(
          inspirations[paintMode].filter((p) => p.group === group),
        ),
      );
      box.appendChild(section);
    }
  }
  $("inspirationCount").textContent =
    (paintMode === "gradient" ? t("渐变") : t("纯色")) +
    " · " +
    inspirations[paintMode].length;
  const toggle = $("inspirationToggle");
  toggle.textContent = inspirationsExpanded ? t("收起 ↑") : t("展开全部 ↓");
  toggle.setAttribute("aria-expanded", String(inspirationsExpanded));
}
$("inspirationToggle").onclick = () => {
  inspirationsExpanded = !inspirationsExpanded;
  drawInspirations();
};
function applyInspiration(mode, index) {
  const scheme = inspirations[mode]?.[index];
  if (!scheme) return;
  setPaintMode(mode);
  setColor("frame", scheme.frame);
  if (mode === "gradient") setColor("front", scheme.front);
  setColor("logo", scheme.logo);
  select("frame");
  $("status").textContent = t("已应用：") + scheme.name + " · " + scheme.group;
  const source = $("brandSource");
  source.style.display = scheme.url ? "block" : "none";
  if (scheme.url) {
    source.textContent =
      scheme.brand + " · " + scheme.model + " · " + scheme.official + " ↗";
    source.href = scheme.url;
  }
  toast(
    language === "en"
      ? "Applied: " + scheme.name
      : "已应用「" + scheme.name + "」",
  );
}
function setPaintMode(mode) {
  const next = mode === "gradient" ? "gradient" : "solid";
  if (next === paintMode) return;
  if (next === "gradient") {
    solidColor = colors.frame;
    solidLogo = colors.logo;
    paintMode = next;
    setColor("front", solidColor);
    setColor("frame", "#000000");
    setColor("logo", "#FFFFFF");
  } else {
    paintMode = next;
    setColor("frame", solidColor);
    setColor("logo", solidLogo);
  }
  const gradient = paintMode === "gradient";
  uiLabels.frame = gradient ? t("后部颜色") : t("车架与前叉");
  document.querySelector('.row[data-part="frame"] span').textContent =
    uiLabels.frame;
  document.querySelector('.row[data-part="front"]').hidden = !gradient;
  for (const m of ["solid", "gradient"]) {
    $("mode-" + m).classList.toggle("active", paintMode === m);
    $("mode-" + m).setAttribute("aria-pressed", String(paintMode === m));
  }
  if (!gradient && selected === "front") selected = "frame";
  select(selected);
  drawInspirations();
  render();
}
$("mode-solid").onclick = () => setPaintMode("solid");
$("mode-gradient").onclick = () => setPaintMode("gradient");
document.querySelector('.row[data-part="front"]').hidden = true;
drawInspirations();
canvas.onclick = (e) => {
  if (!ready) return;
  let r = canvas.getBoundingClientRect(),
    x = Math.floor(((e.clientX - r.left) / r.width) * CROP.w + CROP.x),
    y = Math.floor(((e.clientY - r.top) / r.height) * CROP.h + CROP.y),
    i =
      (Math.max(
        0,
        Math.min(H - 1, Math.floor((y - bikeLayout.dy) / bikeLayout.scale)),
      ) *
        W +
        Math.max(
          0,
          Math.min(W - 1, Math.floor((x - bikeLayout.dx) / bikeLayout.scale)),
        )) *
        4 +
      3;
  for (let k of ["logo", "frame"]) {
    if (masks[k][i] > 80) {
      select(
        k === "frame" &&
          paintMode === "gradient" &&
          (x - bikeLayout.dx) / bikeLayout.scale > 840
          ? "front"
          : k,
      );
      toast(t("已选择") + uiLabels[selected]);
      return;
    }
  }
};
async function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    toast(t("请添加 PNG、JPEG、WebP 等图片"));
    return;
  }
  let url = URL.createObjectURL(file),
    im = new Image();
  im.onload = () => {
    let c = $("ref"),
      scale = Math.min(1, 1600 / Math.max(im.width, im.height));
    c.width = Math.max(1, Math.round(im.width * scale));
    c.height = Math.max(1, Math.round(im.height * scale));
    c.getContext("2d", { willReadFrequently: true }).drawImage(
      im,
      0,
      0,
      c.width,
      c.height,
    );
    $("refWrap").style.display = "flex";
    $("drop").classList.add("has-image");
    $("upload").textContent = t("更换图片");
    $("expandReference").hidden = false;
    $("refHint").textContent = t("点击图片吸色，也可拖入或粘贴替换");
    $("status").textContent =
      t("图片已载入，点击图片为") + uiLabels[selected] + t("吸色");
    URL.revokeObjectURL(url);
  };
  im.onerror = () => {
    URL.revokeObjectURL(url);
    toast(t("此图片无法读取，请换成 PNG 或 JPEG"));
  };
  im.src = url;
}
const referenceDialog = $("referenceDialog");
$("expandReference").onclick = () => {
  if (!$("ref").width) return;
  hideLoupe();
  $("referenceDialogImage").appendChild($("refWrap"));
  referenceDialog.appendChild($("loupe"));
  referenceDialog.showModal();
};
$("closeReference").onclick = () => referenceDialog.close();
referenceDialog.addEventListener("close", () => {
  hideLoupe();
  $("drop").appendChild($("refWrap"));
  document.body.appendChild($("loupe"));
  $("expandReference").focus();
});
$("upload").onclick = () => $("file").click();
$("file").onchange = (e) => {
  loadImage(e.target.files[0]);
  e.target.value = "";
};
const drop = $("drop");
drop.ondragover = (e) => {
  e.preventDefault();
  drop.classList.add("drag");
};
drop.ondragleave = () => drop.classList.remove("drag");
drop.ondrop = (e) => {
  e.preventDefault();
  drop.classList.remove("drag");
  loadImage(e.dataTransfer.files[0]);
};
document.addEventListener("paste", (e) => {
  const item = [...e.clipboardData.items].find((i) =>
    i.type.startsWith("image/"),
  );
  if (item) {
    e.preventDefault();
    loadImage(item.getAsFile());
  }
});
function referencePoint(e) {
  const c = $("ref"),
    r = c.getBoundingClientRect();
  return {
    x: Math.min(
      c.width - 1,
      Math.max(0, Math.floor(((e.clientX - r.left) * c.width) / r.width)),
    ),
    y: Math.min(
      c.height - 1,
      Math.max(0, Math.floor(((e.clientY - r.top) * c.height) / r.height)),
    ),
  };
}
function hideLoupe() {
  $("loupe").style.display = "none";
}
$("ref").onpointermove = (e) => {
  if (e.pointerType === "touch") return;
  const c = $("ref"),
    { x, y } = referencePoint(e),
    view = $("loupeCanvas"),
    lc = view.getContext("2d");
  lc.imageSmoothingEnabled = false;
  lc.fillStyle = "#eee";
  lc.fillRect(0, 0, 132, 132);
  const cells = 11,
    zoom = 12,
    startX = x - 5,
    startY = y - 5,
    sx = Math.max(0, startX),
    sy = Math.max(0, startY),
    sw = Math.min(c.width, x + 6) - sx,
    sh = Math.min(c.height, y + 6) - sy;
  lc.drawImage(
    c,
    sx,
    sy,
    sw,
    sh,
    (sx - startX) * zoom,
    (sy - startY) * zoom,
    sw * zoom,
    sh * zoom,
  );
  lc.strokeStyle = "#ffffff";
  lc.lineWidth = 3;
  lc.strokeRect(60, 60, 12, 12);
  lc.strokeStyle = "#111";
  lc.lineWidth = 1;
  lc.strokeRect(60, 60, 12, 12);
  lc.beginPath();
  for (const [a, b, d, f] of [
    [66, 48, 66, 59],
    [66, 73, 66, 84],
    [48, 66, 59, 66],
    [73, 66, 84, 66],
  ]) {
    lc.moveTo(a, b);
    lc.lineTo(d, f);
  }
  lc.stroke();
  const p = c.getContext("2d").getImageData(x, y, 1, 1).data;
  $("loupeHex").textContent = p[3]
    ? "#" +
      [...p.slice(0, 3)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()
    : t("透明");
  const box = $("loupe");
  box.style.display = "block";
  const bw = 140,
    bh = 163;
  let left = e.clientX + 18,
    top = e.clientY - 80;
  if (left + bw > window.innerWidth - 8) left = e.clientX - bw - 18;
  box.style.left =
    Math.max(8, Math.min(left, window.innerWidth - bw - 8)) + "px";
  box.style.top =
    Math.max(8, Math.min(top, window.innerHeight - bh - 8)) + "px";
};
$("ref").onpointerleave = hideLoupe;
$("ref").onpointercancel = hideLoupe;
window.addEventListener("blur", hideLoupe);
window.addEventListener("scroll", hideLoupe, true);
$("ref").onclick = (e) => {
  let c = $("ref"),
    { x, y } = referencePoint(e),
    pixel = c.getContext("2d").getImageData(x, y, 1, 1).data;
  if (pixel[3] === 0) {
    toast(t("这里是透明区域，请选择图片中的颜色"));
    return;
  }
  sampled =
    "#" +
    [...pixel.slice(0, 3)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  $("sample").style.display = "flex";
  $("chip").style.background = sampled;
  $("sampleHex").textContent = sampled;
  setColor(selected, sampled);
  $("status").textContent =
    t("已吸取 ") + sampled + t("，应用至") + uiLabels[selected];
};
$("apply").onclick = () => {
  if (sampled) {
    setColor(selected, sampled);
    $("status").textContent =
      t("已将 ") + sampled + t(" 应用至") + uiLabels[selected];
  }
};
function toast(s) {
  $("toast").textContent = s;
  $("toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").style.display = "none"), 2300);
}
function download(url, name) {
  let a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function colorName(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min,
    l = (max + min) / 2,
    s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (max < 0.15) return t("黑色");
  if (min > 0.92) return t("白色");
  if (s < 0.12)
    return l > 0.72 ? t("浅灰色") : l < 0.3 ? t("深灰色") : t("灰色");
  let h =
    d === 0
      ? 0
      : max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (l > 0.82 && s < 0.5) return h < 70 || h > 330 ? t("米白色") : t("浅灰色");
  if (h < 15 || h >= 345)
    return l > 0.7 ? t("粉色") : l < 0.28 ? t("酒红色") : t("红色");
  if (h < 45) return l < 0.42 ? t("棕色") : l > 0.75 ? t("杏色") : t("橙色");
  if (h < 68) return l < 0.38 ? t("橄榄色") : t("黄色");
  if (h < 165)
    return l < 0.28 ? t("墨绿色") : l > 0.72 ? t("浅绿色") : t("绿色");
  if (h < 195) return t("青色");
  if (h < 255)
    return l < 0.27 ? t("藏蓝色") : l > 0.72 ? t("浅蓝色") : t("蓝色");
  if (h < 290) return t("紫色");
  return l > 0.68 ? t("粉色") : t("玫红色");
}
function designFilename(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0"),
    date = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
  const paint =
    paintMode === "gradient"
      ? t("渐变-") + colorName(colors.frame) + t("至") + colorName(colors.front)
      : t("纯色-") + colorName(colors.frame);
  return t("VOOK配色设计-") + paint + "-" + date + ".png";
}
function isPhoneDevice() {
  const nav = typeof navigator === "undefined" ? {} : navigator;
  const ua = nav.userAgent || "";
  const mobileAgent =
    nav.userAgentData?.mobile === true ||
    /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua);
  const scr = typeof screen === "undefined" ? null : screen;
  const touchPhone =
    window.matchMedia?.("(pointer: coarse)").matches &&
    scr &&
    Math.min(scr.width, scr.height) < 700;
  return Boolean(mobileAgent || touchPhone);
}
function syncDeviceLayout() {
  const phone = isPhoneDevice();
  document.documentElement?.classList.toggle("phone-layout", phone);
  const hint = $("exportHint");
  if (hint)
    hint.textContent = phone
      ? t("导出适合手机查看的竖版海报，包含所选颜色及色号。")
      : t("将当前车型与配色导出为横版海报，包含所选颜色及色号。");
}
window.addEventListener("resize", syncDeviceLayout);
syncDeviceLayout();
function exportPhonePoster() {
  const poster = document.createElement("canvas");
  poster.width = 1080;
  poster.height = 1920;
  const pc = poster.getContext("2d"),
    pw = 1080,
    ph = 1920;
  const bg = pc.createLinearGradient(0, 0, 0, ph);
  bg.addColorStop(0, "#f2f2f2");
  bg.addColorStop(0.45, "#ffffff");
  bg.addColorStop(1, "#f3f3f3");
  pc.fillStyle = bg;
  pc.fillRect(0, 0, pw, ph);
  pc.fillStyle = "#35383d";
  pc.font = "italic 800 49px Arial, sans-serif";
  pc.fillText("VOOK", 70, 106);
  pc.fillStyle = "#8b8e93";
  pc.font = "400 17px Arial, sans-serif";
  pc.textAlign = "right";
  pc.fillText("PAINT ATELIER", pw - 70, 101);
  pc.textAlign = "left";
  pc.font = "400 21px Arial, sans-serif";
  pc.fillText(modelInfo[model].caption, 70, 178);
  pc.save();
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  pc.font = "italic 800 270px Arial, sans-serif";
  pc.lineWidth = 1.2;
  pc.strokeStyle = "rgba(75,78,86,.17)";
  pc.strokeText("VOOK", pw / 2, 590, 1000);
  pc.restore();
  const source = { x: 0, y: 70, w: 1536, h: 925 },
    dw = 1040,
    scale = dw / source.w,
    dx = (pw - dw) / 2,
    dy = 540;
  function shadow(x, y, rx, ry, opacity) {
    pc.save();
    pc.translate(x, y);
    pc.scale(rx, ry);
    const g = pc.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(25,25,28," + opacity + ")");
    g.addColorStop(0.45, "rgba(25,25,28," + opacity * 0.4 + ")");
    g.addColorStop(1, "rgba(25,25,28,0)");
    pc.fillStyle = g;
    pc.fillRect(-1, -1, 2, 2);
    pc.restore();
  }
  for (const [x, y] of groundPoints()) {
    shadow(
      dx + x * scale,
      dy + (y - source.y) * scale + 3,
      160 * scale,
      14 * scale,
      0.15,
    );
  }
  pc.drawImage(
    displayBike,
    source.x,
    source.y,
    source.w,
    source.h,
    dx,
    dy,
    dw,
    source.h * scale,
  );
  pc.strokeStyle = "#d6d8dc";
  pc.lineWidth = 1;
  pc.beginPath();
  pc.moveTo(70, 1310);
  pc.lineTo(pw - 70, 1310);
  pc.stroke();
  pc.fillStyle = "#8b8e93";
  pc.font = "400 18px Arial, sans-serif";
  pc.fillText(
    paintMode === "gradient" ? "GRADIENT FINISH" : "SOLID FINISH",
    70,
    1360,
  );
  const entries =
    paintMode === "gradient"
      ? [
          ["REAR", colors.frame],
          ["FRONT", colors.front],
          ["LOGO", colors.logo],
        ]
      : [
          ["FRAME & FORK", colors.frame],
          ["LOGO", colors.logo],
        ];
  entries.forEach(([label, hex], n) => {
    const y = 1430 + n * 104;
    pc.fillStyle = hex;
    pc.fillRect(70, y, 46, 46);
    pc.strokeStyle = "#00000020";
    pc.strokeRect(70, y, 46, 46);
    pc.fillStyle = "#8b8e93";
    pc.font = "400 17px Arial, sans-serif";
    pc.textAlign = "left";
    pc.fillText(label, 138, y + 28);
    pc.textAlign = "right";
    pc.fillStyle = "#34373b";
    pc.font = "500 26px monospace";
    pc.fillText(hex.toUpperCase(), pw - 70, y + 30);
  });
  pc.textAlign = "left";
  pc.fillStyle = "#96999d";
  pc.font = "400 17px Arial, sans-serif";
  pc.fillText("VOOK / COLOR STUDY", 70, 1832);
  pc.textAlign = "right";
  pc.fillText("01", pw - 70, 1832);
  download(poster.toDataURL("image/png"), designFilename());
  toast(t("竖版设计海报已导出"));
}
function exportPoster() {
  if (!ready) return;
  if (isPhoneDevice()) return exportPhonePoster();
  const poster = document.createElement("canvas");
  poster.width = 2400;
  poster.height = 1600;
  const pc = poster.getContext("2d"),
    pw = 2400,
    ph = 1600;
  const bg = pc.createLinearGradient(0, 0, 0, ph);
  bg.addColorStop(0, "#f2f2f2");
  bg.addColorStop(0.48, "#ffffff");
  bg.addColorStop(1, "#f3f3f3");
  pc.fillStyle = bg;
  pc.fillRect(0, 0, pw, ph);
  pc.save();
  pc.font =
    "italic 800 510px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  pc.lineWidth = 1.5;
  pc.strokeStyle = "rgba(75,78,86,.19)";
  pc.strokeText("VOOK", pw / 2, 490, 2170);
  pc.restore();
  pc.fillStyle = "#85878b";
  pc.font = "500 23px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  pc.textAlign = "left";
  pc.fillText("VOOK  /  PAINT ATELIER", 110, 102);
  pc.textAlign = "right";
  pc.font = "400 20px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  pc.fillText(modelInfo[model].caption, pw - 110, 102);
  // Render the current paint buffer at a deliberate product-photography scale.
  function floorShadow(x, y, rx, ry, opacity) {
    pc.save();
    pc.translate(x, y);
    pc.scale(rx, ry);
    const g = pc.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(25,25,28," + opacity + ")");
    g.addColorStop(0.45, "rgba(25,25,28," + opacity * 0.4 + ")");
    g.addColorStop(1, "rgba(25,25,28,0)");
    pc.fillStyle = g;
    pc.fillRect(-1, -1, 2, 2);
    pc.restore();
  }
  const sourceBox = { x: 0, y: 70, w: 1536, h: 925 },
    displayW = 1900,
    displayH = (displayW * sourceBox.h) / sourceBox.w,
    displayY = 180,
    scale = displayW / sourceBox.w,
    bikeX = (pw - displayW) / 2;
  for (const [x, y] of groundPoints()) {
    const groundY = displayY + (y - sourceBox.y) * scale;
    floorShadow(bikeX + x * scale, groundY + 4, 230 * scale, 20 * scale, 0.11);
    floorShadow(bikeX + x * scale, groundY, 100 * scale, 5 * scale, 0.24);
  }
  pc.drawImage(
    displayBike,
    sourceBox.x,
    sourceBox.y,
    sourceBox.w,
    sourceBox.h,
    (pw - displayW) / 2,
    displayY,
    displayW,
    displayH,
  );
  pc.strokeStyle = "#d8dade";
  pc.lineWidth = 1;
  pc.beginPath();
  pc.moveTo(110, 1420);
  pc.lineTo(pw - 110, 1420);
  pc.stroke();
  const entries =
    paintMode === "gradient"
      ? [
          ["REAR", colors.frame],
          ["FRONT", colors.front],
          ["LOGO", colors.logo],
        ]
      : [
          ["FRAME & FORK", colors.frame],
          ["LOGO", colors.logo],
        ];
  let px = 110;
  for (const [label, hex] of entries) {
    pc.fillStyle = hex;
    pc.fillRect(px, 1460, 34, 34);
    pc.strokeStyle = "rgba(0,0,0,.12)";
    pc.strokeRect(px, 1460, 34, 34);
    pc.textAlign = "left";
    pc.fillStyle = "#7a7d82";
    pc.font = "400 15px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    pc.fillText(label, px + 54, 1470);
    pc.fillStyle = "#282b30";
    pc.font = "500 22px monospace";
    pc.fillText(hex.toUpperCase(), px + 54, 1503);
    px += 390;
  }
  pc.textAlign = "right";
  pc.fillStyle = "#8c8f94";
  pc.font = "400 18px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  pc.fillText(
    paintMode === "gradient" ? "GRADIENT FINISH" : "SOLID FINISH",
    pw - 110,
    1480,
  );
  pc.font = "italic 800 33px Arial, sans-serif";
  pc.fillStyle = "#303238";
  pc.fillText("VOOK", pw - 110, 1530);
  download(poster.toDataURL("image/png"), designFilename());
  toast(t("设计海报已导出"));
}
$("export").onclick = exportPoster;

const surfacePhoto = new Image(),
  maskPhoto = new Image();
let modelLoad = 0;
// Small V9 marks are clean vector decals, independent from photographic lettering.
function rebuildV9SmallLogos() {
  const d = originalData.data,
    source = new Uint8ClampedArray(d),
    lighting = new Uint8ClampedArray(surfaceData),
    oldInk = new Uint8ClampedArray(masks.logo);
  const zones = [
    {
      part: "frame",
      poly: [
        [892, 349],
        [947, 338],
        [952, 363],
        [897, 375],
      ],
      dx: -67,
      dy: 14,
    },
    {
      part: "fork",
      poly: [
        [1125, 659],
        [1147, 653],
        [1173, 740],
        [1149, 747],
      ],
      dx: -28,
      dy: -83,
    },
  ];
  for (const z of zones) {
    for (let y = 200; y < 700; y++)
      for (let x = 900; x < 1260; x++) {
        const ox = (x - 50) / 1.02,
          oy = (y + 110) / 1.02;
        if (!pointPoly(ox, oy, z.poly)) continue;
        const i = (y * W + x) * 4;
        if (source[i + 3] < 230) continue;
        const sx = Math.round(x + z.dx * 1.02),
          sy = Math.round(y + z.dy * 1.02),
          j = (sy * W + sx) * 4;
        if (source[j + 3] < 240) continue;
        for (let k = 0; k < 3; k++) d[i + k] = source[j + k];
        const shadeSamples = [];
        for (let offset = -4; offset <= 4; offset++) {
          const q = j + offset * 4;
          shadeSamples.push(lighting[q]);
        }
        surfaceData[i] =
          shadeSamples.reduce((a, b) => a + b, 0) / shadeSamples.length;
        surfaceData[i + 1] = lighting[j + 1];
        masks.logo[i + 3] = 0;
        masks[z.part][i + 3] = 255;
      }
  }
  // A continuous tube lighting field replaces the photographed lettering's baked-in shadow.
  for (let y = 210; y < 365; y++)
    for (let x = 615; x < 1055; x++) {
      const ox = (x - 50) / 1.02,
        oy = (y + 110) / 1.02,
        n = oy + 0.2 * ox;
      if (n < 520 || n > 566) continue;
      const i = (y * W + x) * 4;
      if (masks.frame[i + 3] < 200) continue;
      const edge = Math.min(
        1,
        Math.max(0, (ox - 555) / 30),
        Math.max(0, (985 - ox) / 28),
      );
      if (!edge) continue;
      const shade =
        (0.77 + 0.22 * Math.exp(-(((n - 539) / 14) ** 2))) * 0.88 * 255;
      surfaceData[i] = surfaceData[i] * (1 - edge) + shade * edge;
      surfaceData[i + 1] *= 1 - edge;
    }
  const decals = off(),
    dc = decals.getContext("2d");
  dc.fillStyle = "#fff";
  dc.textBaseline = "middle";
  dc.font = "italic 900 19px Arial, sans-serif";
  function mark(x, y, angle, width) {
    dc.save();
    dc.translate(50 + x * 1.02, -110 + y * 1.02);
    dc.rotate((angle * Math.PI) / 180);
    dc.scale(width / dc.measureText("VOOK").width, 0.68);
    dc.fillText("VOOK", 0, 0);
    dc.restore();
  }
  mark(899, 357, -11.5, 46);
  mark(1136, 674, 73, 61);
  const ink = dc.getImageData(0, 0, W, H).data;
  for (let i = 3; i < ink.length; i += 4)
    if (ink[i]) masks.logo[i] = Math.max(masks.logo[i], ink[i]);
}
function refineV9PaintEdges() {
  const src = originalData.data,
    oldLogo = new Uint8ClampedArray(masks.logo);
  const patches = [
    [
      [539, 437],
      [568, 428],
      [595, 427],
      [594, 442],
      [566, 448],
      [554, 461],
      [553, 478],
      [559, 501],
      [547, 492],
    ],
    [
      [278, 774],
      [548, 811],
      [547, 819],
      [305, 785],
      [278, 781],
    ],
    [
      [524, 779],
      [568, 783],
      [557, 824],
      [535, 828],
    ],
  ];
  for (let y = 270; y < 745; y++)
    for (let x = 300; x < 1090; x++) {
      const i = (y * W + x) * 4,
        ox = (x - 50) / 1.02,
        oy = (y + 110) / 1.02,
        lo = Math.min(src[i], src[i + 1], src[i + 2]),
        hi = Math.max(src[i], src[i + 1], src[i + 2]);
      if (src[i + 3] < 20) continue;
      if (
        patches.some((p) => pointPoly(ox, oy, p)) &&
        hi - lo < 20 &&
        lo > 138
      ) {
        const coverage = Math.min(1, (lo - 138) / 30) * src[i + 3];
        masks.frame[i + 3] = Math.max(masks.frame[i + 3], coverage);
        surfaceData[i] = Math.max(surfaceData[i], Math.min(223, lo * 0.88));
      }
    }
  // Trace the visible white underside rather than cropping it with a straight exclusion line.
  const lowerStay = [
    [337, 674],
    [358, 678],
    [615, 720],
    [614, 733],
    [350, 686],
    [333, 682],
  ];
  const dropout = [
    [324, 629],
    [341, 633],
    [331, 649],
    [331, 656],
    [343, 663],
    [346, 678],
    [360, 683],
    [352, 689],
    [330, 685],
    [315, 680],
    [308, 669],
    [310, 654],
  ];
  for (let y = 625; y < 740; y++)
    for (let x = 300; x < 620; x++) {
      const i = (y * W + x) * 4,
        lo = Math.min(src[i], src[i + 1], src[i + 2]),
        hi = Math.max(src[i], src[i + 1], src[i + 2]);
      const innerBend = [
        [336, 621],
        [356, 623],
        [347, 637],
        [344, 649],
        [351, 657],
        [374, 661],
        [373, 666],
        [340, 660],
        [334, 649],
      ];
      const farStay = [
        [424, 650],
        [443, 656],
        [576, 675],
        [576, 689],
        [490, 674],
        [448, 662],
      ];
      const inTube =
        pointPoly(x, y, lowerStay) ||
        pointPoly(x, y, dropout) ||
        pointPoly(x, y, innerBend) ||
        pointPoly(x, y, farStay);
      if (!inTube || src[i + 3] < 30 || Math.hypot(x - 325.5, y - 668) < 11.3)
        continue;
      if (lo > 150 && hi - lo < 24) {
        masks.frame[i + 3] = Math.max(
          masks.frame[i + 3],
          src[i + 3] * Math.min(1, (lo - 150) / 28),
        );
        surfaceData[i] = Math.max(
          0.67 * 0.88 * 255,
          Math.min(0.96 * 0.88 * 255, lo * 0.88),
        );
        surfaceData[i + 1] = 0;
      }
    }
  // Complete the painted tube behind the front derailleur while leaving its cage and clamp silver/black.
  const tubeBehindCage = [
    [669, 574],
    [681, 591],
    [694, 629],
    [700, 636],
    [688, 635],
    [677, 606],
  ];
  const clamp = [
    [673, 588],
    [683, 585],
    [687, 595],
    [677, 600],
  ];
  for (let y = 573; y < 638; y++)
    for (let x = 667; x < 703; x++) {
      const i = (y * W + x) * 4;
      if (!pointPoly(x, y, tubeBehindCage) || pointPoly(x, y, clamp)) continue;
      const lo = Math.min(src[i], src[i + 1], src[i + 2]),
        hi = Math.max(src[i], src[i + 1], src[i + 2]);
      if (lo > 165 && hi - lo < 20 && src[i + 3] > 200) {
        masks.frame[i + 3] = src[i + 3];
        surfaceData[i] = Math.max(0.7 * 0.88 * 255, lo * 0.88);
        surfaceData[i + 1] = 0;
      }
    }
  // Reconstruct one continuous head-tube lighting field; no hard-edged seam patch.
  for (let y = 215; y < 392; y++)
    for (let x = 1020; x < 1155; x++) {
      const i = (y * W + x) * 4,
        lo = Math.min(src[i], src[i + 1], src[i + 2]);
      if (src[i + 3] < 220 || lo < 100 || masks.frame[i + 3] < 100) continue;
      const blend = Math.max(
        0,
        Math.min(
          1,
          (x - 1020) / 18,
          (1155 - x) / 18,
          (y - 215) / 14,
          (392 - y) / 18,
        ),
      );
      const natural = (0.62 + (0.36 * lo) / 255) * 0.88 * 255;
      surfaceData[i] = surfaceData[i] * (1 - blend) + natural * blend;
      surfaceData[i + 1] *= 1 - blend;
      masks.frame[i + 3] = Math.max(masks.frame[i + 3], src[i + 3]);
    }
  // Local correction: the shaded underside of the seatstay at the seat-tube junction.
  const stayJointEdge = [
    [487, 505],
    [568, 440],
    [581, 432],
    [596, 430],
    [603, 433],
    [600, 440],
    [586, 439],
    [576, 445],
    [490, 515],
  ];
  for (let y = 428; y < 516; y++)
    for (let x = 487; x < 604; x++) {
      if (!pointPoly(x, y, stayJointEdge)) continue;
      const i = (y * W + x) * 4,
        lo = Math.min(src[i], src[i + 1], src[i + 2]),
        hi = Math.max(src[i], src[i + 1], src[i + 2]);
      if (src[i + 3] < 20 || lo < 122 || hi - lo > 18) continue;
      masks.frame[i + 3] = Math.max(
        masks.frame[i + 3],
        src[i + 3] * Math.min(1, (lo - 122) / 28),
      );
      surfaceData[i] = Math.max(
        0.56 * 0.88 * 255,
        Math.min(0.92 * 0.88 * 255, lo * 0.88),
      );
      surfaceData[i + 1] = 0;
    }
  // Local cassette-side seatstay silhouette and continuous shading.
  const rearDiagonal = [
    [315, 649],
    [320, 635],
    [331, 619],
    [349, 600],
    [369, 581],
    [385, 581],
    [385, 587],
    [366, 605],
    [350, 620],
    [343, 633],
    [342, 644],
    [346, 655],
    [334, 662],
    [320, 660],
  ];
  for (let y = 581; y < 654; y++)
    for (let x = 315; x < 386; x++) {
      const i = (y * W + x) * 4;
      if (!pointPoly(x, y, rearDiagonal)) continue;
      const lo = Math.min(src[i], src[i + 1], src[i + 2]),
        hi = Math.max(src[i], src[i + 1], src[i + 2]);
      if (src[i + 3] < 40 || hi - lo > 20 || lo < 125) continue;
      const coverage = src[i + 3] * Math.min(1, (lo - 125) / 36);
      masks.frame[i + 3] = Math.max(masks.frame[i + 3], coverage);
      surfaceData[i] = (0.62 + (0.36 * lo) / 255) * 0.88 * 255;
      surfaceData[i + 1] = 0;
    }
  const candidate = new Uint8Array(W * H),
    seen = new Uint8Array(W * H),
    clean = new Uint8Array(W * H);
  for (let y = 370; y < 620; y++)
    for (let x = 790; x < 1030; x++) {
      const n = y * W + x;
      if (oldLogo[n * 4 + 3] > 40) candidate[n] = 1;
      masks.logo[n * 4 + 3] = 0;
    }
  for (let y = 370; y < 620; y++)
    for (let x = 790; x < 1030; x++) {
      const n = y * W + x;
      if (!candidate[n] || seen[n]) continue;
      let q = [n],
        head = 0,
        minX = x,
        maxX = x,
        minY = y,
        maxY = y;
      seen[n] = 1;
      while (head < q.length) {
        const v = q[head++],
          vx = v % W,
          vy = Math.floor(v / W);
        minX = Math.min(minX, vx);
        maxX = Math.max(maxX, vx);
        minY = Math.min(minY, vy);
        maxY = Math.max(maxY, vy);
        for (const t of [v - 1, v + 1, v - W, v + W])
          if (candidate[t] && !seen[t]) {
            seen[t] = 1;
            q.push(t);
          }
      }
      if (
        q.length > 70 &&
        q.length / ((maxX - minX + 1) * (maxY - minY + 1)) > 0.14
      )
        for (const v of q) clean[v] = 1;
    }
  for (let y = 370; y < 620; y++)
    for (let x = 790; x < 1030; x++) {
      const n = y * W + x,
        i = n * 4;
      let near = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) near = near || clean[n + dy * W + dx];
      if (!near) continue;
      const lo = Math.min(src[i], src[i + 1], src[i + 2]);
      if (lo >= 235) continue;
      masks.logo[i + 3] = Math.min(1, (235 - lo) / 24) * src[i + 3];
      masks.frame[i + 3] = Math.max(masks.frame[i + 3], masks.logo[i + 3]);
      surfaceData[i] = 0.91 * 0.88 * 255;
      surfaceData[i + 1] = 0;
    }
}
const modelInfo = {
  v8: { caption: "V8 · CARBON WHEELS", name: "VOOK V8" },
  v9: { caption: "V9 · AERO CARBON", name: "VOOK V9" },
  carbon: { caption: "ONE 3.0 · CARBON", name: "VOOK ONE 3.0" },
  crv: { caption: "CRV · CITY", name: "VOOK CRV" },
};
const modelAssets = {
  v8: ["v8-base.png", "v8-masks.png", "v8-surface.png"],
  crv: ["crv-base.png", "crv-masks.png", "crv-surface.png"],
  carbon: ["white-carbon.png", "paint-masks.png", "surface-map.png"],
  v9: [
    "v9-base.png",
    "v9-masks.png",
    "v9-surface.png",
    "v9-original-wheel.png",
  ],
};
async function setModel(next) {
  if (!modelAssets[next]) return;
  const ticket = ++modelLoad;
  ready = false;
  model = next;
  $("loading").style.display = "block";
  canvas.style.display = "none";
  $("loading").textContent = t("载入车型…");
  try {
    const images = await Promise.all(
      modelAssets[next].map(
        (src) =>
          new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = src;
          }),
      ),
    );
    if (ticket !== modelLoad) return;
    rawCtx.clearRect(0, 0, W, H);
    rawCtx.drawImage(images[0], 0, 0, W, H);
    originalData = rawCtx.getImageData(0, 0, W, H);
    const mc = off(),
      mctx = mc.getContext("2d");
    mctx.drawImage(images[1], 0, 0, W, H);
    const packed = mctx.getImageData(0, 0, W, H).data;
    for (const k of ["frame", "fork", "logo"])
      masks[k] = new Uint8ClampedArray(packed.length);
    for (let i = 3; i < packed.length; i += 4) {
      masks.frame[i] =
        next === "v9" ? Math.max(packed[i - 3], packed[i - 2]) : packed[i - 3];
      masks.fork[i] = 0;
      masks.logo[i] = packed[i - 1];
    }
    mctx.clearRect(0, 0, W, H);
    mctx.drawImage(images[2], 0, 0, W, H);
    surfaceData = mctx.getImageData(0, 0, W, H).data;
    colors.fork = paintMode === "gradient" ? colors.front : colors.frame;
    changed.logo = true;
    $("color-fork").value = colors.fork;
    $("hex-fork").value = colors.fork;
    document.querySelector('[data-part="fork"]').hidden = true;
    $("modelCaption").textContent = modelInfo[next].caption;
    $("modelEyebrow").textContent = modelInfo[next].name;
    if (next === "v9") {
      const rotor = off(),
        rc = rotor.getContext("2d");
      rc.drawImage(
        images[3],
        50 + 835 * 1.02,
        -110 + 455 * 1.02,
        571 * 1.02,
        590 * 1.02,
      );
      const exact = rc.getImageData(0, 0, W, H).data,
        dst = originalData.data;
      for (let y = 350; y < 960; y++)
        for (let x = 895; x < 1490; x++) {
          const ox = (x - 50) / 1.02,
            oy = (y + 110) / 1.02;
          const radiusGuard =
            ((ox - 1120) / 286) ** 2 + ((oy - 752) / 291) ** 2;
          if (radiusGuard > 1.08) continue;
          const i = (y * W + x) * 4;
          if (
            masks.frame[i + 3] > 5 ||
            packed[i + 1] > 5 ||
            masks.logo[i + 3] > 5
          )
            continue;
          const rr = exact[i],
            gg = exact[i + 1],
            bb = exact[i + 2],
            hi = Math.max(rr, gg, bb),
            lo = Math.min(rr, gg, bb);
          if (!exact[i + 3]) {
            if (x > 900 && y > 354) dst[i + 3] = 0;
            continue;
          }
          const radius = ((ox - 1120) / 286) ** 2 + ((oy - 752) / 291) ** 2;
          const background =
            radius < 0.67
              ? lo > 180 || (hi > 140 && hi - lo < 6)
              : hi > 185 && hi - lo < 6;
          dst[i] = rr;
          dst[i + 1] = gg;
          dst[i + 2] = bb;
          dst[i + 3] = background ? 0 : exact[i + 3];
        }
    }
    if (next === "v9") {
      for (let y = 590; y < 710; y++)
        for (let x = 290; x < 470; x++) {
          const i = (y * W + x) * 4;
          const r = originalData.data[i],
            g = originalData.data[i + 1],
            b = originalData.data[i + 2],
            lo = Math.min(r, g, b),
            chroma = Math.max(r, g, b) - lo;
          const neutral = Math.max(0, Math.min(1, (18 - chroma) / 8)),
            white = Math.max(0, Math.min(1, (lo - 172) / 32));
          masks.frame[i + 3] *= neutral * white;
        }
      rebuildV9SmallLogos();
      refineV9PaintEdges();
      for (let i = 3; i < masks.frame.length; i += 4) {
        masks.frame[i] = Math.max(masks.frame[i], masks.fork[i]);
        masks.fork[i] = 0;
      }
    }
    $("model").value = next;
    uiLabels.frame = paintMode === "gradient" ? t("后部颜色") : t("车架与前叉");
    document.querySelector('.row[data-part="frame"] span').textContent =
      uiLabels.frame;
    fitBike();
    ready = true;
    $("loading").style.display = "none";
    canvas.style.display = "block";
    render();
  } catch (e) {
    $("loading").textContent = t("车型载入失败，请刷新重试");
    console.error(e);
  }
}
document.querySelector('[data-part="fork"]').hidden = true;
$("model").onchange = (e) => setModel(e.target.value);
select("frame");
setModel("v9");
window.flatStudio = {
  inspirations,
  applyInspiration,
  designFilename,
  exportPoster,
  isPhoneDevice,
  setPaintMode,
  setModel,
  get model() {
    return model;
  },
  get ready() {
    return ready;
  },
  get paintMode() {
    return paintMode;
  },
  get gloss() {
    return gloss;
  },
  setColor,
  render,
  select,
  loadImage,
  get masks() {
    return masks;
  },
  get changed() {
    return changed;
  },
  colors,
};

// Explicit local saves avoid uploading reference images or personal data.
$("saveDesign").textContent = language === "en" ? "Save colors" : "保存配色";
$("restoreDesign").textContent =
  language === "en" ? "Restore colors" : "恢复配色";
$("saveDesign").onclick = () => {
  if (!ready) return;
  try {
    localStorage.setItem(
      "vook-design",
      JSON.stringify({ version: 1, model, paintMode, colors }),
    );
    toast(language === "en" ? "Saved on this device" : "已保存在本机");
  } catch {
    toast(language === "en" ? "Storage unavailable" : "本机存储不可用");
  }
};
$("restoreDesign").onclick = async () => {
  try {
    const saved = JSON.parse(readPreference("vook-design"));
    if (
      !saved ||
      saved.version !== 1 ||
      !modelAssets[saved.model] ||
      !["solid", "gradient"].includes(saved.paintMode) ||
      !saved.colors ||
      !["frame", "front", "logo"].every((k) =>
        /^#[0-9a-f]{6}$/i.test(saved.colors[k]),
      )
    )
      throw Error();
    await setModel(saved.model);
    setPaintMode(saved.paintMode);
    for (const k of ["frame", "front", "logo"]) setColor(k, saved.colors[k]);
    toast(language === "en" ? "Colors restored" : "配色已恢复");
  } catch {
    toast(language === "en" ? "No valid saved design" : "没有可恢复的配色");
  }
};
for (const row of document.querySelectorAll(".row")) {
  row.tabIndex = 0;
  row.setAttribute("role", "group");
  row.onkeydown = (e) => {
    if (e.target === row && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      select(row.dataset.part);
    }
  };
}
