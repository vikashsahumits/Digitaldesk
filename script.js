// Digital Desk - logic circuit simulator
// MITS Microproject, CST 147 & 149

function $(id) {
  return document.getElementById(id);
}

// ===================================================
// 1. Part types (what each part does)
// ===================================================
var NODE_W = 112;   // width of a part
var HEAD_H = 24;    // height of the title strip
var BODY_H = 56;    // height of the body

var TYPES = {
  SWITCH: { inputs: 0, title: "Toggle Switch", info: "A switch you can flip. Press it to change between 0 and 1.", formula: "Y = switch" },
  CONST:  { inputs: 0, title: "High / Low", info: "A fixed signal. Press it to change between 1 (high) and 0 (low).", formula: "Y = 1 or 0" },
  CLOCK:  { inputs: 0, title: "Clock", info: "Flips between 0 and 1 by itself while the simulator is Running.", formula: "Y = 0, 1, 0, 1 ..." },
  LED:    { inputs: 1, title: "LED Output Indicator", info: "Lights up when its input is HIGH (1).", formula: "LED = input" },
  AND:  { inputs: 2, title: "AND Gate", info: "Output is HIGH (1) only if both inputs are HIGH.", formula: "Y = A · B", fn: function (a, b) { return a & b; } },
  OR:   { inputs: 2, title: "OR Gate", info: "Output is HIGH (1) if at least one input is HIGH.", formula: "Y = A + B", fn: function (a, b) { return a | b; } },
  NOT:  { inputs: 1, title: "NOT Gate (Inverter)", info: "Output is the opposite of the input.", formula: "Y = A′", fn: function (a) { return 1 - a; } },
  NAND: { inputs: 2, title: "NAND Gate", info: "Output is LOW (0) only if both inputs are HIGH.", formula: "Y = (A · B)′", fn: function (a, b) { return 1 - (a & b); } },
  NOR:  { inputs: 2, title: "NOR Gate", info: "Output is HIGH (1) only if both inputs are LOW.", formula: "Y = (A + B)′", fn: function (a, b) { return 1 - (a | b); } },
  XOR:  { inputs: 2, title: "XOR Gate", info: "Output is HIGH (1) if inputs are different.", formula: "Y = A ⊕ B", fn: function (a, b) { return a ^ b; } },
  XNOR: { inputs: 2, title: "XNOR Gate", info: "Output is HIGH (1) if inputs are the same.", formula: "Y = (A ⊕ B)′", fn: function (a, b) { return 1 - (a ^ b); } }
};

// ===================================================
// 2. Data (everything on the board)
// ===================================================
var nodes = [];        // parts: {id, type, x, y, label, value, out}
var wires = [];        // wires: {id, from: partId, to: partId, port: input number}
var nextId = 1;
var selected = null;   // {kind: "node" or "wire", id}
var nodeEls = {};      // the HTML element of each part
var running = true;    // are the clocks running?
var undoList = [];     // old states for the Previous button
var redoList = [];     // states for the Next button

// view (pan and zoom)
var zoom = 1;
var panX = 0;
var panY = 0;

var canvas = $("canvas");
var world = $("world");
var wiresSvg = $("wires");
var drag = null;       // what the mouse is doing right now
var tempPath = "";     // the wire being dragged

function getNode(id) {
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes[i];
  }
  return null;
}

function nodesOfType(type) {
  var list = [];
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].type === type) list.push(nodes[i]);
  }
  return list;
}

function wireTo(id, port) {
  for (var i = 0; i < wires.length; i++) {
    if (wires[i].to === id && wires[i].port === port) return wires[i];
  }
  return null;
}

function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toast(message) {
  var box = $("toast");
  box.textContent = message;
  box.classList.add("show");
  setTimeout(function () { box.classList.remove("show"); }, 2200);
}

// ===================================================
// 3. Simulation
// ===================================================
function inputValue(node, port) {
  var wire = wireTo(node.id, port);
  if (wire === null) return 0;          // nothing connected = 0
  var source = getNode(wire.from);
  return source ? source.out : 0;
}

function computeOut(node) {
  var type = node.type;
  if (type === "SWITCH" || type === "CONST" || type === "CLOCK") return node.value;
  if (type === "LED") return inputValue(node, 0);
  if (type === "NOT") return TYPES.NOT.fn(inputValue(node, 0));
  return TYPES[type].fn(inputValue(node, 0), inputValue(node, 1));
}

