/**
 * Hero «circuit board» network canvas — анимированный фон под заголовком героя.
 *
 * Порт standalone-логики из дизайн-хендоффа (design_handoff_landing_page/
 * hero-network-canvas.js) в типизированный модуль. Framework-agnostic: принимает
 * элемент <canvas> (его размер задаёт родитель) и интерактивную секцию, которая
 * управляет отталкиванием узлов от курсора; возвращает функцию-очистку.
 *
 * Визуальный язык: рыхлая дрожащая сетка «чипов» (маленькие квадраты) и
 * «модулей» (скруглённые IC-блоки с ножками), соединённых прямоугольными
 * трассами, плюс несколько длинных пунктирных «шин». По трассам бегают яркие
 * «пакеты» и подсвечивают трассу на финише. Курсор подсвечивает ближние трассы
 * и расталкивает узлы. Узлы едва «дышат» на месте.
 *
 * reduced-motion: если пользователь просит меньше движения, рисуем один
 * статичный кадр без RAF-цикла (см. option reducedMotion).
 *
 * Использование (React):
 *   useEffect(() => mountHeroNetworkCanvas(canvasRef.current, sectionRef.current,
 *     { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }), []);
 */

interface Node {
  x: number;
  y: number;
  col: number;
  row: number;
  hub: boolean;
  r: number;
  phase: number;
  ox: number;
  oy: number;
}

interface Edge {
  a: Node;
  b: Node;
  vertFirst: boolean;
  phase: number;
  freq: number;
  flash: number;
}

interface Bus {
  dir: 'h' | 'v';
  pos: number;
}

interface Packet {
  edge: Edge;
  t: number;
  speed: number;
}

interface Options {
  reducedMotion?: boolean;
}

