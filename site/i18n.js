/* Language preferences stay on this device. No analytics or uploads. */
const readPreference = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const language =
  readPreference("vook-language") ||
  (navigator.language.startsWith("zh") ? "zh" : "en");
const translations = {
  车架与前叉: "Frame & fork",
  前叉: "Fork",
  "车身 Logo": "Frame logo",
  前部颜色: "Front color",
  后部颜色: "Rear color",
  纯色: "Solid",
  渐变: "Gradient",
  "载入车型…": "Loading bicycle…",
  "车型载入失败，请刷新重试": "Unable to load bicycle. Please reload to retry.",
  应用颜色: "Apply color",
  "当前部位：": "Selected part: ",
  更换图片: "Replace image",
  已选择: "Selected: ",
  "已应用「": "Applied: ",
  "已应用：": "Applied: ",
  "已吸取 ": "Sampled ",
  "已将 ": "Applied ",
  "，应用至": " to ",
  " 应用至": " to ",
  至: " to ",
  "图片已载入，点击图片为": "Image ready. Click to sample for ",
  吸色: "Sample color",
  透明: "Transparent",
  "请添加 PNG、JPEG、WebP 等图片": "Choose a PNG, JPEG or WebP image.",
  "此图片无法读取，请换成 PNG 或 JPEG":
    "Unable to read image. Try PNG or JPEG.",
  "这里是透明区域，请选择图片中的颜色":
    "This area is transparent. Choose an opaque pixel.",
  "点击图片吸色，也可拖入或粘贴替换":
    "Click to sample. Drop or paste to replace.",
  "展开全部 ↓": "Show all ↓",
  "收起 ↑": "Show less ↑",
  品牌灵感: "Brand inspired",
  莫兰迪配色: "Muted tones",
  山系: "Outdoors",
  "官网配色近似 · 渐变为色系演绎":
    "Approximate colors; gradients are interpretations",
  "方案：": "Palette: ",
  "导出适合手机查看的竖版海报，包含所选颜色及色号。":
    "Export a portrait poster with your colors and hex values.",
  "将当前车型与配色导出为横版海报，包含所选颜色及色号。":
    "Export a landscape poster with your bicycle and hex values.",
  设计海报已导出: "Design poster exported",
  竖版设计海报已导出: "Portrait poster exported",
  "VOOK配色设计-": "VOOK-Paint-",
  "纯色-": "Solid-",
  "渐变-": "Gradient-",
  选择车型: "Choose bicycle",
  设计配色: "Design your colors",
  色彩系统: "Color studio",
  颜色微调: "Fine-tune colors",
  "先套用灵感方案，再选部位，用调色盘或图片吸色微调。":
    "Start with a palette, then select a part and fine-tune its color.",
  "先点选部位，再点色圈调色，也可直接输入色号。":
    "Select a part, then use its color picker or enter a hex value.",
  图片吸色: "Sample from an image",
  "为当前选中的部位取色。点击图片立即应用，悬停可放大查看。":
    "Click an image to apply its color to the selected part. Hover to magnify.",
  添加图片: "Add image",
  "放大取色 ↗": "Enlarge ↗",
  "拖入图片，或 ⌘V / Ctrl+V 粘贴": "Drop an image or paste with ⌘V / Ctrl+V",
  "选择部位，点击参考图片吸色":
    "Select a part, then click your reference image.",
  灵感配色: "Color inspiration",
  "一键应用整套配色，之后仍可用调色盘或图片吸色微调。":
    "Apply a palette, then fine-tune any color.",
  "导出设计 ↗": "Export design ↗",
  "图片取色 · 点击图片应用颜色": "Image sampler · Click to apply color",
  完成: "Done",
  "VOOK V9 · 气动公路": "VOOK V9 · Aero road",
  "VOOK V8 · 碳轮版": "VOOK V8 · Carbon wheels",
  "VOOK ONE 3.0 · 碳轮版": "VOOK ONE 3.0 · Carbon wheels",
  "VOOK CRV · 城市平把": "VOOK CRV · City",
  VOOK涂装设计预览: "Bicycle paint preview",
  "上传、拖入或粘贴图片": "Upload, drop or paste an image",
  点击参考图片吸色: "Click reference image to sample a color",
  放大图片取色: "Magnified image sampler",
  车架与前叉涂装方式: "Paint mode",
  雾蓝: "Mist blue",
  鼠尾草: "Sage",
  灰玫瑰: "Dusty rose",
  燕麦: "Oat",
  岩灰: "Rock gray",
  海盐: "Sea salt",
  奶油: "Cream",
  烟紫: "Smoky violet",
  薄荷灰: "Mint gray",
  陶土: "Terracotta",
  松林: "Pine",
  暮蓝: "Dusk blue",
  暖砂: "Warm sand",
  梅雾: "Plum mist",
  橄榄: "Olive",
  蓝铜: "Blue copper",
  苔粉: "Moss pink",
  紫麦: "Purple wheat",
  砖青: "Brick teal",
  墨杏: "Ink apricot",
  雾海: "Ocean mist",
  山岚: "Mountain haze",
  玫瑰石: "Rose stone",
  暖岩: "Warm rock",
  紫烟: "Violet smoke",
  盐白: "Salt white",
  苔霜: "Frosted moss",
  柔杏: "Soft apricot",
  雾樱: "Cherry mist",
  海石: "Sea stone",
  森林: "Forest",
  海岸: "Coast",
  暮紫: "Dusk violet",
  沙丘: "Dune",
  雪松: "Cedar",
  蓝与陶: "Blue clay",
  苔与玫: "Moss rose",
  紫与麦: "Violet wheat",
  砖与青: "Brick teal",
  墨与杏: "Ink apricot",
  松针: "Pine needle",
  荒野沙: "Wild sand",
  岩层: "Strata",
  赤土: "Red earth",
  冰川: "Glacier",
  森林晨雾: "Forest mist",
  山脊沙丘: "Ridge dune",
  苔岩: "Moss rock",
  日落赤岭: "Sunset ridge",
  雪线: "Snowline",
  银白: "Silver white",
  峡湾绿: "Fjord green",
  水晶白: "Crystal white",
  酸绿: "Acid green",
  极光白: "Arctic white",
  烈焰红: "Flame red",
  曜石绿: "Obsidian green",
  琥珀金: "Amber gold",
  天空青: "Sky teal",
  午夜蓝: "Midnight blue",
  峡湾银绿: "Silver fjord",
  夜蓝酸绿: "Night acid",
  曜石翡翠: "Emerald",
  深海湛蓝: "Deep ocean",
  烟黑焰红: "Black flame",
  熔沙: "Lava sand",
  红玉髓: "Carnelian",
  红金流光: "Red gold",
  礁湖蓝: "Lagoon",
  钴蓝珊瑚: "Cobalt coral",
  黑色: "Black",
  白色: "White",
  浅灰色: "Light gray",
  深灰色: "Dark gray",
  灰色: "Gray",
  米白色: "Ivory",
  粉色: "Pink",
  酒红色: "Burgundy",
  红色: "Red",
  棕色: "Brown",
  杏色: "Apricot",
  橙色: "Orange",
  橄榄色: "Olive",
  黄色: "Yellow",
  墨绿色: "Dark green",
  浅绿色: "Light green",
  绿色: "Green",
  青色: "Teal",
  藏蓝色: "Navy",
  浅蓝色: "Light blue",
  蓝色: "Blue",
  紫色: "Purple",
  玫红色: "Magenta",
};
function t(value) {
  return language === "en" ? translations[value] || value : value;
}
function translatePage() {
  document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (["SCRIPT", "STYLE"].includes(node.parentElement?.tagName)) continue;
    const original = node.nodeValue.trim();
    if (translations[original])
      node.nodeValue = node.nodeValue.replace(original, t(original));
  }
  document
    .querySelectorAll("[aria-label]")
    .forEach((el) =>
      el.setAttribute("aria-label", t(el.getAttribute("aria-label"))),
    );
  document.querySelector("#language").textContent =
    language === "en" ? "中文" : "English";
  document.querySelector("#language").onclick = () => {
    try {
      localStorage.setItem("vook-language", language === "en" ? "zh" : "en");
      location.reload();
    } catch {
      alert("Browser storage is unavailable.");
    }
  };
}
translatePage();