// keep updating every part until nothing changes any more
function settle() {
  for (var pass = 0; pass < 60; pass++) {
    var changed = false;
    for (var i = 0; i < nodes.length; i++) {
      var v = computeOut(nodes[i]);
      if (v !== nodes[i].out) {
        nodes[i].out = v;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

// ===================================================
// 4. Drawing parts and wires
// ===================================================
// height of a dot, counted from the top of the part
// (these numbers match the lines drawn inside gateShape)
function portY(type, index) {
  if (TYPES[type].inputs === 2) return HEAD_H + (index === 0 ? 19 : 39);
  return HEAD_H + 29;
}

// ----- gate symbols (drawn as SVG, 112 wide and 56 tall) -----
function gateShape(type) {
  var violet = (type === "NAND" || type === "NOR" || type === "XOR" || type === "XNOR") ? " violet" : "";
  var inverted = (type === "NAND" || type === "NOR" || type === "XNOR" || type === "NOT");
  var body = "";
  var inX;   // where the input lines stop
  var tip;   // where the symbol ends on the right

  if (type === "AND" || type === "NAND") {
    body = '<path class="sym-body' + violet + '" d="M30,8 H52 A20,20 0 0 1 52,48 H30 Z"/>';
    inX = 30; tip = 72;
  } else if (type === "OR" || type === "NOR") {
    body = '<path class="sym-body' + violet + '" d="M26,8 C46,8 64,16 76,28 C64,40 46,48 26,48 C34,38 34,18 26,8 Z"/>';
    inX = 31; tip = 76;
  } else if (type === "XOR" || type === "XNOR") {
    body = '<path class="sym-body' + violet + '" d="M32,8 C52,8 70,16 82,28 C70,40 52,48 32,48 C40,38 40,18 32,8 Z"/>' +
           '<path class="sym-arc" d="M24,8 C32,18 32,38 24,48"/>';
    inX = 28; tip = 82;
  } else {   // NOT
    body = '<path class="sym-body" d="M34,10 L34,46 L78,28 Z"/>';
    inX = 34; tip = 78;
  }

  var lines = "";
  if (TYPES[type].inputs === 2) lines += '<path class="sym-line" d="M0,18 H' + inX + ' M0,38 H' + inX + '"/>';
  else lines += '<path class="sym-line" d="M0,28 H' + inX + '"/>';

  var outStart = tip;
  if (inverted) {
    body += '<circle class="sym-body' + violet + '" cx="' + (tip + 5) + '" cy="28" r="5"/>';
    outStart = tip + 10;
  }
  lines += '<path class="sym-line" d="M' + outStart + ',28 H112"/>';
  return lines + body;
}

// small pictures for the parts list on the left
function paletteIcon(type) {
  if (TYPES[type].fn) return '<svg class="sym" viewBox="22 4 72 48">' + gateShape(type) + "</svg>";
  if (type === "SWITCH") return '<svg class="sym" viewBox="0 0 66 40"><rect class="sym-body" x="10" y="12" width="46" height="18" rx="9"/><circle class="sym-on" cx="44" cy="21" r="6"/></svg>';
  if (type === "CONST") return '<svg class="sym" viewBox="0 0 66 40"><text class="sym-text" x="33" y="27" text-anchor="middle">1 0</text></svg>';
  if (type === "CLOCK") return '<svg class="sym" viewBox="0 0 66 40"><path class="sym-led" d="M8,30 H18 V12 H30 V30 H42 V12 H54 V30 H60" stroke-linejoin="round"/></svg>';
  return '<svg class="sym" viewBox="0 0 66 40"><circle class="sym-led" cx="33" cy="20" r="11"/><path class="sym-led" d="M33,5 V1 M48,20 H53 M13,20 H18"/></svg>';
}

function addPaletteIcons() {
  var items = document.querySelectorAll(".pal-item");
  for (var i = 0; i < items.length; i++) {
    items[i].insertAdjacentHTML("afterbegin", paletteIcon(items[i].getAttribute("data-type")));
  }
}

// small icons for the Run and theme buttons
var ICON = {
  play: '<svg class="ico" viewBox="0 0 24 24"><polygon points="7,4 20,12 7,20" fill="currentColor"/></svg>',
  pause: '<svg class="ico" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  sun: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>',
  moon: '<svg class="ico" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>'
};

function defaultLabel(type) {
  if (type === "SWITCH") {
    for (var code = 65; code <= 90; code++) {
      var letter = String.fromCharCode(code);
      var used = false;
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].type === "SWITCH" && nodes[i].label === letter) used = true;
      }
      if (!used) return letter;
    }
    return "Input";
  }
  if (type === "LED") return "Out " + (nodesOfType("LED").length + 1);
  if (type === "CONST") return "Const";
  if (type === "CLOCK") return "Clock";
  return type;
}

function createNodeEl(n) {
  var t = TYPES[n.type];
  var body;
  if (n.type === "SWITCH") body = '<div class="toggle"><div class="knob"></div></div>';
  else if (n.type === "CONST") body = '<button type="button" class="const">0</button>';
  else if (n.type === "CLOCK") body = '<div class="clock">CLK 0</div>';
  else if (n.type === "LED") body = '<div class="led"></div>';
  else body = '<svg class="gate-svg" viewBox="0 0 112 56">' + gateShape(n.type) + "</svg>";

  var html = '<div class="n-head"><span class="n-label"></span></div><div class="n-body">' + body + "</div>";
  for (var i = 0; i < t.inputs; i++) {
    html += '<div class="port in" data-port="' + i + '" style="top:' + (portY(n.type, i) - 7) + 'px"></div>';
  }
  if (n.type !== "LED") {
    html += '<div class="port out" style="top:' + (portY(n.type, 0) - 7) + 'px"></div>';
  }

  var el = document.createElement("div");
  el.className = "node";
  el.setAttribute("data-id", n.id);
  el.style.left = n.x + "px";
  el.style.top = n.y + "px";
  el.innerHTML = html;
  el.querySelector(".n-label").textContent = n.label;
  world.appendChild(el);
  nodeEls[n.id] = el;
}

function rebuildDom() {
  for (var id in nodeEls) nodeEls[id].remove();
  nodeEls = {};
  for (var i = 0; i < nodes.length; i++) createNodeEl(nodes[i]);
}

// colours, lights and switches
function updateVisuals() {
  var i;
  var oldHigh = world.querySelectorAll(".port.high");
  for (i = 0; i < oldHigh.length; i++) oldHigh[i].classList.remove("high");

  for (i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var el = nodeEls[n.id];
    if (n.type === "SWITCH") el.querySelector(".toggle").classList.toggle("on", n.value === 1);
    if (n.type === "CONST") {
      var btn = el.querySelector(".const");
      btn.textContent = n.value;
      btn.classList.toggle("on", n.value === 1);
    }
    if (n.type === "CLOCK") {
      var clk = el.querySelector(".clock");
      clk.textContent = "CLK " + n.out;
      clk.classList.toggle("on", n.out === 1);
    }
    if (n.type === "LED") el.querySelector(".led").classList.toggle("on", n.out === 1);

    var isSelected = selected !== null && selected.kind === "node" && selected.id === n.id;
    el.classList.toggle("selected", isSelected);
    if (n.out === 1 && n.type !== "LED") el.querySelector(".port.out").classList.add("high");
  }

  for (i = 0; i < wires.length; i++) {
    var source = getNode(wires[i].from);
    if (source.out === 1) {
      var port = nodeEls[wires[i].to].querySelector('.port.in[data-port="' + wires[i].port + '"]');
      if (port) port.classList.add("high");
    }
  }
}

function curve(x1, y1, x2, y2) {
  var dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2;
}

function drawWires() {
  var html = "";
  for (var i = 0; i < wires.length; i++) {
    var w = wires[i];
    var a = getNode(w.from);
    var b = getNode(w.to);
    var d = curve(a.x + NODE_W, a.y + portY(a.type, 0), b.x, b.y + portY(b.type, w.port));
    var cls = "wire";
    if (a.out === 1) cls += " high";
    if (selected !== null && selected.kind === "wire" && selected.id === w.id) cls += " sel";
    html += '<path class="' + cls + '" d="' + d + '"/>';
    html += '<path class="hit" data-wire="' + w.id + '" d="' + d + '"/>';
  }
  if (tempPath !== "") html += '<path class="wire temp" d="' + tempPath + '"/>';
  wiresSvg.innerHTML = html;
}

function update() {
  settle();
  updateVisuals();
  drawWires();
}

// call this after every change to the circuit
function refresh() {
  update();
  $("empty").style.display = (nodes.length === 0) ? "grid" : "none";
  updateHistoryButtons();
}

// ===================================================
// 5. Undo / redo, save / open
// ===================================================
function takeSnapshot() {
  var list = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    list.push({ id: n.id, type: n.type, x: n.x, y: n.y, label: n.label, value: n.value });
  }
  return JSON.stringify({ nodes: list, wires: wires, nextId: nextId });
}