export function mountHeroNetworkCanvas(
  canvas: HTMLCanvasElement | null,
  section: HTMLElement | null,
  options: Options = {},
): () => void {
  if (!canvas || !section) return () => {};

  const state = {
    mouse: { x: -9999, y: -9999, active: false },
    nodes: [] as Node[],
    edges: [] as Edge[],
    buses: [] as Bus[],
    packets: [] as Packet[],
    t: 0,
    w: 0,
    h: 0,
    ctx: null as CanvasRenderingContext2D | null,
    raf: 0,
    reducedMotion: !!options.reducedMotion,
  };

  function setupCanvas(isResize: boolean) {
    const parent = canvas!.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas!.width = w * dpr;
    canvas!.height = h * dpr;
    canvas!.style.width = w + 'px';
    canvas!.style.height = h + 'px';
    // getContext по спецификации возвращает null при неподдерживаемом типе, но
    // некоторые окружения (jsdom без canvas-пакета) его бросают — глотаем, чтобы
    // сбой фона-анимации никогда не ронял монтирование всей страницы.
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas!.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.w = w;
    state.h = h;
    state.ctx = ctx;
    buildGrid(w, h);
    // Первый монтаж — запускаем цикл (в reduced-motion animate() нарисует один
    // кадр и не запланирует следующий). При ресайзе цикл уже крутится, но в
    // reduced-motion его нет — перерисовываем один кадр вручную.
    if (!isResize) animate();
    else if (state.reducedMotion) animate();
  }

  // Раскладываем узлы по рыхлой дрожащей сетке — это разведённая плата, а не
  // рассыпанное звёздное небо. Длинные «шины» + IC-блоки с ножками дают
  // структуру настоящей схемы.
  function buildGrid(w: number, h: number) {
    const cell = 118;
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    const nodes: Node[] = [];
    const grid: Record<string, Node> = {};
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (Math.random() < 0.1) continue; // редкий пропуск, не разрежённая пустота
        const jitter = cell * 0.22;
        const isModule = (i + j) % 6 === 0 && Math.random() < 0.8;
        const node: Node = {
          x: i * cell + cell / 2 + (Math.random() - 0.5) * jitter,
          y: j * cell + cell / 2 + (Math.random() - 0.5) * jitter,
          col: i,
          row: j,
          hub: isModule,
          r: isModule ? 3.4 : 1.7,
          phase: Math.random() * Math.PI * 2,
          ox: 0,
          oy: 0,
        };
        nodes.push(node);
        grid[i + ',' + j] = node;
      }
    }

    // Плотная локальная разводка — прямоугольные трассы к правому/нижнему соседу.
    const edges: Edge[] = [];
    for (const n of nodes) {
      const right = grid[n.col + 1 + ',' + n.row];
      const down = grid[n.col + ',' + (n.row + 1)];
      if (right && Math.random() < 0.62)
        edges.push({ a: n, b: right, vertFirst: Math.random() < 0.5, phase: Math.random() * Math.PI * 2, freq: 0.08 + Math.random() * 0.18, flash: 0 });
      if (down && Math.random() < 0.62)
        edges.push({ a: n, b: down, vertFirst: Math.random() < 0.5, phase: Math.random() * Math.PI * 2, freq: 0.08 + Math.random() * 0.18, flash: 0 });
    }

    // Длинные «шины» на всю строку/столбец — то, что есть у настоящих схем.
    const buses: Bus[] = [];
    for (let j = 2; j < rows; j += 4) buses.push({ dir: 'h', pos: j * cell + cell / 2 + 6 });
    for (let i = 2; i < cols; i += 4) buses.push({ dir: 'v', pos: i * cell + cell / 2 - 6 });

    state.nodes = nodes;
    state.edges = edges;
    state.buses = buses;
    state.packets = [];
  }

  // Точка на L-образном пути трассы при прогрессе t (0..1) с постоянной видимой
  // скоростью независимо от соотношения длин двух сегментов.
  function pointOnEdge(edge: Edge, t: number): { x: number; y: number } {
    const ax = edge.a.x + edge.a.ox,
      ay = edge.a.y + edge.a.oy;
    const bx = edge.b.x + edge.b.ox,
      by = edge.b.y + edge.b.oy;
    const corner = edge.vertFirst ? { x: ax, y: by } : { x: bx, y: ay };
    const l1 = Math.hypot(corner.x - ax, corner.y - ay);
    const l2 = Math.hypot(bx - corner.x, by - corner.y);
    const total = l1 + l2 || 1;
    const d = t * total;
    if (d <= l1) {
      const f = l1 ? d / l1 : 0;
      return { x: ax + (corner.x - ax) * f, y: ay + (corner.y - ay) * f };
    }
    const f = l2 ? (d - l1) / l2 : 0;
    return { x: corner.x + (bx - corner.x) * f, y: corner.y + (by - corner.y) * f };
  }

  function animate() {
    const ctx = state.ctx,
      w = state.w,
      h = state.h,
      nodes = state.nodes,
      mouse = state.mouse;
    if (!ctx) return;
    state.t += 0.016;

    ctx.clearRect(0, 0, w, h);
    const edges = state.edges;
    const buses = state.buses;
    const rr = ctx as CanvasRenderingContext2D & {
      roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    };

    // «Шины» первыми, под всем остальным — пунктирные, бледные.
    ctx.save();
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = 'rgba(120,150,220,.14)';
    ctx.lineWidth = 1;
    for (const bus of buses) {
      ctx.beginPath();
      if (bus.dir === 'h') {
        ctx.moveTo(0, bus.pos);
        ctx.lineTo(w, bus.pos);
      } else {
        ctx.moveTo(bus.pos, 0);
        ctx.lineTo(bus.pos, h);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Узлы едва «дышат» на месте — чертёж, а не плавающее звёздное небо.
    for (const n of nodes) {
      const bx = Math.sin(state.t * 0.35 + n.phase) * 2.2;
      const by = Math.cos(state.t * 0.3 + n.phase) * 2.2;
      let tox = 0,
        toy = 0;
      if (mouse.active) {
        const dx = n.x - mouse.x,
          dy = n.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 150) {
          const force = (1 - dist / 150) * 10;
          tox = (dx / dist) * force;
          toy = (dy / dist) * force;
        }
      }
      n.ox += (bx + tox - n.ox) * 0.05;
      n.oy += (by + toy - n.oy) * 0.05;
    }

    // Ортогональные трассы — фоновое мерцание + затухающая вспышка после пакета.
    for (const e of edges) {
      const a = e.a,
        b = e.b,
        vertFirst = e.vertFirst;
      const ax = a.x + a.ox,
        ay = a.y + a.oy;
      const bx = b.x + b.ox,
        by = b.y + b.oy;
      const mid = vertFirst ? { x: ax, y: by } : { x: bx, y: ay };
      const bright = a.hub || b.hub;
      const shimmer = 0.5 + Math.sin(state.t * e.freq + e.phase) * 0.5;
      e.flash *= 0.94;
      const base = bright ? 0.14 : 0.08;
      const range = bright ? 0.26 : 0.16;
      const alpha = base + shimmer * range + e.flash * 0.55;
      ctx.strokeStyle = 'rgba(130,165,255,' + Math.min(alpha, 0.95) + ')';
      ctx.lineWidth = bright ? 1.2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(mid.x, mid.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.fillStyle = 'rgba(150,185,255,' + Math.min(0.3 + e.flash * 0.6, 0.9) + ')';
      ctx.fillRect(mid.x - 1, mid.y - 1, 2, 2);
    }

    // Непрерывные «пакеты» — яркие точки, бегущие по случайным трассам.
    if (edges.length && state.packets.length < 22 && Math.random() < 0.09) {
      const edge = edges[(Math.random() * edges.length) | 0];
      state.packets.push({ edge, t: 0, speed: 0.0035 + Math.random() * 0.02 });
    }
    for (let i = state.packets.length - 1; i >= 0; i--) {
      const p = state.packets[i];
      p.t += p.speed;
      if (p.t >= 1) {
        p.edge.flash = Math.min(p.edge.flash + 1, 1.6);
        state.packets.splice(i, 1);
        continue;
      }
      const pos = pointOnEdge(p.edge, p.t);
      const fade = p.t < 0.08 ? p.t / 0.08 : p.t > 0.9 ? (1 - p.t) / 0.1 : 1;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(210,225,255,' + 0.9 * fade + ')';
      ctx.arc(pos.x, pos.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      const trail = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 6);
      trail.addColorStop(0, 'rgba(140,180,255,' + 0.35 * fade + ')');
      trail.addColorStop(1, 'rgba(140,180,255,0)');
      ctx.fillStyle = trail;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Курсор: подсветка ближних трасс + кольцо.
    if (mouse.active) {
      for (const e of edges) {
        const a = e.a,
          b = e.b,
          vertFirst = e.vertFirst;
        const ax = a.x + a.ox,
          ay = a.y + a.oy;
        const bx = b.x + b.ox,
          by = b.y + b.oy;
        const midx = (ax + bx) / 2,
          midy = (ay + by) / 2;
        const dx = midx - mouse.x,
          dy = midy - mouse.y;
        if (Math.sqrt(dx * dx + dy * dy) < 170) {
          const mid = vertFirst ? { x: ax, y: by } : { x: bx, y: ay };
          ctx.strokeStyle = 'rgba(170,200,255,.6)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(mid.x, mid.y);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(150,185,255,.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 22, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Обычные узлы — маленькие плоские чипы (без мерцания).
    for (const n of nodes) {
      if (n.hub) continue;
      const nx = n.x + n.ox,
        ny = n.y + n.oy;
      const size = n.r;
      ctx.fillStyle = 'rgba(130,165,235,.5)';
      ctx.beginPath();
      const x0 = nx - size,
        y0 = ny - size,
        s = size * 2;
      if (rr.roundRect) rr.roundRect(x0, y0, s, s, 1);
      else ctx.rect(x0, y0, s, s);
      ctx.fill();
    }

    // Hub-узлы — маленькие IC-модули: скруглённое тело + короткие ножки.
    for (const n of nodes) {
      if (!n.hub) continue;
      const nx = n.x + n.ox,
        ny = n.y + n.oy;
      const bw = 15,
        bh = 10;
      ctx.fillStyle = 'rgba(20,24,34,.9)';
      ctx.strokeStyle = 'rgba(150,180,255,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (rr.roundRect) rr.roundRect(nx - bw / 2, ny - bh / 2, bw, bh, 2.5);
      else ctx.rect(nx - bw / 2, ny - bh / 2, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(150,180,255,.4)';
      ctx.beginPath();
      ctx.moveTo(nx - bw / 2 - 5, ny - bh / 2 + 2);
      ctx.lineTo(nx - bw / 2, ny - bh / 2 + 2);
      ctx.moveTo(nx - bw / 2 - 5, ny + bh / 2 - 2);
      ctx.lineTo(nx - bw / 2, ny + bh / 2 - 2);
      ctx.moveTo(nx + bw / 2 + 5, ny - bh / 2 + 2);
      ctx.lineTo(nx + bw / 2, ny - bh / 2 + 2);
      ctx.moveTo(nx + bw / 2 + 5, ny + bh / 2 - 2);
      ctx.lineTo(nx + bw / 2, ny + bh / 2 - 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(190,215,255,.8)';
      ctx.beginPath();
      ctx.arc(nx - bw / 2 + 3, ny - bh / 2 + 3, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Планируем следующий кадр только в обычном режиме — reduced-motion рисует
    // один статичный кадр.
    if (!state.reducedMotion) state.raf = requestAnimationFrame(animate);
  }

  function handleResize() {
    setupCanvas(true);
  }
  function handleMouseMove(e: MouseEvent) {
    const rect = section!.getBoundingClientRect();
    state.mouse.x = e.clientX - rect.left;
    state.mouse.y = e.clientY - rect.top;
    state.mouse.active = true;
  }
  function handleMouseLeave() {
    state.mouse.active = false;
  }

  // Инициализация не должна бросать наружу (иначе упадёт passive-эффект React и
  // потянет за собой всё монтирование лендинга) — фон-анимация некритична.
  try {
    setupCanvas(false);
  } catch {
    /* фон не запустился — герой остаётся статичным, страница живёт */
  }
  window.addEventListener('resize', handleResize);
  section.addEventListener('mousemove', handleMouseMove);
  section.addEventListener('mouseleave', handleMouseLeave);

  return function dispose() {
    cancelAnimationFrame(state.raf);
    window.removeEventListener('resize', handleResize);
    section.removeEventListener('mousemove', handleMouseMove);
    section.removeEventListener('mouseleave', handleMouseLeave);
  };
}