function loadSnapshot(text) {
  var data = JSON.parse(text);
  if (!Array.isArray(data.nodes) || !Array.isArray(data.wires)) throw new Error("bad file");
  nodes = [];
  for (var i = 0; i < data.nodes.length; i++) {
    var n = data.nodes[i];
    if (!TYPES[n.type]) throw new Error("bad part");
    nodes.push({ id: n.id, type: n.type, x: n.x, y: n.y, label: String(n.label), value: n.value ? 1 : 0, out: 0 });
  }
  wires = [];
  for (var j = 0; j < data.wires.length; j++) {
    var w = data.wires[j];
    if (getNode(w.from) && getNode(w.to)) wires.push({ id: w.id, from: w.from, to: w.to, port: w.port });
  }
  nextId = data.nextId || 1000;
  selected = null;
  rebuildDom();
  refresh();
}

function pushUndo(snapshot) {
  undoList.push(snapshot);
  if (undoList.length > 60) undoList.shift();
  redoList = [];
  updateHistoryButtons();
}

// call this just BEFORE changing the circuit
function saveHistory() {
  pushUndo(takeSnapshot());
}

function goPrevious() {
  if (undoList.length === 0) return;
  redoList.push(takeSnapshot());
  loadSnapshot(undoList.pop());
}

function goNext() {
  if (redoList.length === 0) return;
  undoList.push(takeSnapshot());
  loadSnapshot(redoList.pop());
}

function updateHistoryButtons() {
  $("btnPrev").disabled = (undoList.length === 0);
  $("btnNext").disabled = (redoList.length === 0);
}

function saveFile() {
  var blob = new Blob([takeSnapshot()], { type: "application/json" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "my-circuit.json";
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Circuit saved as my-circuit.json");
}

function openFile(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var before = takeSnapshot();
    try {
      loadSnapshot(reader.result);
      pushUndo(before);
      fitView();
      toast("Circuit opened");
    } catch (err) {
      loadSnapshot(before);
      toast("That file is not a Digital Desk circuit.");
    }
  };
  reader.readAsText(file);
}

// ===================================================
// 6. Changing the circuit
// ===================================================
function addNode(type, x, y) {
  saveHistory();
  var n = { id: nextId++, type: type, x: Math.round(x), y: Math.round(y), label: defaultLabel(type), value: 0, out: 0 };
  nodes.push(n);
  createNodeEl(n);
  selected = { kind: "node", id: n.id };
  showInfo(type);
  refresh();
}

function addWire(from, to, port) {
  if (from === to) return;
  saveHistory();
  var keep = [];
  for (var i = 0; i < wires.length; i++) {
    // an input can only have one wire, so remove the old one
    if (!(wires[i].to === to && wires[i].port === port)) keep.push(wires[i]);
  }
  wires = keep;
  wires.push({ id: nextId++, from: from, to: to, port: port });
  refresh();
}

function deleteSelected() {
  if (selected === null) return;
  saveHistory();
  if (selected.kind === "wire") {
    wires = wires.filter(function (w) { return w.id !== selected.id; });
  } else {
    var id = selected.id;
    nodes = nodes.filter(function (n) { return n.id !== id; });
    wires = wires.filter(function (w) { return w.from !== id && w.to !== id; });
    nodeEls[id].remove();
    delete nodeEls[id];
  }
  selected = null;
  refresh();
}

function clearAll() {
  if (nodes.length === 0) return;
  saveHistory();
  nodes = [];
  wires = [];
  selected = null;
  rebuildDom();
  refresh();
}

// ===================================================
// 7. Preset circuits
// Each part is [type, x, y, label]. Each wire is [fromIndex, toIndex, inputPort].
// ===================================================
var PRESETS = {
  half: {
    nodes: [["SWITCH", 60, 90, "Input A"], ["SWITCH", 60, 230, "Input B"], ["XOR", 300, 80, "Sum Gate"],
            ["AND", 300, 230, "Carry Gate"], ["LED", 520, 90, "Sum"], ["LED", 520, 240, "Carry"]],
    wires: [[0, 2, 0], [1, 2, 1], [0, 3, 0], [1, 3, 1], [2, 4, 0], [3, 5, 0]]
  },
  full: {
    nodes: [["SWITCH", 40, 40, "A"], ["SWITCH", 40, 170, "B"], ["SWITCH", 40, 310, "Cin"],
            ["XOR", 240, 70, "XOR 1"], ["XOR", 440, 130, "Sum Gate"], ["AND", 240, 200, "AND 1"],
            ["AND", 440, 270, "AND 2"], ["OR", 620, 235, "Carry Gate"], ["LED", 640, 110, "Sum"], ["LED", 800, 245, "Cout"]],
    wires: [[0, 3, 0], [1, 3, 1], [3, 4, 0], [2, 4, 1], [0, 5, 0], [1, 5, 1], [3, 6, 0], [2, 6, 1],
            [5, 7, 0], [6, 7, 1], [4, 8, 0], [7, 9, 0]]
  },
  mux: {
    nodes: [["SWITCH", 40, 50, "A"], ["SWITCH", 40, 200, "B"], ["SWITCH", 40, 350, "S"], ["NOT", 210, 340, "Invert S"],
            ["AND", 400, 70, "Pick A"], ["AND", 400, 230, "Pick B"], ["OR", 590, 150, "Join"], ["LED", 770, 160, "Y"]],
    wires: [[2, 3, 0], [0, 4, 0], [3, 4, 1], [1, 5, 0], [2, 5, 1], [4, 6, 0], [5, 6, 1], [6, 7, 0]]
  },
  nand: {
    nodes: [["SWITCH", 40, 80, "A"], ["SWITCH", 40, 270, "B"], ["NAND", 240, 175, "NAND 1"], ["NAND", 440, 70, "NAND 2"],
            ["NAND", 440, 280, "NAND 3"], ["NAND", 640, 175, "NAND 4"], ["LED", 820, 185, "A xor B"]],
    wires: [[0, 2, 0], [1, 2, 1], [0, 3, 0], [2, 3, 1], [1, 4, 0], [2, 4, 1], [3, 5, 0], [4, 5, 1], [5, 6, 0]]
  },
  latch: {
    nodes: [["SWITCH", 40, 60, "Reset"], ["SWITCH", 40, 280, "Set"], ["NOR", 290, 60, "NOR for Q"], ["NOR", 290, 280, "NOR for Q-bar"],
            ["LED", 530, 70, "Q"], ["LED", 530, 290, "Q-bar"]],
    wires: [[0, 2, 0], [3, 2, 1], [1, 3, 0], [2, 3, 1], [2, 4, 0], [3, 5, 0]]
  },
  clock: {
    nodes: [["CLOCK", 60, 130, "Clock"], ["NOT", 280, 220, "Invert"], ["LED", 300, 60, "Lamp 1"], ["LED", 520, 230, "Lamp 2"]],
    wires: [[0, 2, 0], [0, 1, 0], [1, 3, 0]]
  }
};

function loadPreset(key) {
  var preset = PRESETS[key];
  if (!preset) return;
  saveHistory();
  nodes = [];
  wires = [];
  selected = null;
  var ids = [];
  for (var i = 0; i < preset.nodes.length; i++) {
    var d = preset.nodes[i];
    var n = { id: nextId++, type: d[0], x: d[1], y: d[2], label: d[3], value: 0, out: 0 };
    nodes.push(n);
    ids.push(n.id);
  }
  for (var j = 0; j < preset.wires.length; j++) {
    var w = preset.wires[j];
    wires.push({ id: nextId++, from: ids[w[0]], to: ids[w[1]], port: w[2] });
  }
  rebuildDom();
  refresh();
  fitView();
}

// ===================================================
// 8. Pan, zoom and mouse
// ===================================================
function applyView() {
  world.style.transform = "translate(" + panX + "px," + panY + "px) scale(" + zoom + ")";
  canvas.style.backgroundPosition = panX + "px " + panY + "px";
  canvas.style.backgroundSize = (24 * zoom) + "px " + (24 * zoom) + "px";
  $("zoomText").textContent = Math.round(zoom * 100) + "%";
}

function zoomAt(factor, cx, cy) {
  var newZoom = Math.max(0.3, Math.min(2.2, zoom * factor));
  panX = cx - (cx - panX) * (newZoom / zoom);
  panY = cy - (cy - panY) * (newZoom / zoom);
  zoom = newZoom;
  applyView();
}

function zoomCenter(factor) {
  var rect = canvas.getBoundingClientRect();
  zoomAt(factor, rect.width / 2, rect.height / 2);
}

function fitView() {
  var rect = canvas.getBoundingClientRect();
  if (nodes.length === 0) {
    zoom = 1; panX = 0; panY = 0;
    applyView();
    return;
  }
  var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (var i = 0; i < nodes.length; i++) {
    minX = Math.min(minX, nodes[i].x);
    minY = Math.min(minY, nodes[i].y);
    maxX = Math.max(maxX, nodes[i].x + NODE_W);
    maxY = Math.max(maxY, nodes[i].y + HEAD_H + BODY_H);
  }
  zoom = Math.min(rect.width / (maxX - minX + 140), rect.height / (maxY - minY + 160), 1.3);
  zoom = Math.max(0.3, zoom);
  panX = (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom;
  panY = (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom + 20;
  applyView();
}

// mouse position converted to board coordinates
function worldPoint(e) {
  var rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left - panX) / zoom, y: (e.clientY - rect.top - panY) / zoom };
}

function showInfo(type) {
  $("infoTitle").textContent = TYPES[type].title;
  $("infoText").textContent = TYPES[type].info;
  $("infoFormula").textContent = TYPES[type].formula;
}

function onDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  var target = e.target;
  if (target.isContentEditable) return;
  var pt = worldPoint(e);

  // 1. pressed a dot: start a new wire
  var port = target.closest(".port");
  if (port) {
    var portNode = Number(port.closest(".node").getAttribute("data-id"));
    drag = {
      mode: "wire",
      side: port.classList.contains("out") ? "out" : "in",
      nodeId: portNode,
      port: Number(port.getAttribute("data-port") || 0)
    };
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  // 2. pressed a wire: select it
  var hit = target.closest(".hit");
  if (hit) {
    selected = { kind: "wire", id: Number(hit.getAttribute("data-wire")) };
    updateVisuals();
    drawWires();
    return;
  }

  // 3. pressed a part: select it and get ready to drag
  var nodeEl = target.closest(".node");
  if (nodeEl) {
    var n = getNode(Number(nodeEl.getAttribute("data-id")));
    selected = { kind: "node", id: n.id };
    drag = {
      mode: "node", node: n, offX: pt.x - n.x, offY: pt.y - n.y,
      startX: e.clientX, startY: e.clientY, moved: false,
      isClick: target.closest(".toggle, .const") !== null
    };
    canvas.setPointerCapture(e.pointerId);
    showInfo(n.type);
    updateVisuals();
    drawWires();
    return;
  }

  // 4. pressed empty space: unselect and move the whole board
  selected = null;
  drag = { mode: "pan", startX: e.clientX, startY: e.clientY, panX0: panX, panY0: panY };
  canvas.setPointerCapture(e.pointerId);
  updateVisuals();
  drawWires();
}

function onMove(e) {
  if (drag === null) return;

  if (drag.mode === "pan") {
    panX = drag.panX0 + (e.clientX - drag.startX);
    panY = drag.panY0 + (e.clientY - drag.startY);
    applyView();
    return;
  }

  var pt = worldPoint(e);

  if (drag.mode === "node") {
    var moveAmount = Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY);
    if (!drag.moved) {
      if (moveAmount < 5) return;     // tiny shake, treat it as a click
      saveHistory();                  // first real movement: remember the old place
      drag.moved = true;
    }
    drag.node.x = Math.round(pt.x - drag.offX);
    drag.node.y = Math.round(pt.y - drag.offY);
    nodeEls[drag.node.id].style.left = drag.node.x + "px";
    nodeEls[drag.node.id].style.top = drag.node.y + "px";
    drawWires();
    return;
  }

  if (drag.mode === "wire") {
    var n = getNode(drag.nodeId);
    if (drag.side === "out") {
      tempPath = curve(n.x + NODE_W, n.y + portY(n.type, 0), pt.x, pt.y);
    } else {
      tempPath = curve(pt.x, pt.y, n.x, n.y + portY(n.type, drag.port));
    }
    drawWires();
  }
}

function onUp(e) {
  if (drag === null) return;
  var d = drag;
  drag = null;

  if (d.mode === "node") {
    if (!d.moved && d.isClick) {
      // a click on a switch or constant flips it
      saveHistory();
      d.node.value = 1 - d.node.value;
    }
    refresh();
    return;
  }

  if (d.mode === "wire") {
    tempPath = "";
    // what is under the mouse when it is released?
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var port = under ? under.closest(".port") : null;
    if (port) {
      var otherId = Number(port.closest(".node").getAttribute("data-id"));
      var otherIsOut = port.classList.contains("out");
      if (d.side === "out" && !otherIsOut) {
        addWire(d.nodeId, otherId, Number(port.getAttribute("data-port")));
        return;
      }
      if (d.side === "in" && otherIsOut) {
        addWire(otherId, d.nodeId, d.port);
        return;
      }
    }
    drawWires();
  }
}

// double-click a part title to rename it
function onDoubleClick(e) {
  // the mouse is captured by the board, so look at what is really under it
  var under = document.elementFromPoint(e.clientX, e.clientY);
  if (under === null) return;
  var label = under.closest(".n-label");
  if (label) {
    var n = getNode(Number(label.closest(".node").getAttribute("data-id")));
    var before = takeSnapshot();
    label.contentEditable = "true";
    label.focus();
    document.getSelection().selectAllChildren(label);

    var finish = function () {
      label.contentEditable = "false";
      var text = label.textContent.trim().slice(0, 20);
      if (text === "") text = n.label;
      label.textContent = text;
      if (text !== n.label) {
        n.label = text;
        pushUndo(before);
        refresh();
      }
    };
    label.onblur = finish;
    label.onkeydown = function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); label.blur(); }
    };
    return;
  }
  // double-click on a wire deletes it
  var hit = under.closest(".hit");
  if (hit) {
    selected = { kind: "wire", id: Number(hit.getAttribute("data-wire")) };
    deleteSelected();
  }
}

// ===================================================
// 9. Truth table and Boolean expressions
// ===================================================
// returns {s: text, atom: true if no brackets are needed}
function exprOf(node, depth) {
  if (depth > 12) return { s: "...", atom: true };
  var t = node.type;
  if (t === "SWITCH" || t === "CLOCK") return { s: node.label, atom: true };
  if (t === "CONST") return { s: String(node.value), atom: true };

  var a = exprInput(node, 0, depth);
  if (t === "LED") return a;
  if (t === "NOT") return { s: brackets(a) + "′", atom: true };

  var b = exprInput(node, 1, depth);
  var symbol = { AND: " · ", NAND: " · ", OR: " + ", NOR: " + ", XOR: " ⊕ ", XNOR: " ⊕ " }[t];
  var text = brackets(a) + symbol + brackets(b);
  if (t === "NAND" || t === "NOR" || t === "XNOR") return { s: "(" + text + ")′", atom: true };
  return { s: text, atom: false };
}

function exprInput(node, port, depth) {
  var wire = wireTo(node.id, port);
  if (wire === null) return { s: "0", atom: true };
  return exprOf(getNode(wire.from), depth + 1);
}

function brackets(e) {
  return e.atom ? e.s : "(" + e.s + ")";
}

function openTable() {
  var switches = nodesOfType("SWITCH");
  var leds = nodesOfType("LED");
  var box = $("ttBody");

  if (switches.length === 0 || leds.length === 0) {
    box.innerHTML = '<p class="note">Add at least one Switch and one LED to see a truth table.</p>';
  } else if (switches.length > 6) {
    box.innerHTML = '<p class="note">Too many switches (' + switches.length + '). The table works for up to 6.</p>';
  } else {
    // remember the real state, then try every combination
    var savedOuts = [];
    var savedValues = [];
    var i;
    for (i = 0; i < nodes.length; i++) savedOuts.push(nodes[i].out);
    for (i = 0; i < switches.length; i++) savedValues.push(switches[i].value);

    var html = '<div class="tt-scroll"><table><tr>';
    for (i = 0; i < switches.length; i++) html += "<th>" + esc(switches[i].label) + "</th>";
    for (i = 0; i < leds.length; i++) html += "<th>" + esc(leds[i].label) + "</th>";
    html += "</tr>";

    var rows = Math.pow(2, switches.length);
    for (var row = 0; row < rows; row++) {
      var isNow = true;
      var cells = "";
      for (i = 0; i < switches.length; i++) {
        var bit = (row >> (switches.length - 1 - i)) & 1;
        if (bit !== savedValues[i]) isNow = false;
        switches[i].value = bit;
        cells += "<td>" + bit + "</td>";
      }
      for (i = 0; i < nodes.length; i++) nodes[i].out = 0;   // start clean every row
      settle();
      for (i = 0; i < leds.length; i++) {
        cells += '<td class="' + (leds[i].out ? "one" : "") + '">' + leds[i].out + "</td>";
      }
      html += (isNow ? '<tr class="now">' : "<tr>") + cells + "</tr>";
    }
    html += "</table></div>";

    // Boolean expression for each LED
    for (i = 0; i < leds.length; i++) {
      html += '<p class="expr"><b>' + esc(leds[i].label) + "</b> = " + esc(exprOf(leds[i], 0).s) + "</p>";
    }
    box.innerHTML = html;

    // put everything back the way it was
    for (i = 0; i < switches.length; i++) switches[i].value = savedValues[i];
    for (i = 0; i < nodes.length; i++) nodes[i].out = savedOuts[i];
  }
  $("tableDlg").showModal();
}

// ===================================================
// 10. Buttons, keyboard, theme
// ===================================================
function setRunning(flag) {
  running = flag;
  $("runIcon").innerHTML = running ? ICON.play : ICON.pause;
  $("runText").textContent = running ? "Running" : "Paused";
  $("btnRun").classList.toggle("paused", !running);
}

function flipClocks() {
  var clocks = nodesOfType("CLOCK");
  for (var i = 0; i < clocks.length; i++) clocks[i].value = 1 - clocks[i].value;
  if (clocks.length > 0) update();
  return clocks.length;
}

function setTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
  // the button shows the mode you will get when you press it
  $("themeBtn").innerHTML = (name === "dark") ? ICON.sun + "Light mode" : ICON.moon + "Dark mode";
  try { localStorage.setItem("digitalDeskTheme2", name); } catch (err) { }
}

// slide the bar on the right edge of the components list to make it wider or narrower
function setSideWidth(px) {
  var w = Math.max(230, Math.min(620, px));
  document.querySelector(".app").style.setProperty("--side-w", w + "px");
  try { localStorage.setItem("digitalDeskSideW", String(w)); } catch (err) { }
}

function setupResizer() {
  var handle = $("resizer");
  var app = document.querySelector(".app");
  var sliding = false;

  var saved = null;
  try { saved = localStorage.getItem("digitalDeskSideW"); } catch (err) { }
  if (saved) setSideWidth(Number(saved));

  handle.addEventListener("pointerdown", function (e) {
    sliding = true;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener("pointermove", function (e) {
    if (sliding) setSideWidth(e.clientX - app.getBoundingClientRect().left);
  });
  handle.addEventListener("pointerup", function () { sliding = false; });
  handle.addEventListener("pointercancel", function () { sliding = false; });
  handle.addEventListener("dblclick", function () { setSideWidth(250); });
  handle.addEventListener("keydown", function (e) {
    var now = document.querySelector(".side").getBoundingClientRect().width;
    if (e.key === "ArrowLeft") { e.preventDefault(); setSideWidth(now - 20); }
    if (e.key === "ArrowRight") { e.preventDefault(); setSideWidth(now + 20); }
  });
}

function setupButtons() {
  // parts list: press to add, or drag onto the board
  var items = document.querySelectorAll(".pal-item");
  for (var i = 0; i < items.length; i++) {
    items[i].onclick = function () {
      var rect = canvas.getBoundingClientRect();
      var step = (nodes.length % 6) * 22;
      var x = (rect.width / 2 - panX) / zoom - NODE_W / 2 + step;
      var y = (rect.height / 2 - panY) / zoom - 34 + step;
      addNode(this.getAttribute("data-type"), x, y);
    };
    items[i].onmouseenter = function () { showInfo(this.getAttribute("data-type")); };
    items[i].onfocus = items[i].onmouseenter;
    items[i].ondragstart = function (e) { e.dataTransfer.setData("text/plain", this.getAttribute("data-type")); };
  }
  canvas.addEventListener("dragover", function (e) { e.preventDefault(); });
  canvas.addEventListener("drop", function (e) {
    e.preventDefault();
    var type = e.dataTransfer.getData("text/plain");
    var pt = worldPoint(e);
    if (TYPES[type]) addNode(type, pt.x - NODE_W / 2, pt.y - 34);
  });

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  $("zoomIn").onclick = function () { zoomCenter(1.2); };
  $("zoomOut").onclick = function () { zoomCenter(1 / 1.2); };
  $("zoomFit").onclick = fitView;

  $("btnRun").onclick = function () { setRunning(!running); };
  $("btnStep").onclick = function () {
    if (flipClocks() === 0) toast("Add a Clock part to use Step.");
  };
  $("btnPrev").onclick = goPrevious;
  $("btnNext").onclick = goNext;
  $("btnDelete").onclick = deleteSelected;
  $("btnClear").onclick = clearAll;
  $("btnTable").onclick = openTable;
  $("btnSave").onclick = saveFile;
  $("btnOpen").onclick = function () { $("fileInput").click(); };
  $("fileInput").onchange = function () {
    if (this.files.length > 0) openFile(this.files[0]);
    this.value = "";
  };
  $("presets").onchange = function () {
    loadPreset(this.value);
    this.value = "";
  };
  $("themeBtn").onclick = function () {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  };

  document.addEventListener("keydown", function (e) {
    var typing = e.target.isContentEditable || e.target.tagName === "INPUT" || e.target.tagName === "SELECT";
    if (typing) return;
    if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
    if (e.ctrlKey && e.key === "z") { e.preventDefault(); goPrevious(); }
    if (e.ctrlKey && e.key === "y") { e.preventDefault(); goNext(); }
    if (e.key === "Escape") { selected = null; updateVisuals(); drawWires(); }
  });
  window.addEventListener("resize", applyView);

  // clocks tick every 0.7 seconds while running
  setInterval(function () {
    if (running) flipClocks();
  }, 700);
}

// ===================================================
// Start
// ===================================================
function start() {
  var theme = "light";   // always start in bright mode
  try { theme = localStorage.getItem("digitalDeskTheme2") || "light"; } catch (err) { }
  setTheme(theme);
  setRunning(true);
  addPaletteIcons();
  setupButtons();
  setupResizer();
  showInfo("XOR");

  // the board starts empty (and forget any circuit an older version saved)
  try { localStorage.removeItem("digitalDeskCircuit"); } catch (err) { }
  applyView();
  refresh();
}

start();
